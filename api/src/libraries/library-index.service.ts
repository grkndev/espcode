import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compareVersionsDesc } from './semver-lite';

const gunzipAsync = promisify(gunzip);

const INDEX_URL =
  'https://downloads.arduino.cc/libraries/library_index.json.gz';
const TTL_MS = 24 * 60 * 60 * 1000;
// Kütüphane başına yalnızca en yeni 5 sürüm tutulur — ~9900 kütüphane × 5 ≈
// 50k kayıt, bellekte/diskte makul, sürüm seçimi için fazlasıyla yeterli.
const MAX_VERSIONS_PER_LIBRARY = 5;
const SEARCH_DEFAULT_LIMIT = 30;
const SEARCH_MAX_LIMIT = 100;

export interface LibraryVersionEntry {
  version: string;
  size: number;
  checksum: string; // "SHA-256:<hex>"
  url: string;
  archiveFileName: string;
  dependencies: { name: string }[];
}

export interface LibraryEntry {
  name: string;
  author: string;
  sentence: string;
  category: string;
  architectures: string[];
  providesIncludes: string[];
  versions: LibraryVersionEntry[]; // en yeniden en eskiye, en fazla MAX_VERSIONS_PER_LIBRARY
}

export interface LibrarySearchResult extends LibraryEntry {
  compatible: boolean; // architectures 'esp32' veya '*' içeriyor mu
}

interface RawLibrary {
  name: string;
  version: string;
  author?: string;
  sentence?: string;
  category?: string;
  architectures?: string[];
  providesIncludes?: string[];
  size?: number;
  checksum?: string;
  url?: string;
  archiveFileName?: string;
  dependencies?: { name: string; version?: string }[];
}

interface SlimIndexFile {
  builtAt: number;
  libraries: LibraryEntry[];
}

function isEsp32Compatible(architectures: string[]): boolean {
  return (
    architectures.length === 0 ||
    architectures.some((a) => a === '*' || a.toLowerCase() === 'esp32')
  );
}

// master.plan.md §12 eski kararının tersine — kayıt defterinin tamamını
// (canlı doğrulandı: 9865 kütüphane, 53259 sürüm girişi, 57 MB) indirip
// kırpılmış bir "slim index"e indirger. Builder'ın kendisi buna hiç
// dokunmaz; yalnızca ide-api'nin interneti olduğu için burada yaşar
// (docs/backend.plan.md §3.1 — internet erişimi olan tek servis).
@Injectable()
export class LibraryIndexService implements OnModuleInit {
  private readonly logger = new Logger(LibraryIndexService.name);
  private readonly libraryDir =
    process.env.LIBRARY_DIR ?? '/var/lib/espcode/libraries';
  private readonly indexPath = path.join(
    this.libraryDir,
    'index',
    'slim-index.json',
  );

  private byName: Map<string, LibraryEntry> | null = null;
  private loadedAt = 0;
  private loadingPromise: Promise<void> | null = null;

  onModuleInit() {
    // Açılışı bloklamasın — ağ yavaşsa/erişilemezse API yine ayağa kalkar,
    // ilk arama isteği kendi ensureLoaded()'ını tetikler.
    void this.ensureLoaded().catch((err) =>
      this.logger.warn(
        `açılışta indeks yüklenemedi (arka planda tekrar denenecek): ${err}`,
      ),
    );
  }

  private async ensureLoaded(): Promise<void> {
    if (this.byName && Date.now() - this.loadedAt < TTL_MS) return;
    if (this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = this.loadInternal().finally(() => {
      this.loadingPromise = null;
    });
    return this.loadingPromise;
  }

  private async loadInternal(): Promise<void> {
    const fromDisk = await this.readDiskCache();
    if (fromDisk && Date.now() - fromDisk.builtAt < TTL_MS) {
      this.applyIndex(fromDisk.libraries, fromDisk.builtAt);
      return;
    }

    try {
      await this.refreshFromRegistry();
    } catch (err) {
      // Ağ hatası aramayı düşürmemeli — eldeki (bayat olsa da) diskteki
      // kopyayla çalışmaya devam et. Disk de yoksa arama boş sonuç döner.
      this.logger.warn(`kayıt defteri tazelenemedi: ${err}`);
      if (fromDisk) this.applyIndex(fromDisk.libraries, fromDisk.builtAt);
    }
  }

  private applyIndex(libraries: LibraryEntry[], builtAt: number) {
    this.byName = new Map(libraries.map((l) => [l.name, l]));
    this.loadedAt = builtAt;
  }

  private async readDiskCache(): Promise<SlimIndexFile | null> {
    try {
      const raw = await readFile(this.indexPath, 'utf8');
      return JSON.parse(raw) as SlimIndexFile;
    } catch {
      return null;
    }
  }

  private async refreshFromRegistry(): Promise<void> {
    this.logger.log('kütüphane kayıt defteri indiriliyor…');
    const res = await fetch(INDEX_URL);
    if (!res.ok) throw new Error(`library_index_fetch_failed:${res.status}`);
    const gz = Buffer.from(await res.arrayBuffer());
    const json = await gunzipAsync(gz);
    const raw = JSON.parse(json.toString('utf8')) as {
      libraries: RawLibrary[];
    };

    const grouped = new Map<string, RawLibrary[]>();
    for (const lib of raw.libraries) {
      const list = grouped.get(lib.name);
      if (list) list.push(lib);
      else grouped.set(lib.name, [lib]);
    }

    const slim: LibraryEntry[] = [];
    for (const [name, entries] of grouped) {
      entries.sort((a, b) => compareVersionsDesc(a.version, b.version));
      const top = entries.slice(0, MAX_VERSIONS_PER_LIBRARY);
      const latest = top[0];
      slim.push({
        name,
        author: latest.author ?? '',
        sentence: latest.sentence ?? '',
        category: latest.category ?? '',
        architectures: latest.architectures ?? [],
        providesIncludes: latest.providesIncludes ?? [],
        versions: top.map((e) => ({
          version: e.version,
          size: e.size ?? 0,
          checksum: e.checksum ?? '',
          url: e.url ?? '',
          archiveFileName: e.archiveFileName ?? '',
          dependencies: (e.dependencies ?? []).map((d) => ({ name: d.name })),
        })),
      });
    }

    const builtAt = Date.now();
    await mkdir(path.dirname(this.indexPath), { recursive: true });
    const tmpPath = `${this.indexPath}.tmp-${process.pid}`;
    await writeFile(
      tmpPath,
      JSON.stringify({ builtAt, libraries: slim } satisfies SlimIndexFile),
    );
    await rename(tmpPath, this.indexPath);

    this.applyIndex(slim, builtAt);
    this.logger.log(`kayıt defteri hazır — ${slim.length} kütüphane`);
  }

  async search(
    query: string,
    limit = SEARCH_DEFAULT_LIMIT,
  ): Promise<LibrarySearchResult[]> {
    await this.ensureLoaded().catch(() => {});
    if (!this.byName) return [];
    const q = query.trim().toLowerCase();
    const cap = Math.min(Math.max(limit, 1), SEARCH_MAX_LIMIT);
    if (!q) {
      return [...this.byName.values()]
        .slice(0, cap)
        .map((l) => ({ ...l, compatible: isEsp32Compatible(l.architectures) }));
    }

    const scored: { entry: LibraryEntry; score: number }[] = [];
    for (const entry of this.byName.values()) {
      const name = entry.name.toLowerCase();
      let score = -1;
      if (name === q) score = 100;
      else if (name.startsWith(q)) score = 80;
      else if (name.includes(q)) score = 60;
      else if (entry.sentence.toLowerCase().includes(q)) score = 20;
      if (score < 0) continue;
      if (isEsp32Compatible(entry.architectures)) score += 5;
      scored.push({ entry, score });
    }
    scored.sort(
      (a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name),
    );
    return scored.slice(0, cap).map(({ entry }) => ({
      ...entry,
      compatible: isEsp32Compatible(entry.architectures),
    }));
  }

  // WorkspacePanel'in "PROJEDE" listesi — arama sonuçlarında bulunmasa bile
  // (farklı bir sorguyla eklenmiş olabilir) projeye eklenen kütüphanelerin
  // açıklama/yazar bilgisini isme göre tek seferde toplu getirir.
  async getByNames(names: string[]): Promise<LibrarySearchResult[]> {
    await this.ensureLoaded().catch(() => {});
    if (!this.byName) return [];
    const found: LibrarySearchResult[] = [];
    for (const name of names) {
      const entry = this.byName.get(name);
      if (entry)
        found.push({
          ...entry,
          compatible: isEsp32Compatible(entry.architectures),
        });
    }
    return found;
  }

  async resolve(name: string, version: string): Promise<LibraryVersionEntry> {
    await this.ensureLoaded().catch(() => {});
    const entry = this.byName?.get(name);
    const found = entry?.versions.find((v) => v.version === version);
    if (!found) throw new NotFoundException('library_version_not_found');
    return found;
  }

  async latestVersion(name: string): Promise<string | null> {
    await this.ensureLoaded().catch(() => {});
    return this.byName?.get(name)?.versions[0]?.version ?? null;
  }
}
