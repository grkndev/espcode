"use client";

import { Loader2 } from "lucide-react";
import type { SerialSessionState } from "@/features/serial/SerialSession";
import type { BuildStatus } from "@/features/build/useBuildStore";

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
  buildStatus: BuildStatus;
  flashProgress: number | null;
  flashStageLabel: string | null;
}

export default function StatusBar({
  state,
  fqbn,
  baud,
  buildStatus,
  flashProgress,
  flashStageLabel,
}: StatusBarProps) {
  const compiling = buildStatus === "compiling";
  const flashing = state === "flashing";
  const busy = compiling || flashing;

  const label = compiling ? "Derleniyor…" : flashing && flashStageLabel ? flashStageLabel : STATE_LABEL[state];
  const percent = flashing && flashProgress !== null ? Math.round(flashProgress * 100) : null;

  return (
    <footer className="relative flex h-8 shrink-0 items-center gap-5 border-t border-[var(--vsc-border)] bg-[var(--vsc-statusbar)] px-4 [font-family:var(--font-data)] text-[11px] font-medium text-[var(--vsc-fg)]">
      <span className="flex items-center gap-1.5">
        {busy ? (
          <Loader2 size={11} strokeWidth={2.5} className="animate-spin text-[var(--vsc-accent)]" />
        ) : (
          <span className={`h-1.5 w-1.5 rounded-full ${STATE_DOT[state]}`} />
        )}
        <span className={busy ? "shimmer-text" : undefined}>{label}</span>
        {percent !== null && <span className="text-[var(--vsc-fg-muted)]">{percent}%</span>}
      </span>
      <span>{fqbn}</span>
      {state !== "disconnected" && <span>{baud} baud</span>}

      {busy && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-[var(--vsc-border)]">
          <div
            className={
              percent !== null
                ? "h-full bg-[var(--vsc-accent)] transition-[width]"
                : "h-full w-2/5 animate-[status-indeterminate_1.1s_ease-in-out_infinite] bg-[var(--vsc-accent)]"
            }
            style={percent !== null ? { width: `${percent}%` } : undefined}
          />
        </div>
      )}
    </footer>
  );
}
