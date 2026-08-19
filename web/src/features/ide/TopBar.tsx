"use client";

import { ChevronDown, SquareTerminal } from "lucide-react";
import FlashPopover, { type FlashPopoverProps } from "@/features/flash/FlashPopover";
import BoardPickerDialog from "./BoardPickerDialog";
import { boardLabel } from "./board-match";
import type { ChipInfo } from "@/features/serial/useSerialStore";

export interface TopBarProps {
  connected: boolean;
  connecting: boolean;
  fqbn: string;
  chipInfo: ChipInfo | null;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onTriggerClick: () => void;
  onSelectBoard: (fqbn: string) => void;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  flash: FlashPopoverProps;
}

export default function TopBar({
  connected,
  connecting,
  fqbn,
  chipInfo,
  dialogOpen,
  onDialogOpenChange,
  onTriggerClick,
  onSelectBoard,
  terminalOpen,
  onToggleTerminal,
  flash,
}: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--vsc-border)] bg-[var(--vsc-activitybar)] px-4">
      <div className="flex items-center gap-3">
        <span className="[font-family:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--vsc-fg-active)]">
          espcode
        </span>

        <button
          onClick={onTriggerClick}
          disabled={connecting}
          className="flex items-center gap-2 rounded-md border border-[var(--vsc-border)] bg-[var(--vsc-selected)] px-3 py-1.5 text-xs font-medium text-[var(--vsc-fg)] transition-transform active:scale-[0.97] disabled:opacity-60"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-[var(--vsc-fg-muted)]"}`}
          />
          {connecting ? "Bağlanıyor…" : connected ? boardLabel(fqbn) : "Kart seçiniz"}
          <ChevronDown size={13} strokeWidth={2.25} className="text-[var(--vsc-fg-muted)]" />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={onToggleTerminal}
          title="Terminal"
          className={`flex h-9 w-9 items-center justify-center rounded-md transition-transform active:scale-[0.94] ${
            terminalOpen
              ? "bg-[var(--vsc-selected)] text-[var(--vsc-fg-active)]"
              : "text-[var(--vsc-fg-muted)] hover:text-[var(--vsc-fg)]"
          }`}
        >
          <SquareTerminal size={16} strokeWidth={2.25} />
        </button>
        <FlashPopover {...flash} />
      </div>

      <BoardPickerDialog
        open={dialogOpen}
        onOpenChange={onDialogOpenChange}
        fqbn={fqbn}
        onSelect={onSelectBoard}
        chipInfo={chipInfo}
      />
    </header>
  );
}
