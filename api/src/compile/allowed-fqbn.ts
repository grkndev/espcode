// backend.plan.md §7.3 — kart listesi sabit bir enum, client asla serbest metin
// göndermez. builder/src/worker.js'teki ALLOWED_FQBN ile birebir aynı kalmalı.
export const ALLOWED_FQBN = new Set([
  'esp32:esp32:esp32',
  'esp32:esp32:esp32c3',
  'esp32:esp32:esp32s3',
  'esp32:esp32:esp32c6',
]);

// Kart seçenekleri (web/src/features/ide/board-options.ts'in sunucu tarafı
// aynası) — FQBN'e :key=value,... olarak eklenecek. Anahtar/değer sadece
// harf/rakam/alt çizgi içerebilir; bilinmeyen bir seçenek arduino-cli'de
// derleme hatasına düşer, güvenlik riski oluşturmaz ama yine de doğrulanır.
const OPTION_TOKEN = /^[A-Za-z0-9_]+$/;

export function buildExtendedFqbn(
  fqbn: string,
  options?: Record<string, string>,
): string {
  if (!options || Object.keys(options).length === 0) return fqbn;
  const parts = Object.entries(options)
    .filter(([k, v]) => OPTION_TOKEN.test(k) && OPTION_TOKEN.test(v))
    .map(([k, v]) => `${k}=${v}`);
  return parts.length ? `${fqbn}:${parts.join(',')}` : fqbn;
}
