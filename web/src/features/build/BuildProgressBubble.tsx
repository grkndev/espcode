"use client";

import { Loader2 } from "lucide-react";
import { useBuildStore } from "./useBuildStore";
import { FLASH_STAGE_LABEL } from "@/features/flash/flasher";

// Root layout'a bağlı — derleme/flash IdeShell dışına (Dashboard vb.) geçilse
// bile sürüyor olduğunu gösterir. Bitince zaten useBuildStore'un kendi
// toast.success/error'ı ve NotificationBell'deki kayıt devreye giriyor.
export default function BuildProgressBubble() {
  const status = useBuildStore((s) => s.status);
  const flashing = useBuildStore((s) => s.flashing);
  const progress = useBuildStore((s) => s.progress);
  const flashStage = useBuildStore((s) => s.flashStage);

  const active = status === "compiling" || flashing;
  if (!active) return null;

  const label = flashing
    ? (flashStage ? FLASH_STAGE_LABEL[flashStage] : "Yükleniyor…")
    : "Derleniyor…";
  const percent = flashing && progress !== null ? Math.round(progress * 100) : null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-6 z-50 flex justify-end sm:inset-x-auto sm:right-6">
      <div className="pointer-events-auto flex w-full max-w-72 flex-col gap-2 rounded-xl border border-border bg-popover px-4 py-3 text-popover-foreground shadow-lg">
        <div className="flex items-center gap-2.5 text-sm font-medium">
          <Loader2 size={15} strokeWidth={2.5} className="shrink-0 animate-spin text-primary" />
          <span className="flex-1 truncate">{label}</span>
          {percent !== null && <span className="text-xs text-muted-foreground">%{percent}</span>}
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={
              percent !== null
                ? "h-full rounded-full bg-primary transition-[width]"
                : "h-full w-2/5 animate-[status-indeterminate_1.1s_ease-in-out_infinite] rounded-full bg-primary"
            }
            style={percent !== null ? { width: `${percent}%` } : undefined}
          />
        </div>
      </div>
    </div>
  );
}
