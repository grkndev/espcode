# Web ESP IDE — VPS Tarafı Mimari ve Dağıtım Planı

**Kapsam:** Yalnızca sunucu tarafı. Web Serial, esptool protokolü, editör, seri monitör ve
tarayıcı içi her şey ayrı bir raporun konusu.

**Hedef:** Mevcut VPS'te çalışan 4 proje + 2 veritabanı + 1 Redis'i hiçbir şekilde
sıkıştırmadan, derleme servisini aynı makineye yerleştirmek.

---

## 1. Mevcut durum envanteri

Ölçülen değerler:

| Kaynak | Değer |
|---|---|
| OS | Ubuntu 24.04.4 LTS, kernel 6.8 |
| Host | OpenStack Nova (paylaşımlı hypervisor) |
| CPU | 4 vCPU, Intel Haswell ~2.0 GHz |
| RAM | 7751 MiB toplam / 1498 MiB kullanımda → **~6.2 GB boş** |
| Page cache | 5.7 GB (DB'ler bundan faydalanıyor) |
| Swap | **Yok** |
| Steal time | %0 (komşu baskısı yok) |
| Disk | 72 GB / 22 GB kullanımda → **51 GB boş** |
| Docker çöp | ~10.7 GB geri kazanılabilir (build cache 5.6 + images 5.0) |
| Mevcut Redis | maxmemory 256 MB, policy `allkeys-lru` → **eviction yapıyor** |

İki sonuç doğrudan mimariyi belirliyor:

- **Steal time sıfır** olduğu için CPU tahminleri nominal alınabilir; derleme süreleri
  öngörülebilir.
- **Mevcut Redis eviction yapıyor**, dolayısıyla kuyruk için kullanılamaz (Bölüm 5).

---

## 2. Kaynak bütçesi

### 2.1 RAM tahsisi

| Servis | `mem_limit` | Tipik idle | Peak |
|---|---|---|---|
| `ide-api` | 384 MB | ~70 MB | ~150 MB |
| `ide-builder` | 2048 MB | ~120 MB | ~900 MB |
| `redis-jobs` | 256 MB | ~12 MB | ~60 MB |
| **Toplam tavan** | **2688 MB** | **~200 MB** | **~1.1 GB** |

6.2 GB boş RAM'den en kötü senaryoda 2.7 GB, gerçekçi kullanımda ~1.1 GB düşüyor.
Kalan 3.5 GB+ hem mevcut servislerin büyümesi hem de page cache için tampon.

**Swap olmadığı için her konteynerin sert tavanı olması zorunlu.** Limitsiz bir konteyner
şiştiğinde kernel OOM killer'ı çalıştırır ve kurbanı `oom_score` üzerinden seçer — bu
büyük ihtimalle en çok bellek tutan süreç, yani Postgres olur. Sert `mem_limit`,
öldürülecek sürecin builder olmasını garanti eder.

### 2.2 CPU tahsisi

| Servis | `cpus` | `cpu_shares` |
|---|---|---|
| `ide-api` | 0.5 | 1024 (varsayılan) |
| `ide-builder` | 2.0 | **256** |
| `redis-jobs` | 0.25 | 1024 |

`cpu_shares: 256`, çekişme anında planlayıcının DB'lere öncelik vermesini sağlar.
Sistem boştayken builder yine 2 çekirdeği tam kullanır; sıkışınca kendiliğinden geri
çekilir. Bu, sabit bir kota yerine esnek bir öncelik mekanizması — boş zamanı israf
etmiyor, dolu zamanda zarar vermiyor.

`cpus: "2.0"` sert tavan olarak 4 vCPU'nun ikisini garanti altına alıyor.

### 2.3 Disk tahsisi

Önce temizlik:

```bash
docker builder prune -af      # ~5.6 GB
docker image prune -af        # ~5.0 GB
```

51 GB → ~61 GB.

| Kalem | Bütçe |
|---|---|
| `ide_toolchain` volume (arduino-cli + esp32 core, xtensa + riscv) | 5 GB |
| `ide_buildcache` volume (`core.a` ve ara nesneler) | 10 GB tavan |
| Docker imajları (api + builder) | 1.5 GB |
| **Toplam** | **~17 GB** |

Kalan ~44 GB, DB'lerin büyümesi için fazlasıyla yeterli. **Toolchain'i budamaya gerek
yok** — hem Xtensa (ESP32/S2/S3) hem RISC-V (C3/C6/H2/P4) ailesi kurulabilir.

Derlenmiş firmware'ler VPS diskinde tutulmayacak; Bölüm 6'ya bakınız.

---

## 3. Mimari

```
                    Cloudflare (rate limit, TLS, CDN)
                              │
                    ┌─────────┴─────────┐
                    │                   │
              [static site]        nginx (mevcut)
              Pages / Vercel            │
              — VPS'e sıfır yük —       │
                                        ▼
                              ┌──────────────────┐
                              │     ide-api      │  proxy-net + ide-net
                              │  (NestJS, 384MB) │
                              └────────┬─────────┘
                                       │ BullMQ
                              ┌────────▼─────────┐
                              │   redis-jobs     │  ide-net (internal)
                              │   (256MB cap)    │
                              └────────┬─────────┘
                                       │
                              ┌────────▼─────────┐
                              │   ide-builder    │  ide-net (internal)
                              │ concurrency: 1   │  ── internet erişimi YOK
                              │ arduino-cli      │
                              └────────┬─────────┘
                                       │ .bin + .elf
                                       ▼
                              Cloudflare R2 (artifact deposu)
```

### 3.1 Ağ ayrımı

```yaml
networks:
  ide-net:
    internal: true      # dışarıya çıkış yok — kritik satır
  proxy-net:
    external: true      # mevcut nginx ağı
```

`internal: true`, o ağdaki konteynerlerin internete çıkmasını **kernel seviyesinde**
engelliyor. `ide-builder` yalnızca bu ağda olduğu için:

- Derleme sırasında `#pragma` / build script hilesiyle dışarı veri sızdırma yolu yok
- Kullanıcı kaynağının rastgele bir URL'den kod çekmesi mümkün değil
- Kütüphane indirme gibi meşru ihtiyaçlar da kapalı → kütüphaneler önceden kurulmalı
  (istenen davranış)

`ide-api` iki ağda birden: nginx'ten erişilebilir olması için `proxy-net`, kuyruğa
erişmek için `ide-net`.

### 3.2 Neden concurrency = 1

Tek eşzamanlı derleme kararı bilinçli:

- Kaynak tavanı öngörülebilir hale geliyor: 1 build = ~900 MB + 2 çekirdek. İki paralel
  build'de tavan ikiye katlanır ve `mem_limit`'i 4 GB'a çıkarmak gerekir.
- Bu bir portföy projesi; eşzamanlı kullanıcı sayısı tek haneli olacak. Kuyrukta 20
  saniye beklemek kabul edilebilir bir maliyet.
- Kuyruk derinliği zaten doğal bir backpressure sinyali veriyor (Bölüm 5.2).

Yük artarsa `concurrency: 2` + `mem_limit: 3g` tek satırlık bir değişiklik.

---

## 4. Docker Compose

```yaml
name: web-ide

networks:
  ide-net:
    internal: true
  proxy-net:
    external: true

volumes:
  ide_toolchain:
  ide_buildcache:

services:
  redis-jobs:
    image: redis:7-alpine
    restart: unless-stopped
    command: >
      redis-server
      --maxmemory 192mb
      --maxmemory-policy noeviction
      --save ""
      --appendonly no
      --requirepass ${REDIS_JOBS_PASSWORD}
    mem_limit: 256m
    memswap_limit: 256m
    cpus: "0.25"
    networks: [ide-net]
    healthcheck:
      test: ["CMD", "redis-cli", "--no-auth-warning", "-a", "${REDIS_JOBS_PASSWORD}", "ping"]
      interval: 30s
      timeout: 3s
      retries: 3

  ide-api:
    build: ./api
    restart: unless-stopped
    depends_on:
      redis-jobs: {condition: service_healthy}
    mem_limit: 384m
    memswap_limit: 384m
    cpus: "0.5"
    pids_limit: 128
    networks: [ide-net, proxy-net]
    environment:
      REDIS_URL: redis://:${REDIS_JOBS_PASSWORD}@redis-jobs:6379/0
      R2_ENDPOINT: ${R2_ENDPOINT}
      R2_ACCESS_KEY_ID: ${R2_ACCESS_KEY_ID}
      R2_SECRET_ACCESS_KEY: ${R2_SECRET_ACCESS_KEY}
      R2_BUCKET: ide-artifacts
      R2_PUBLIC_BASE: ${R2_PUBLIC_BASE}

  ide-builder:
    build: ./builder
    restart: unless-stopped
    depends_on:
      redis-jobs: {condition: service_healthy}
    mem_limit: 2g
    mem_reservation: 256m
    memswap_limit: 2g
    cpus: "2.0"
    cpu_shares: 256
    pids_limit: 256
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop: [ALL]
    tmpfs:
      - /work:size=512m,mode=1777,nodev,nosuid,noexec
      - /tmp:size=64m,mode=1777
    volumes:
      - ide_toolchain:/opt/arduino:ro
      - ide_buildcache:/var/cache/arduino
    networks: [ide-net]
    environment:
      REDIS_URL: redis://:${REDIS_JOBS_PASSWORD}@redis-jobs:6379/0
      ARDUINO_DIRECTORIES_DATA: /opt/arduino/data
      ARDUINO_DIRECTORIES_USER: /opt/arduino/user
      ARDUINO_DIRECTORIES_DOWNLOADS: /tmp/dl
      BUILD_TIMEOUT_SEC: "120"
      COMPILE_JOBS: "2"
```

### Dikkat edilecek noktalar

- `read_only: true` — kök dosya sistemi salt-okunur. Yazılabilir tek yerler `/work`
  (tmpfs) ve `/var/cache/arduino` (volume). Derleyicinin başka hiçbir yere yazma
  ihtimali yok.
- `noexec` tmpfs'te — derleme çıktısı `.o`/`.elf` dosyaları hedef mimari için, x86'da
  zaten çalıştırılamaz; yine de savunma katmanı olarak duruyor.
- `cap_drop: [ALL]` + `no-new-privileges` — yetki yükseltme yolu kapalı.
- `memswap_limit` her yerde `mem_limit`'e eşit: swap olmadığı için semantik olarak
  gereksiz ama ileride swap eklenirse davranışı sabitliyor.

---

## 5. Kuyruk katmanı

### 5.1 Neden ayrı Redis

Mevcut Redis `maxmemory 256mb` + `allkeys-lru` ile yapılandırılmış, yani bellek dolunca
anahtarları siliyor. BullMQ oraya konursa job hash'leri ve kuyruk listeleri sessizce
kaybolur — hata dönmez, build'ler yok olur, worker boşta bekler. Teşhisi çok zor bir
arıza sınıfı.

Politikayı `noeviction` yapmak da olmaz: mevcut dört proje o Redis'i cache olarak
kullanıyor, limit dolduğunda yazma hatası almaya başlarlar.

Ayrı instance'ın maliyeti ~12 MB idle. Paylaşım uğruna alınacak risk buna değmez.

`--save "" --appendonly no`: persistence kapalı. Kaybolan bir build job'ı kullanıcı
tarafından yeniden tetiklenebilir; RDB fork'unun bellek ve I/O maliyetini ödemeye
gerek yok.

### 5.2 Worker yapılandırması

```js
new Worker('builds', processor, {
  connection,
  concurrency: 1,
  lockDuration: 180_000,      // build timeout'undan uzun
  stalledInterval: 30_000,
  maxStalledCount: 1,
  limiter: { max: 30, duration: 60_000 },
});
```

Kuyruk tarafı:

```js
await queue.add('compile', payload, {
  attempts: 1,                          // derleme hatası deterministik, tekrar anlamsız
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 200 },
  timeout: 180_000,
});
```

`attempts: 1` önemli: sözdizimi hatası içeren bir sketch üç kez denenirse üç kat CPU
harcanır ve sonuç değişmez.

### 5.3 Backpressure

`ide-api` kuyruğa eklemeden önce derinliği kontrol eder:

```js
const waiting = await queue.getWaitingCount();
if (waiting > 10) return res.status(429).json({ error: 'queue_full', retryAfter: 60 });
```

Bu, VPS'i koruyan son savunma hattı. Cloudflare tarafında da IP başına dakikada 5 build
kuralı kurulmalı — istek origin'e hiç ulaşmasın.

---

## 6. Cache ve artifact deposu

### 6.1 İçerik-adresli anahtar

```js
const key = sha256([
  normalizeSource(source),   // satır sonları normalize, sondaki boşluklar kırpılmış
  fqbn,
  JSON.stringify(buildOptions, Object.keys(buildOptions).sort()),
  coreVersion,               // ör. "esp32:esp32@3.0.7"
  libLockHash,
].join('\0'));
```

Kaynak normalizasyonu cache hit oranını gözle görülür artırıyor — aynı kodun CRLF/LF
farkıyla iki kez derlenmesini engelliyor.

### 6.2 Depolama: R2, VPS değil

```
r2://ide-artifacts/<key>/firmware.bin
r2://ide-artifacts/<key>/firmware.elf
r2://ide-artifacts/<key>/manifest.json
```

Cache hit akışı:

1. `POST /api/compile` gelir
2. API anahtarı hesaplar, R2'de `HEAD` atar
3. Varsa doğrudan public URL döner — **VPS ~0 CPU harcar, binary'yi R2 servis eder**

Bu tasarımın değeri, örnek odaklı bir sitede hit oranının doğal olarak yüksek olması:
aynı Blink, aynı WiFi scan tekrar tekrar derlenmez.

`.elf` dosyasının saklanması ileride panic backtrace çözümleme (`addr2line`) özelliği
için gerekli — client raporunda ele alınacak.

### 6.3 `core.a` cache'i (yerel)

`ide_buildcache` volume'u arduino-cli'nin `--build-cache-path`'i. İçinde derlenmiş
Arduino core arşivleri var. İlk derlemede oluşur (~4-8 dk), sonrasında her build
15-35 saniyeye iner.

**Bu, sistemdeki tek paylaşımlı yazılabilir yüzey.** Riski düşük (içerik kullanıcı
kodundan değil, güvenilen core kaynağından üretiliyor) ama sıfır değil. Hafifletme:
aylık olarak volume'u sıfırla ve güvenilen bir ısıtma turuyla yeniden doldur (Bölüm 8).

---

## 7. Güvenlik modeli

### 7.1 Tehdit

Güvenilmeyen C++ kaynağı derleniyor. C++ derlemesi kod çalıştırmaz, ama:

- `#include "/etc/passwd"` → dosya içeriği derleyici hata mesajında sızabilir
- `#include` zinciriyle veya devasa template ile CPU/RAM tüketimi (derleme bombası)
- `-fplugin=` ile keyfi kod çalıştırma (derleyici eklentisi)
- Derleme sırasında ağ erişimi denemesi

### 7.2 Kontroller

| Tehdit | Kontrol |
|---|---|
| Dosya sızdırma | `read_only: true`, sadece toolchain ro-mount, minimal imaj — okunacak hassas dosya yok |
| Derleyici eklentisi | **Kullanıcı derleyici bayrağı gönderemez.** FQBN ve build seçenekleri sabit bir enum'dan seçilir |
| Ağ erişimi | `internal: true` ağ — kernel seviyesinde çıkış yok |
| Derleme bombası | `mem_limit: 2g` + `cpus: 2.0` + `timeout 120` + `pids_limit: 256` |
| Yetki yükseltme | `cap_drop: ALL`, `no-new-privileges`, root olmayan kullanıcı |
| Job'lar arası sızıntı | Her job için `/work/<uuid>` dizini, iş bitince silinir; tmpfs zaten konteyner ömrüyle sınırlı |
| Docker kaçışı | Docker socket **mount edilmiyor** |

### 7.3 Mutlak kural

Kullanıcıdan gelen hiçbir string derleme komut satırına doğrudan geçmez. Şablon:

```js
const ALLOWED_FQBN = new Set([
  'esp32:esp32:esp32',
  'esp32:esp32:esp32c3',
  'esp32:esp32:esp32s3',
  // ...
]);
if (!ALLOWED_FQBN.has(fqbn)) throw new BadRequestException('unsupported_board');
```

Kaynak kodu dosyaya yazılır, komut satırına değil. `execFile` kullanılır, `exec`
kullanılmaz (shell yorumlaması yok).

### 7.4 Opsiyonel ek katman: bubblewrap

Derleyici sürecini ayrıca ayrı namespace'e almak istenirse:

```bash
bwrap --unshare-all --die-with-parent --new-session \
      --ro-bind /usr /usr --ro-bind /opt/arduino /opt/arduino \
      --bind "$JOB_DIR" /work --proc /proc --dev /dev --tmpfs /tmp \
      -- arduino-cli compile ...
```

**Ubuntu 24.04 uyarısı:** bu sürümden itibaren yetkisiz user namespace'ler AppArmor ile
kısıtlı (`kernel.apparmor_restrict_unprivileged_userns=1`). Konteyner içinde
`unshare -Urn true` komutuyla önce test et; başarısız olursa ya sysctl'i gevşetmen ya da
konteynere `SYS_ADMIN` vermen gerekir — ikisi de mevcut kontrolleri zayıflatır.

Bölüm 7.2'deki kontroller zaten yeterli. bwrap'i **isteğe bağlı** kabul et; çalışmıyorsa
zorlama.

---

## 8. Kurulum prosedürü

### Adım 1 — Temizlik

```bash
docker builder prune -af
docker image prune -af
df -h /                      # ~61 GB boş beklenir
```

### Adım 2 — Ağ ve gizli değerler

```bash
docker network create --internal ide-net
openssl rand -base64 32      # REDIS_JOBS_PASSWORD → .env
chmod 600 .env
```

### Adım 3 — Builder imajı

```dockerfile
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl python3 xz-utils \
    && rm -rf /var/lib/apt/lists/*

ARG ARDUINO_CLI_VERSION=1.1.1
RUN curl -fsSL "https://downloads.arduino.cc/arduino-cli/arduino-cli_${ARDUINO_CLI_VERSION}_Linux_64bit.tar.gz" \
    | tar -xz -C /usr/local/bin arduino-cli \
 && chmod +x /usr/local/bin/arduino-cli

RUN useradd -m -u 10001 builder
WORKDIR /app
COPY --chown=builder:builder package*.json ./
RUN npm ci --omit=dev
COPY --chown=builder:builder src ./src
USER builder
CMD ["node", "src/worker.js"]
```

Toolchain imaja gömülmüyor — volume'a ayrı kuruluyor. Bu sayede imaj ~250 MB kalıyor ve
kod değişikliğinde 5 GB'lık katman yeniden inşa edilmiyor.

### Adım 4 — Toolchain kurulumu (tek seferlik, ~10-20 dk)

```bash
docker run --rm \
  -v web-ide_ide_toolchain:/opt/arduino \
  -e ARDUINO_DIRECTORIES_DATA=/opt/arduino/data \
  -e ARDUINO_DIRECTORIES_USER=/opt/arduino/user \
  web-ide-builder bash -c '
    arduino-cli config init --dest-dir /tmp
    arduino-cli config add board_manager.additional_urls \
      https://espressif.github.io/arduino-esp32/package_esp32_index.json
    arduino-cli core update-index
    arduino-cli core install esp32:esp32
  '
du -sh /var/lib/docker/volumes/web-ide_ide_toolchain/_data
```

Bu adım internet gerektirdiği için `ide-net` dışında, geçici bir konteynerle yapılır.
Kurulum bittikten sonra volume kalıcı olarak salt-okunur mount edilir.

### Adım 5 — Cache ısıtma

**Kritik adım.** Soğuk `core.a` derlemesi bu CPU'da 4-8 dakika sürüyor. Bunu bir
kullanıcı isteği tetiklememeli.

```bash
# desteklenen her FQBN için bir kez
for FQBN in esp32:esp32:esp32 esp32:esp32:esp32c3 esp32:esp32:esp32s3; do
  docker compose run --rm ide-builder \
    arduino-cli compile --fqbn "$FQBN" --jobs 2 \
      --build-cache-path /var/cache/arduino \
      /app/warmup/Blink
done
```

Bu, deploy script'inin parçası olmalı; core sürümü her güncellendiğinde tekrar
çalıştırılır.

### Adım 6 — Ayağa kaldırma

```bash
docker compose up -d
docker compose logs -f ide-builder
```

### Adım 7 — nginx

```nginx
location /api/ {
    proxy_pass http://ide-api:3000/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;

    # SSE ile canlı build log akışı için
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
}
```

Log akışı için Socket.IO yerine **SSE** öneriliyor: tek yönlü veri için yeterli, ek
Redis adapter'ı gerektirmiyor, nginx yapılandırması iki satır.

---

## 9. İzleme

### Temel ölçüm

Kurulumun ilk haftası gerçek sayıları topla:

```bash
docker stats --no-stream --format \
  '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' >> /var/log/ide-stats.log
```

Cron: `*/5 * * * *`.

### OOM tespiti

```bash
docker inspect ide-builder --format '{{.State.OOMKilled}}'
```

`true` dönerse `mem_limit` yetersiz. Peak'i ölç, gerçek değerin %30 üstüne ayarla.

### Page cache etkisi

Bu, RAM muhasebesinde görünmeyen tek etkileşim kanalı. Şu an 5.7 GB page cache var ve
DB'lerin sıcak sayfaları orada. Builder her derlemede yüzlerce MB toolchain dosyası
okuyunca kernel bu sayfaları tahliye etmeye başlayabilir; `free` normal görünür ama DB
sorguları yavaşlar.

Hafifletmeler zaten planda: build dizini tmpfs'te (ara dosyalar page cache'e hiç
girmiyor) ve toolchain okuma seti sabit (ısındıktan sonra yeni sayfa çekmiyor).

Doğrulama: bir derleme yükü altında ve boştayken tipik bir DB sorgusunun süresini
karşılaştır. Beklenen sonuç "fark yok"; anlamlı bir fark görürsen sebep büyük ihtimalle
burasıdır.

### Alarm eşikleri

| Metrik | Eşik | Aksiyon |
|---|---|---|
| Kuyruk derinliği | > 10 | 429 döndür (otomatik) |
| Builder peak RSS | > 1.6 GB | `mem_limit` yükselt veya sebebi araştır |
| `MemAvailable` | < 2 GB | Yeni servis ekleme, bütçeyi gözden geçir |
| Disk kullanımı | > %75 | Cache budama sıklığını artır |
| Build süresi (p95) | > 90 sn | Cache bozulmuş olabilir, ısıtmayı tekrarla |

---

## 10. Bakım

```cron
# Haftalık Docker çöp temizliği — Pazar 04:00
0 4 * * 0 docker builder prune -af --filter until=168h && docker image prune -af

# Haftalık build cache budama — Pazar 04:30
30 4 * * 0 /opt/web-ide/scripts/prune-buildcache.sh

# Aylık cache sıfırlama + ısıtma — ayın 1'i 05:00
0 5 1 * * /opt/web-ide/scripts/reset-and-warm-cache.sh
```

`prune-buildcache.sh` — volume 8 GB'ı aşarsa en eski erişilmiş dosyaları siler:

```bash
#!/usr/bin/env bash
set -euo pipefail
CACHE=/var/lib/docker/volumes/web-ide_ide_buildcache/_data
LIMIT_MB=8192
while [ "$(du -sm "$CACHE" | cut -f1)" -gt "$LIMIT_MB" ]; do
  find "$CACHE" -type f -printf '%A@ %p\n' | sort -n | head -50 | cut -d' ' -f2- | xargs -r rm -f
done
```

R2 tarafında lifecycle kuralı: 90 gündür erişilmemiş artifact'ları sil.

---

## 11. Risk kaydı

| # | Risk | Olasılık | Etki | Karşılık |
|---|---|---|---|---|
| 1 | Builder OOM → DB'ler etkilenir | Düşük | Yüksek | Sert `mem_limit`, swap yok, ölçüm |
| 2 | Soğuk derleme kullanıcıyı 6 dk bekletir | Yüksek | Orta | Deploy'da cache ısıtma (Adım 5) |
| 3 | CPU çekişmesi DB latency'sini bozar | Orta | Orta | `cpu_shares: 256`, `--jobs 2` |
| 4 | Page cache tahliyesi | Orta | Düşük | tmpfs build dizini, ölçümle doğrula |
| 5 | Derleme bombası (devasa template) | Düşük | Orta | 120 sn timeout, `pids_limit`, cgroup |
| 6 | Toolchain diski beklenenden şişer | Düşük | Düşük | 44 GB tampon var |
| 7 | Redis job kaybı | Yok edildi | — | Ayrı `noeviction` instance |
| 8 | Core sürüm güncellemesi cache'i geçersizler | Orta | Düşük | Cache anahtarında `coreVersion` var |
| 9 | bwrap Ubuntu 24.04'te çalışmaz | Yüksek | Yok | Opsiyonel katman, temel kontroller yeterli |

---

## 12. Uygulama sırası

| Faz | İçerik | VPS etkisi |
|---|---|---|
| **0** | Prune, `.env`, `ide-net` ağı | Yok |
| **1** | `redis-jobs` ayağa kalkar | +12 MB |
| **2** | Builder imajı + toolchain volume + ısıtma | +5 GB disk |
| **3** | Worker + kuyruk; manuel job ile uçtan uca test | +120 MB idle |
| **4** | `ide-api` + nginx + SSE log akışı | +70 MB idle |
| **5** | R2 entegrasyonu + içerik-adresli cache | Yükü azaltır |
| **6** | Cloudflare rate limit kuralı | Yükü azaltır |

Faz 3'ten sonra sistem uçtan uca çalışır durumda olur; 4-6 sertleştirme ve
optimizasyondur.

---

## Ek: doğrulama komutları

```bash
# Ağın gerçekten izole olduğunu doğrula
docker compose exec ide-builder curl -m 5 https://example.com   # başarısız olmalı
docker compose exec ide-builder getent hosts redis-jobs         # çözülmeli

# Salt-okunur kök doğrulaması
docker compose exec ide-builder touch /foo                      # başarısız olmalı
docker compose exec ide-builder touch /work/foo                 # başarılı olmalı

# Bellek tavanı doğrulaması
docker compose exec ide-builder cat /sys/fs/cgroup/memory.max   # 2147483648

# Toolchain erişimi
docker compose exec ide-builder arduino-cli board listall | head
```