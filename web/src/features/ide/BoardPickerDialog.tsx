"use client";

import { CheckIcon, CpuIcon } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { hasPsram } from "@/features/flash/flasher";
import { BOARDS, matchBoardFromChip, type Board } from "./board-match";
import type { ChipInfo } from "@/features/serial/useSerialStore";

export interface BoardPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fqbn: string;
  onSelect: (fqbn: string) => void;
  chipInfo: ChipInfo | null;
}

// Kataloğun geri kalanı için genel mimari bilgisi — gerçek tespit verisi
// değil, yalnızca ESP32 ailesinin bilinen donanım özellikleri (referans
// amaçlı, mockup'taki "RISC-V · 4MB FLASH" gibi satırların karşılığı).
const FAMILY_INFO: Record<string, string> = {
  "esp32:esp32:esp32s3": "XTENSA LX7 · DUAL-CORE",
  "esp32:esp32:esp32c3": "RISC-V · SINGLE-CORE",
  "esp32:esp32:esp32c6": "RISC-V · WIFI 6",
  "esp32:esp32:esp32": "XTENSA LX6 · DUAL-CORE",
};

function BoardRow({
  board,
  selected,
  detected,
  onSelect,
}: {
  board: Board;
  selected: boolean;
  detected?: string;
  onSelect: () => void;
}) {
  return (
    <CommandItem
      value={board.label}
      onSelect={onSelect}
      className="gap-[11px] rounded-[10px] px-3 py-2.5 text-sm data-selected:bg-[var(--vsc-selected)]"
    >
      <span
        className={`flex size-[30px] shrink-0 items-center justify-center rounded-[8px] ${
          detected ? "bg-[var(--vsc-border-input)] text-[var(--vsc-accent-mono)]" : "bg-[var(--vsc-selected)] text-[var(--vsc-fg-muted)]"
        }`}
      >
        <CpuIcon size={15} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-[family-name:var(--font-ui)] text-[13.5px] font-semibold text-[var(--vsc-fg-active)]">
          {board.label}
        </div>
        <div className="truncate font-[family-name:var(--font-data)] text-[10px] text-[var(--vsc-fg-muted)]">
          {detected ?? FAMILY_INFO[board.fqbn] ?? ""}
        </div>
      </div>
      {detected && (
        <span className="shrink-0 font-[family-name:var(--font-data)] text-[9.5px] font-medium tracking-[0.1em] text-[var(--vsc-accent-mono)]">
          ALGILANDI ✓
        </span>
      )}
      {selected && <CheckIcon size={16} className="shrink-0 text-[var(--vsc-accent-mono)]" />}
    </CommandItem>
  );
}

export default function BoardPickerDialog({
  open,
  onOpenChange,
  fqbn,
  onSelect,
  chipInfo,
}: BoardPickerDialogProps) {
  const matched = matchBoardFromChip(chipInfo);
  const rest = BOARDS.filter((b) => b.fqbn !== matched?.fqbn);
  const detectedSpecs =
    chipInfo && matched
      ? [chipInfo.description, chipInfo.flashSize && `${chipInfo.flashSize} FLASH`, hasPsram(chipInfo.features) && "PSRAM"]
          .filter(Boolean)
          .join(" · ")
      : undefined;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Kart seç"
      description="Bağlı ESP32 varyantını seç"
      className="w-[520px] sm:max-w-[520px]"
    >
      <Command className="p-0">
        <CommandInput
          placeholder="Kart ara…"
          className="bg-transparent text-sm"
          endAddon={<kbd data-slot="kbd">Esc</kbd>}
        />
        <CommandList className="max-h-96 p-2">
          <CommandEmpty className="py-10 text-sm">Kart bulunamadı.</CommandEmpty>

          {matched && (
            <CommandGroup
              heading="ALGILANAN"
              className="**:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:font-[family-name:var(--font-data)] **:[[cmdk-group-heading]]:text-[9.5px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:tracking-[0.12em]"
            >
              <BoardRow
                board={matched}
                selected={matched.fqbn === fqbn}
                detected={detectedSpecs}
                onSelect={() => onSelect(matched.fqbn)}
              />
            </CommandGroup>
          )}

          <CommandGroup
            heading="TÜM KARTLAR"
            className="**:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:font-[family-name:var(--font-data)] **:[[cmdk-group-heading]]:text-[9.5px] **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:tracking-[0.12em]"
          >
            {(matched ? rest : BOARDS).map((b) => (
              <BoardRow key={b.fqbn} board={b} selected={b.fqbn === fqbn} onSelect={() => onSelect(b.fqbn)} />
            ))}
          </CommandGroup>
        </CommandList>

        <div className="flex gap-4 border-t border-[var(--vsc-border)] px-4 py-2.5 font-[family-name:var(--font-data)] text-[10px] text-[var(--vsc-fg-faint)]">
          <span>↑↓ gezin</span>
          <span>↵ seç</span>
          <span>esc kapat</span>
        </div>
      </Command>
    </CommandDialog>
  );
}
