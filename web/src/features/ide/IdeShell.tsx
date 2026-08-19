"use client";

import { useEffect, useRef, useState } from "react";
import { checkSerialSupport } from "@/lib/serial/support";
import { serialSession } from "@/features/serial/SerialSession";
import { useSerialStore } from "@/features/serial/useSerialStore";
import { getChipInfo, flashFirmware, hasPsram } from "@/features/flash/flasher";
import { describeSerialError } from "@/lib/serial/errors";
import SerialTerminal, { type TerminalHandle } from "@/features/monitor/Terminal";
import { LineBuffer } from "@/features/monitor/line-buffer";

// frontend.plan.md §5.3 — iki başarısız deneme sonrası manuel moda geç
const MANUAL_MODE_THRESHOLD = 2;

const BAUD_RATES = [9600, 19200, 38400, 57600, 74880, 115200, 230400, 460800, 921600];

type LineEnding = "none" | "lf" | "cr" | "crlf";
const LINE_ENDINGS: Record<LineEnding, string> = {
  none: "",
  lf: "\n",
  cr: "\r",
  crlf: "\r\n",
};

export default function IdeShell() {
  const support = checkSerialSupport();
  const { state, chipInfo, error, connecting, connect, setChipInfo, setError } =
    useSerialStore();

  const [logLines, setLogLines] = useState<string[]>([]);
  const [syncFailCount, setSyncFailCount] = useState(0);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [address, setAddress] = useState("0x0");

  const [flashing, setFlashing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [flashDone, setFlashDone] = useState(false);

  const [baud, setBaud] = useState(115200);
  const [lineEnding, setLineEnding] = useState<LineEnding>("lf");
  const [sendValue, setSendValue] = useState("");
  const [sendHistory, setSendHistory] = useState<string[]>([]);
  const historyIndexRef = useRef<number | null>(null);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const terminalRef = useRef<TerminalHandle>(null);
  const lineBufferRef = useRef(new LineBuffer());

  const isMonitoring = state === "monitoring";

  const appendLog = (line: string) => setLogLines((prev) => [...prev.slice(-199), line]);

  // Kart bağlıyken gelen tüm seri veri buraya akar — startMonitor()
  // çağrılmadığı sürece SerialSession hiç okuma döngüsü başlatmaz.
  useEffect(() => {
    return serialSession.subscribeData((chunk) => {
      terminalRef.current?.write(chunk);
      lineBufferRef.current.push(chunk);
    });
  }, []);

  useEffect(() => {
    if (!flashing) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    navigator.wakeLock?.request("screen").then(
      (lock) => (wakeLockRef.current = lock),
      () => {},
    );
    return () => {
      window.removeEventListener("beforeunload", guard);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [flashing]);

  async function handleConnect() {
    setError(null);
    await connect();
    const port = serialSession.getPort();
    if (!port) return; // requestPort iptal edildi ya da başarısız oldu, hata store'da

    try {
      const chipInfo = await getChipInfo(port, appendLog);
      setChipInfo(chipInfo);
      setSyncFailCount(0);
    } catch (err) {
      setSyncFailCount((n) => n + 1);
      setError(describeSerialError(err));
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    setFileName(file.name);
    setFileData(new Uint8Array(buffer));
  }

  async function handleFlash() {
    const port = serialSession.getPort();
    if (!port || !fileData) return;
    setError(null);
    setFlashDone(false);
    setFlashing(true);

    // frontend.plan.md §4.1 — monitör açıkken flash: devri kullanıcıya
    // göstermeden durdur → yaz → geri başlat.
    const wasMonitoring = isMonitoring;
    if (wasMonitoring) await serialSession.stopMonitor();
    serialSession.beginFlashing();

    try {
      const addr = Number.parseInt(address, 16);
      await flashFirmware(port, { data: fileData, address: addr }, setProgress, appendLog);
      setFlashDone(true);
    } catch (err) {
      setError(describeSerialError(err));
    } finally {
      setFlashing(false);
      setProgress(null);
      serialSession.endFlashing();
      if (wasMonitoring) await serialSession.startMonitor(baud).catch(() => {});
    }
  }

  async function handleToggleMonitor() {
    setError(null);
    try {
      if (isMonitoring) {
        await serialSession.stopMonitor();
      } else {
        terminalRef.current?.clear();
        lineBufferRef.current.clear();
        await serialSession.startMonitor(baud);
      }
    } catch (err) {
      setError(describeSerialError(err));
    }
  }

  // §4.3 — SerialPort açıkken baud değiştirilemez, kapat → yeni baud ile aç.
  async function handleBaudChange(next: number) {
    setBaud(next);
    if (isMonitoring) {
      await serialSession.stopMonitor();
      await serialSession.startMonitor(next).catch((err) => setError(describeSerialError(err)));
    }
  }

  async function handleSend() {
    if (!sendValue) return;
    await serialSession.send(sendValue + LINE_ENDINGS[lineEnding]).catch((err) => {
      setError(describeSerialError(err));
    });
    setSendHistory((prev) => [...prev, sendValue].slice(-100));
    historyIndexRef.current = null;
    setSendValue("");
  }

  function handleSendKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (sendHistory.length === 0) return;
      const idx = historyIndexRef.current === null ? sendHistory.length - 1 : Math.max(0, historyIndexRef.current - 1);
      historyIndexRef.current = idx;
      setSendValue(sendHistory[idx]);
    }
  }

  function exportBuffer(kind: "log" | "csv") {
    const text = kind === "log" ? lineBufferRef.current.toLog() : lineBufferRef.current.toCsv();
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `espcode-monitor.${kind}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!support.ok) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <Banner tone="warn">
          {support.reason === "no_api"
            ? "Bu tarayıcı karta yazmayı desteklemiyor. Chrome, Edge veya Firefox 151+ kullan — ya da .bin dosyasını indirip kendi aracınla yaz."
            : "Karta yazmak için güvenli bağlantı gerekiyor. Adresi https:// ile aç."}
        </Banner>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between border-b border-[var(--rule)] pb-4">
        <h1 className="font-[var(--font-display)] text-xl tracking-tight text-[var(--ink)]">
          espcode
        </h1>
        <button
          onClick={handleConnect}
          disabled={connecting || state !== "disconnected"}
          className="rounded bg-[var(--signal)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {connecting ? "Bağlanıyor…" : state === "disconnected" ? "Bağlan" : "Bağlı"}
        </button>
      </header>

      {error && <Banner tone="error">{error}</Banner>}

      {syncFailCount >= MANUAL_MODE_THRESHOLD && (
        <Banner tone="warn">
          Kart yanıt vermiyor. Kartın üzerindeki BOOT düğmesini basılı tut, EN (veya RST)
          düğmesine bir kez bas, sonra BOOT&apos;u bırak. Ardından tekrar bağlanmayı dene.
        </Banner>
      )}

      {chipInfo && (
        <section className="rounded border border-[var(--rule)] p-4">
          <h2 className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
            Çip bilgisi
          </h2>
          <dl className="grid grid-cols-2 gap-y-2 font-[var(--font-data)] text-sm">
            <Field label="Çip" value={chipInfo.description} />
            <Field label="MAC" value={chipInfo.macAddress} />
            <Field label="Kristal" value={`${chipInfo.crystalFreqMHz} MHz`} />
            <Field label="Flash" value={chipInfo.flashSize} />
            <Field label="PSRAM" value={hasPsram(chipInfo.features) ? "Var" : "Yok"} />
            <Field label="Özellikler" value={chipInfo.features.join(", ")} />
          </dl>
        </section>
      )}

      {chipInfo && (
        <section className="flex flex-col gap-3 rounded border border-[var(--rule)] p-4">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground">
            Firmware yükle
          </h2>
          <input type="file" accept=".bin" onChange={handleFile} disabled={flashing} />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Adres
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={flashing}
              className="w-24 rounded border border-[var(--rule)] px-2 py-1 font-[var(--font-data)]"
            />
          </label>

          <button
            onClick={handleFlash}
            disabled={!fileData || flashing}
            className="rounded bg-[var(--signal)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {flashing ? "Yükleniyor…" : `Karta yükle${fileName ? ` (${fileName})` : ""}`}
          </button>

          {progress !== null && (
            <div className="h-2 w-full overflow-hidden rounded bg-[var(--rule)]">
              <div
                className="h-full bg-[var(--signal)] transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}

          {flashDone && (
            <Banner tone="ok">Yükleme tamamlandı, kart yeniden başlatıldı.</Banner>
          )}
        </section>
      )}

      {chipInfo && (
        <section className="flex flex-col gap-3 rounded border border-[var(--rule)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-wide text-muted-foreground">
              Seri monitör
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={baud}
                onChange={(e) => handleBaudChange(Number(e.target.value))}
                className="rounded border border-[var(--rule)] bg-transparent px-2 py-1 text-xs font-[var(--font-data)]"
              >
                {BAUD_RATES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <button
                onClick={handleToggleMonitor}
                disabled={flashing}
                className="rounded bg-[var(--signal)] px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
              >
                {isMonitoring ? "Durdur" : "Başlat"}
              </button>
            </div>
          </div>

          <SerialTerminal ref={terminalRef} />

          <div className="flex items-center gap-2">
            <input
              value={sendValue}
              onChange={(e) => setSendValue(e.target.value)}
              onKeyDown={handleSendKeyDown}
              disabled={!isMonitoring}
              placeholder={isMonitoring ? "Karta gönder…" : "Önce monitörü başlat"}
              className="flex-1 rounded border border-[var(--rule)] px-2 py-1 text-sm font-[var(--font-data)] disabled:opacity-40"
            />
            <select
              value={lineEnding}
              onChange={(e) => setLineEnding(e.target.value as LineEnding)}
              className="rounded border border-[var(--rule)] bg-transparent px-2 py-1 text-xs"
            >
              <option value="none">Yok</option>
              <option value="lf">LF</option>
              <option value="cr">CR</option>
              <option value="crlf">CRLF</option>
            </select>
            <button
              onClick={handleSend}
              disabled={!isMonitoring || !sendValue}
              className="rounded border border-[var(--rule)] px-3 py-1 text-sm disabled:opacity-40"
            >
              Gönder
            </button>
          </div>

          <div className="flex gap-2 text-xs text-muted-foreground">
            <button onClick={() => exportBuffer("log")} className="underline">
              .log indir
            </button>
            <button onClick={() => exportBuffer("csv")} className="underline">
              .csv indir
            </button>
          </div>
        </section>
      )}

      {logLines.length > 0 && (
        <details className="rounded border border-[var(--rule)] p-4">
          <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted-foreground">
            Günlük
          </summary>
          <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-[var(--font-code)] text-xs text-muted-foreground">
            {logLines.join("")}
          </pre>
        </details>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-[var(--ink)]">{value}</dd>
    </>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "warn" | "error" | "ok";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "error"
      ? "border-[var(--alarm)] text-[var(--alarm)]"
      : tone === "ok"
        ? "border-[var(--signal)] text-[var(--signal)]"
        : "border-muted-foreground text-muted-foreground";
  return (
    <div className={`rounded border px-4 py-3 text-sm ${toneClass}`}>{children}</div>
  );
}
