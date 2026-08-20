import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, type Dirent } from 'node:fs';
import { mkdir, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { LibraryIndexService } from './library-index.service';
import { libraryDirName, slugifyLibraryName } from './library-slug';

export interface LibraryDep {
  name: string;
  version: string;
}

export interface ResolvedLibrary {
  name: string;
  version: string;
  dir: string; // "<slug>@<version>" — worker.js'in --library argümanına bu isimle path.join edilir
  includes: string[]; // kurulum sonrası diskte gerçekten bulunan .h/.hpp adları
}

const MAX_ZIP_BYTES = 64 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 256 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const MAX_DEPS = 20;

function commonTopLevelPrefix(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.some((n) => !n.includes('/'))) return null; // kökte doğrudan dosya varsa sarmalayıcı klasör yok
  const firsts = new Set(names.map((n) => n.split('/')[0]));
  if (firsts.size !== 1) return null;
  const [only] = firsts;
  return `${only}/`;
}

function safeJoin(base: string, rel: string): string {
  const resolvedBase = path.resolve(base);
  const resolved = path.resolve(base, rel);
  if (
    resolved !== resolvedBase &&
    !resolved.startsWith(resolvedBase + path.sep)
  ) {
    throw new Error('zip_path_traversal');
  }
  return resolved;
}

// Zip'ten çıkarılmış bir kütüphane kökünde (veya src/ altında) gerçekten
// bulunan header'lar — otomatik #include için index'teki (güvenilmez/eksik
// olabilen) providesIncludes yerine bu, çıkarılmış diskteki zemin gerçeği.
async function scanIncludes(dir: string): Promise<string[]> {
  for (const sub of ['', 'src']) {
    const p = path.join(dir, sub);
    let entries: Dirent[];
    try {
      entries = await readdir(p, { withFileTypes: true });
    } catch {
      continue;
    }
    const headers = entries
      .filter((e) => e.isFile() && /\.(h|hpp)$/i.test(e.name))
      .map((e) => e.name);
    if (headers.length) return headers.sort();
  }
  return [];
}

async function extractZip(buf: Buffer, targetDir: string): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) return reject(err ?? new Error('zip_open_failed'));

      let entryCount = 0;
      let totalBytes = 0;
      const fileEntries: Entry[] = [];

      zipfile.on('error', reject);

      zipfile.on('entry', (entry: Entry) => {
        entryCount++;
        if (entryCount > MAX_ENTRIES) {
          zipfile.close();
          return reject(new Error('zip_too_many_entries'));
        }

        const name = entry.fileName.replace(/\\/g, '/');
        const isDir = name.endsWith('/');
        // yauzl external attrs: üst 16 bit unix dosya modu. 0xA000 = symlink.
        const unixMode = entry.externalFileAttributes >>> 16;
        const isSymlink = (unixMode & 0xf000) === 0xa000;
        if (isSymlink) {
          zipfile.close();
          return reject(new Error('zip_symlink_rejected'));
        }

        if (!isDir) {
          totalBytes += entry.uncompressedSize;
          if (totalBytes > MAX_EXTRACTED_BYTES) {
            zipfile.close();
            return reject(new Error('zip_too_large_extracted'));
          }
          fileEntries.push(entry);
        }
        zipfile.readEntry();
      });

      zipfile.on('end', () => {
        void extractEntries(zipfile, fileEntries, targetDir).then(
          resolve,
          reject,
        );
      });

      zipfile.readEntry();
    });
  });
}

async function extractEntries(
  zipfile: ZipFile,
  entries: Entry[],
  targetDir: string,
): Promise<void> {
  const names = entries.map((e) => e.fileName.replace(/\\/g, '/'));
  const prefix = commonTopLevelPrefix(names);

  for (const entry of entries) {
    const name = entry.fileName.replace(/\\/g, '/');
    const rel = prefix ? name.slice(prefix.length) : name;
    if (!rel) continue;
    const dest = safeJoin(targetDir, rel);
    await mkdir(path.dirname(dest), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      zipfile.openReadStream(entry, (err, stream) => {
        if (err || !stream)
          return reject(err ?? new Error('zip_stream_failed'));
        const out = createWriteStream(dest);
        stream.on('error', reject);
        out.on('error', reject);
        out.on('finish', resolve);
        stream.pipe(out);
      });
    });
  }
}

// master.plan.md §12 eski kararının tersine — builder'ın kendisi hâlâ hiçbir
// ağa çıkmıyor (docs/backend.plan.md §3.1); yalnızca burada, interneti olan
// ide-api'de indirilip doğrulanıp paylaşımlı bir volume'a (ide_libraries)
// açılıyor. Builder o volume'u yalnızca salt-okunur okuyor.
@Injectable()
export class LibraryStoreService {
  private readonly logger = new Logger(LibraryStoreService.name);
  private readonly libraryDir =
    process.env.LIBRARY_DIR ?? '/var/lib/espcode/libraries';
  private readonly inFlight = new Map<string, Promise<ResolvedLibrary>>();

  constructor(private readonly index: LibraryIndexService) {}

  // Bağımlılıkları (indeksteki dependencies alanı) geçişli olarak çözer,
  // eksik olanları indirir. Döner: derlemede --library'ye verilecek, ismin
  // sırasına bakılmaksızın çözülmüş tüm kütüphaneler (istenenler + dolaylı
  // bağımlılıklar). Build key'e bu dönüş değeri (dir listesi) giriyor.
  async ensureInstalled(deps: LibraryDep[]): Promise<ResolvedLibrary[]> {
    if (deps.length > MAX_DEPS)
      throw new BadRequestException('too_many_libraries');

    const resolved = new Map<string, ResolvedLibrary>();
    const queue = [...deps];

    while (queue.length) {
      const dep = queue.shift();
      if (!dep || resolved.has(dep.name)) continue;

      const lib = await this.ensureOne(dep.name, dep.version);
      resolved.set(dep.name, lib);

      const versionEntry = await this.index.resolve(dep.name, dep.version);
      for (const d of versionEntry.dependencies) {
        if (resolved.has(d.name) || queue.some((q) => q.name === d.name))
          continue;
        const depVersion = await this.index.latestVersion(d.name);
        if (!depVersion) {
          this.logger.warn(
            `bilinmeyen bağımlılık atlandı: ${dep.name} → ${d.name}`,
          );
          continue;
        }
        if (resolved.size + queue.length >= MAX_DEPS) continue;
        queue.push({ name: d.name, version: depVersion });
      }
    }

    return [...resolved.values()];
  }

  private ensureOne(name: string, version: string): Promise<ResolvedLibrary> {
    const dir = libraryDirName(name, version);
    const existing = this.inFlight.get(dir);
    if (existing) return existing;

    const promise = this.installOne(name, version, dir).finally(() =>
      this.inFlight.delete(dir),
    );
    this.inFlight.set(dir, promise);
    return promise;
  }

  private async installOne(
    name: string,
    version: string,
    dir: string,
  ): Promise<ResolvedLibrary> {
    const target = path.join(this.libraryDir, dir);

    const already = await scanIncludes(target);
    if (already.length) return { name, version, dir, includes: already };

    const entry = await this.index.resolve(name, version);
    if (!entry.checksum.startsWith('SHA-256:')) {
      throw new BadRequestException('unsupported_checksum_format');
    }
    if (entry.size > MAX_ZIP_BYTES)
      throw new BadRequestException('library_too_large');

    this.logger.log(`kütüphane indiriliyor: ${name}@${version}`);
    const zipBuf = await this.download(entry.url);
    const actualHash = createHash('sha256').update(zipBuf).digest('hex');
    const expectedHash = entry.checksum.slice('SHA-256:'.length);
    if (actualHash !== expectedHash)
      throw new BadRequestException('checksum_mismatch');

    const tmpDir = path.join(
      this.libraryDir,
      `.tmp-${slugifyLibraryName(name)}-${randomUUID()}`,
    );
    try {
      await extractZip(zipBuf, tmpDir);
      try {
        await rename(tmpDir, target);
      } catch {
        // Yarışan bir kurulum bizden önce bitirmiş olabilir — kendi geçici
        // kopyamızı at, diskteki sonucu kullan.
        await rm(tmpDir, { recursive: true, force: true });
      }
    } catch (err) {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }

    const includes = await scanIncludes(target);
    return { name, version, dir, includes };
  }

  private async download(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`library_download_failed:${res.status}`);
    const len = Number(res.headers.get('content-length') ?? '0');
    if (len && len > MAX_ZIP_BYTES)
      throw new BadRequestException('library_too_large');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_ZIP_BYTES)
      throw new BadRequestException('library_too_large');
    return buf;
  }
}
