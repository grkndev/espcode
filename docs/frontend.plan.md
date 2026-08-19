# Web ESP IDE — Client Tarafı Mimari ve Uygulama Planı

**Kapsam:** Tarayıcıda çalışan her şey. Derleme sunucusu, kuyruk, Docker ve VPS
yapılandırması ayrı raporun konusu.

**Temel kısıt:** Web Serial yalnızca masaüstü Chromium ve Firefox 151+ üzerinde çalışır.
Bu, ürünün şeklini belirleyen tek gerçek — mobil bir hedef yok, olamaz.

---

## 1. Tarayıcı gerçekliği

| Tarayıcı | Durum | Not |
|---|---|---|
| Chrome / Edge / Opera (masaüstü) | 89+ tam destek | Birincil hedef |
| Firefox (masaüstü) | 151+ (Mayıs 2026) | Port seçiciden **önce** site-permission add-on onayı ister |
| Chrome (Android) | 148 beta | Web Serial var ama OTG + sürücü sorunu; hedeflenmiyor |
| Safari / iOS / iPadOS | **Yok, olmayacak** | WebKit ekibi kalıcı red pozisyonunda |
| Firefox (Android) | Yok | — |

### 1.1 Gating stratejisi

Sessizce patlamak kabul edilemez. Uygulama açılışta üç aşamalı kontrol yapar:

```ts
type SerialSupport =
  | { ok: true }
  | { ok: false; reason: 'insecure_context' | 'no_api' };

export function checkSerialSupport(): SerialSupport {
  if (!window.isSecureContext) return { ok: false, reason: 'insecure_context' };
  if (!('serial' in navigator)) return { ok: false, reason: 'no_api' };
  return { ok: true };
}
```

Desteklenmeyen tarayıcıda uygulama **kapanmaz** — editör, örnekler ve derleme çalışır,
yalnızca "Karta yükle" ve "Monitör" butonları devre dışı kalır ve bunun nedenini açıklayan
kalıcı bir şerit görünür. Derlenmiş `.bin`'i indirip kendi aracıyla yazmak isteyen
kullanıcı engellenmemeli.

Firefox için özel bir durum var: add-on onayı reddedilirse `requestPort()` hiç port
seçici göstermez ve sessizce başarısız olur. Bunu ayrı bir hata durumu olarak yakala
(Bölüm 12).

### 1.2 Dağıtım gereksinimleri

- **HTTPS zorunlu.** `localhost` geliştirmede muaf.
- iframe içinde açılacaksa: `allow="serial"`
- Next.js `output: 'export'`, Cloudflare Pages. Sunucu tarafı render yok — Web Serial
  zaten sadece tarayıcıda var, SSR'ın hiçbir katkısı olmaz.

---

## 2. Stack kararları

| Katman | Seçim | Gerekçe |
|---|---|---|
| Framework | Next.js (static export) | App Router, dosya tabanlı routing; SSR kapalı |
| Editör | **CodeMirror 6** | Bkz. 2.1 |
| Terminal | `@xterm/xterm` + fit + web-links addon | Fiili standart, ANSI desteği hazır |
| Grafik | **uPlot** | Bkz. 2.2 |
| Flash | `esptool-js` | Espressif'in resmi JS portu |
| State | Zustand | Seri port global tekil kaynak; Context yeterli değil |
| Kalıcılık | IndexedDB (`idb`) + OPFS | Proje dosyaları IDB, indirilen `.bin` OPFS |
| Stil | Tailwind + CSS değişkenleri | Token sistemi Bölüm 11'de |
| Bileşenler | **shadcn/ui** | Kaynak kodu projeye kopyalanan, headless (Base UI) tabanlı bileşenler — bağımlılık değil, düzenlenebilir kod. Kurulum: `npx shadcn@latest init --preset b2GVUt5DMm` (tweakcn preset, style: `base-maia`) |

### 2.1 Neden Monaco değil CodeMirror 6

| | Monaco | CodeMirror 6 |
|---|---|---|
| Bundle (tek dil, gzip) | ~900 KB – 1.4 MB | ~150 KB |
| Özel gutter / dekorasyon | Zahmetli | Birinci sınıf API |
| LSP olgunluğu | Daha iyi | `codemirror-languageserver` yeterli |
| Mobil davranış | Kötü | İyi |

Karar CM6 yönünde çünkü bu projede editörün en çok ihtiyaç duyduğu şey **özel
dekorasyon**: derleme hatalarını satıra iliştirme, panic backtrace'ini satıra
işaretleme, flash haritası gutter'ı. CM6'nın decoration API'si bunun için tasarlanmış.

Monaco'nun avantajı yalnızca clangd entegrasyonu olgunlaştığında belirginleşir. O aşamaya
gelirsen kararı yeniden aç — ama o aşamaya gelmeden 1 MB ödemenin karşılığı yok.

### 2.2 Neden uPlot

Seri plotter saniyede 50-200 örnek alacak ve sürekli akacak. Recharts/Chart.js bu yükte
her güncellemede React ağacını yeniden çizer ve birkaç bin noktadan sonra çöker. uPlot
canvas üzerine doğrudan çizer, 10k+ noktada 60fps tutar ve ~45 KB.

### 2.3 Bundle bütçesi

| Parça | Yükleme | Boyut (gzip) |
|---|---|---|
| Kabuk (Next + React + Zustand + Tailwind) | Eager | ~120 KB |
| CodeMirror 6 + C++ modu | Rota bazlı | ~150 KB |
| xterm.js + addon | Lazy (monitör açılınca) | ~110 KB |
| uPlot | Lazy (plotter açılınca) | ~45 KB |
| esptool-js | Lazy (bağlan'a basınca) | ~90 KB |
| **İlk anlamlı boya** | | **~270 KB** |

esptool-js, xterm ve uPlot'un hiçbiri sayfa açılışında yüklenmemeli:

```ts
const ESPTool = dynamic(() => import('@/lib/flash/esptool'), { ssr: false });
```

`ssr: false` isteğe bağlı değil — bu modüller `navigator` erişiyor ve build sırasında
patlarlar.

---

## 3. Uygulama mimarisi

```
src/
├─ app/
│  ├─ page.tsx                 # IDE kabuğu
│  └─ f/[slug]/page.tsx        # paylaşılabilir firmware kurulum sayfası
├─ features/
│  ├─ serial/
│  │  ├─ SerialSession.ts      # port yaşam döngüsü — TEK sahip
│  │  ├─ useSerialStore.ts
│  │  └─ reset-sequences.ts
│  ├─ flash/
│  │  ├─ flasher.ts            # esptool-js sarmalayıcı
│  │  └─ flash-map.ts          # partition offset hesapları
│  ├─ monitor/
│  │  ├─ Terminal.tsx
│  │  └─ line-buffer.ts        # ring buffer
│  ├─ plotter/
│  │  ├─ Plotter.tsx
│  │  └─ parse-samples.ts
│  ├─ editor/
│  │  ├─ Editor.tsx
│  │  ├─ arduino-completions.ts
│  │  └─ diagnostics.ts        # gcc hata → CM6 marker
│  └─ build/
│     ├─ useBuild.ts           # POST + SSE
│     └─ parse-gcc-output.ts
└─ lib/
   ├─ storage/                 # IndexedDB + OPFS
   └─ design/tokens.css
```

### 3.1 Neden tekil `SerialSession`

Seri port **paylaşılamayan bir donanım kaynağı**. React bileşenleri mount/unmount olurken
port sahipliğini takip etmek imkânsız hale gelir. Bu yüzden port, React ağacının dışında
yaşayan tek bir sınıfa ait olur; bileşenler ona Zustand üzerinden abone olur.

Bu ayrım yapılmazsa karşılaşılacak klasik hata: bileşen unmount olur, `reader` lock'u
serbest bırakılmaz, port kapanmaz, ve sonraki `requestPort()` "port already open" ile
başarısız olur. Kullanıcı için tek çözüm sayfayı yenilemek olur.

---

## 4. Seri port yaşam döngüsü

**Projenin en çok hata üreteceği yer burası.** Diğer her şey standart web geliştirme;
bu bölüm değil.

### 4.1 Durum makinesi

```
        ┌──────────────┐
        │ disconnected │◄──────────────────┐
        └──────┬───────┘                   │
               │ requestPort()             │ close() / cihaz çıkarıldı
               ▼                           │
        ┌──────────────┐                   │
        │   granted    │  (port var, açık değil)
        └──────┬───────┘                   │
               │ open({baudRate})          │
               ▼                           │
        ┌──────────────┐                   │
   ┌────┤    open      ├───┐               │
   │    └──────────────┘   │               │
   │ startMonitor()        │ flash()       │
   ▼                       ▼               │
┌──────────┐         ┌──────────┐          │
│ monitoring│◄───────►│ flashing │──────────┘
└──────────┘  devir   └──────────┘
```

`monitoring` ve `flashing` **aynı anda olamaz**. Kullanıcı monitör açıkken "Yükle"ye
basarsa akış: monitörü durdur → flash → monitörü otomatik yeniden başlat. Bu devir
kullanıcıya görünmez olmalı, ama kod içinde açıkça modellenmeli.

### 4.2 Doğru kapatma sırası

Bu sıra yanlış olduğunda port kilitli kalır. Ezberlenecek sıra:

```ts
async function stopReading() {
  if (this.reader) {
    await this.reader.cancel();        // 1. okumayı iptal et
    this.reader.releaseLock();         // 2. lock'u bırak
    this.reader = undefined;
  }
  if (this.writer) {
    await this.writer.close();         // 3. writer'ı kapat
    this.writer.releaseLock();
    this.writer = undefined;
  }
}

async function closePort() {
  await this.stopReading();
  await this.port.close();             // 4. en son port
}
```

**`TextDecoderStream` tuzağı.** Bu kalıp yaygın ama sorunlu:

```ts
// KULLANMA
const stream = port.readable.pipeThrough(new TextDecoderStream());
```

`pipeThrough` `port.readable`'ı kilitler ve pipe zinciri tamamlanana kadar bırakmaz;
`port.close()` çağrın belirsiz süre asılı kalır. Bunun yerine manuel decode:

```ts
const decoder = new TextDecoder();
this.reader = port.readable.getReader();
while (true) {
  const { value, done } = await this.reader.read();
  if (done) break;
  onText(decoder.decode(value, { stream: true }));
}
```

Kilit kontrolü sende kalır, `cancel()` anında etki eder.

### 4.3 Baud değişimi

`SerialPort` açıkken baud değiştirilemez. Monitörde baud seçici kullanıldığında:
kapat → yeni `baudRate` ile aç. Kullanıcıya bunu hissettirme, ama terminal buffer'ını
temizleme — bağlam kaybolmasın.

### 4.4 İzin kalıcılığı ve hot-plug

```ts
// Sayfa açılışında: daha önce izin verilmiş portlar
const ports = await navigator.serial.getPorts();

// Cihaz takılıp çıkarıldığında
navigator.serial.addEventListener('connect', (e) => { /* otomatik bağlan öner */ });
navigator.serial.addEventListener('disconnect', (e) => { /* durumu temizle */ });
```

`disconnect` olayı özellikle native USB kartlarda kritik — bkz. 5.3.

---

## 5. Flash yolu

### 5.1 esptool-js entegrasyonu

```ts
import { ESPLoader, Transport } from 'esptool-js';

const port = await navigator.serial.requestPort();
const transport = new Transport(port, /* enableTracing */ false);

const loader = new ESPLoader({
  transport,
  baudrate: 921600,
  romBaudrate: 115200,
  terminal: xtermAdapter,
});

const chipDesc = await loader.main();   // SYNC + stub yükleme + chip tespiti
await loader.writeFlash({
  fileArray: [{ data: binaryString, address: 0x0 }],
  flashSize: 'keep',
  eraseAll: false,
  compress: true,
  reportProgress: (i, written, total) => setProgress(written / total),
});
await loader.after();                    // hard reset → uygulamayı başlat
await transport.disconnect();
```

**İki sürüm tuzağı:**

1. `writeFlash` bazı sürümlerde `Uint8Array` değil **binary string** bekler.
   `loader.ui8ToBstr(uint8array)` yardımcısıyla dönüştür. Yanlış tip verirsen hata
   almazsın — bozuk firmware yazarsın.
2. `main()` fonksiyonunun adı sürümler arasında değişti (`main_fn` → `main`). Sürümü
   `package.json`'da sabitle (`~` değil, tam sürüm) ve yükseltmeden önce test et.

Baud stratejisi: bootloader'a 115200'de bağlan, stub yüklendikten sonra 921600'e çık.
esptool-js bunu `romBaudrate`/`baudrate` ayrımıyla kendi yapar. 921600 bazı CH340
klonlarında kararsız — hata alırsan 460800'e düş.

### 5.2 Otomatik reset — kart tipine göre

Elindeki **ESP32-S3 N16R8 DevKit** iki farklı yol sunuyor ve ikisi de farklı davranıyor.
Test sırası bu yüzden önemli.

**UART portu (CP2102/CH340 köprüsü) — klasik yol**

```
DTR=false, RTS=true      →  EN low (reset)
bekle 100ms
DTR=true,  RTS=false     →  IO0 low, EN high (download mode)
bekle 50ms
DTR=false                →  IO0 serbest
```

Web Serial'da `port.setSignals({ dataTerminalReady, requestToSend })`. Port reset
boyunca açık kalır, `SerialPort` nesnesi geçerliliğini korur. En öngörülebilir yol —
**geliştirmeye buradan başla.**

**Native USB portu — re-enumeration sorunu**

ESP32-S3'ün yerleşik USB-Serial-JTAG çevre birimi ve TinyUSB tabanlı CDC farklı
davranır. Uygulaman USB-OTG CDC kullanıyorsa, kart download moduna girerken **USB
cihazı yeniden numaralandırılır**: mevcut `SerialPort` nesnesi geçersizleşir,
`disconnect` olayı tetiklenir, ve aynı fiziksel kart yeni bir port olarak geri gelir.

Kod bunu bir hata değil, beklenen bir geçiş olarak ele almalı:

```ts
async function reacquireAfterReset(previousInfo: SerialPortInfo, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ports = await navigator.serial.getPorts();
    const match = ports.find(p => {
      const i = p.getInfo();
      return i.usbVendorId === previousInfo.usbVendorId
          && i.usbProductId === previousInfo.usbProductId;
    });
    if (match) return match;
    await sleep(200);
  }
  throw new SerialError('reenumeration_timeout');
}
```

Bu fonksiyon olmadan native USB portunda flash sonrası monitörü yeniden açamazsın.

### 5.3 Manuel mod — vazgeçilmez kaçış kapağı

Bazı kartlarda otomatik reset devresi yok veya kondansatör değeri uygun değil. Otomatik
reset iki denemede başarısız olursa UI manuel moda geçmeli:

> **Kart yanıt vermiyor.** Kartın üzerindeki BOOT düğmesini basılı tut, EN (veya RST)
> düğmesine bir kez bas, sonra BOOT'u bırak. Ardından Tekrar dene'ye bas.

Bu metin bir hata mesajı değil, bir talimat. Modal değil, flash panelinin içinde
görünmeli — kullanıcının kartla ekran arasında gidip gelmesi gerekiyor.

### 5.4 Chip bilgisi — bağlanır bağlanmaz

`loader.main()` zaten döndürüyor; ilk ekranda göster:

- Çip tipi ve revizyon (ESP32-S3, rev 0.2)
- MAC adresi
- Flash boyutu ve üretici
- Kristal frekansı
- PSRAM varlığı

Bu, kullanıcının "kart doğru bağlandı mı" sorusunu yazma işlemine hiç girmeden yanıtlıyor
ve destek yükünün önemli kısmını ortadan kaldırıyor.

### 5.5 Kesinti koruması

Flash sırasında sekme kapatılırsa kart yarı yazılmış halde kalır (kurtarılabilir ama
korkutucu):

```ts
useEffect(() => {
  if (state !== 'flashing') return;
  const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
  window.addEventListener('beforeunload', guard);
  return () => window.removeEventListener('beforeunload', guard);
}, [state]);
```

Ek olarak `navigator.wakeLock.request('screen')` — ekranın uyumasını engeller. **Sekme
throttling'ini engellemez**; bunun için garantili bir API yok. Yapılabilecek en iyi şey
flash paneline "Bu sekmede kal" uyarısı koymak ve arka plana geçildiğinde
(`document.visibilityState`) uyarıyı belirginleştirmek.

---

## 6. Seri monitör

### 6.1 Buffer yönetimi

Sınırsız büyüyen bir terminal, uzun oturumda sekmeyi öldürür. `xterm.js`'in kendi
`scrollback` ayarı (varsayılan 1000) üst sınırı çiziyor, ama uygulama tarafında da bir
ring buffer tut — dışa aktarma ve arama bunun üzerinden çalışsın.

```ts
class LineBuffer {
  private lines: { t: number; text: string }[] = [];
  constructor(private max = 5000) {}
  push(text: string, t = Date.now()) {
    this.lines.push({ t, text });
    if (this.lines.length > this.max) this.lines.splice(0, this.lines.length - this.max);
  }
}
```

### 6.2 Render batching

Kart saniyede yüzlerce satır basabilir. Her satırda `term.write()` çağırmak ana thread'i
kilitler. Gelen veriyi biriktir, `requestAnimationFrame` ile tek seferde yaz:

```ts
let pending = '';
let scheduled = false;
function enqueue(chunk: string) {
  pending += chunk;
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => { term.write(pending); pending = ''; scheduled = false; });
}
```

### 6.3 Özellikler

| Özellik | Not |
|---|---|
| Zaman damgası | Aç/kapa; ilk satırdan itibaren göreli süre de sunulabilir |
| Satır sonu seçici | Gönderirken: yok / LF / CR / CRLF |
| Baud seçici | Değişimde port kapat-aç (4.3) |
| Regex filtre | Buffer üzerinden, terminali yeniden çiz |
| ANSI renk | xterm zaten destekliyor; ESP-IDF log renkleri doğrudan çalışır |
| Dışa aktarma | `.log` ve `.csv` (zaman damgalı) |
| Gönderme kutusu | Yukarı ok ile komut geçmişi |

---

## 7. Seri plotter

Arduino IDE'nin plotter'ının yaptığından fazlasını yapmak kolay ve etkisi yüksek.

### 7.1 Ayrıştırma protokolü

İki formatı destekle:

```
1) Etiketsiz CSV:      12.4,55,3.3
2) Etiketli:           temp:12.4 hum:55 vcc:3.3
```

İkincisi tercih edilen olmalı çünkü seri çıktının içinde başka log satırları da olacak.
Ayrıştırıcı, formata uymayan satırları sessizce atlamalı — plotter açıkken normal
`Serial.println("baslatiliyor")` çıktısı grafiği bozmamalı.

### 7.2 Veri modeli

Kanal başına sabit boyutlu ring buffer (son 2000 örnek). uPlot'a tipli dizi ver,
her karede `setData` çağır. Örnek sayısı sınırlı olduğu için downsampling gerekmiyor.

Eksen: X ekseni varsayılan olarak alınma zamanı (`performance.now()`), örnek indeksi
değil — kartın örnekleme hızı sabit olmayabilir.

---

## 8. Editör ve derleme akışı

### 8.1 Derleme isteği

```ts
const res = await fetch('/api/compile', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ source, fqbn, options }),
});

// İki olası yanıt:
// { cached: true, binUrl, elfUrl }          → doğrudan flash'a geç
// { cached: false, jobId }                  → SSE'ye abone ol
```

Cache hit'te derleme adımı hiç görünmez; kullanıcı "Yükle"ye basar ve doğrudan flash
progress'i başlar. Bu, sistemin en tatmin edici anı — cache'in UX değeri, sunucu
tasarrufundan daha büyük.

### 8.2 Canlı log akışı (SSE)

```ts
const es = new EventSource(`/api/jobs/${jobId}/stream`);
es.addEventListener('log',  (e) => appendBuildLog(JSON.parse(e.data).line));
es.addEventListener('done', (e) => { setArtifacts(JSON.parse(e.data)); es.close(); });
es.addEventListener('error', () => { /* yeniden bağlan veya iptal et */ });
```

`EventSource` özel header gönderemez. Auth eklendiğinde token'ı query parametresi
olarak değil, **cookie** ile taşı — query string log'lara ve Referer'a sızar.

### 8.3 GCC hatalarını editöre eşleme — yüksek değerli özellik

Ham derleyici çıktısını terminale basmak yeterli değil. Ayrıştır ve satıra iliştir:

```ts
const GCC_LINE = /^(?<file>[^:]+):(?<line>\d+):(?<col>\d+):\s+(?<sev>error|warning|note):\s+(?<msg>.*)$/;

export function parseDiagnostics(output: string): Diagnostic[] {
  return output.split('\n').flatMap(l => {
    const m = GCC_LINE.exec(l);
    if (!m?.groups) return [];
    return [{
      line: +m.groups.line,
      col:  +m.groups.col,
      severity: m.groups.sev === 'error' ? 'error' : 'warning',
      message: m.groups.msg,
    }];
  });
}
```

CM6 tarafında `@codemirror/lint` ile `setDiagnostics`. Satır numarası eşlemesinde bir
incelik var: `.ino` dosyası sunucuda `.cpp`'ye dönüştürülüyor ve prototype üretimi satır
kaydırıyor. Sunucu `#line` direktifi kullanıyorsa numaralar doğru gelir; gelmiyorsa API
yanıtında bir satır offset'i döndürmesi gerekir. **Bunu VPS tarafıyla sözleşmeye bağla.**

### 8.4 Otomatik tamamlama

Başlangıçta clangd'ye gerek yok. Statik bir liste, Arduino kullanıcılarının %90'ının
yazdığı şeyi kapsıyor: `pinMode`, `digitalWrite`, `analogRead`, `Serial.*`, `delay`,
`millis`, `WiFi.*`, `HIGH/LOW/INPUT/OUTPUT/INPUT_PULLUP`. İmza ve kısa açıklama ile
birlikte ~120 giriş.

clangd-WASM'ı ancak temel akış otururken düşün.

---

## 9. Exception decoder

Projenin en akılda kalıcı özelliği. Uygulama maliyeti düşük, etkisi orantısız yüksek.

Kart panic ettiğinde seri çıktıya şuna benzer bir blok basar:

```
Guru Meditation Error: Core 1 panic'ed (LoadProhibited)
Backtrace: 0x400d1234:0x3ffb1f20 0x400d5678:0x3ffb1f40 ...
```

Akış:

1. Monitör satırlarında `Backtrace:` desenini yakala
2. Adresleri ayıkla, aktif build'in cache anahtarıyla birlikte
   `POST /api/decode` gövdesine koy
3. Sunucu `.elf` + `addr2line` ile çözer, `[{addr, function, file, line}]` döner
4. Terminalde ham backtrace'in hemen altına çözülmüş hali basılır, dosya:satır
   tıklanabilir olur ve editörde ilgili satıra atlar

Arduino IDE'de bu, ayrı bir masaüstü aracı gerektiriyor. Burada otomatik ve satır içi
oluyor.

**Ön koşul:** `.elf` dosyasının derleme sonrası saklanması. VPS raporunda R2'de
`<key>/firmware.elf` olarak planlandı.

---

## 10. Paylaşılabilir kurulum sayfası

`/f/[slug]` rotası: bir kullanıcının derlediği firmware'i başkasının tek tıkla kendi
kartına yazabildiği sayfa.

İçerik: proje adı, hedef kart, chip gereksinimi, `Karta yükle` butonu, ve isteğe bağlı
WiFi provisioning (Improv protokolü). Editör yok, derleme yok — sadece flash.

Bu sayfa, projenin dışa açılan yüzü. Birisi kendi ESP projesini paylaşmak istediğinde
senin siten üzerinden paylaşır.

---

## 11. Tasarım yönü

Konu, kendi görsel dilini zaten üretmiş bir alan: **datasheet**. Espressif ve TI
veri sayfalarının dili — ince mavi-gri cetveller, yoğun tablolar, pin numaralandırması,
offset haritaları, tek doygun mürekkep rengi. IDE'yi "canlı bir datasheet" olarak kur.

### 11.1 Token seti

```css
:root {
  --stock:    #EDF0F2;  /* soğuk kağıt — datasheet baskı stoğu */
  --ink:      #10151A;  /* mavi kaçışlı siyah, saf siyah değil */
  --rule:     #C3CDD4;  /* saç teli cetvel */
  --muted:    #6B7A85;  /* ikincil metin, pin etiketleri */
  --signal:   #3D3BFF;  /* tek aksiyon rengi — ultramarin, "sinyal teli" */
  --alarm:    #C8102E;  /* yalnızca hata, başka hiçbir yerde */
}
```

Dark mode ayrı bir tema değil, aynı sistemin negatifi: `--stock: #0D1114`,
`--ink: #DCE3E8`. Terminal ve editör her iki modda da koyu kalır — kod okuma yüzeyi
sabit olmalı.

**shadcn/ui ile uzlaştırma.** shadcn (tweakcn preset `b2GVUt5DMm`) kendi CSS
değişken adlarını (`--background`, `--foreground`, `--primary`, `--radius` vb.)
getiriyor. Bu isimler yukarıdaki `--stock/--ink/--rule/--muted/--signal/--alarm`
setiyle çakışmıyor ama örtüşüyor — çözüm ikisini birleştirmek değil, shadcn'in
değişkenlerini bu token setine **eşlemek**: `--background: var(--stock)`,
`--foreground: var(--ink)`, `--primary: var(--signal)`, `--destructive: var(--alarm)`,
`--border: var(--rule)`, `--muted-foreground: var(--muted)`. Tek kaynak of truth
§11.1'deki tablo kalır; shadcn bileşenleri ona abone olur, tersi değil.

### 11.2 Tipografi

| Rol | Yüz | Kullanım |
|---|---|---|
| Display | **Bricolage Grotesque** (variable) | Yalnızca panel başlıkları ve kart adı; genişlik ekseniyle daraltılmış |
| Arayüz | **Instrument Sans** | Butonlar, etiketler, gövde |
| Veri | **Martian Mono** | Pin adları, adresler, chip ID, offset'ler |
| Kod | **Commit Mono** | Editör ve terminal |

Veri ile kod için farklı mono kullanmak bilinçli: adres ve pin etiketleri arayüz
öğesidir, kod değildir. Görsel olarak ayrışmaları okumayı kolaylaştırır.

### 11.3 İmza öğesi: flash haritası

Genel bir yüzde çubuğu yerine, ilerlemeyi **kartın gerçek bellek haritası üzerinde**
göster. Yatay bir şerit, gerçek offset'lere göre bölünmüş:

```
0x0000        0x8000   0x10000                        0x400000
├─────────────┼────────┼──────────────────────────────────┤
│ bootloader  │ parts  │ app                    │ spiffs  │
│▓▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░│░░░░░░░░░│
                                    ▲ yazılıyor
```

Yazma ilerledikçe bölümler gerçek offset sırasında doluyor. Kullanıcı hem ilerlemeyi hem
de 16 MB flash'ının nasıl kullanıldığını aynı anda görüyor — sketch'in ne kadar yer
kapladığı, ne kadar boş alan kaldığı. Flash bittiğinde çubuk kaybolmuyor, statik bir
bellek haritası olarak kalıyor.

Cesaretin tek harcanacağı yer burası. Etrafındaki her şey sakin ve tablo disiplininde
kalmalı.

### 11.4 Yerleşim

```
┌────────────────────────────────────────────────────────────┐
│  [kart adı ▾]  [derle ve yükle]           ESP32-S3 · 16MB  │  üst şerit
├──────────────────────────────┬─────────────────────────────┤
│                              │  ┌───────────────────────┐  │
│                              │  │ chip · MAC · flash    │  │
│         editör               │  ├───────────────────────┤  │
│                              │  │ flash haritası        │  │
│                              │  └───────────────────────┘  │
│                              │                             │
│                              │   monitör / plotter         │
├──────────────────────────────┴─────────────────────────────┤
│  derleme çıktısı (katlanabilir)                            │
└────────────────────────────────────────────────────────────┘
```

Masaüstü öncelikli, ve bu bir taviz değil — Web Serial zaten masaüstünde. Dar ekranda
editör tam genişliğe geçer, monitör alt sekmeye iner, flash butonları gizlenir.

---

## 12. Hata durumları

Hata metinleri özür dilemez ve belirsiz olmaz. Ne olduğunu ve ne yapılacağını söyler.

| Durum | Sebep | Arayüz metni |
|---|---|---|
| `no_api` | Safari / eski Firefox | Bu tarayıcı karta yazmayı desteklemiyor. Chrome, Edge veya Firefox 151+ kullan — ya da `.bin` dosyasını indirip kendi aracınla yaz. |
| `insecure_context` | HTTP üzerinden açılmış | Karta yazmak için güvenli bağlantı gerekiyor. Adresi `https://` ile aç. |
| `firefox_addon_declined` | Add-on onayı reddedilmiş | Firefox seri port erişimi için ek bir onay istiyor. Bağlan'a tekrar bas ve izni kabul et. |
| `no_ports` | Sürücü yok veya kablo veri taşımıyor | Port listesi boş. Kartın sürücüsü kurulu mu (CP2102 / CH340) ve kablo veri kablosu mu? |
| `port_busy` | Arduino IDE veya başka bir uygulama portu tutuyor | Port başka bir program tarafından kullanılıyor. Arduino IDE veya seri monitör açıksa kapat. |
| `sync_failed` | Bootloader'a girilemedi | Kart bootloader'a geçmedi. BOOT'u basılı tut, EN'e bas, BOOT'u bırak, sonra tekrar dene. |
| `chip_mismatch` | Seçilen kart ≠ bağlı çip | Seçili kart ESP32-S3 ama bağlı çip ESP32-C3. Kart seçimini değiştir. |
| `reenumeration_timeout` | Native USB reset sonrası port dönmedi | Kart resetten sonra geri dönmedi. Kabloyu çıkarıp tak, sonra tekrar bağlan. |
| `write_failed` | Baud çok yüksek veya kablo kalitesiz | Yazma yarıda kesildi. Hızı 460800'e düşürüp tekrar dene. |
| `queue_full` | Sunucu meşgul | Derleme kuyruğu dolu. Bir dakika sonra tekrar dene. |

---

## 13. Test stratejisi

Seri iletişim otomatik test edilemez; katmanlı yaklaş.

**Birim testi (donanımsız)**

- `parse-gcc-output.ts` — gerçek arduino-cli çıktılarından fixture'lar
- `parse-samples.ts` — bozuk satır, eksik kanal, karışık format
- `line-buffer.ts` — sınır taşması
- `flash-map.ts` — partition offset hesapları

**Sahte Transport**

`esptool-js`'in `Transport` arayüzünü taklit eden bir mock: SYNC'e doğru yanıt veren,
istenirse zaman aşımı simüle eden, yazma ilerlemesi üreten. Flash UI'ının tüm durumları
(başarı, sync hatası, yarıda kesilme) donanımsız test edilebilir hale gelir.

**Gerçek donanım smoke listesi**

Her sürümde elle geçilecek liste:

1. ESP32-S3 UART portundan bağlan → chip bilgisi doğru mu
2. Blink yaz → LED yanıp sönüyor mu
3. Monitörü aç → çıktı geliyor mu
4. Monitör açıkken tekrar yaz → devir sorunsuz mu
5. Native USB portundan aynısı → re-enumeration yönetiliyor mu
6. Flash ortasında sekmeyi kapatmayı dene → uyarı çıkıyor mu
7. Panic üreten sketch yaz → backtrace çözülüyor mu
8. Kabloyu flash sırasında çek → hata mesajı anlamlı mı, uygulama kurtarılabilir mi

Madde 8 özellikle önemli: uygulamanın kabul edilebilir bir başarısızlık davranışı
olmalı, donmamalı.

---

## 14. Faz planı

| Faz | Kapsam | Çıktı |
|---|---|---|
| **1** | Web Serial bağlantısı, chip bilgisi, `.bin` yükleme ile flash, progress | Çalışan flasher, sunucu yok |
| **2** | Seri monitör (xterm) + doğru port devri | Bağlan → yaz → izle döngüsü tam |
| **3** | Plotter | Arduino IDE'yi geçtiğin ilk nokta |
| **4** | CM6 editör + sunucu derleme + SSE log + hata eşlemesi | Gerçek IDE |
| **5** | Exception decoder | Ayırt edici özellik |
| **6** | `/f/[slug]` paylaşım sayfası + Improv WiFi | Dışa açılan yüz |
| **7** | Flash haritası imza öğesinin tam hali, tasarım cilası | Portföy sunumu |

Faz 1-3 sunucuya hiç ihtiyaç duymaz; Cloudflare Pages'e statik olarak çıkar ve VPS'e
tek bayt yük bindirmez. Faz 4, VPS raporundaki altyapının hazır olmasını bekler.

---

## 15. VPS tarafıyla sözleşme

İki raporun kesiştiği noktalar, ikisi de uygulanmadan önce sabitlenmeli:

| Konu | Karar |
|---|---|
| Derleme isteği | `POST /api/compile { source, fqbn, options }` |
| Cache hit yanıtı | `{ cached: true, binUrl, elfUrl, sizes }` |
| Cache miss yanıtı | `{ cached: false, jobId }` |
| Log akışı | SSE, `GET /api/jobs/:id/stream`, olaylar: `log`, `done`, `failed` |
| Satır numarası | Sunucu `#line` direktifi kullanır → editör offset düzeltmesi yapmaz |
| Backtrace çözme | `POST /api/decode { buildKey, addresses[] }` |
| Kart listesi | Statik JSON, sabit FQBN enum'u — client asla serbest metin göndermez |
| Kuyruk dolu | `429 { error: 'queue_full', retryAfter }` |