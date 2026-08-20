// library_index.json'daki sürümler her zaman semver değil (ör. "trunk",
// "1.0-beta") — tam bir semver ayrıştırıcı yerine yalnızca "en yeni N
// sürümü" seçmek için yeterli, hoşgörülü bir karşılaştırıcı. Sayısal
// segmentleri sırayla karşılaştırır, kalan kısmı sözlüksel olarak.
function segments(version: string): (number | string)[] {
  return version
    .split(/[.\-+]/)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

export function compareVersionsDesc(a: string, b: string): number {
  const as = segments(a);
  const bs = segments(b);
  const len = Math.max(as.length, bs.length);
  for (let i = 0; i < len; i++) {
    const av = as[i];
    const bv = bs[i];
    if (av === undefined) return 1; // "1.2" < "1.2.1"
    if (bv === undefined) return -1;
    if (av === bv) continue;
    if (typeof av === 'number' && typeof bv === 'number') return bv - av;
    return String(bv).localeCompare(String(av));
  }
  return 0;
}
