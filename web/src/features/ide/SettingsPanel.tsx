"use client";

import { hasPsram } from "@/features/flash/flasher";
import type { ChipInfo } from "@/features/serial/useSerialStore";
import { BOARDS } from "./TopBar";

export interface SettingsPanelProps {
  fqbn: string;
  onFqbnChange: (fqbn: string) => void;
  chipInfo: ChipInfo | null;
}

export default function SettingsPanel({ fqbn, onFqbnChange, chipInfo }: SettingsPanelProps) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto bg-[var(--vsc-sidebar)] p-4 text-[var(--vsc-fg)]">
      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--vsc-fg-muted)]">
          Kart
        </h2>
        <select
          value={fqbn}
          onChange={(e) => onFqbnChange(e.target.value)}
          className="w-full rounded-md border border-[var(--vsc-border)] bg-[var(--vsc-selected)] px-3 py-2 text-xs font-[var(--font-data)] text-[var(--vsc-fg-active)]"
        >
          {BOARDS.map((b) => (
            <option key={b.fqbn} value={b.fqbn}>
              {b.label}
            </option>
          ))}
        </select>
      </section>

      <section className="border-t border-[var(--vsc-border)] pt-5">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--vsc-fg-muted)]">
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
