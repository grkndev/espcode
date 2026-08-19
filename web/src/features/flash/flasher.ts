import { ESPLoader, Transport } from "esptool-js";
import type { IEspLoaderTerminal } from "esptool-js";
import { SerialError } from "@/lib/serial/errors";
import type { ChipInfo } from "@/features/serial/useSerialStore";

function makeTerminal(onLog?: (line: string) => void): IEspLoaderTerminal {
  return {
    clean: () => {},
    write: (data) => onLog?.(data),
    writeLine: (data) => onLog?.(data),
  };
}

export interface Connection {
  loader: ESPLoader;
  transport: Transport;
}

// frontend.plan.md §5.1/§5.4 — SYNC + stub yükleme + çip tespiti, bağlanır
// bağlanmaz gösterilecek bilgiler
export async function connectAndDetectChip(
  port: SerialPort,
  onLog?: (line: string) => void,
): Promise<{ connection: Connection; chipInfo: ChipInfo }> {
  const transport = new Transport(port, false);
  const loader = new ESPLoader({
    transport,
    baudrate: 921600,
    terminal: makeTerminal(onLog),
  });

  try {
    await loader.main();
  } catch (err) {
    throw new SerialError("sync_failed", err instanceof Error ? err.message : undefined);
  }

  // Tek seri port yazıcısını paylaşıyorlar — Promise.all ile eşzamanlı çağrılırsa
  // "WritableStream is locked" hatası verir, sıralı çalışmak zorunda.
  const chip = loader.chip;
  const description = await chip.getChipDescription(loader);
  const features = await chip.getChipFeatures(loader);
  const crystalFreqMHz = await chip.getCrystalFreq(loader);
  const macAddress = await chip.readMac(loader);
  const flashSize = await loader.detectFlashSize();

  return {
    connection: { loader, transport },
    chipInfo: { description, features, crystalFreqMHz, macAddress, flashSize },
  };
}

export interface FlashJob {
  data: Uint8Array;
  address: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// frontend.plan.md §5.1 — writeFlash + hard reset → uygulamayı başlat
export async function flashFirmware(
  connection: Connection,
  job: FlashJob,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const { loader, transport } = connection;
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
    await hardResetToApp(transport);
  } catch (err) {
    throw new SerialError("write_failed", err instanceof Error ? err.message : undefined);
  } finally {
    await transport.disconnect();
  }
}

export function hasPsram(features: string[]): boolean {
  return features.some((f) => /psram/i.test(f));
}
