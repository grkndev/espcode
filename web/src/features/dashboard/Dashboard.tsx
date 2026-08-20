"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Database,
  GitBranch,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import TickQuota from "@/features/auth/TickQuota";
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

const SORT_LABEL: Record<SortMode, string> = {
  updated: "Son etkinlik",
  name: "İsme göre",
};

function ProviderMeta({ project }: { project: ProjectSummary }) {
  const base = "inline-flex shrink-0 items-center gap-[5px] font-[family-name:var(--font-data)] text-[10.5px] font-medium";
  if (project.githubLinkBroken) {
    return (
      <span title="GitHub bağlantısı koptu" className={cn(base, "text-destructive")}>
        <AlertTriangle size={11} strokeWidth={2.25} />
        koptu
      </span>
    );
  }
  if (project.storageProvider === "github") {
    return (
      <span title={project.githubRepoFullName ?? "GitHub"} className={cn(base, "text-muted-foreground")}>
        <GitBranch size={11} strokeWidth={2} />
        {project.githubBranch ?? "main"}
      </span>
    );
  }
  return (
    <span title="Postgres'te saklanıyor" className={cn(base, "text-muted-foreground")}>
      <Database size={11} strokeWidth={2} />
      yerel
    </span>
  );
}

interface ProjectCardProps {
  project: ProjectSummary;
  index: number;
  renaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (v: string) => void;
  onStartRename: () => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onDelete: () => void;
}

function ProjectCard({
  project,
  index,
  renaming,
  renameDraft,
  onRenameDraftChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
}: ProjectCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2 pr-11">
        <span className="font-[family-name:var(--font-data)] text-[10px] font-medium tracking-[0.1em] text-muted-foreground">
          PRJ-{String(index + 1).padStart(3, "0")}
        </span>
        <ProviderMeta project={project} />
      </div>

      {renaming ? (
        <input
          autoFocus
          value={renameDraft}
          onChange={(e) => onRenameDraftChange(e.target.value)}
          onBlur={onCommitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") onCommitRename();
            if (e.key === "Escape") onCancelRename();
          }}
          className="mt-3 w-full min-w-0 truncate rounded-md border border-primary bg-input/30 px-1.5 py-0.5 font-[family-name:var(--font-ui)] text-[18px] font-semibold outline-none"
        />
      ) : (
        <span className="mt-3 truncate font-[family-name:var(--font-ui)] text-[18px] font-semibold">
          {project.name}
        </span>
      )}

      <div className="mt-2 flex gap-1.5">
        <span className="rounded-[6px] border border-primary/50 px-[7px] py-[3px] font-[family-name:var(--font-data)] text-[10px] font-medium text-signal-mono">
          {boardLabel(project.fqbn)}
        </span>
      </div>

      <div className="mt-4 border-t border-dashed border-rule-soft" />

      <div className="mt-2.5 flex flex-col gap-1.5 font-[family-name:var(--font-data)] text-[11px] text-muted-foreground">
        <span className="truncate">
          {project.storageProvider === "github" ? project.githubRepoFullName : "Postgres'te saklanıyor"}
        </span>
        <span>
          {project.versionCount} sürüm · {formatRelativeDate(project.updatedAt)}
        </span>
      </div>

      <div className="mt-auto flex items-center justify-between pt-4">
        <span className="text-[12.5px] font-semibold text-signal-mono">Aç →</span>
        <span
          className={cn("size-[7px] rounded-full", project.versionCount > 0 ? "bg-success" : "bg-border")}
          title={project.versionCount > 0 ? "Kayıtlı versiyon var" : "Henüz versiyon yok"}
        />
      </div>
    </>
  );

  return (
    <li className="group relative">
      {renaming ? (
        <div className="flex h-full flex-col rounded-xl border border-primary bg-card px-5 py-[18px]">{body}</div>
      ) : (
        <Link
          href={`/editor?project=${project.id}`}
          className="flex h-full flex-col rounded-xl border border-border bg-card px-5 py-[18px] transition-colors hover:border-primary/40"
        >
          {body}
        </Link>
      )}

      {!renaming && (
        <div className="absolute top-[14px] right-4 flex items-center gap-0.5 rounded-md bg-card opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onStartRename();
            }}
            title="Yeniden adlandır"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil size={13} strokeWidth={2.25} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onDelete();
            }}
            title="Projeyi sil"
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={13} strokeWidth={2.25} />
          </button>
        </div>
      )}
    </li>
  );
}

function CardSkeleton() {
  return (
    <div className="flex h-[218px] animate-pulse flex-col gap-3 rounded-xl border border-border bg-card px-5 py-[18px]">
      <div className="flex justify-between">
        <div className="h-2.5 w-14 rounded bg-muted" />
        <div className="h-2.5 w-10 rounded bg-muted" />
      </div>
      <div className="h-4 w-2/3 rounded bg-muted" />
      <div className="h-4 w-16 rounded bg-muted" />
      <div className="mt-2 h-px w-full bg-muted" />
      <div className="h-2.5 w-4/5 rounded bg-muted" />
      <div className="mt-auto h-2.5 w-1/2 rounded bg-muted" />
    </div>
  );
}

function SortMenu({ value, onChange }: { value: SortMode; onChange: (mode: SortMode) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="flex h-[38px] items-center gap-2 rounded-[10px] border border-border bg-card px-3 font-[family-name:var(--font-ui)] text-[12.5px] font-medium outline-none">
        {SORT_LABEL[value]}
        <ChevronDown size={13} strokeWidth={2} className="text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 gap-0.5 p-1.5">
        {(Object.keys(SORT_LABEL) as SortMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              onChange(mode);
              setOpen(false);
            }}
            className={cn(
              "flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted",
              value === mode && "text-primary",
            )}
          >
            {SORT_LABEL[mode]}
            {value === mode && <Check size={14} strokeWidth={2.5} />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
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
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // "/" proje aramaya odaklanır — başka bir input/textarea'da yazarken tetiklenmez.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (e.key === "/" && !isTyping) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Proje sıralama/arama değişse de kart üstündeki "PRJ-XXX" sabit kalsın diye
  // API'nin döndürdüğü ham sıraya göre hesaplanır, görünür listeye göre değil.
  const stableIndex = useMemo(() => new Map(projects.map((p, i) => [p.id, i])), [projects]);

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
      <header className="flex h-14 items-center justify-between border-b border-border px-7">
        <div className="flex items-baseline gap-3">
          <span className="font-[family-name:var(--font-display)] text-[21px] font-bold tracking-tight">
            espcode
          </span>
          <span className="font-[family-name:var(--font-data)] text-[9.5px] font-medium tracking-[0.14em] text-muted-foreground">
            WEB IDE · REV 2
          </span>
        </div>
        <div className="flex items-center gap-3">
          <NotificationBell />
          <AccountMenu user={user} onLogout={onLogout} align="end" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-7 pt-9 pb-10 lg:px-14">
        <div className="mb-6.5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-[family-name:var(--font-data)] text-[10px] font-medium tracking-[0.16em] text-muted-foreground">
              PROJELERİM
            </p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-[32px] leading-none font-semibold tracking-[-0.01em]">
              Projelerim
            </h1>
            <TickQuota used={quotaUsed} max={quotaMax} className="mt-3.5" />
          </div>

          <div className="flex items-center gap-2.5">
            {projects.length > 0 && (
              <>
                <div className="relative w-full sm:w-[280px]">
                  <Search
                    size={14}
                    strokeWidth={2.25}
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Proje ara…"
                    className="h-[38px] pl-9"
                  />
                  {!search && (
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-[5px] border border-border px-1.5 py-0.5 font-[family-name:var(--font-data)] text-[10px] font-medium text-muted-foreground">
                      /
                    </span>
                  )}
                </div>
                <SortMenu value={sortMode} onChange={setSortMode} />
              </>
            )}
            <Button
              render={<Link href="/editor" />}
              nativeButton={false}
              disabled={quotaFull}
              title={quotaFull ? "Proje limitine ulaşıldı" : undefined}
              className="h-[38px] shrink-0"
            >
              <Plus size={16} strokeWidth={2.25} />
              Yeni proje
            </Button>
          </div>
        </div>

        {loading && projects.length === 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i}>
                <CardSkeleton />
              </li>
            ))}
          </ul>
        )}

        {!loading && projects.length === 0 && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border-[1.5px] border-dashed border-rule-soft px-6 py-14 text-center">
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
          <div className="rounded-2xl border-[1.5px] border-dashed border-rule-soft px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">&quot;{search}&quot; ile eşleşen proje yok.</p>
          </div>
        )}

        {visibleProjects.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleProjects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                index={stableIndex.get(p.id) ?? 0}
                renaming={renamingId === p.id}
                renameDraft={renameDraft}
                onRenameDraftChange={setRenameDraft}
                onStartRename={() => startRename(p)}
                onCommitRename={() => void commitRename(p)}
                onCancelRename={() => setRenamingId(null)}
                onDelete={() => setDeleteTarget(p)}
              />
            ))}

            {!search.trim() && !quotaFull && (
              <li>
                <Link
                  href="/editor"
                  className="flex min-h-[218px] flex-col items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-rule-soft text-center text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  <span className="flex size-9 items-center justify-center rounded-full border-[1.5px] border-dashed border-rule-soft">
                    <Plus size={16} strokeWidth={2} />
                  </span>
                  <span className="font-[family-name:var(--font-ui)] text-[13.5px] font-semibold text-foreground">
                    Yeni proje
                  </span>
                  <span className="text-[11.5px]">Boş sketch ya da GitHub deposundan</span>
                </Link>
              </li>
            )}
          </ul>
        )}

        {projects.length > 0 && (
          <div className="mt-7.5 flex flex-wrap gap-5.5 font-[family-name:var(--font-data)] text-[10px] tracking-[0.08em] text-faint">
            <span>● SERİ DESTEĞİ: CHROME / EDGE / FIREFOX 151+</span>
            <span>
              KOTA {quotaUsed}/{quotaMax}
            </span>
          </div>
        )}
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
