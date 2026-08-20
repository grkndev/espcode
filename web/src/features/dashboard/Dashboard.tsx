"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownAZ,
  Clock,
  Database,
  GitBranch,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AccountMenu from "@/features/auth/AccountMenu";
import QuotaBar from "@/features/auth/QuotaBar";
import NotificationBell from "@/features/build/NotificationBell";
import type { AuthUser } from "@/features/auth/useAuth";
import { useProjects, type ProjectSummary } from "@/features/projects/useProjects";
import { boardLabel } from "@/features/ide/board-match";
import { cn, formatRelativeDate } from "@/lib/utils";

export interface DashboardProps {
  user: AuthUser;
  onLogout: () => void;
}

type SortMode = "updated" | "name";

function ProviderBadge({ project }: { project: ProjectSummary }) {
  if (project.githubLinkBroken) {
    return (
      <span title="GitHub bağlantısı koptu" className="shrink-0 text-destructive">
        <AlertTriangle size={12} strokeWidth={2.5} />
      </span>
    );
  }
  if (project.storageProvider === "github") {
    return (
      <span title={project.githubRepoFullName ?? "GitHub"} className="shrink-0 text-muted-foreground">
        <GitBranch size={12} strokeWidth={2.25} />
      </span>
    );
  }
  return (
    <span title="Postgres'te saklanıyor" className="shrink-0 text-muted-foreground">
      <Database size={12} strokeWidth={2.25} />
    </span>
  );
}

function CardSkeleton() {
  return (
    <div className="flex h-[104px] animate-pulse flex-col gap-3 rounded-xl border border-border bg-card px-4 py-4">
      <div className="h-3.5 w-2/3 rounded bg-muted" />
      <div className="h-2.5 w-1/3 rounded bg-muted" />
      <div className="mt-auto h-2.5 w-1/2 rounded bg-muted" />
    </div>
  );
}

// frontend.plan.md §11 — IDE dışı yüzey, datasheet paleti (--stock/--ink/--signal).
// Editör artık ana sayfa değil (bkz. app/page.tsx) — giriş yapmış kullanıcı önce
// burayı görür, bir proje açtığında ya da "Yeni proje"ye tıkladığında /editor'a geçer.
export default function Dashboard({ user, onLogout }: DashboardProps) {
  const { projects, loading, refresh, remove, update } = useProjects();
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("updated");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleProjects = useMemo(() => {
    const filtered = search.trim()
      ? projects.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
      : projects;
    return [...filtered].sort((a, b) =>
      sortMode === "name"
        ? a.name.localeCompare(b.name, "tr")
        : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [projects, search, sortMode]);

  const quotaUsed = user.quota.projects.used;
  const quotaMax = user.quota.projects.max;
  const quotaFull = quotaUsed >= quotaMax;

  function startRename(project: ProjectSummary) {
    setRenamingId(project.id);
    setRenameDraft(project.name);
  }

  async function commitRename(project: ProjectSummary) {
    const name = renameDraft.trim();
    setRenamingId(null);
    if (!name || name === project.name) return;
    try {
      await update(project.id, { name });
      await refresh();
    } catch (err) {
      toast.error("Yeniden adlandırılamadı", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await remove(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      toast.error("Proje silinemedi", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="[font-family:var(--font-display)] text-xl font-semibold tracking-tight">
          espcode
        </span>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <AccountMenu user={user} onLogout={onLogout} align="end" />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="[font-family:var(--font-display)] text-2xl font-semibold tracking-tight">
              Projelerim
            </h1>
            <QuotaBar used={quotaUsed} max={quotaMax} className="mt-1.5" />
          </div>
          <Button
            render={<Link href="/editor" />}
            nativeButton={false}
            disabled={quotaFull}
            title={quotaFull ? "Proje limitine ulaşıldı" : undefined}
          >
            <Plus size={16} strokeWidth={2.25} />
            Yeni proje
          </Button>
        </div>

        {projects.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={14}
                strokeWidth={2.25}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Proje ara…"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1 rounded-4xl bg-muted p-1">
              <button
                type="button"
                title="Son güncellenene göre sırala"
                onClick={() => setSortMode("updated")}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs transition-colors",
                  sortMode === "updated"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Clock size={13} strokeWidth={2.25} />
              </button>
              <button
                type="button"
                title="İsme göre sırala"
                onClick={() => setSortMode("name")}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs transition-colors",
                  sortMode === "name"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ArrowDownAZ size={13} strokeWidth={2.25} />
              </button>
            </div>
          </div>
        )}

        {loading && projects.length === 0 && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i}>
                <CardSkeleton />
              </li>
            ))}
          </ul>
        )}

        {!loading && projects.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Henüz kaydedilmiş proje yok. Yeni bir sketch açıp kaydet.
            </p>
            <Button render={<Link href="/editor" />} nativeButton={false} size="sm">
              <Plus size={14} strokeWidth={2.25} />
              Yeni proje
            </Button>
          </div>
        )}

        {!loading && projects.length > 0 && visibleProjects.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">&quot;{search}&quot; ile eşleşen proje yok.</p>
          </div>
        )}

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProjects.map((p) => (
            <li key={p.id} className="group relative">
              <div className="flex h-full flex-col gap-2 rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:border-primary/50">
                <div className="flex items-center gap-1.5 pr-12">
                  {renamingId === p.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => void commitRename(p)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename(p);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="w-full min-w-0 truncate rounded-md border border-primary bg-input/30 px-1.5 py-0.5 [font-family:var(--font-display)] text-base font-medium outline-none"
                    />
                  ) : (
                    <Link
                      href={`/editor?project=${p.id}`}
                      className="truncate [font-family:var(--font-display)] text-base font-medium hover:text-primary"
                    >
                      {p.name}
                    </Link>
                  )}
                  {renamingId !== p.id && <ProviderBadge project={p} />}
                </div>

                <Link href={`/editor?project=${p.id}`} className="flex flex-1 flex-col gap-2">
                  <span className="text-xs text-muted-foreground [font-family:var(--font-data)]">
                    {boardLabel(p.fqbn)}
                  </span>
                  <span className="mt-auto text-xs text-muted-foreground">
                    {p.storageProvider === "github" ? p.githubRepoFullName : `v${p.versionCount}`} ·{" "}
                    {formatRelativeDate(p.updatedAt)}
                  </span>
                </Link>
              </div>

              <div className="absolute top-3 right-3 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <button
                  onClick={() => startRename(p)}
                  title="Yeniden adlandır"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil size={13} strokeWidth={2.25} />
                </button>
                <button
                  onClick={() => setDeleteTarget(p)}
                  title="Projeyi sil"
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 size={13} strokeWidth={2.25} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </main>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>&quot;{deleteTarget?.name}&quot; silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              Bu işlem geri alınamaz. Versiyon geçmişi dahil tüm kayıtlı veriler kaybolur.
              {deleteTarget?.storageProvider === "github" &&
                " GitHub deposundaki commit geçmişi etkilenmez, yalnızca espcode'daki bağlantı silinir."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Vazgeç</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              {deleting ? "Siliniyor…" : "Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
