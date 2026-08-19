"use client";

import { Upload } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface FlashPopoverProps {
  connected: boolean;
  fileName: string | null;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  address: string;
  onAddressChange: (value: string) => void;
  flashing: boolean;
  progress: number | null;
  flashDone: boolean;
  canFlash: boolean;
  onFlash: () => void;
}

// frontend.plan.md §11.4 — Faz 5'e kadar tek flash yolu elle .bin yüklemek;
// sürekli görünen panel yerine üst şeritteki bu simgeye taşındı. Faz 5'te
// "derle ve yükle" gelince aynı simge o akışı tetikleyecek.
export default function FlashPopover({
  connected,
  fileName,
  onFile,
  address,
  onAddressChange,
  flashing,
  progress,
  flashDone,
  canFlash,
  onFlash,
}: FlashPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        disabled={!connected}
        title="Firmware yükle"
        className="flex items-center gap-2 rounded-md border border-[var(--vsc-border)] px-3.5 py-2 text-xs font-medium text-[var(--vsc-fg)] transition-transform hover:text-[var(--vsc-fg-active)] active:scale-[0.94] disabled:opacity-40 disabled:active:scale-100"
      >
        <Upload size={14} strokeWidth={2.25} />
        Yükle
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-3 p-5">
        <PopoverHeader>
          <PopoverTitle className="font-[var(--font-display)] text-sm">
            Firmware yükle
          </PopoverTitle>
        </PopoverHeader>

        <input type="file" accept=".bin" onChange={onFile} disabled={flashing} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Adres
          <input
            value={address}
            onChange={(e) => onAddressChange(e.target.value)}
            disabled={flashing}
            className="w-24 rounded border border-input px-2.5 py-1.5 font-[var(--font-data)]"
          />
        </label>

        <button
          onClick={onFlash}
          disabled={!canFlash || flashing}
          className="rounded-md bg-[var(--vsc-accent)] px-4 py-2 text-xs font-medium text-white transition-transform active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
        >
          {flashing ? "Yükleniyor…" : `Karta yükle${fileName ? ` (${fileName})` : ""}`}
        </button>

        {progress !== null && (
          <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
            <div
              className="h-full bg-[var(--vsc-accent)] transition-all"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}

        {flashDone && (
          <p className="text-xs text-emerald-600">Yükleme tamamlandı, kart yeniden başlatıldı.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
