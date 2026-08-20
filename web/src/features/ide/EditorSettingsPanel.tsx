"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";

export interface EditorSettingsPanelProps {
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  lineWrap: boolean;
  onLineWrapChange: (wrap: boolean) => void;
}

const FONT_SIZES = [12, 13, 14, 15, 16, 18];

// SettingsPanel.tsx (kart ayarları) ile aynı Accordion deseni — ama bu panel
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
    <div className="h-full overflow-y-auto bg-[var(--vsc-sidebar)] p-3 text-[var(--vsc-fg)]">
      <Accordion multiple defaultValue={["editor"]} className="border-none bg-transparent">
        <AccordionItem value="editor">
          <AccordionTrigger className="px-1 py-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--vsc-fg-muted)] hover:no-underline">
            Editör
          </AccordionTrigger>
          <AccordionContent className="px-1 pb-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-[var(--vsc-fg)]">Yazı tipi boyutu</span>
                <div className="flex flex-wrap gap-1.5">
                  {FONT_SIZES.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => onFontSizeChange(size)}
                      className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                        size === fontSize
                          ? "border-[var(--vsc-accent)] bg-[var(--vsc-accent)]/15 text-[var(--vsc-fg-active)]"
                          : "border-[var(--vsc-border)] text-[var(--vsc-fg-muted)] hover:text-[var(--vsc-fg)]"
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between gap-3">
                <span className="text-xs text-[var(--vsc-fg)]">Satırları kaydır</span>
                <Switch checked={lineWrap} onCheckedChange={onLineWrapChange} />
              </label>

              <p className="border-t border-[var(--vsc-border)] pt-3 text-[10px] leading-relaxed text-[var(--vsc-fg-muted)]">
                Daha fazlası yakında: sekme genişliği, klavye haritası.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
