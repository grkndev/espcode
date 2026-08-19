"use client";

import { useEffect, useRef, useState } from "react";
import { checkSerialSupport } from "@/lib/serial/support";
import { serialSession } from "@/features/serial/SerialSession";
import { useSerialStore } from "@/features/serial/useSerialStore";
import {
  connectAndDetectChip,
  flashFirmware,
  hasPsram,
  type Connection,
} from "@/features/flash/flasher";
import { describeSerialError } from "@/lib/serial/errors";

// frontend.plan.md §5.3 — iki başarısız deneme sonrası manuel moda geç
const MANUAL_MODE_THRESHOLD = 2;

export default function IdeShell() {
  const support = checkSerialSupport();
  const { state, chipInfo, error, connecting, connect, setChipInfo, setError } =
    useSerialStore();

  const [connection, setConnection] = useState<Connection | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [syncFailCount, setSyncFailCount] = useState(0);

  const [fileName, setFileName] = useState<string | null>(null);
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [address, setAddress] = useState("0x0");

  const [flashing, setFlashing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [flashDone, setFlashDone] = useState(false);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const appendLog = (line: string) => setLogLines((prev) => [...prev.slice(-199), line]);

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
      const { connection, chipInfo } = await connectAndDetectChip(port, appendLog);
      setConnection(connection);
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
    if (!connection || !fileData) return;
    setError(null);
    setFlashDone(false);
    setFlashing(true);
    serialSession.beginFlashing();
    try {
      const addr = Number.parseInt(address, 16);
      await flashFirmware(connection, { data: fileData, address: addr }, setProgress);
      setFlashDone(true);
    } catch (err) {
      setError(describeSerialError(err));
    } finally {
      setFlashing(false);
      setProgress(null);
      serialSession.endFlashing();
    }
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
          <h2 className="mb-3 text-xs uppercase tracking-wide text-[var(--muted)]">
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
          <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Firmware yükle
          </h2>
          <input type="file" accept=".bin" onChange={handleFile} disabled={flashing} />
          <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
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

      {logLines.length > 0 && (
        <details className="rounded border border-[var(--rule)] p-4">
          <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--muted)]">
            Günlük
          </summary>
          <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-[var(--font-code)] text-xs text-[var(--muted)]">
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
      <dt className="text-[var(--muted)]">{label}</dt>
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
        : "border-[var(--muted)] text-[var(--muted)]";
  return (
    <div className={`rounded border px-4 py-3 text-sm ${toneClass}`}>{children}</div>
  );
}
