"use client";

import { useState } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { CreditCard, LogOut, Monitor, Moon, Sun, User, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { AuthUser } from "./useAuth";

export interface AccountMenuProps {
  user: AuthUser;
  onLogout: () => void;
  avatarSize?: "default" | "sm" | "lg";
  side?: "top" | "bottom" | "left" | "right";
  align?: "start" | "center" | "end";
}

const THEME_OPTIONS = [
  { value: "light", label: "Açık", icon: Sun },
  { value: "dark", label: "Koyu", icon: Moon },
  { value: "system", label: "Sistem", icon: Monitor },
] as const;

function initials(login: string): string {
  return login.slice(0, 2).toUpperCase();
}

// Dashboard.tsx, ProjectsPanel.tsx ve TopBar.tsx'teki üç ayrı, tıklanamaz
// <img> avatar tekrarının tek kaynağı. Tema seçimi burada yaşıyor (uygulama
// geneli bir tercih — editör kabuğu --vsc-* sabit koyu kaldığı için ondan
// etkilenmez, bkz. globals.css).
export default function AccountMenu({
  user,
  onLogout,
  avatarSize = "default",
  side = "bottom",
  align = "start",
}: AccountMenuProps) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={user.login}
        className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar size={avatarSize}>
          <AvatarImage src={user.avatarUrl ?? undefined} alt={user.login} />
          <AvatarFallback>{initials(user.login)}</AvatarFallback>
        </Avatar>
      </PopoverTrigger>

      <PopoverContent side={side} align={align} className="w-64 gap-3">
        <div className="flex items-center gap-3">
          <Avatar size="lg">
            <AvatarImage src={user.avatarUrl ?? undefined} alt={user.login} />
            <AvatarFallback>{initials(user.login)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.login}</p>
            <p className="text-xs text-muted-foreground">
              {user.quota.projects.used}/{user.quota.projects.max} proje
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-0.5 border-t border-border pt-3">
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            <User size={15} strokeWidth={2} /> Profil
          </Link>
          <Link
            href="/subscription"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            <CreditCard size={15} strokeWidth={2} /> Abonelik
          </Link>
          <Link
            href="/tools"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
          >
            <Wrench size={15} strokeWidth={2} /> Araçlar
          </Link>
        </div>

        <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              title={label}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-1 items-center justify-center rounded-lg py-1.5 transition-colors",
                theme === value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon size={14} strokeWidth={2.25} />
              <span className="sr-only">{label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onLogout();
          }}
          className="flex items-center gap-2 rounded-lg border-t border-border px-2 pt-3 text-sm text-destructive transition-colors hover:text-destructive/80"
        >
          <LogOut size={15} strokeWidth={2} /> Çıkış yap
        </button>
      </PopoverContent>
    </Popover>
  );
}
