"use client";

import { useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, FileUp, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { checkSerialSupport } from "@/lib/serial/support";
import { serialSession } from "@/features/serial/SerialSession";
import { useSerialStore } from "@/features/serial/useSerialStore";
import {
  getChipInfo,
  flashFirmware,
  hasPsram,
  FLASH_STAGE_LABEL,
  type FlashStage,
} from "@/features/flash/flasher";
import { describeSerialError, SERIAL_ERROR_MESSAGES } from "@/lib/serial/errors";

// IdeShell.tsx'teki aynı eşik — kart iki kez üst üste sync olmazsa BOOT/EN
// ipucu gösterilir. Ortak bir modüle taşınmadı, tek başka kullanıcısı IDE ve
// oradaki değer de dışa açık değil.
const MANUAL_MODE_THRESHOLD = 2;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} KB`;
}

export default function FlashTool() {
  const support = checkSerialSupport();
  const { state, chipInfo, error, connecting, connect, setChipInfo, setError } = useSerialStore();
  const connected = state !== "disconnected";

  const [syncFailCount, setSyncFailCount] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [eraseAll, setEraseAll] = useState(false);
  const [writing, setWriting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [flashStage, setFlashStage] = useState<FlashStage | null>(null);
  const [log, setLog] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLPreElement>(null);

  function appendLog(line: string) {
    setLog((prev) => prev + line);
    requestAnimationFrame(() => {
      const el = logRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // IdeShell.handleConnect ile aynı akış — bağlan, çip tespit et, art arda
  // MANUAL_MODE_THRESHOLD kez başarısız olursa BOOT/EN ipucu göster.
  async function handleConnect() {
    setError(null);
    await connect();
    const port = serialSession.getPort();
    if (!port) return; // requestPort iptal edildi ya da başarısız oldu, hata store'da

    try {
      const info = await getChipInfo(port, appendLog);
      setChipInfo(info);
      setSyncFailCount(0);
    } catch (err) {
      const nextCount = syncFailCount + 1;
      setSyncFailCount(nextCount);
      setError(describeSerialError(err));
      if (nextCount >= MANUAL_MODE_THRESHOLD) {
        toast.warning("Kart yanıt vermiyor", {
          description:
            "Kartın üzerindeki BOOT düğmesini basılı tut, EN (veya RST) düğmesine bir kez bas, sonra BOOT'u bırak. Ardından tekrar bağlanmayı dene.",
          duration: 8000,
        });
      }
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    e.target.value = ""; // aynı dosya tekrar seçilebilsin diye
  }

  async function handleWrite() {
    const port = serialSession.getPort();
    if (!port || !file) return;

    setLog("");
    setWriting(true);
    // §4.1 devri — monitör açıksa flash başlamadan önce durdur, bitince geri aç.
    const wasMonitoring = serialSession.getState() === "monitoring";
    if (wasMonitoring) await serialSession.stopMonitor();
    serialSession.beginFlashing();

    try {
      const data = new Uint8Array(await file.arrayBuffer());
      await flashFirmware(
        port,
        { data, address: 0, eraseAll },
        (fraction) => setProgress(fraction),
        appendLog,
        (stage) => setFlashStage(stage),
      );
      toast.success("Yazma tamamlandı", { description: "Kart yeniden başlatıldı." });
    } catch (err) {
      toast.error("Yazma başarısız", { description: describeSerialError(err) });
    } finally {
      setWriting(false);
      setProgress(null);
      setFlashStage(null);
      serialSession.endFlashing();
      if (wasMonitoring) await serialSession.startMonitor(115200).catch(() => {});
    }
  }

  const percent = progress !== null ? Math.round(progress * 100) : null;
  const detectedSpecs = chipInfo
    ? [chipInfo.description, chipInfo.flashSize && `${chipInfo.flashSize} FLASH`, hasPsram(chipInfo.features) && "PSRAM"]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex h-13 items-center justify-between border-b border-border px-6">
        <Link href="/" className="font-[family-name:var(--font-display)] text-[19px] font-bold tracking-tight">
          espcode
        </Link>
        <Button render={<Link href="/tools" />} nativeButton={false} variant="ghost" size="sm">
          <ArrowLeft size={14} strokeWidth={2.25} />
          Araçlara dön
        </Button>
      </header>

      <main className="mx-auto max-w-2xl px-6 pt-9 pb-16">
        <p className="font-[family-name:var(--font-data)] text-[10px] font-medium tracking-[0.16em] text-muted-foreground">
          ARAÇLAR · BIN YAZ
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-[28px] leading-none font-semibold tracking-[-0.01em]">
          Bin Yaz
        </h1>
        <p className="mt-3.5 text-[13px] text-muted-foreground">
          Derlemeden, hazır bir .bin dosyasını (bootloader + bölüm tablosu + uygulama
          birleşik, 0x0 adresine yazılan türden) karta doğrudan yükle.
        </p>

        {!support.ok ? (
          <div className="mt-7 rounded-xl border border-border bg-card px-5 py-4 text-[13px] text-muted-foreground">
            {SERIAL_ERROR_MESSAGES[support.reason]}
          </div>
        ) : (
          <>
            {/* Bağlantı */}
            <section className="mt-7 rounded-xl border border-border bg-card px-5 py-[18px]">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`size-[7px] rounded-full ${connected ? "bg-success" : "bg-border"}`}
                  />
                  <span className="text-[13px] font-medium">
                    {connecting ? "Bağlanıyor…" : connected ? "Kart bağlı" : "Kart bağlı değil"}
                  </span>
                </div>
                <Button size="sm" variant={connected ? "outline" : "default"} onClick={handleConnect} disabled={connecting}>
                  {connected ? "Yeniden bağlan" : "Kart bağla"}
                </Button>
              </div>
              {detectedSpecs && (
                <p className="mt-2.5 font-[family-name:var(--font-data)] text-[11px] text-muted-foreground">
                  {detectedSpecs}
                </p>
              )}
              {error && <p className="mt-2.5 text-[12.5px] text-destructive">{error}</p>}
            </section>

            {/* Dosya seçimi */}
            <section className="mt-4 rounded-xl border border-border bg-card px-5 py-[18px]">
              <input ref={fileInputRef} type="file" accept=".bin" onChange={handleFileChange} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={writing}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed border-rule-soft px-4 py-3.5 text-left transition-colors hover:border-primary/40 disabled:opacity-60"
              >
                <FileUp size={18} strokeWidth={2} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    {file ? file.name : "Bir .bin dosyası seç"}
                  </p>
                  {file && (
                    <p className="text-[11.5px] text-muted-foreground">{formatBytes(file.size)}</p>
                  )}
                </div>
              </button>

              <div className="mt-4 flex items-center justify-between gap-4 border-t border-dashed border-rule-soft pt-3.5">
                <div>
                  <p className="text-[13px]">Yazmadan önce flash&apos;ı tamamen sil</p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    Önceki firmware&apos;den kalan verileri (NVS, dosya sistemi) temizler.
                  </p>
                </div>
                <Switch checked={eraseAll} onCheckedChange={setEraseAll} disabled={writing} />
              </div>
            </section>

            <Button
              onClick={handleWrite}
              disabled={!connected || !file || writing}
              className="mt-4 h-11 w-full"
            >
              {writing ? (
                <Loader2 size={15} strokeWidth={2.5} className="animate-spin" />
              ) : (
                <Zap size={15} strokeWidth={2.25} />
              )}
              {writing
                ? flashStage
                  ? FLASH_STAGE_LABEL[flashStage]
                  : "Yazılıyor…"
                : "Karta Yaz"}
            </Button>

            {(writing || log) && (
              <div className="mt-4">
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      percent !== null
                        ? "h-full rounded-full bg-primary transition-[width]"
                        : "h-full w-2/5 animate-[status-indeterminate_1.1s_ease-in-out_infinite] rounded-full bg-primary"
                    }
                    style={percent !== null ? { width: `${percent}%` } : undefined}
                  />
                </div>
                <pre
                  ref={logRef}
                  className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-border bg-card p-3 font-[family-name:var(--font-code)] text-xs whitespace-pre-wrap text-muted-foreground"
                >
                  {log.replace(/\r\n?/g, "\n") || "Henüz bir günlük yok."}
                </pre>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
