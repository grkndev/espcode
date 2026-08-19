"use client";

import { hasPsram } from "@/features/flash/flasher";
import type { ChipInfo } from "@/features/serial/useSerialStore";
import { boardLabel } from "./board-match";

export interface SettingsPanelProps {
  fqbn: string;
  chipInfo: ChipInfo | null;
}

export default function SettingsPanel({ fqbn, chipInfo }: SettingsPanelProps) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto bg-[var(--vsc-sidebar)] p-4 text-[var(--vsc-fg)]">
      <section>
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--vsc-fg-muted)]">
          Kart
        </h2>
        <p className="text-xs text-[var(--vsc-fg)]">
          {boardLabel(fqbn)}{" "}
          <span className="text-[var(--vsc-fg-muted)]">— üst şeritteki seçiciden değiştir</span>
        </p>
      </section>

      <section className="border-t border-[var(--vsc-border)] pt-5">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--vsc-fg-muted)]">
          Çip bilgisi
        </h2>
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
      </section>
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
