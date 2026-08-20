"use client";

import { useEffect, useRef, type Ref } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SerialTerminal, { type TerminalHandle } from "@/features/monitor/Terminal";
import Plotter, { type PlotterHandle } from "@/features/plotter/Plotter";

const BAUD_RATES = [9600, 19200, 38400, 57600, 74880, 115200, 230400, 460800, 921600];

export type LineEnding = "none" | "lf" | "cr" | "crlf";

export interface BottomPanelProps {
  activeTab: string;
  onActiveTabChange: (tab: string) => void;
  terminalRef: Ref<TerminalHandle>;
  plotterRef: Ref<PlotterHandle>;
  isMonitoring: boolean;
  canMonitor: boolean;
  baud: number;
  onBaudChange: (baud: number) => void;
  onToggleMonitor: () => void;
  onClearMonitor: () => void;
  sendValue: string;
  onSendValueChange: (value: string) => void;
  onSendKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  lineEnding: LineEnding;
  onLineEndingChange: (ending: LineEnding) => void;
  onSend: () => void;
  buildLog: string;
}

export default function BottomPanel({
  activeTab,
  onActiveTabChange,
  terminalRef,
  plotterRef,
  isMonitoring,
  canMonitor,
  baud,
  onBaudChange,
  onToggleMonitor,
  onClearMonitor,
  sendValue,
  onSendValueChange,
  onSendKeyDown,
  lineEnding,
  onLineEndingChange,
  onSend,
  buildLog,
}: BottomPanelProps) {
  const buildScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = buildScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [buildLog]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={onActiveTabChange}
      className="flex h-full flex-col gap-0 overflow-hidden bg-[var(--vsc-panel)] text-[var(--vsc-fg)]"
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--vsc-border)] px-3.5">
        <TabsList variant="line" className="gap-0.5 bg-transparent">
          <TabsTrigger
            value="monitor"
            className="rounded-none px-3 py-[9px] font-[family-name:var(--font-ui)] text-[12px] text-[var(--vsc-fg-muted)] after:bg-[var(--vsc-accent)] data-active:bg-transparent data-active:font-medium data-active:text-[var(--vsc-fg-active)]"
          >
            Monitör
          </TabsTrigger>
          <TabsTrigger
            value="plotter"
            className="rounded-none px-3 py-[9px] font-[family-name:var(--font-ui)] text-[12px] text-[var(--vsc-fg-muted)] after:bg-[var(--vsc-accent)] data-active:bg-transparent data-active:font-medium data-active:text-[var(--vsc-fg-active)]"
          >
            Plotter
          </TabsTrigger>
          <TabsTrigger
            value="build"
            className="rounded-none px-3 py-[9px] font-[family-name:var(--font-ui)] text-[12px] text-[var(--vsc-fg-muted)] after:bg-[var(--vsc-accent)] data-active:bg-transparent data-active:font-medium data-active:text-[var(--vsc-fg-active)]"
          >
            Derleme Çıktısı
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-2">
          <select
            value={baud}
            onChange={(e) => onBaudChange(Number(e.target.value))}
            className="rounded-[8px] border border-[var(--vsc-border-input)] bg-[var(--vsc-selected)] px-2.5 py-[5px] font-[family-name:var(--font-data)] text-[11px] text-[var(--vsc-fg)]"
          >
            {BAUD_RATES.map((b) => (
              <option key={b} value={b}>
                {b} baud
              </option>
            ))}
          </select>
          <button
            onClick={onClearMonitor}
            className="rounded-[8px] border border-[var(--vsc-border-ghost)] px-3.5 py-[6px] text-xs font-medium text-[var(--vsc-fg)] transition-transform hover:text-[var(--vsc-fg-active)] active:scale-[0.97]"
          >
            Temizle
          </button>
          <button
            onClick={onToggleMonitor}
            disabled={!canMonitor}
            className="rounded-[8px] bg-[var(--vsc-accent)] px-3.5 py-[6px] text-xs font-semibold text-white transition-transform active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
          >
            {isMonitoring ? "Durdur" : "Başlat"}
          </button>
        </div>
      </div>

      <TabsContent value="monitor" className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
        <div className="flex h-[46px] shrink-0 items-center gap-2 border-b border-[var(--vsc-border)] px-3.5">
          <input
            value={sendValue}
            onChange={(e) => onSendValueChange(e.target.value)}
            onKeyDown={onSendKeyDown}
            disabled={!isMonitoring}
            placeholder={isMonitoring ? "Karta gönder…" : "Önce monitörü başlat"}
            className="flex-1 rounded-[8px] border border-[var(--vsc-border-input)] bg-[var(--vsc-selected)] px-[11px] py-[7px] text-[12.5px] text-[var(--vsc-fg)] placeholder:text-[var(--vsc-fg-faint)] disabled:opacity-40"
          />
          <select
            value={lineEnding}
            onChange={(e) => onLineEndingChange(e.target.value as LineEnding)}
            className="rounded-[8px] border border-[var(--vsc-border-input)] bg-[var(--vsc-selected)] px-2.5 py-[6px] font-[family-name:var(--font-data)] text-[11px] text-[var(--vsc-fg)]"
          >
            <option value="none">Yok</option>
            <option value="lf">LF</option>
            <option value="cr">CR</option>
            <option value="crlf">CRLF</option>
          </select>
          <button
            onClick={onSend}
            disabled={!isMonitoring || !sendValue}
            className="rounded-[8px] border border-[var(--vsc-border-ghost)] px-3.5 py-[6px] text-[12px] font-medium text-[var(--vsc-fg)] disabled:opacity-40"
          >
            Gönder
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <SerialTerminal ref={terminalRef} />
        </div>
      </TabsContent>

      <TabsContent value="plotter" className="min-h-0 flex-1 p-4">
        <Plotter ref={plotterRef} />
      </TabsContent>

      <TabsContent value="build" className="min-h-0 flex-1 overflow-hidden">
        <div ref={buildScrollRef} className="h-full overflow-y-auto p-4">
          <pre className="whitespace-pre-wrap font-[var(--font-code)] text-xs text-[var(--vsc-fg-muted)]">
            {/* esptool ilerleme satırları \r ile satır içi güncelleme yapar; \n'e
                çevirmezsek mesajlar alt alta değil yan yana akar. */}
            {buildLog.replace(/\r\n?/g, "\n") || "Henüz bir günlük yok."}
          </pre>
        </div>
      </TabsContent>
    </Tabs>
  );
}
