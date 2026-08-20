"use client";

import Link from "next/link";
import { ChevronDown, Hammer, LogIn, Rocket, SquareTerminal } from "lucide-react";
import BoardPickerDialog from "./BoardPickerDialog";
import { boardLabel } from "./board-match";
import type { ChipInfo } from "@/features/serial/useSerialStore";
import type { AuthUser } from "@/features/auth/useAuth";

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
  user: AuthUser | null;
  onLogin: () => void;
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
  user,
  onLogin,
}: TopBarProps) {
  const busy = compiling || flashing;
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--vsc-border)] bg-[var(--vsc-activitybar)] px-4">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          title="Panoya dön"
          className="[font-family:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--vsc-fg-active)]"
        >
          espcode
        </Link>

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

        <button
          onClick={onCompile}
          disabled={!connected || busy}
          title="Derle"
          className="flex items-center gap-2 rounded-md border border-[var(--vsc-border)] px-3.5 py-2 text-xs font-medium text-[var(--vsc-fg)] transition-transform hover:text-[var(--vsc-fg-active)] active:scale-[0.94] disabled:opacity-40 disabled:active:scale-100"
        >
          <Hammer size={14} strokeWidth={2.25} />
          {compiling && !flashing ? "Derleniyor…" : "Derle"}
        </button>

        <button
          onClick={onCompileAndFlash}
          disabled={!connected || busy}
          title="Derle ve Yükle"
          className="flex items-center gap-2 rounded-md bg-[var(--vsc-accent)] px-3.5 py-2 text-xs font-medium text-white transition-transform active:scale-[0.94] disabled:opacity-40 disabled:active:scale-100"
        >
          <Rocket size={14} strokeWidth={2.25} />
          {compiling ? "Derleniyor…" : flashing ? "Yükleniyor…" : "Derle ve Yükle"}
        </button>

        {user ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl ?? undefined}
            alt={user.login}
            title={user.login}
            className="h-8 w-8 shrink-0 rounded-full border border-[var(--vsc-border)]"
          />
        ) : (
          <button
            onClick={onLogin}
            title="GitHub ile giriş yap"
            className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--vsc-fg-muted)] transition-transform hover:text-[var(--vsc-fg)] active:scale-[0.94]"
          >
            <LogIn size={16} strokeWidth={2.25} />
          </button>
        )}
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
