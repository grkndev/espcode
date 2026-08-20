"use client";

import Link from "next/link";
import { ChevronDown, Hammer, Rocket, SquareTerminal } from "lucide-react";
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
  compiling: boolean;
  flashing: boolean;
  onCompile: () => void;
  onCompileAndFlash: () => void;
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
  compiling,
  flashing,
  onCompile,
  onCompileAndFlash,
}: TopBarProps) {
  const busy = compiling || flashing;
  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--vsc-border)] bg-[var(--vsc-activitybar)] px-4">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          title="Panoya dön"
          className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-[var(--vsc-fg-active)]"
        >
          espcode
        </Link>

        <button
          onClick={onTriggerClick}
          disabled={connecting}
          className="flex items-center gap-2 rounded-[8px] border border-[var(--vsc-border-input)] bg-[var(--vsc-selected)] px-3 py-1.5 text-xs font-medium text-[var(--vsc-fg)] transition-transform active:scale-[0.97] disabled:opacity-60"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-[var(--vsc-success)]" : "bg-[var(--vsc-fg-muted)]"}`}
          />
          {connecting ? "Bağlanıyor…" : connected ? boardLabel(fqbn) : "Kart seçiniz"}
          <ChevronDown size={13} strokeWidth={2.25} className="text-[var(--vsc-fg-muted)]" />
        </button>

        <span
          title="⌘K ile kart seçiciyi aç"
          className="hidden rounded-[6px] border border-[var(--vsc-border-input)] px-1.5 py-0.5 font-[family-name:var(--font-data)] text-[10px] font-medium text-[var(--vsc-fg-muted)] sm:inline-block"
        >
          ⌘K
        </span>
      </div>

      <div className="flex items-center gap-2.5">
        <button
          onClick={onToggleTerminal}
          title="Terminal"
          className={`flex h-9 w-9 items-center justify-center rounded-[8px] transition-transform active:scale-[0.94] ${
            terminalOpen
              ? "bg-[var(--vsc-selected)] text-[var(--vsc-fg-active)]"
              : "text-[var(--vsc-fg-muted)] hover:text-[var(--vsc-fg)]"
          }`}
        >
          <SquareTerminal size={16} strokeWidth={2.25} />
        </button>

        <button
          onClick={onCompile}
          disabled={!connected || busy}
          title="Derle"
          className="flex items-center gap-2 rounded-[8px] border border-[var(--vsc-border-ghost)] px-3.5 py-[7px] text-[12.5px] font-medium text-[var(--vsc-fg)] transition-transform hover:text-[var(--vsc-fg-active)] active:scale-[0.94] disabled:opacity-40 disabled:active:scale-100"
        >
          <Hammer size={14} strokeWidth={2.25} />
          {compiling && !flashing ? "Derleniyor…" : "Derle"}
        </button>

        <button
          onClick={onCompileAndFlash}
          disabled={!connected || busy}
          title="Derle ve Yükle"
          className="flex items-center gap-2 rounded-[8px] bg-[var(--vsc-accent)] px-3.5 py-[7px] text-[12.5px] font-semibold text-white transition-transform active:scale-[0.94] disabled:opacity-40 disabled:active:scale-100"
        >
          <Rocket size={14} strokeWidth={2.25} />
          {compiling ? "Derleniyor…" : flashing ? "Yükleniyor…" : "Derle ve Yükle"}
        </button>
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
