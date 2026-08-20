"use client";

import Link from "next/link";
import { ArrowLeft, ExternalLink, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import QuotaBar from "@/features/auth/QuotaBar";
import type { AuthUser } from "@/features/auth/useAuth";

export interface ProfilePageProps {
  user: AuthUser;
  onLogout: () => void;
}

function initials(login: string): string {
  return login.slice(0, 2).toUpperCase();
}

// master.plan.md — kullanıcı yalnızca GitHub ile giriş yapıyor (read:user scope),
// bu yüzden e-posta/isim/bio gibi alanlar hiç yok ve burada uydurulmuyor.
// Gösterilen her alan (login, avatar, üye olma tarihi, kota) gerçek /api/me
// verisi.
export default function ProfilePage({ user, onLogout }: ProfilePageProps) {
  const memberSince = new Date(user.createdAt)
    .toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })
    .toUpperCase();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex h-13 items-center justify-between border-b border-border px-6">
        <Link href="/" className="font-[family-name:var(--font-display)] text-[19px] font-bold tracking-tight">
          espcode
        </Link>
        <Button render={<Link href="/" />} nativeButton={false} variant="ghost" size="sm">
          <ArrowLeft size={14} strokeWidth={2.25} />
          Panoya dön
        </Button>
      </header>

      <main className="flex flex-col items-center px-6 pt-11 pb-16">
        <Avatar className="size-16">
          <AvatarImage src={user.avatarUrl ?? undefined} alt={user.login} />
          <AvatarFallback className="bg-foreground font-[family-name:var(--font-display)] text-2xl font-semibold text-background">
            {initials(user.login)}
          </AvatarFallback>
        </Avatar>

        <h1 className="mt-3.5 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          {user.login}
        </h1>
        <a
          href={`https://github.com/${user.login}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 inline-flex items-center gap-1.5 font-[family-name:var(--font-data)] text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <span className="size-1.5 rounded-full bg-success" />
          GITHUB İLE BAĞLI
          <ExternalLink size={10} strokeWidth={2.25} />
        </a>

        <div className="mt-6.5 w-full max-w-[420px] overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex items-center justify-between gap-4 border-b border-dashed border-rule-soft px-5 py-3.5">
            <span className="text-[13px] text-muted-foreground">Üye olma</span>
            <span className="font-[family-name:var(--font-data)] text-xs font-medium">{memberSince}</span>
          </div>
          <div className="flex items-center justify-between gap-4 border-b border-dashed border-rule-soft px-5 py-3.5">
            <span className="text-[13px] text-muted-foreground">Proje kotası</span>
            <QuotaBar used={user.quota.projects.used} max={user.quota.projects.max} />
          </div>
          <div className="flex items-center justify-between gap-4 px-5 py-3.5">
            <span className="text-[13px] text-muted-foreground">Plan</span>
            <Link
              href="/subscription"
              className="font-[family-name:var(--font-data)] text-xs font-medium text-signal-mono"
            >
              ÜCRETSİZ · <span className="text-muted-foreground">yükselt →</span>
            </Link>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={onLogout}
          className="mt-4.5 h-10 w-full max-w-[420px] rounded-[10px] border-border bg-transparent text-destructive hover:bg-destructive/5 hover:text-destructive"
        >
          <LogOut size={13} strokeWidth={2.25} />
          Çıkış yap
        </Button>
      </main>
    </div>
  );
}
