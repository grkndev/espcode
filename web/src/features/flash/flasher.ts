import { ESPLoader, Transport } from "esptool-js";
import type { IEspLoaderTerminal } from "esptool-js";
import { SerialError } from "@/lib/serial/errors";
import type { ChipInfo } from "@/features/serial/useSerialStore";

function makeTerminal(onLog?: (line: string) => void): IEspLoaderTerminal {
  return {
    clean: () => {},
    write: (data) => onLog?.(data),
    // esploader.write()'ın kendisi withNewline=true iken writeLine'ı çağırır
    // (bkz. node_modules/esptool-js/lib/esploader.js) — satır sonunu KENDİSİ
    // eklemiyor, terminal implementasyonundan bekliyor. Eklemezsek art arda
    // gelen her satır aynı satıra yapışıyordu.
    writeLine: (data) => onLog?.(data + "\n"),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type FlashStage = "connecting" | "syncing" | "writing" | "resetting";

export const FLASH_STAGE_LABEL: Record<FlashStage, string> = {
  connecting: "Bağlanılıyor",
  syncing: "Senkronize ediliyor",
  writing: "Flash'a yazılıyor",
  resetting: "Yeniden başlatılıyor",
};

// esptool-js 0.6.1'in classic (UART) hard-reset yolu yalnızca setRTS(false)
// çağırıyor — connect sonrası RTS zaten false olduğu için bu bir no-op, hiç
// reset pulse'ı üretmiyor (writeFlash de reboot:false ile bitiriyor, bkz.
// node_modules/esptool-js/lib/{esploader,reset}.js). Reset'i elle üretiyoruz:
// EN'i düşür-yükselt, IO0/DTR'a hiç dokunma (frontend.plan.md §5.2'nin tersi).
async function hardResetToApp(transport: Transport): Promise<void> {
  await transport.setDTR(false);
  await transport.setRTS(true);
  await sleep(100);
  await transport.setRTS(false);
}

async function withEspLoader<T>(
  port: SerialPort,
  onLog: ((line: string) => void) | undefined,
  fn: (loader: ESPLoader, transport: Transport) => Promise<T>,
  onStage?: (stage: FlashStage) => void,
): Promise<T> {
  onStage?.("connecting");
  const transport = new Transport(port, false);
  const loader = new ESPLoader({
    transport,
    baudrate: 921600,
    terminal: makeTerminal(onLog),
  });

  try {
    onStage?.("syncing");
    await loader.main();
  } catch (err) {
    await transport.disconnect().catch(() => {});
    throw new SerialError("sync_failed", err instanceof Error ? err.message : undefined);
  }

  try {
    return await fn(loader, transport);
  } finally {
    // İşin sonunda çip her zaman gerçek uygulamaya dönüp portu bırakır —
    // esptool stub'ında asılı kalmaz, monitör devralabilir (§4.1 port devri).
    onStage?.("resetting");
    await hardResetToApp(transport);
    await transport.disconnect();
  }
}

// frontend.plan.md §5.1/§5.4 — SYNC + stub yükleme + çip tespiti, bağlanır
// bağlanmaz gösterilecek bilgiler. Bittiğinde port bırakılır (granted'e döner).
export async function getChipInfo(
  port: SerialPort,
  onLog?: (line: string) => void,
): Promise<ChipInfo> {
  return withEspLoader(port, onLog, async (loader) => {
    // Tek seri port yazıcısını paylaşıyorlar — Promise.all ile eşzamanlı
    // çağrılırsa "WritableStream is locked" hatası verir, sıralı çalışmalı.
    const chip = loader.chip;
    const description = await chip.getChipDescription(loader);
    const features = await chip.getChipFeatures(loader);
    const crystalFreqMHz = await chip.getCrystalFreq(loader);
    const macAddress = await chip.readMac(loader);
    const flashSize = await loader.detectFlashSize();
    return { description, features, crystalFreqMHz, macAddress, flashSize };
  });
}

export interface FlashJob {
  data: Uint8Array;
  address: number;
}

// frontend.plan.md §5.1 — kendi bağlantısını kurar, yazar, resetler, portu
// bırakır. Önceden açılmış bir bağlantıya bağımlı değil.
export async function flashFirmware(
  port: SerialPort,
  job: FlashJob,
  onProgress: (fraction: number) => void,
  onLog?: (line: string) => void,
  onStage?: (stage: FlashStage) => void,
): Promise<void> {
  await withEspLoader(
    port,
    onLog,
    async (loader) => {
      onStage?.("writing");
      try {
        await loader.writeFlash({
          fileArray: [{ data: job.data, address: job.address }],
          flashMode: "keep",
          flashFreq: "keep",
          flashSize: "keep",
          eraseAll: false,
          compress: true,
          reportProgress: (_fileIndex, written, total) => onProgress(written / total),
        });
      } catch (err) {
        throw new SerialError("write_failed", err instanceof Error ? err.message : undefined);
      }
    },
    onStage,
  );
}

export function hasPsram(features: string[]): boolean {
  return features.some((f) => /psram/i.test(f));
}
