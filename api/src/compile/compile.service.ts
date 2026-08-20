import {
  HttpException,
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { Job, Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { Observable } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { computeBuildKey } from './build-key';
import { CompileRequestDto } from './dto/compile-request.dto';
import { BuildsService } from '../builds/builds.service';
import { ProjectsService } from '../projects/projects.service';
import { LibraryStoreService } from '../libraries/library-store.service';
import type { LibraryDep } from '../projects/storage/project-storage';

export interface CompileJobResult {
  ok: boolean;
  flashBytes?: number;
  elfBytes?: number;
  binBase64?: string;
  log: string;
  error?: string;
}

interface CompileJobData {
  files: { path: string; content: string }[];
  fqbn: string;
  options: Record<string, string>;
  // Kütüphane isim/sürümleri DEĞİL — CompileService.compile()'ın çözdüğü
  // ("<slug>@<version>" dizin adları, dolaylı bağımlılıklar dahil) nihai
  // liste. worker.js bunu doğrudan LIBRARY_ROOT altında arar, build key de
  // bundan hesaplanır.
  libraries: string[];
  // Kullanıcının doğrudan istediği isim/sürüm çiftleri (dolaylı bağımlılıklar
  // HARİÇ) — yalnızca autoCommit'in sketch.yaml'a yazacağı liste için
  // taşınıyor; derlemenin kendisi yalnızca yukarıdaki `libraries`i kullanır.
  requestedLibraries: LibraryDep[];
  // projectId/userId artık job'ın kendisinde taşınıyor — persist işlemi
  // hangi SSE bağlantısının o an dinlediğinden bağımsız hale geldi (bkz.
  // ensureJobResult).
  projectId?: string;
  userId: string | null;
}

type VersionSaved = 'ok' | 'conflict' | 'link_broken' | 'error' | null;

// binBase64 KASITLI OLARAK burada değil — o zaten build:${buildKey}
// önbelleğinde duruyor (tek kaynak). Aynı ~birkaç MB'lık binary'i
// jobresult:* altında ikinci kez tutmak Redis'i (192mb, noeviction)
// gereksiz yere OOM'a düşürüyordu — bir test sırasında canlı olarak
// gözlemlendi.
interface JobResultPayload extends Omit<CompileJobResult, 'binBase64'> {
  versionSaved: VersionSaved;
  buildKey: string;
}

// backend.plan.md §6.1/§6.2 tarif ettiği içerik-adresli cache R2 üzerinde
// çalışıyor; R2 kimlik bilgileri henüz yok. Bu yüzden geçici olarak
// redis-jobs'un kendisi kısa TTL'li bir önbellek olarak kullanılıyor — gerçek
// üretim davranışı değil, R2 bağlanınca burası değişecek.
const CACHE_TTL_SEC = 60 * 60;
// Bir job'ın SSE'ye teslim edilecek nihai sonucu (versionSaved dahil) —
// build:* önbelleğinden ayrı, çok daha kısa ömürlü: yalnızca geç bağlanan
// veya yeniden bağlanan bir istemcinin sonucu okuyabilmesi için.
const JOB_RESULT_TTL_SEC = 60 * 10;
const QUEUE_FULL_THRESHOLD = 10;
const LOCK_RETRY_MS = 300;
const LOCK_MAX_ATTEMPTS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class CompileService implements OnModuleDestroy {
  private readonly logger = new Logger(CompileService.name);
  private readonly connection: IORedis;
  private readonly queue: Queue;
  private readonly queueEvents: QueueEvents;

  constructor(
    private readonly builds: BuildsService,
    private readonly projects: ProjectsService,
    private readonly libraryStore: LibraryStoreService,
  ) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL tanımlı değil');
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue('builds', { connection: this.connection });
    this.queueEvents = new QueueEvents('builds', {
      connection: this.connection,
    });

    // Kimse dinlemiyor olsa bile (sekme kapandı, internet gitti) derlenmiş
    // sonuç kaybolmasın diye: persist artık hiçbir SSE bağlantısının yaşam
    // döngüsüne bağlı değil, iş bitince tek seferlik ve garantili çalışır.
    // streamJob() yalnızca bu (zaten hazırlanmış) sonucu izleyip iletir.
    this.queueEvents.on('completed', ({ jobId }) => {
      this.ensureJobResult(jobId).catch((err) =>
        this.logger.warn(`job sonucu işlenemedi (jobId=${jobId}): ${err}`),
      );
    });
  }

  async onModuleDestroy() {
    await this.queueEvents.close();
    await this.queue.close();
    await this.connection.quit();
  }

  async compile(dto: CompileRequestDto, userId: string | null) {
    // Cache'e bakmadan ÖNCE — hem güvenlik ağı (volume budandıysa/taşındıysa
    // yeniden indirir) hem de dolaylı bağımlılıkları çözen tek yer. Sonuç
    // build key'e ve job payload'ına giriyor.
    const resolvedLibraries = await this.libraryStore.ensureInstalled(
      dto.libraries ?? [],
    );
    const libraryDirs = resolvedLibraries.map((r) => r.dir);

    const buildKey = computeBuildKey(
      dto.files,
      dto.fqbn,
      dto.options ?? {},
      libraryDirs,
    );

    const cached = await this.connection.get(`build:${buildKey}`);
    if (cached) {
      const result = JSON.parse(cached) as CompileJobResult;
      const versionSaved = await this.persist(
        result,
        buildKey,
        {
          files: dto.files,
          fqbn: dto.fqbn,
          projectId: dto.projectId,
          libraries: dto.libraries ?? [],
        },
        userId,
      );
      return { cached: true, buildKey, ...result, versionSaved };
    }

    // backend.plan.md §5.3 — backpressure, VPS'i koruyan son savunma hattı
    const waiting = await this.queue.getWaitingCount();
    if (waiting > QUEUE_FULL_THRESHOLD) {
      throw new HttpException({ error: 'queue_full', retryAfter: 60 }, 429);
    }

    const job = await this.queue.add(
      'compile',
      {
        files: dto.files,
        fqbn: dto.fqbn,
        options: dto.options ?? {},
        libraries: libraryDirs,
        requestedLibraries: dto.libraries ?? [],
        projectId: dto.projectId,
        userId,
      } satisfies CompileJobData,
      {
        // backend.plan.md §5.2 — derleme hatası deterministik, tekrar anlamsız
        attempts: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
      },
    );

    return { cached: false, jobId: job.id, buildKey };
  }

  // master.plan.md §3/§6 — başarılı derlemede builds tablosuna yaz + artifact'ı
  // diske koy; projectId verilmişse (yalnızca "Derle ve Yükle" akışı) proje
  // sağlayıcısına (postgres/github) bir versiyon/commit yazar. Sahiplik/DB
  // hataları derleme yanıtını bozmasın diye burada yutuluyor — kullanıcı
  // flash'ı yine de alır; sonuç yalnızca versionSaved alanına yansır.
  private async persist(
    result: CompileJobResult,
    buildKey: string,
    dto: {
      files: Pick<CompileRequestDto, 'files'>['files'];
      fqbn: string;
      projectId?: string;
      libraries: LibraryDep[];
    },
    userId: string | null,
  ): Promise<VersionSaved> {
    if (!result.ok || !result.binBase64) return null;
    try {
      const bin = Buffer.from(result.binBase64, 'base64');
      const elf = null; // .elf şimdilik worker'dan taşınmıyor (Faz 7'de exception decoder ile eklenir)
      await this.builds.recordBuild(
        buildKey,
        dto.fqbn,
        result.flashBytes ?? bin.length,
        bin,
        elf,
      );
      if (userId) await this.builds.recordOwner(userId, buildKey);

      if (!userId || !dto.projectId) return null;
      const commitResult = await this.projects.autoCommit(
        userId,
        dto.projectId,
        dto.files,
        dto.fqbn,
        dto.libraries ?? [],
        buildKey,
      );
      if (!commitResult) return null;
      return commitResult.ok ? 'ok' : commitResult.reason;
    } catch (err) {
      this.logger.warn(`persist başarısız (buildKey=${buildKey}): ${err}`);
      return 'error';
    }
  }

  // Bir job'ın sonucu (cache + persist dahil) TAM OLARAK BİR KEZ işlenir.
  // Hem constructor'daki global 'completed' dinleyicisi hem de geç bağlanan
  // bir SSE istemcisi aynı anda çağırabilir — Redis NX kilidi bunları
  // sıraya sokar, ikinci çağıran yalnızca ilkinin yazdığı sonucu okur.
  private async ensureJobResult(
    jobId: string,
  ): Promise<JobResultPayload | null> {
    const resultKey = `jobresult:${jobId}`;

    for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt++) {
      const cached = await this.connection.get(resultKey);
      if (cached) return JSON.parse(cached) as JobResultPayload;

      const lockKey = `${resultKey}:lock`;
      const gotLock = await this.connection.set(lockKey, '1', 'EX', 30, 'NX');
      if (!gotLock) {
        await sleep(LOCK_RETRY_MS);
        continue;
      }

      try {
        // Kilidi alınca bir kez daha kontrol et — kilidi bekleyen taraf
        // biz kilidi alana kadar başka biri zaten yazmış olabilir.
        const alreadyDone = await this.connection.get(resultKey);
        if (alreadyDone) return JSON.parse(alreadyDone) as JobResultPayload;

        const job = await Job.fromId(this.queue, jobId);
        if (!job) return null;
        const state = await job.getState();
        if (state !== 'completed') return null; // 'failed' ayrı ele alınıyor (streamJob)

        const result = job.returnvalue as CompileJobResult;
        const data = job.data as CompileJobData;
        const buildKey = computeBuildKey(
          data.files,
          data.fqbn,
          data.options,
          data.libraries,
        );

        let versionSaved: VersionSaved = null;
        if (result.ok) {
          await this.connection
            .set(
              `build:${buildKey}`,
              JSON.stringify(result),
              'EX',
              CACHE_TTL_SEC,
            )
            .catch((err) => this.logger.warn(`cache set başarısız: ${err}`));
          versionSaved = await this.persist(
            result,
            buildKey,
            {
              files: data.files,
              fqbn: data.fqbn,
              projectId: data.projectId,
              libraries: data.requestedLibraries,
            },
            data.userId,
          );
        }

        const payload: JobResultPayload = {
          ok: result.ok,
          log: result.log,
          error: result.error,
          flashBytes: result.flashBytes,
          elfBytes: result.elfBytes,
          versionSaved,
          buildKey,
        };
        await this.connection.set(
          resultKey,
          JSON.stringify(payload),
          'EX',
          JOB_RESULT_TTL_SEC,
        );
        return payload;
      } finally {
        await this.connection.del(lockKey).catch(() => {});
      }
    }

    this.logger.warn(`jobresult kilidi çözülemedi (jobId=${jobId})`);
    return null;
  }

  // frontend.plan.md §8.2 — SSE: log / done / failed olayları. Persist artık
  // burada değil (bkz. ensureJobResult) — bu yalnızca (zaten garantili
  // şekilde hazırlanmış) sonucu izleyip o an bağlı istemciye iletir.
  streamJob(jobId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        this.queueEvents.off('progress', onProgress);
        this.queueEvents.off('completed', onCompleted);
        this.queueEvents.off('failed', onFailed);
      };

      const deliver = async () => {
        const payload = await this.ensureJobResult(jobId);
        if (!payload) {
          subscriber.next({
            type: 'failed',
            data: JSON.stringify({ error: 'result_unavailable' }),
          });
          subscriber.complete();
          cleanup();
          return;
        }
        if (payload.log) {
          subscriber.next({
            type: 'log',
            data: JSON.stringify({ line: payload.log }),
          });
        }
        if (payload.ok) {
          // binBase64 jobresult:*'ta yok (bkz. ensureJobResult) — asıl
          // binary'nin tek kaynağı olan build:*'tan burada okunuyor.
          const buildCache = await this.connection.get(
            `build:${payload.buildKey}`,
          );
          const binBase64 = buildCache
            ? (JSON.parse(buildCache) as CompileJobResult).binBase64
            : undefined;
          subscriber.next({
            type: 'done',
            data: JSON.stringify({
              flashBytes: payload.flashBytes,
              elfBytes: payload.elfBytes,
              binBase64,
              buildKey: payload.buildKey,
              versionSaved: payload.versionSaved,
            }),
          });
        } else {
          subscriber.next({
            type: 'failed',
            data: JSON.stringify({ error: payload.error }),
          });
        }
        subscriber.complete();
        cleanup();
      };

      const onProgress = ({ jobId: id }: { jobId: string }) => {
        if (id !== jobId) return;
        subscriber.next({
          type: 'log',
          data: JSON.stringify({ line: 'Deleniyor…\n' }),
        });
      };
      const onCompleted = ({ jobId: id }: { jobId: string }) => {
        if (id !== jobId) return;
        void deliver();
      };
      const onFailed = ({
        jobId: id,
        failedReason,
      }: {
        jobId: string;
        failedReason: string;
      }) => {
        if (id !== jobId) return;
        subscriber.next({
          type: 'failed',
          data: JSON.stringify({ error: failedReason }),
        });
        subscriber.complete();
        cleanup();
      };

      this.queueEvents.on('progress', onProgress);
      this.queueEvents.on('completed', onCompleted);
      this.queueEvents.on('failed', onFailed);

      // Job, SSE bağlantısı kurulmadan önce zaten bitmiş olabilir — kaçırılmasın.
      void Job.fromId(this.queue, jobId).then(async (job) => {
        if (!job) return;
        const state = await job.getState();
        if (state === 'completed') {
          void deliver();
        } else if (state === 'failed') {
          subscriber.next({
            type: 'failed',
            data: JSON.stringify({ error: job.failedReason }),
          });
          subscriber.complete();
          cleanup();
        }
      });

      return cleanup;
    });
  }
}
