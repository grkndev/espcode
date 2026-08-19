"use client";

import type { SerialSessionState } from "@/features/serial/SerialSession";

const STATE_LABEL: Record<SerialSessionState, string> = {
  disconnected: "Bağlı değil",
  granted: "Bağlı",
  monitoring: "İzleniyor",
  flashing: "Yükleniyor",
};

const STATE_DOT: Record<SerialSessionState, string> = {
  disconnected: "bg-[var(--vsc-fg-muted)]",
  granted: "bg-[var(--vsc-accent)]",
  monitoring: "bg-emerald-500",
  flashing: "bg-amber-500 animate-pulse",
};

export interface StatusBarProps {
  state: SerialSessionState;
  fqbn: string;
  baud: number;
}

export default function StatusBar({ state, fqbn, baud }: StatusBarProps) {
  return (
    <footer className="flex h-8 shrink-0 items-center gap-5 border-t border-[var(--vsc-border)] bg-[var(--vsc-statusbar)] px-4 [font-family:var(--font-data)] text-[11px] font-medium text-[var(--vsc-fg)]">
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[state]}`} />
        {STATE_LABEL[state]}
      </span>
      <span>{fqbn}</span>
      {state !== "disconnected" && <span>{baud} baud</span>}
    </footer>
  );
}
