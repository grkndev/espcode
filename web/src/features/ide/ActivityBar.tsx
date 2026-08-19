"use client";

import { Files, Settings } from "lucide-react";

export type SidePanel = "library" | "settings";

export interface ActivityBarProps {
  active: SidePanel | null;
  onSelect: (panel: SidePanel) => void;
}

const ITEMS: { id: SidePanel; icon: typeof Files; title: string }[] = [
  { id: "library", icon: Files, title: "Sketch dosyaları" },
  { id: "settings", icon: Settings, title: "Kart ayarları" },
];

export default function ActivityBar({ active, onSelect }: ActivityBarProps) {
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-2 bg-[var(--vsc-activitybar)] py-3">
      {ITEMS.map(({ id, icon: Icon, title }) => (
        <button
          key={id}
          title={title}
          onClick={() => onSelect(id)}
          className={`relative flex h-11 w-11 items-center justify-center rounded-md transition-transform active:scale-[0.92] ${
            active === id
              ? "bg-[var(--vsc-selected)] text-[var(--vsc-fg-active)]"
              : "text-[var(--vsc-fg-muted)] hover:text-[var(--vsc-fg)]"
          }`}
        >
          {active === id && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--vsc-accent)]" />
          )}
          <Icon size={22} strokeWidth={2} />
        </button>
      ))}
    </nav>
  );
}
