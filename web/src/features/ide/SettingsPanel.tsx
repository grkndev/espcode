"use client";

import { ChevronRight } from "lucide-react";
import { hasPsram } from "@/features/flash/flasher";
import type { ChipInfo } from "@/features/serial/useSerialStore";
import { boardLabel } from "./board-match";
import { groupedBoardOptions } from "./board-options";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SettingsPanelProps {
  fqbn: string;
  connected: boolean;
  chipInfo: ChipInfo | null;
  boardOptions: Record<string, string>;
  onOptionChange: (key: string, value: string) => void;
  onOpenBoardPicker: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 font-[family-name:var(--font-data)] text-[9.5px] font-medium tracking-[0.12em] text-[var(--vsc-fg-muted)]">
      {children}
    </div>
  );
}

export default function SettingsPanel({
  fqbn,
  connected,
  chipInfo,
  boardOptions,
  onOptionChange,
  onOpenBoardPicker,
}: SettingsPanelProps) {
  const groups = groupedBoardOptions(fqbn);

  return (
    <div className="flex h-full flex-col bg-[var(--vsc-sidebar)] text-[var(--vsc-fg)]">
      <div className="flex h-[38px] shrink-0 items-center border-b border-[var(--vsc-border)] px-3">
        <span className="font-[family-name:var(--font-data)] text-[9.5px] font-medium tracking-[0.14em] text-[var(--vsc-fg-muted)]">
          KART AYARLARI
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-3.5">
        <div>
          <SectionLabel>KART</SectionLabel>
          <button
            onClick={onOpenBoardPicker}
            className="flex w-full items-center gap-2 rounded-[8px] border border-[var(--vsc-border-input)] bg-[var(--vsc-selected)] px-[11px] py-2 text-left"
          >
            <span
              className={`size-1.5 shrink-0 rounded-full ${connected ? "bg-[var(--vsc-success)]" : "bg-[var(--vsc-fg-muted)]"}`}
            />
            <span className="flex-1 truncate text-[12.5px] font-medium text-[var(--vsc-fg-active)]">
              {boardLabel(fqbn)}
            </span>
            <span className="shrink-0 font-[family-name:var(--font-data)] text-[10px] text-[var(--vsc-fg-muted)]">
              değiştir: ⌘K
            </span>
          </button>
        </div>

        <div>
          <SectionLabel>ÇİP BİLGİSİ</SectionLabel>
          {chipInfo ? (
            <dl className="flex flex-col gap-[7px] font-[family-name:var(--font-data)] text-[11px]">
              <Field label="Çip" value={chipInfo.description} />
              <Field label="MAC" value={chipInfo.macAddress} />
              <Field label="Kristal" value={`${chipInfo.crystalFreqMHz} MHz`} />
              <Field label="Flash" value={chipInfo.flashSize} />
              <Field label="PSRAM" value={hasPsram(chipInfo.features) ? "Var" : "Yok"} />
            </dl>
          ) : (
            <p className="text-[11px] text-[var(--vsc-fg-faint)]">Karta bağlanınca burada görünür.</p>
          )}
        </div>

        <div>
          <SectionLabel>DERLEME AYARLARI</SectionLabel>
          <p className="mb-2.5 text-[11px] leading-relaxed text-[var(--vsc-fg-faint)]">
            Arduino Tools menüsündeki kart seçenekleri — derleme bu seçimlere göre yapılır.
          </p>
          <div className="flex flex-col gap-3.5">
            {groups.map(({ group, options }) => (
              <div key={group}>
                <h3 className="mb-1.5 flex items-center gap-1 text-[10px] font-medium text-[var(--vsc-fg-faint)]">
                  <ChevronRight size={10} strokeWidth={2.5} />
                  {group}
                </h3>
                <div className="flex flex-col gap-2.5">
                  {options.map((opt) => (
                    <label key={opt.key} className="flex flex-col gap-[5px]">
                      <span className="text-[11.5px] text-[var(--vsc-fg-muted)]">{opt.label}</span>
                      <Select
                        value={boardOptions[opt.key] ?? opt.default}
                        onValueChange={(v) => v && onOptionChange(opt.key, v)}
                      >
                        <SelectTrigger className="w-full rounded-[8px] border-[var(--vsc-border-input)] bg-[var(--vsc-selected)] px-[11px] py-[7px] font-[family-name:var(--font-data)] text-xs text-[var(--vsc-fg)] [&_[data-slot=select-value]]:justify-start">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="w-(--anchor-width) rounded-[8px]">
                          {opt.choices.map((c) => (
                            <SelectItem key={c.value} value={c.value} className="rounded-[6px] text-xs">
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-[var(--vsc-fg-faint)]">{label}</dt>
      <dd className="truncate text-[var(--vsc-fg)]">{value}</dd>
    </div>
  );
}
