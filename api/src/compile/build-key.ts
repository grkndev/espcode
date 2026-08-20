import { createHash } from 'node:crypto';

// backend.plan.md §6.1 — içerik-adresli anahtar, çoklu dosya için path'e göre
// sıralanmış [path, normalizeSource(content)] çiftleri (aynı sketch farklı
// dosya sırasıyla gönderilse de aynı anahtarı versin diye).
//
// coreVersion şimdilik sabit — builder/docs/backend.plan.md §8 Adım 4'te
// kurulan tek core sürümü (esp32:esp32@3.3.11). Birden fazla core sürümü
// desteklenirse builder'dan dinamik sorgulanmalı.
export const CORE_VERSION = 'esp32:esp32@3.3.11';

export interface SketchFileInput {
  path: string;
  content: string;
}

function normalizeSource(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '');
}

export function computeBuildKey(
  files: SketchFileInput[],
  fqbn: string,
  options: Record<string, string> = {},
  // Çözülmüş kütüphane dizin adları ("<slug>@<version>", dolaylı
  // bağımlılıklar dahil) — LibraryStoreService.ensureInstalled()'ın dönüşü.
  // Bir kütüphane eklemek/kaldırmak/sürüm değiştirmek eski binary'yi cache'ten
  // döndürmesin diye anahtara giriyor.
  libraryDirs: string[] = [],
): string {
  const filesPart = files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `${f.path}\0${normalizeSource(f.content)}`)
    .join('\0');

  const optionsPart = JSON.stringify(options, Object.keys(options).sort());
  const librariesPart = libraryDirs.slice().sort().join('\0');

  const key = [filesPart, fqbn, optionsPart, librariesPart, CORE_VERSION].join(
    '\0',
  );
  return createHash('sha256').update(key).digest('hex');
}
