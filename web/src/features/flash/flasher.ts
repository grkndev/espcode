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

  const chip = loader.chip;
  const [description, features, crystalFreqMHz, macAddress, flashSize] = await Promise.all([
    chip.getChipDescription(loader),
    chip.getChipFeatures(loader),
    chip.getCrystalFreq(loader),
    chip.readMac(loader),
    loader.detectFlashSize(),
  ]);

  return {
    connection: { loader, transport },
    chipInfo: { description, features, crystalFreqMHz, macAddress, flashSize },
  };
}

export interface FlashJob {
  data: Uint8Array;
  address: number;
}

// frontend.plan.md §5.1 — writeFlash + after (hard reset → uygulamayı başlat)
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
    await loader.after();
  } catch (err) {
    throw new SerialError("write_failed", err instanceof Error ? err.message : undefined);
  } finally {
    await transport.disconnect();
  }
}

export function hasPsram(features: string[]): boolean {
  return features.some((f) => /psram/i.test(f));
}
