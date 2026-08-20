"use client";

import { Files, GitBranch, Library, LayoutDashboard, LogIn, Settings, SlidersHorizontal } from "lucide-react";
import AccountMenu from "@/features/auth/AccountMenu";
import type { AuthUser } from "@/features/auth/useAuth";

export type SidePanel = "files" | "projects" | "libraries" | "settings" | "editor";

export interface ActivityBarProps {
  active: SidePanel | null;
  onSelect: (panel: SidePanel) => void;
  onGoDashboard: () => void;
  user: AuthUser | null;
  onLogin: () => void;
  onLogout: () => void;
  /** Aktif projede commit edilmemiş yerel değişiklikler var mı — "Git" ikonunda nokta olarak gösterilir. */
  dirty?: boolean;
}

const TOP_ITEMS: { id: SidePanel; icon: typeof Files; title: string }[] = [
  { id: "files", icon: Files, title: "Sketch dosyaları" },
  { id: "projects", icon: GitBranch, title: "Git" },
  { id: "libraries", icon: Library, title: "Kütüphaneler" },
  { id: "settings", icon: Settings, title: "Kart ayarları" },
];

function PanelButton({
  active,
  title,
  onClick,
  icon: Icon,
  dot,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  icon: typeof Files;
  dot?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`relative flex h-[34px] w-[34px] items-center justify-center rounded-[8px] transition-transform active:scale-[0.92] ${
        active
          ? "bg-[var(--vsc-selected)] text-[var(--vsc-fg-active)]"
          : "text-[var(--vsc-fg-muted)] hover:text-[var(--vsc-fg)]"
      }`}
    >
      <Icon size={17} strokeWidth={2} />
      {dot && (
        <span className="absolute top-1 right-1 flex size-[7px] rounded-full bg-[var(--vsc-accent-mono)] ring-2 ring-[var(--vsc-activitybar)]" />
      )}
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
  dirty,
}: ActivityBarProps) {
  return (
    <nav className="flex w-[46px] shrink-0 flex-col items-center gap-1.5 bg-[var(--vsc-activitybar)] py-2.5">
      {TOP_ITEMS.map(({ id, icon, title }) => (
        <PanelButton
          key={id}
          active={active === id}
          title={title}
          icon={icon}
          onClick={() => onSelect(id)}
          dot={id === "projects" && dirty}
        />
      ))}

      {/* Alt grup — hesap, panoya dönüş, editör ayarları. Kullanıcının
          açıkça istediği yerleşim: "asıl amaç editör" olduğu için hesap
          yüzeyleri buradan, TopBar'ın önündeki alandan değil, ulaşılıyor. */}
      <div className="mt-auto flex flex-col items-center gap-1.5">
        <PanelButton
          active={active === "editor"}
          title="Editör ayarları"
          icon={SlidersHorizontal}
          onClick={() => onSelect("editor")}
        />

        <button
          title="Panoya dön"
          onClick={onGoDashboard}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[8px] text-[var(--vsc-fg-muted)] transition-transform hover:text-[var(--vsc-fg)] active:scale-[0.92]"
        >
          <LayoutDashboard size={17} strokeWidth={2} />
        </button>

        <div className="mt-1 border-t border-[var(--vsc-border)] pt-2">
          {user ? (
            <AccountMenu user={user} onLogout={onLogout} avatarSize="sm" side="right" align="end" />
          ) : (
            <button
              onClick={onLogin}
              title="GitHub ile giriş yap"
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[8px] text-[var(--vsc-fg-muted)] transition-transform hover:text-[var(--vsc-fg)] active:scale-[0.94]"
            >
              <LogIn size={16} strokeWidth={2.25} />
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
