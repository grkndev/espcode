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
  const memberSince = new Date(user.createdAt).toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/" className="[font-family:var(--font-display)] text-xl font-semibold tracking-tight">
          espcode
        </Link>
        <Button render={<Link href="/" />} nativeButton={false} variant="ghost" size="sm">
          <ArrowLeft size={14} strokeWidth={2.25} />
          Panoya dön
        </Button>
      </header>

      <main className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-16">
        <Avatar className="size-20">
          <AvatarImage src={user.avatarUrl ?? undefined} alt={user.login} />
          <AvatarFallback className="text-2xl">{initials(user.login)}</AvatarFallback>
        </Avatar>

        <div className="text-center">
          <h1 className="[font-family:var(--font-display)] text-2xl font-semibold tracking-tight">
            {user.login}
          </h1>
          <a
            href={`https://github.com/${user.login}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            GitHub ile bağlı
            <ExternalLink size={11} strokeWidth={2.25} />
          </a>
        </div>

        <div className="w-full rounded-xl border border-border bg-card px-5 py-4">
          <dl className="flex flex-col gap-3.5 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Üye olma</dt>
              <dd>{memberSince}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-muted-foreground">Proje kotası</dt>
              <dd>
                <QuotaBar used={user.quota.projects.used} max={user.quota.projects.max} />
              </dd>
            </div>
          </dl>
        </div>

        <Button variant="destructive" onClick={onLogout} className="w-full">
          <LogOut size={14} strokeWidth={2.25} />
          Çıkış yap
        </Button>
      </main>
    </div>
  );
}
