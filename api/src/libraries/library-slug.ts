// arduino-cli'nin kendi davranışıyla aynı: kütüphane adındaki boşluk ve özel
// karakterler dizin adında alt çizgiye döner (örn. "Adafruit GFX Library" →
// "Adafruit_GFX_Library"). Sonuç yalnızca [A-Za-z0-9._-] içerir — worker.js
// tarafında path traversal riski taşımadan doğrudan path.join ile kullanılır.
export function slugifyLibraryName(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9._-]+/g, '_');
}

// Diskteki/--libraries argümanındaki koleksiyon dizini adı. "@" hem worker.js
// hem burada ayraç olarak kullanılıyor — kütüphane adı/sürümü asla "@"
// içermez (slugify zaten atıyor).
export function libraryDirName(name: string, version: string): string {
  return `${slugifyLibraryName(name)}@${version}`;
}

export const LIBRARY_DIR_RE = /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/;
