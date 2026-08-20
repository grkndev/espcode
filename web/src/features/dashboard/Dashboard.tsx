"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, GitBranch, LogOut, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuthUser } from "@/features/auth/useAuth";
import { useProjects } from "@/features/projects/useProjects";

export interface DashboardProps {
  user: AuthUser;
  onLogout: () => void;
}

// frontend.plan.md §11 — IDE dışı yüzey, datasheet paleti (--stock/--ink/--signal).
// Editör artık ana sayfa değil (bkz. app/page.tsx) — giriş yapmış kullanıcı önce
// burayı görür, bir proje açtığında ya da "Yeni proje"ye tıkladığında /editor'a geçer.
export default function Dashboard({ user, onLogout }: DashboardProps) {
  const { projects, loading, refresh, remove } = useProjects();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="[font-family:var(--font-display)] text-xl font-semibold tracking-tight">
          espcode
        </span>
        <div className="flex items-center gap-3">
          {user.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-7 w-7 shrink-0 rounded-full" />
          )}
          <span className="text-sm text-muted-foreground">{user.login}</span>
          <Button onClick={onLogout} variant="ghost" size="icon-sm" title="Çıkış yap">
            <LogOut size={14} strokeWidth={2.25} />
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="[font-family:var(--font-display)] text-2xl font-semibold tracking-tight">
              Projelerim
            </h1>
            <p className="text-sm text-muted-foreground">
              {user.quota.projects.used}/{user.quota.projects.max} proje
            </p>
          </div>
          <Button render={<Link href="/editor" />} nativeButton={false}>
            <Plus size={16} strokeWidth={2.25} />
            Yeni proje
          </Button>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Yükleniyor…</p>}

        {!loading && projects.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Henüz kaydedilmiş proje yok. Yeni bir sketch açıp kaydet.
            </p>
          </div>
        )}

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id} className="group relative">
              <Link
                href={`/editor?project=${p.id}`}
                className="flex h-full flex-col gap-2 rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:border-primary/50"
              >
                <span className="flex items-center gap-1.5 truncate pr-6">
                  <span className="[font-family:var(--font-display)] truncate text-base font-medium">
                    {p.name}
                  </span>
                  {p.githubLinkBroken ? (
                    <AlertTriangle size={12} strokeWidth={2.5} className="shrink-0 text-red-500" />
                  ) : (
                    p.storageProvider === "github" && (
                      <GitBranch size={12} strokeWidth={2.25} className="shrink-0 text-muted-foreground" />
                    )
                  )}
                </span>
                <span className="text-xs text-muted-foreground [font-family:var(--font-data)]">
                  {p.fqbn}
                </span>
                <span className="mt-auto text-xs text-muted-foreground">
                  {p.storageProvider === "github"
                    ? p.githubRepoFullName
                    : `v${p.versionCount}`}{" "}
                  · {new Date(p.updatedAt).toLocaleDateString("tr-TR")}
                </span>
              </Link>
              <button
                onClick={() => void remove(p.id)}
                title="Projeyi sil"
                className="absolute right-3 top-3 rounded p-1 text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
              >
                <Trash2 size={13} strokeWidth={2.25} />
              </button>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
