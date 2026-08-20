// §3.1 — bağlama anında proje adından türetilip donan sketch klasörü adı.
// Arduino sketch kuralına uyar: yalnızca [a-z0-9-], boşluk yerine tire.
const COMBINING_MARKS_RE = /[̀-ͯ]/g;

export function slugifyProjectName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(COMBINING_MARKS_RE, '') // aksan işaretleri (ör. "ç" → "c")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'sketch';
}
