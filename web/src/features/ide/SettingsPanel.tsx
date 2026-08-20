"use client";

import { hasPsram } from "@/features/flash/flasher";
import type { ChipInfo } from "@/features/serial/useSerialStore";
import { boardLabel } from "./board-match";
import { groupedBoardOptions } from "./board-options";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SettingsPanelProps {
  fqbn: string;
  chipInfo: ChipInfo | null;
  boardOptions: Record<string, string>;
  onOptionChange: (key: string, value: string) => void;
}

export default function SettingsPanel({
  fqbn,
  chipInfo,
  boardOptions,
  onOptionChange,
}: SettingsPanelProps) {
  const groups = groupedBoardOptions(fqbn);

  return (
    <div className="h-full overflow-y-auto bg-[var(--vsc-sidebar)] p-3 text-[var(--vsc-fg)]">
      <Accordion
        multiple
        defaultValue={["board", "options", "chip"]}
        className="border-none bg-transparent"
      >
        <AccordionItem value="board" className="border-b border-[var(--vsc-border)]">
          <AccordionTrigger className="px-1 py-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--vsc-fg-muted)] hover:no-underline">
            Kart
          </AccordionTrigger>
          <AccordionContent className="px-1 pb-4 text-xs">
            <p className="text-[var(--vsc-fg)]">
              {boardLabel(fqbn)}{" "}
              <span className="text-[var(--vsc-fg-muted)]">— üst şeritteki seçiciden değiştir</span>
            </p>
          </AccordionContent>
        </AccordionItem>

         <AccordionItem value="chip" className="border-b border-[var(--vsc-border)]">
          <AccordionTrigger className="px-1 py-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--vsc-fg-muted)] hover:no-underline">
            Çip bilgisi
          </AccordionTrigger>
          <AccordionContent className="px-1 pb-4">
            {chipInfo ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 font-[var(--font-data)] text-xs">
                <Field label="Çip" value={chipInfo.description} />
                <Field label="MAC" value={chipInfo.macAddress} />
                <Field label="Kristal" value={`${chipInfo.crystalFreqMHz} MHz`} />
                <Field label="Flash" value={chipInfo.flashSize} />
                <Field label="PSRAM" value={hasPsram(chipInfo.features) ? "Var" : "Yok"} />
              </dl>
            ) : (
              <p className="text-xs text-[var(--vsc-fg-muted)]">Karta bağlanınca burada görünür.</p>
            )}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="options" >
          <AccordionTrigger className="px-1 py-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--vsc-fg-muted)] hover:no-underline">
            Derleme ayarları
          </AccordionTrigger>
          <AccordionContent className="px-1 pb-4">
            <p className="mb-4 text-[10px] leading-relaxed text-[var(--vsc-fg-muted)]">
              Arduino Tools menüsündeki kart seçenekleri — derleme bu seçimlere göre yapılır.
            </p>
            <div className="flex flex-col gap-4">
              {groups.map(({ group, options }) => (
                <div key={group}>
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--vsc-fg-muted)]/70">
                    {group}
                  </h3>
                  <div className="flex flex-col gap-3">
                    {options.map((opt) => (
                      <label key={opt.key} className="flex flex-col gap-1.5">
                        <span className="text-xs text-[var(--vsc-fg)]">{opt.label}</span>
                        <Select
                          value={boardOptions[opt.key] ?? opt.default}
                          onValueChange={(v) => v && onOptionChange(opt.key, v)}
                        >
                          <SelectTrigger className="w-full rounded-md border-[var(--vsc-border)] bg-[var(--vsc-selected)] text-xs text-[var(--vsc-fg-active)] [&_[data-slot=select-value]]:justify-start">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="w-(--anchor-width) rounded-md">
                            {opt.choices.map((c) => (
                              <SelectItem key={c.value} value={c.value} className="rounded-sm text-xs">
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
          </AccordionContent>
        </AccordionItem>

       
      </Accordion>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[var(--vsc-fg-muted)]">{label}</dt>
      <dd className="truncate text-[var(--vsc-fg)]">{value}</dd>
    </>
  );
}
