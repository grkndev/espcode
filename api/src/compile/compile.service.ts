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
}

// backend.plan.md §6.1/§6.2 tarif ettiği içerik-adresli cache R2 üzerinde
// çalışıyor; R2 kimlik bilgileri henüz yok. Bu yüzden geçici olarak
// redis-jobs'un kendisi kısa TTL'li bir önbellek olarak kullanılıyor — gerçek
// üretim davranışı değil, R2 bağlanınca burası değişecek.
const CACHE_TTL_SEC = 60 * 60;
const QUEUE_FULL_THRESHOLD = 10;

@Injectable()
export class CompileService implements OnModuleDestroy {
  private readonly logger = new Logger(CompileService.name);
  private readonly connection: IORedis;
  private readonly queue: Queue;
  private readonly queueEvents: QueueEvents;

  constructor(
    private readonly builds: BuildsService,
    private readonly projects: ProjectsService,
  ) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL tanımlı değil');
    this.connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.queue = new Queue('builds', { connection: this.connection });
    this.queueEvents = new QueueEvents('builds', {
      connection: this.connection,
    });
  }

  async onModuleDestroy() {
    await this.queueEvents.close();
    await this.queue.close();
    await this.connection.quit();
  }

  async compile(dto: CompileRequestDto, userId: string | null) {
    const buildKey = computeBuildKey(dto.files, dto.fqbn, dto.options ?? {});

    const cached = await this.connection.get(`build:${buildKey}`);
    if (cached) {
      const result = JSON.parse(cached) as CompileJobResult;
      const versionSaved = await this.persist(result, buildKey, dto, userId);
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
  // flash'ı yine de alır; sonuç yalnızca SSE'deki versionSaved alanına yansır.
  private async persist(
    result: CompileJobResult,
    buildKey: string,
    dto: Pick<CompileRequestDto, 'files' | 'fqbn' | 'projectId'>,
    userId: string | null,
  ): Promise<'ok' | 'conflict' | 'link_broken' | 'error' | null> {
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
        buildKey,
      );
      if (!commitResult) return null;
      return commitResult.ok ? 'ok' : commitResult.reason;
    } catch (err) {
      this.logger.warn(`persist başarısız (buildKey=${buildKey}): ${err}`);
      return 'error';
    }
  }

  // frontend.plan.md §8.2 — SSE: log / done / failed olayları
  streamJob(
    jobId: string,
    buildKey: string,
    userId: string | null,
    projectId?: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        this.queueEvents.off('progress', onProgress);
        this.queueEvents.off('completed', onCompleted);
        this.queueEvents.off('failed', onFailed);
      };

      const emitResult = async (
        result: CompileJobResult,
        jobData?: CompileJobData,
      ) => {
        if (result.log) {
          subscriber.next({
            type: 'log',
            data: JSON.stringify({ line: result.log }),
          });
        }
        if (result.ok) {
          await this.connection
            .set(
              `build:${buildKey}`,
              JSON.stringify(result),
              'EX',
              CACHE_TTL_SEC,
            )
            .catch((err) => this.logger.warn(`cache set başarısız: ${err}`));
          let versionSaved: 'ok' | 'conflict' | 'link_broken' | 'error' | null =
            null;
          if (jobData) {
            versionSaved = await this.persist(
              result,
              buildKey,
              { ...jobData, projectId },
              userId,
            );
          }
          subscriber.next({
            type: 'done',
            data: JSON.stringify({
              flashBytes: result.flashBytes,
              elfBytes: result.elfBytes,
              binBase64: result.binBase64,
              buildKey,
              versionSaved,
            }),
          });
        } else {
          subscriber.next({
            type: 'failed',
            data: JSON.stringify({ error: result.error }),
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
      const onCompleted = ({
        jobId: id,
        returnvalue,
      }: {
        jobId: string;
        returnvalue: unknown;
      }) => {
        if (id !== jobId) return;
        void Job.fromId(this.queue, id).then((job) => {
          void emitResult(
            returnvalue as CompileJobResult,
            job?.data as CompileJobData | undefined,
          );
        });
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
        if (state === 'completed' && job.returnvalue) {
          void emitResult(
            job.returnvalue as CompileJobResult,
            job.data as CompileJobData,
          );
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
