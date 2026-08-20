// master.plan.md §2 — üretimde app.espcode.dev + api.espcode.dev aynı apex
// domain altında olacak (aynı site → çerez sorunsuz). Faz 6'ya kadar
// (nginx/domain yok) yerel geliştirme için doğrudan ide-api'nin yayınladığı
// porta gidiyor: frontend localhost:3010, API localhost:3001 — farklı
// origin ama aynı site (SameSite portu saymaz), oturum çerezi bu yüzden
// çalışıyor. ngrok/localtest.me KULLANMA: ikisi de frontend'le farklı site
// sayılıyor, tarayıcının 3. taraf çerez engeli (Brave Shields, Chrome
// Privacy Sandbox) çerezi cross-site fetch'e hiç eklemiyor — CORS/cookie
// ayarlarıyla (SameSite=None, Secure) aşılamıyor, denendi.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: init.credentials ?? "include",
  });
}
