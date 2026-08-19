"use client";

import { SquareTerminal } from "lucide-react";
import FlashPopover, { type FlashPopoverProps } from "@/features/flash/FlashPopover";

// backend.plan.md §7.3 — kart listesi sabit bir enum, client asla serbest metin
// göndermeyecek. Şimdilik yalnızca görüntüleme amaçlı (derleme Faz 5'te).
export const BOARDS = [
  { fqbn: "esp32:esp32:esp32", label: "ESP32 Dev Module" },
  { fqbn: "esp32:esp32:esp32c3", label: "ESP32-C3" },
  { fqbn: "esp32:esp32:esp32s3", label: "ESP32-S3" },
  { fqbn: "esp32:esp32:esp32c6", label: "ESP32-C6" },
];

export interface TopBarProps {
  connected: boolean;
  connecting: boolean;
  onConnect: () => void;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  flash: FlashPopoverProps;
}

export default function TopBar({
  connected,
  connecting,
  onConnect,
  terminalOpen,
  onToggleTerminal,
  flash,
}: TopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--vsc-border)] bg-[var(--vsc-activitybar)] px-4">
      <span className="[font-family:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--vsc-fg-active)]">
        espcode
      </span>

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
        <button
          onClick={onConnect}
          disabled={connecting || connected}
          className="flex items-center gap-2 rounded-md bg-[var(--vsc-accent)] px-4 py-2 text-xs font-medium text-white transition-transform active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-300" : "bg-white/60"}`}
          />
          {connecting ? "Bağlanıyor…" : connected ? "Bağlı" : "Bağlan"}
        </button>
      </div>
    </header>
  );
}
