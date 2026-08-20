"use client";

import { Files, FolderGit2, LayoutDashboard, LogIn, Settings, SlidersHorizontal } from "lucide-react";
import AccountMenu from "@/features/auth/AccountMenu";
import type { AuthUser } from "@/features/auth/useAuth";

export type SidePanel = "library" | "projects" | "settings" | "editor";

export interface ActivityBarProps {
  active: SidePanel | null;
  onSelect: (panel: SidePanel) => void;
  onGoDashboard: () => void;
  user: AuthUser | null;
  onLogin: () => void;
  onLogout: () => void;
}

const TOP_ITEMS: { id: SidePanel; icon: typeof Files; title: string }[] = [
  { id: "library", icon: Files, title: "Sketch dosyaları" },
  { id: "projects", icon: FolderGit2, title: "Projelerim" },
  { id: "settings", icon: Settings, title: "Kart ayarları" },
];

function PanelButton({
  active,
  title,
  onClick,
  icon: Icon,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  icon: typeof Files;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`relative flex h-11 w-11 items-center justify-center rounded-md transition-transform active:scale-[0.92] ${
        active
          ? "bg-[var(--vsc-selected)] text-[var(--vsc-fg-active)]"
          : "text-[var(--vsc-fg-muted)] hover:text-[var(--vsc-fg)]"
      }`}
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--vsc-accent)]" />
      )}
      <Icon size={22} strokeWidth={2} />
    </button>
  );
}

export default function ActivityBar({
  active,
  onSelect,
  onGoDashboard,
  user,
  onLogin,
  onLogout,
}: ActivityBarProps) {
  return (
    <nav className="flex w-14 shrink-0 flex-col items-center gap-2 bg-[var(--vsc-activitybar)] py-3">
      {TOP_ITEMS.map(({ id, icon, title }) => (
        <PanelButton key={id} active={active === id} title={title} icon={icon} onClick={() => onSelect(id)} />
      ))}

      {/* Alt grup — hesap, panoya dönüş, editör ayarları. Kullanıcının
          açıkça istediği yerleşim: "asıl amaç editör" olduğu için hesap
          yüzeyleri buradan, TopBar'ın önündeki alandan değil, ulaşılıyor. */}
      <div className="mt-auto flex flex-col items-center gap-2">
        <PanelButton
          active={active === "editor"}
          title="Editör ayarları"
          icon={SlidersHorizontal}
          onClick={() => onSelect("editor")}
        />

        <button
          title="Panoya dön"
          onClick={onGoDashboard}
          className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--vsc-fg-muted)] transition-transform hover:text-[var(--vsc-fg)] active:scale-[0.92]"
        >
          <LayoutDashboard size={20} strokeWidth={2} />
        </button>

        <div className="border-t border-[var(--vsc-border)] pt-2">
          {user ? (
            <AccountMenu user={user} onLogout={onLogout} avatarSize="sm" side="right" align="end" />
          ) : (
            <button
              onClick={onLogin}
              title="GitHub ile giriş yap"
              className="flex h-9 w-9 items-center justify-center rounded-md text-[var(--vsc-fg-muted)] transition-transform hover:text-[var(--vsc-fg)] active:scale-[0.94]"
            >
              <LogIn size={18} strokeWidth={2.25} />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
