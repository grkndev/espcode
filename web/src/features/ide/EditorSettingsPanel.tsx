"use client";

import { Switch } from "@/components/ui/switch";

export interface EditorSettingsPanelProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  lineWrap: boolean;
  onLineWrapChange: (wrap: boolean) => void;
}

const FONT_SIZES = [12, 13, 14, 15, 16, 18];

// SettingsPanel.tsx (kart ayarları) ile aynı düz-bölüm deseni — ama bu panel
// editöre özgü tercihleri taşıyor. Tema seçimi burada YOK, kasıtlı: o
// AccountMenu'de yaşıyor çünkü uygulama-geneli bir tercih, editöre özgü
// değil (editör kabuğu zaten sabit koyu, bkz. IdeShell.tsx "dark" sınıfı).
export default function EditorSettingsPanel({
  fontSize,
  onFontSizeChange,
  lineWrap,
  onLineWrapChange,
}: EditorSettingsPanelProps) {
  return (
    <div className="flex h-full flex-col bg-[var(--vsc-sidebar)] text-[var(--vsc-fg)]">
      <div className="flex h-[38px] shrink-0 items-center border-b border-[var(--vsc-border)] px-3">
        <span className="font-[family-name:var(--font-data)] text-[9.5px] font-medium tracking-[0.14em] text-[var(--vsc-fg-muted)]">
          EDİTÖR AYARLARI
        </span>
      </div>

      <div className="flex flex-col gap-[18px] p-3.5">
        <div>
          <span className="mb-2 block text-[11.5px] text-[var(--vsc-fg-muted)]">Yazı tipi boyutu</span>
          <div className="flex flex-wrap gap-1.5">
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => onFontSizeChange(size)}
                className={`rounded-[8px] border px-2.5 py-1.5 font-[family-name:var(--font-data)] text-xs transition-colors ${
                  size === fontSize
                    ? "border-[var(--vsc-accent)] bg-[var(--vsc-accent)]/15 text-[var(--vsc-fg-active)]"
                    : "border-[var(--vsc-border-input)] text-[var(--vsc-fg-muted)] hover:text-[var(--vsc-fg)]"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3">
          <span className="text-[11.5px] text-[var(--vsc-fg-muted)]">Satırları kaydır</span>
          <Switch checked={lineWrap} onCheckedChange={onLineWrapChange} />
        </label>

        <p className="border-t border-[var(--vsc-border)] pt-3 text-[10.5px] leading-relaxed text-[var(--vsc-fg-faint)]">
          Daha fazlası yakında: sekme genişliği, klavye haritası.
        </p>
      </div>
    </div>
  );
}
