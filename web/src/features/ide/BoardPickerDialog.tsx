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
import { BOARDS, matchBoardFromChip } from "./board-match";
import type { ChipInfo } from "@/features/serial/useSerialStore";

export interface BoardPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fqbn: string;
  onSelect: (fqbn: string) => void;
  chipInfo: ChipInfo | null;
}

export default function BoardPickerDialog({
  open,
  onOpenChange,
  fqbn,
  onSelect,
  chipInfo,
}: BoardPickerDialogProps) {
  const matched = matchBoardFromChip(chipInfo);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Kart seç"
      description="Bağlı ESP32 varyantını seç"
      className="sm:max-w-2xl"
    >
      <Command className="p-2">
        <CommandInput
          placeholder="Kart ara…"
          className="text-xl bg-transparent"
          endAddon={<kbd data-slot="kbd">Esc</kbd>}
        />
        <CommandList className="max-h-96 p-2">
          <CommandEmpty className="py-10 text-base">Kart bulunamadı.</CommandEmpty>
          <CommandGroup
            heading={matched ? `Algılanan: ${matched.label}` : "Kartlar"}
            className="**:[[cmdk-group-heading]]:px-4 **:[[cmdk-group-heading]]:py-3 **:[[cmdk-group-heading]]:text-sm"
          >
            {BOARDS.map((b) => (
              <CommandItem
                key={b.fqbn}
                value={b.label}
                onSelect={() => onSelect(b.fqbn)}
                className="gap-3 rounded-xl px-4 py-3.5 text-base"
              >
                <CpuIcon className="size-5 text-muted-foreground" />
                <span className="flex-1">{b.label}</span>
                {b.fqbn === matched?.fqbn && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vsc-accent)]">
                    algılandı
                  </span>
                )}
                {b.fqbn === fqbn && <CheckIcon className="size-5 text-[var(--vsc-accent)]" />}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
