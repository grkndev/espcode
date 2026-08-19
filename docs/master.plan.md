# espcode — Birleşik Ürün ve Uygulama Planı

## Bağlam

`docs/backend.plan.md` ve `docs/frontend.plan.md` iki ayrı katmanı zaten olgun biçimde
tarif ediyor: VPS derleme servisi (Docker, BullMQ, güvenlik modeli, R2 artifact deposu) ve
tarayıcı tarafı (Web Serial, esptool-js, CodeMirror 6, xterm, uPlot). Kod henüz yazılmadı —
depoda yalnızca bu iki doküman var.

Eksik olan üçüncü katman **kullanıcı ve kalıcılık**: kimlik, kaydedilen projeler, versiyon
geçmişi, `.bin` indirme. Mevcut iki doküman bu katmandan hiç söz etmiyor; frontend
"IndexedDB'de tut" diyor, backend ise artifact'ları içerik-adresli olarak R2'ye koyuyor ama
"bu artifact kimin projesine ait" sorusunun cevabı yok.

Bu plan o boşluğu doldurur ve iki dokümanı tek bir uygulama sırasına bağlar.

### Onaylanan kararlar

| Konu | Karar |
|---|---|
| Kimlik | GitHub OAuth (`read:user`, yalnızca kimlik — depolama yetkisinden ayrı bir akış) |
| Backend framework | NestJS |
| Migration aracı | Prisma |
| Kaynak kod deposu | Postgres (varsayılan), proje bazında opsiyonel olarak GitHub'a bağlanabilir (§3.1) |
| GitHub depolama (opsiyonel) | Ayrı bir GitHub App (`contents: write`), proje başına opt-in, kullanıcı hangi repo(lar)a izin vereceğini kurulumda kendisi seçer |
| Artifact deposu | Cloudflare R2 (backend planındaki tasarım korunuyor) |
| Kapsam | Portföy/demo — tek haneli eşzamanlı kullanıcı, `concurrency: 1` builder |

### Neden GitHub deposu değil

GitHub'ı depolama katmanı yapmak cazip görünüyor (ücretsiz, versiyon geçmişi hazır) ama
üç maliyet getiriyor: her kaydetme bir API çağrısı (saatlik 5000 rate limit, kullanıcı
token'ı üzerinden), listeleme/arama için ek indeks yine gerekiyor, ve kullanıcının
depolarına yazma izni istemek OAuth kapsamını `repo` seviyesine çıkarıyor — portföy
projesi için orantısız bir izin talebi. Postgres'te bir sketch birkaç KB'lık bir metin
satırı; mevcut instance'a maliyeti sıfıra yakın. GitHub yalnızca `read:user` kapsamıyla
kimlik sağlayıcı olarak kalıyor.

**Güncelleme — opsiyonel istisna:** Yukarıdaki gerekçe varsayılan (Postgres) yol için
geçerliğini koruyor, ama kullanıcı isterse proje bazında GitHub'ı depolama olarak
seçebilir (§3.1). Bunu mümkün kılan şey, yukarıdaki üç maliyeti tek tek çözen bir
model: **GitHub App** (klasik OAuth `repo` scope değil) kullanılarak izin repo
düzeyinde daralıyor — kullanıcı tüm depolarına değil, seçtiği depoya erişim veriyor.
Rate limit App kurulumu başına 5000/saat, tek kullanıcı ölçeğinde sorun değil. Ek
indeks gerekmiyor çünkü versiyon listesi GitHub Commits API'sinden anlık çekiliyor,
Postgres'e hiç yazılmıyor. Bu istisna varsayılanı değiştirmiyor — yalnızca isteyen
kullanıcıya açık bir kapı.

---

## 1. Sistem şeması

```
  app.espcode.dev                        api.espcode.dev
  (Cloudflare Pages, static)             (VPS, nginx → ide-api)
        │                                       │
        │  fetch + EventSource (credentials)    │
        └───────────────────────────────────────┤
                                                │
                    ┌───────────────────────────┼───────────────┐
                    │                           │               │
              ┌─────▼──────┐            ┌───────▼──────┐  ┌─────▼──────┐
              │  Postgres  │            │  redis-jobs  │  │ Cloudflare │
              │ (mevcut,   │            │  (BullMQ)    │  │     R2     │
              │  yeni DB)  │            └───────┬──────┘  │  .bin/.elf │
              │ users      │                    │         └─────▲──────┘
              │ projects   │            ┌───────▼──────┐        │
              │ versions   │            │ ide-builder  │────────┘
              │ builds     │            │ (izole ağ)   │
              │ shares     │            └──────────────┘
              └────────────┘
```

Web Serial ve flash tamamen tarayıcıda; sunucu firmware yazma yoluna hiç girmiyor.

---

## 2. Kritik kısıt: domain topolojisi

**Frontend ve API aynı apex domain altında olmalı.** Bu bir tercih değil, cookie tabanlı
auth'un çalışması için ön koşul:

- `app.espcode.dev` (Pages) + `api.espcode.dev` (VPS) → same-site, cross-origin
- Cookie: `Domain=.espcode.dev; HttpOnly; Secure; SameSite=Lax; Path=/`
- CORS: `Access-Control-Allow-Origin: https://app.espcode.dev` + `Allow-Credentials: true`
- `EventSource(url, { withCredentials: true })`

Farklı apex domain kullanılırsa (`espcode.pages.dev` + `api.baskasite.com`) cookie
`SameSite=None` olmak zorunda kalır ve tarayıcıların üçüncü taraf çerez engellemesine
takılır — Safari'de bugün, Chrome'da yakın gelecekte. Bu durumda tek çıkış yol
`Authorization` header'ına geçmek olur, ama `EventSource` özel header gönderemez
(frontend.plan.md §8.2 bunu zaten tespit etmiş) ve build log akışı kırılır.

**Aksiyon:** DNS ve domain seçimi Faz 0'da kesinleşir, sonra değişmez.

---

## 3. Veri modeli

Mevcut Postgres instance'ında yeni bir veritabanı: `espcode`. Migration aracı: Prisma
(NestJS ile doğal uyum) veya `node-pg-migrate`. Şema kasten dar tutuldu.

```sql
CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id     bigint UNIQUE NOT NULL,
  login         text NOT NULL,
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                    text NOT NULL,
  fqbn                    text NOT NULL,
  source                  text,                     -- güncel taslak, tek .ino; storage_provider='github' ise kullanılmaz
  storage_provider        text NOT NULL DEFAULT 'postgres',  -- 'postgres' | 'github'
  github_installation_id  bigint,
  github_repo_full_name   text,                     -- 'kullanici/repo'
  github_branch           text,                     -- 'espcode/<proje-adı>'
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON projects (user_id, updated_at DESC);

CREATE TABLE github_installations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  installation_id  bigint NOT NULL UNIQUE,
  account_login    text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE builds (
  build_key     char(64) PRIMARY KEY,     -- backend.plan.md §6.1 içerik-adresli anahtar
  fqbn          text NOT NULL,
  core_version  text NOT NULL,
  flash_bytes   integer,
  ram_bytes     integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE project_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source      text NOT NULL,              -- o anki tam snapshot
  fqbn        text NOT NULL,
  build_key   char(64) REFERENCES builds(build_key),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON project_versions (project_id, created_at DESC);

CREATE TABLE shares (
  slug        text PRIMARY KEY,           -- kısa, URL-güvenli, 8 karakter
  build_key   char(64) NOT NULL REFERENCES builds(build_key),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  fqbn        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

### Tasarım notları

- **`projects.source` tek alan, çoklu dosya yok.** Arduino sketch'lerinin ezici çoğunluğu
  tek `.ino`. Çoklu dosya desteği tabloyu `project_files(project_id, path, content)` haline
  getirir; ihtiyaç ortaya çıkana kadar eklenmiyor.
- **`project_versions` yalnızca flash edilen kod için yazılır**, her kaydetmede değil.
  Kullanıcının istediği şey "karta yüklediğim programlar" — otomatik taslak geçmişi değil.
  Bu, tablo büyümesini de doğal olarak sınırlıyor.
- **`builds` tablosu R2'nin aynası değil, indeksi.** Gerçek dosyalar R2'de; burada boyut
  bilgisi ve `last_used_at` var. R2 lifecycle kuralı (90 gün) bir objeyi silerse satır
  kalır ama `HEAD` başarısız olur — API bunu "artifact süresi doldu, yeniden derle"
  olarak ele alır.
- **Aynı kaynak = aynı `build_key` = paylaşılan artifact.** İki farklı kullanıcı aynı Blink
  kodunu derlerse aynı `.bin`'i alır. Kaynak kod R2'ye hiç yazılmadığı için bu bir sızıntı
  değil; deterministik derlemenin doğal sonucu.
- **`storage_provider='github'` projelerde `project_versions`'a hiç yazılmaz.** Versiyon
  geçmişi GitHub'ın kendi commit geçmişi; Postgres'te ikinci bir kopya tutmak "GitHub
  gerçekten storage olsun" isteğiyle çelişir. Bu yüzden versiyon kotası da bu projeler
  için uygulanmaz (aşağıya bkz.).

### Kotalar (portföy kapsamı)

| Sınır | Değer | Nerede uygulanır |
|---|---|---|
| Kullanıcı başına proje | 20 | `POST /api/projects` |
| Proje başına versiyon | 30 (en eskisi silinir) — yalnızca `storage_provider='postgres'` | versiyon yazımında |
| Kaynak kod boyutu | 256 KB | istek gövdesi doğrulaması |
| Derleme / kullanıcı / saat | 60 | ide-api, Redis sayaç |
| Derleme / IP / dakika | 5 | Cloudflare kuralı (backend.plan.md §5.3) |

### 3.1 GitHub depolama modu (opsiyonel, proje bazında)

Kullanıcı bir projeyi Postgres yerine kendi GitHub deposuna bağlayabilir. Kimlik
doğrulamadaki GitHub OAuth'tan (§4) tamamen ayrı bir yetkilendirme: ayrı bir **GitHub
App** (`contents: write` izniyle), kişisel erişim tokenı değil, kurulum (installation)
bazlı kısa ömürlü token kullanır.

**Bağlama akışı:**
```
1. Proje ayarlarında "GitHub'a bağla" → github.com/apps/<app>/installations/new?state=…
2. Kullanıcı GitHub tarafında hangi repo(lar)a izin vereceğini seçer, onaylar
3. GitHub → /api/github/callback?installation_id&setup_action&state
4. state doğrulanır, github_installations upsert edilir (installation_id, account_login)
5. Frontend GET /api/github/installations/:id/repos ile izin verilen repoları listeler
6. Kullanıcı repo seçer → projects.{storage_provider,github_installation_id,
   github_repo_full_name,github_branch='espcode/<proje-adı>'} yazılır
7. Branch yoksa server oluşturur (Git Refs API, default branch HEAD'inden)
```

**Yeni repo oluşturma yok.** GitHub App installation token'ı kişisel hesapta yeni repo
açamıyor (bu bir GitHub platform kısıtı — yalnızca org hesaplarında `Administration:
write` ile çalışıyor). Kullanıcı repo'yu GitHub'da kendisi açar, App'i o repoya kurar,
espcode'da listeden seçer.

**Commit akışı** (flash başarılı olduğunda, plan §6'daki "v12 kaydedildi" bildiriminin
GitHub karşılığı):
```
1. Installation token üretilir (App private key + installation_id → ~1 saatlik token)
2. GET /repos/{repo}/contents/{path}?ref={branch} → mevcut dosyanın sha'sı (varsa)
3. PUT /repos/{repo}/contents/{path}
   { message: "espcode: flash <fqbn> <timestamp>", content: base64(source),
     branch, sha: <2'deki sha veya yok> }
```

**Dosya yolu:** Arduino sketch kuralına uyar — `<proje-adı>/<proje-adı>.ino` (klasör
adı = dosya adı), böylece kullanıcı repo'yu yerelde klonlayıp Arduino IDE'de de
açabilir.

**Çakışma:** `PUT` sha uyuşmazlığından 409/422 dönerse otomatik merge yapılmaz — plan
§4.3'teki "hangi sürümü tutayım?" felsefesiyle aynı: kullanıcıya "bu dosya GitHub'da
elden değişmiş, üzerine yazayım mı?" sorulur, onaylanırsa sha yeniden okunup tekrar
denenir.

**Repo veya kurulum silinirse:** `GET`/`PUT` 404 döner, proje "GitHub bağlantısı koptu,
yeniden bağla" durumuna düşer. Versiyon geçmişi zaten yalnızca GitHub'da yaşadığı için
bu erişilemez olur — kullanıcı repo'yu sildiğinde bunu kabul etmiş sayılır.

---

## 4. Kimlik doğrulama

### 4.1 Akış

Sunucu tarafı OAuth (client secret tarayıcıya hiç inmiyor):

```
1. Kullanıcı "GitHub ile giriş" → GET api.espcode.dev/api/auth/github
2. ide-api state üretir (Redis'te 10 dk TTL), GitHub'a 302
3. GitHub → GET /api/auth/github/callback?code&state
4. state doğrulanır, code → access_token (scope: read:user)
5. GET api.github.com/user → github_id, login, avatar
6. users tablosunda upsert
7. Oturum: imzalı JWT, HttpOnly cookie, 30 gün
8. 302 → https://app.espcode.dev/
```

GitHub access token **saklanmıyor**. Kimlik doğrulandıktan sonra işi bitiyor; depolama
GitHub'da olmadığı için sonradan kullanılacak bir yer yok. Saklanmayan token sızmaz.

### 4.2 Anonim kullanım birinci sınıf vatandaş

Giriş **yalnızca kaydetme için** gerekli. Giriş yapmamış kullanıcı:

- editörü kullanır, derler, karta yazar, monitörü açar, `.bin` indirir
- projesi IndexedDB'de tutulur (frontend.plan.md §2 zaten böyle planlamış)
- kotası IP başına uygulanır

Bu, portföy projesi için önemli: ziyaretçi hesap açmadan tüm değeri görebilmeli. Giriş
ekranı bir duvar değil, bir yükseltme.

### 4.3 Yerel taslak ile sunucu kaydı arasındaki ilişki

IndexedDB, sunucunun cache'i değil — **kurtarma katmanı**. Her editör değişikliği debounce
ile IndexedDB'ye yazılır (sekme çökerse kod kaybolmaz). Sunucuya yazma yalnızca açık
kaydetme veya flash anında olur.

Çakışma çözümü kasten basit: sunucudaki `updated_at` yerel snapshot'takinden yeniyse
kullanıcıya "bu proje başka bir sekmede güncellendi, hangisini tutayım?" diye sorulur.
Otomatik birleştirme yok — tek dosyalık sketch için orantısız.

### 4.4 Yerel geliştirme

Prod'daki apex-domain kısıtı (§2) yerelde `localhost` + farklı port ile karşılanıyor:
web `localhost:3000`, api `localhost:3001`. Modern tarayıcılar aynı host, farklı portu
same-site sayar; `SameSite=Lax` yeterli, `Secure=false` (yalnızca dev'de, `NODE_ENV`
ile koşullu). Ayrı bir `/etc/hosts` subdomain simülasyonu gerekmiyor.

---

## 5. API sözleşmesi

`docs/frontend.plan.md` §15'teki tablo korunuyor, üzerine ekleniyor. Tüm uçlar
`api.espcode.dev` altında, tümü cookie ile kimlik doğrular.

### Mevcut sözleşme (değişmiyor)

| Uç | Not |
|---|---|
| `POST /api/compile` | Gövde: `{ source, fqbn, options, projectId? }` |
| `GET /api/jobs/:id/stream` | SSE — `log`, `done`, `failed` |
| `POST /api/decode` | `{ buildKey, addresses[] }` → çözülmüş backtrace |
| `GET /api/boards` | Statik FQBN enum'u |

`projectId` alanı yeni ve opsiyonel: verilirse ve derleme başarılıysa, sunucu o proje için
bir `project_versions` satırı yazar. Anonim kullanıcı bu alanı göndermez.

### Yeni uçlar

| Metot | Yol | İşlev |
|---|---|---|
| `GET` | `/api/auth/github` | OAuth başlat |
| `GET` | `/api/auth/github/callback` | Cookie kur, frontend'e dön |
| `POST` | `/api/auth/logout` | Cookie temizle |
| `GET` | `/api/me` | `{ id, login, avatarUrl, quota }` veya 401 |
| `GET` | `/api/projects` | Liste — `{ id, name, fqbn, updatedAt, versionCount }` |
| `POST` | `/api/projects` | Oluştur → `{ id }` |
| `GET` | `/api/projects/:id` | Tam kayıt + son 10 versiyon başlığı |
| `PATCH` | `/api/projects/:id` | `{ name?, fqbn?, source? }` |
| `DELETE` | `/api/projects/:id` | Kaskat siler |
| `GET` | `/api/projects/:id/versions` | Versiyon listesi — `storage_provider='github'` ise GitHub Commits API'sine proxy |
| `GET` | `/api/versions/:id` | Tek versiyonun kaynağı (geri yükleme) — github-backed'de Contents API'sine proxy |
| `GET` | `/api/builds/:key/download?asset=bin\|elf` | 302 → imzalı R2 URL (5 dk) |
| `POST` | `/api/shares` | `{ buildKey, title, fqbn }` → `{ slug }` |
| `GET` | `/api/shares/:slug` | Paylaşım sayfası verisi (auth gerektirmez) |
| `GET` | `/api/github/install` | GitHub App kurulum akışını başlat (§3.1) |
| `GET` | `/api/github/callback` | `installation_id` doğrula, `github_installations` upsert |
| `GET` | `/api/github/installations/:id/repos` | İzin verilen repoları listele |
| `POST` | `/api/projects/:id/github-link` | `{ installationId, repoFullName }` → branch oluştur, projeyi bağla |
| `DELETE` | `/api/projects/:id/github-link` | Bağlantıyı kaldır, `storage_provider='postgres'`e döner (`source` boş kalır) |

### Artifact erişimi: imzalı URL, public değil

`backend.plan.md` §6.2 `R2_PUBLIC_BASE` ile public bucket varsayıyor. Kullanıcı projeleri
devreye girdiğinde bu değişmeli: bucket private kalır, `GET /api/builds/:key/download`
sahiplik kontrolü yapar ve kısa ömürlü imzalı URL'e 302 verir.

Anahtar zaten sha256 olduğu için tahmin edilemez, ama "tahmin edilemez" ile "yetkilendirilmiş"
aynı şey değil — bir URL log'a, Referer'a veya paylaşılan ekran görüntüsüne düştüğünde
public bucket'ta kalıcı erişim olur. İmzalı URL'de 5 dakikada söner.

Paylaşım sayfası (`/f/:slug`) istisnası: `shares` tablosunda kaydı olan bir `build_key`
auth'suz indirilebilir. Paylaşımın amacı bu.

---

## 6. Frontend'e eklenecekler

`docs/frontend.plan.md` §3'teki dizin yapısına ekler:

```
src/
├─ app/
│  ├─ page.tsx                    # IDE kabuğu (mevcut)
│  ├─ projects/page.tsx           # YENİ — proje listesi
│  └─ f/[slug]/page.tsx           # paylaşım sayfası (mevcut planda var)
├─ features/
│  ├─ auth/
│  │  ├─ useAuth.ts               # YENİ — /api/me, login/logout
│  │  └─ AuthGate.tsx             # YENİ — kaydetme butonlarını sarar
│  └─ projects/
│     ├─ useProjects.ts           # YENİ — CRUD + kota durumu
│     ├─ ProjectList.tsx          # YENİ
│     ├─ VersionHistory.tsx       # YENİ — versiyon → editöre geri yükle (github-backed'de proxy'den okur)
│     ├─ useGithubStorage.ts      # YENİ — install/callback/repo listesi/link durumu
│     ├─ GithubLinkDialog.tsx     # YENİ — repo seçim diyaloğu
│     └─ local-draft.ts           # YENİ — IndexedDB taslak katmanı
```

**`/f/[slug]` ve static export uyumu.** Next.js `output: 'export'` dinamik rotayı build
anında bilmek ister. Paylaşım slug'ları çalışma zamanında üretildiği için
`generateStaticParams` kullanılamaz. Çözüm: sayfa iskeleti statik kalır, slug
`window.location`'dan okunur ve içerik `GET /api/shares/:slug` ile istemci tarafında
çekilir. Cloudflare Pages'te `/f/*` için bir `_redirects` kuralı gerekir.

**Flash sonrası versiyon kaydı.** Başarılı flash'tan sonra, giriş yapılmışsa ve aktif
proje varsa, sessizce `project_versions` satırı yazılır ve UI'da küçük bir "v12 kaydedildi"
bildirimi çıkar. Kullanıcıya soru sorulmaz — "yüklediklerim kayıtlı kalsın" isteğinin
doğru karşılığı otomatik olmasıdır.

---

## 7. Compose ve altyapı değişiklikleri

`backend.plan.md` §4'teki compose dosyasına minimum ekleme:

```yaml
  ide-api:
    networks: [ide-net, proxy-net, db-net]   # db-net EKLENDİ
    environment:
      DATABASE_URL: postgres://espcode:${PG_PASSWORD}@postgres:5432/espcode
      GITHUB_CLIENT_ID: ${GITHUB_CLIENT_ID}
      GITHUB_CLIENT_SECRET: ${GITHUB_CLIENT_SECRET}
      SESSION_SECRET: ${SESSION_SECRET}
      APP_ORIGIN: https://app.espcode.dev
      COOKIE_DOMAIN: .espcode.dev
      R2_SIGN_TTL_SEC: "300"
      GITHUB_APP_ID: ${GITHUB_APP_ID}                      # §3.1 — kimlik OAuth'tan ayrı app
      GITHUB_APP_PRIVATE_KEY_PATH: /run/secrets/github_app.pem
    secrets: [github_app_pem]
    mem_limit: 512m       # 384m → 512m (Prisma client + pg pool)

secrets:
  github_app_pem:
    file: ./secrets/github_app.pem   # GitHub App private key, .env değil dosya olarak taşınır
```

- `db-net`: mevcut Postgres'in bulunduğu ağın adı — kurulumda doğrulanmalı. `ide-builder`
  bu ağa **kesinlikle katılmaz**; izolasyonu (`internal: true`) bozulmamalı.
- `mem_limit` 384 → 512 MB: `backend.plan.md` §2.1'deki toplam tavan 2688 → 2816 MB olur.
  6.2 GB boş RAM'de fark önemsiz.
- Postgres bağlantı havuzu küçük tutulmalı (`max: 5`) — 4 vCPU'lu paylaşımlı bir makinede
  mevcut DB'nin bağlantı bütçesini yemesin.

Yeni sır değerleri `.env`'e: `PG_PASSWORD`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
`SESSION_SECRET` (`openssl rand -base64 48`), `GITHUB_APP_ID`. `GITHUB_APP_PRIVATE_KEY`
`.env`'e değil, `./secrets/github_app.pem` dosyasına konur (Docker secret olarak monte
edilir) — private key `.env` gibi düz metin dosyalarda tutulmayacak kadar hassas.

---

## 8. Depo yapısı

```
espcode/
├─ docs/
│  ├─ backend.plan.md          # mevcut
│  ├─ frontend.plan.md         # mevcut
│  └─ master.plan.md           # bu doküman
├─ web/                        # Next.js static export
├─ api/                        # NestJS — Dockerfile burada
│  └─ prisma/schema.prisma
├─ builder/                    # BullMQ worker + arduino-cli
│  └─ warmup/Blink/
├─ scripts/                    # prune-buildcache.sh, reset-and-warm-cache.sh
├─ docker-compose.yml
└─ .env.example
```

Tek depo, workspace aracı yok — `web/` ve `api/` bağımsız `package.json`'lar. Paylaşılan
tek şey tip tanımları; onlar da `api/src/contracts.ts`'ten `web/src/lib/contracts.ts`'e
elle kopyalanacak kadar küçük. Portföy ölçeğinde monorepo araç zinciri kurmanın getirisi
yok.

---

## 9. Uygulama sırası

İki dokümandaki fazlar birleştirildi. **Faz 1-3 sunucuya hiç dokunmuyor** — VPS
hazırlanmadan önce çalışan ve gösterilebilir bir ürün ortaya çıkıyor.

| Faz | Kapsam | Bağımlılık | Çıktı |
|---|---|---|---|
| **0** | Depo iskeleti, domain + DNS, Pages projesi, GitHub OAuth app kaydı | — | Boş ama dağıtılmış kabuk |
| **1** | Web Serial bağlantısı, chip bilgisi, yerel `.bin` ile flash, progress | — | Çalışan flasher, sunucu yok |
| **2** | Seri monitör (xterm) + port devri (`monitoring` ↔ `flashing`) | 1 | Bağlan → yaz → izle döngüsü |
| **3** | Plotter (uPlot) | 2 | Arduino IDE'yi geçtiğin ilk nokta |
| **4** | VPS: prune, `ide-net`, `redis-jobs`, builder imajı, toolchain, cache ısıtma | — | Manuel job ile uçtan uca derleme |
| **5** | `ide-api` + `POST /api/compile` + SSE + nginx + CM6 editör + gcc→satır eşlemesi | 4 | Gerçek IDE |
| **6** | Postgres, GitHub OAuth, proje CRUD, versiyon geçmişi, `.bin` indirme | 5 | **Kalıcılık — bu planın çekirdeği** |
| **6.1** | Opsiyonel GitHub depolama: GitHub App, repo bağlama, commit akışı (§3.1) | 6 | Kullanıcı proje bazında GitHub'ı seçebilir |
| **7** | Exception decoder (`.elf` + `addr2line`) | 5 | Ayırt edici özellik |
| **8** | `/f/[slug]` paylaşım sayfası + `shares` tablosu + Improv WiFi | 6 | Dışa açılan yüz |
| **9** | Flash haritası imza öğesi, tasarım cilası, R2 lifecycle, cron bakım | 8 | Portföy sunumu |

Faz 4 ile 1-3 paralel yürütülebilir (bağımsız katmanlar). Faz 6 planın ağırlık merkezi:
"programlarım kayıtlı kalsın" isteğinin karşılığı burası.

---

## 10. Risk kaydı (yeni katmana ait)

`backend.plan.md` §11'deki tabloya ek:

| # | Risk | Olasılık | Etki | Karşılık |
|---|---|---|---|---|
| 10 | Cookie cross-site engellenir | Yüksek (yanlış domain kurulursa) | Kritik | Aynı apex domain zorunlu (§2), Faz 0'da kesinleşir |
| 11 | SSE + `withCredentials` CORS preflight'a takılır | Orta | Yüksek | nginx'te `Allow-Credentials` ve tam origin; Faz 5'te uçtan uca test |
| 12 | GitHub OAuth callback URL uyuşmazlığı | Orta | Düşük | Prod ve `localhost` için iki ayrı OAuth app |
| 13 | Postgres bağlantı havuzu mevcut DB'yi sıkıştırır | Düşük | Orta | `max: 5`, `pg_stat_activity` ile ilk hafta izle |
| 14 | R2 lifecycle artifact'ı siler, versiyon kaydı ölü referans olur | Orta | Düşük | `HEAD` başarısızsa "yeniden derle" akışı; `last_used_at` güncelle |
| 15 | Kota aşımı sessiz veri kaybı yaratır | Düşük | Orta | 30. versiyondan sonra en eskisi silinir, UI'da açıkça yazar |
| 16 | Static export'ta dinamik `/f/:slug` rotası 404 verir | Yüksek | Orta | Pages `_redirects` kuralı, Faz 8'de ilk iş |
| 17 | GitHub App installation token yenileme başarısız olur (private key okunamaz, App askıya alınmış vb.) | Düşük | Orta | Commit isteği 502 döner, "GitHub'a yazılamadı, tekrar dene" — kullanıcı verisi kaybolmaz, IndexedDB taslak ayakta |
| 18 | Kullanıcı repo'yu veya App kurulumunu siler, versiyon geçmişi erişilemez olur | Orta | Düşük | Beklenen davranış (§3.1) — kullanıcı sildiğinde kabul etmiş sayılır, "bağlantı koptu" durumu net gösterilir |
| 19 | GitHub'da elden değiştirilen dosya sha çakışması yaratır, commit reddedilir | Düşük | Düşük | Otomatik merge yok, kullanıcıya sor (§3.1, §4.3 ile aynı felsefe) |
| 20 | Kişisel hesapta "yeni repo oluştur" GitHub App ile çalışmıyor (platform kısıtı) | Yüksek (özelliği hiç sunmuyoruz) | Düşük | Kapsam dışı bırakıldı — kullanıcı repo'yu GitHub'da kendisi açar (§3.1) |

---

## 11. Doğrulama

### Faz 1-3 (donanım, sunucusuz)

`frontend.plan.md` §13'teki 8 maddelik smoke listesi aynen geçerli. Kritik olan 8. madde:
flash sırasında kabloyu çek → uygulama donmamalı, anlamlı hata vermeli.

### Faz 4-5 (derleme yolu)

```bash
# Ağ izolasyonu — builder internete çıkamamalı
docker compose exec ide-builder curl -m 5 https://example.com    # BAŞARISIZ olmalı
docker compose exec ide-builder getent hosts redis-jobs          # çözülmeli

# Uçtan uca derleme
curl -X POST https://api.espcode.dev/api/compile \
  -H 'content-type: application/json' \
  -d '{"source":"void setup(){}\nvoid loop(){}","fqbn":"esp32:esp32:esp32s3"}'
# → { cached: false, jobId } veya { cached: true, binUrl }

# Aynı istek ikinci kez → cached: true, ~0 CPU
```

### Faz 6 (kalıcılık — bu planın çekirdeği)

```bash
# 1. Giriş
open https://api.espcode.dev/api/auth/github
# → GitHub onayı → app.espcode.dev'e dönüş

# 2. Cookie gerçekten gönderiliyor mu
curl -i --cookie-jar /tmp/c.txt https://api.espcode.dev/api/me
# → 200 { login, avatarUrl }  (401 gelirse §2 domain kısıtı ihlal edilmiş)

# 3. Proje yaşam döngüsü
curl -b /tmp/c.txt -X POST https://api.espcode.dev/api/projects \
  -d '{"name":"Blink","fqbn":"esp32:esp32:esp32s3","source":"..."}'
curl -b /tmp/c.txt https://api.espcode.dev/api/projects

# 4. Sahiplik izolasyonu — başka kullanıcının projesi 404 dönmeli, 403 değil
#    (403 kaydın varlığını sızdırır)
curl -b /tmp/other.txt https://api.espcode.dev/api/projects/<id>   # 404

# 5. İmzalı indirme
curl -b /tmp/c.txt -i "https://api.espcode.dev/api/builds/<key>/download?asset=bin"
# → 302, Location'daki URL 5 dk sonra 403 vermeli
```

**Tarayıcıda elle geçilecek akış:** giriş yap → proje yaz → derle → karta yükle →
"v1 kaydedildi" bildirimi → sayfayı yenile → proje listesinden aç → versiyon geçmişinden
geri yükle → `.bin` indir. Bu zincirin tamamı çalışıyorsa Faz 6 bitmiştir.

**Anonim akış regresyonu:** çıkış yap → aynı editörde derle ve karta yaz. Kaydetme butonu
"giriş yap" davetine dönüşmeli, geri kalan her şey çalışmalı.

### Faz 6 birim testleri (donanımsız)

- Kota uygulama: 21. proje 429, 31. versiyon en eskisini siler (yalnızca `storage_provider='postgres'`)
- Sahiplik: her uçta `user_id` filtresi — eksik filtre testi kırmalı
- `build_key` üretimi: aynı kaynak farklı satır sonlarıyla aynı anahtarı vermeli
- Cookie imza doğrulaması: kurcalanmış JWT 401

### Faz 6.1 (GitHub depolama, opsiyonel)

- Repo bağlama: proje `github`'a bağlanınca `source` alanı boş kalmalı, `storage_provider` güncellenmiş olmalı
- Commit akışı: flash sonrası GitHub'da `<proje-adı>/<proje-adı>.ino` dosyası doğru içerikle oluşmalı/güncellenmeli
- Sha çakışması: dosya GitHub'da elden değiştirilip tekrar flash edilince 409 kullanıcıya "üzerine yazayım mı?" olarak yansımalı
- Bağlantı kopması: repo silindikten sonra `GET /api/projects/:id/versions` 404 yerine "bağlantı koptu" durumunu döndürmeli (ölü referans değil)
- İzolasyon: installation A'nın token'ıyla installation B'nin reposuna erişim denemesi reddedilmeli

---

## 12. Bu planın kapsamadıkları (bilinçli)

- **Çoklu dosya projeleri** — tek `.ino` yeterli, ihtiyaç kanıtlanınca eklenir
- **Kullanıcı kütüphanesi yükleme** — builder ağ izolasyonuyla temelden çelişir
- **İşbirlikçi düzenleme** — CRDT altyapısı portföy ölçeğinde orantısız
- **clangd/LSP** — statik tamamlama listesi (`frontend.plan.md` §8.4) ilk sürüm için yeter
- **Mobil destek** — Web Serial yok, olmayacak
- **Manuel versiyon silme (Postgres-backed)** — 30 limit + otomatik en-eski-silinir yeterli;
  isteyen kullanıcı zaten GitHub depolamaya geçebilir (§3.1)
- **GitHub'da "yeni repo oluştur"** — GitHub App kişisel hesapta repo oluşturamıyor
  (platform kısıtı, risk #20); kullanıcı repo'yu kendisi açar
