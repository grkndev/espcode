import type { ChipInfo } from "@/features/serial/useSerialStore";

// backend.plan.md §7.3 — kart listesi sabit, worker.js'teki ALLOWED_FQBN ile
// birebir eşleşiyor. package_esp32_index.json'dan çekilebilecek tek şey
// görünen isimler; FQBN boards.txt'den gelir ve o dosya bu JSON'da yok —
// bu yüzden liste elle küratörlü kalıyor.
export interface Board {
  fqbn: string;
  label: string;
  match: RegExp;
}

export const BOARDS: Board[] = [
  { fqbn: "esp32:esp32:esp32s3", label: "ESP32-S3", match: /esp32-?s3/i },
  { fqbn: "esp32:esp32:esp32c3", label: "ESP32-C3", match: /esp32-?c3/i },
  { fqbn: "esp32:esp32:esp32c6", label: "ESP32-C6", match: /esp32-?c6/i },
  { fqbn: "esp32:esp32:esp32", label: "ESP32 Dev Module", match: /esp32(?!-?[sc]\d)/i },
];

// Çip tespitinden (esptool "Chip is ESP32-S3 (QFN56)" gibi) en olası kartı bul.
export function matchBoardFromChip(chipInfo: ChipInfo | null): Board | null {
  if (!chipInfo) return null;
  return BOARDS.find((b) => b.match.test(chipInfo.description)) ?? null;
}

export function boardLabel(fqbn: string): string {
  return BOARDS.find((b) => b.fqbn === fqbn)?.label ?? fqbn;
}
