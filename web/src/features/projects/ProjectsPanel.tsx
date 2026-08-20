"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Database,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  History,
  Link2Off,
  LogIn,
  LogOut,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { AuthUser } from "@/features/auth/useAuth";
import { useProjects, type ProjectSummary, type ProjectVersionSummary } from "./useProjects";
import { useGithubStorage } from "./useGithubStorage";
import GithubLinkDialog from "./GithubLinkDialog";
import CommitDialog from "./CommitDialog";
import type { SketchFile } from "@/features/editor/sketch-files";
import type { LibraryDep } from "@/features/libraries/useLibraries";

export interface PendingGithubInstall {
  projectId: string;
  installationId: string;
}

export interface ProjectsPanelProps {
  user: AuthUser | null;
  authLoading: boolean;
  onLogin: () => void;
  onLogout: () => void;
  files: SketchFile[];
  fqbn: string;
  libraries: LibraryDep[];
  activeProjectId: string | null;
  onActivate: (
    id: string | null,
    files?: SketchFile[],
    fqbn?: string,
    libraries?: LibraryDep[],
    opts?: { discardDraft?: boolean },
  ) => void;
  /** create()/commit() sunucuya başarıyla yazınca çağrılır — yerel taslağın temizlenmesi için (bkz. IdeShell). */
  onSaved?: (projectId: string, files: SketchFile[], fqbn: string, libraries: LibraryDep[]) => void;
  pendingGithubInstall?: PendingGithubInstall | null;
  onConsumePendingGithubInstall?: () => void;
}

function ProviderBadge({ project }: { project: ProjectSummary }) {
  if (project.githubLinkBroken) {
    return (
      <span title="GitHub bağlantısı koptu" className="shrink-0 text-red-500">
        <AlertTriangle size={11} strokeWidth={2.5} />
      </span>
    );
  }
  if (project.storageProvider === "github") {
    return (
      <span title={project.githubRepoFullName ?? "GitHub"} className="shrink-0 text-[var(--vsc-fg-muted)]">
        <GitBranch size={11} strokeWidth={2.25} />
      </span>
    );
  }
  // Sağlayıcı durumu her zaman açık gösterilir — "hiçbir şey görünmüyorsa
  // bağlı değildir" gibi örtük bir kurala bağlı kalınmaz (bağlama sessizce
  // yarım kalırsa kullanıcı bunu buradan hemen anlar).
  return (
    <span title="Postgres'te saklanıyor" className="shrink-0 text-[var(--vsc-fg-muted)]">
      <Database size={11} strokeWidth={2.25} />
    </span>
  );
}

export default function ProjectsPanel({
  user,
  authLoading,
  onLogin,
  onLogout,
  files,
  fqbn,
  libraries,
  activeProjectId,
  onActivate,
  onSaved,
  pendingGithubInstall,
  onConsumePendingGithubInstall,
}: ProjectsPanelProps) {
  const { projects, loading, refresh, create, remove, listVersions, getVersion, loadProject, commit } =
    useProjects();
  const { unlink } = useGithubStorage();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [versions, setVersions] = useState<ProjectVersionSummary[] | null>(null);
  const [githubDialogOpen, setGithubDialogOpen] = useState(false);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);

  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  useEffect(() => {
    if (!activeProjectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- aktif proje değişince versiyon listesi sıfırlanır, sorgu kütüphanesi yok
      setVersions(null);
      return;
    }
    void listVersions(activeProjectId).then(setVersions);
  }, [activeProjectId, listVersions]);

  // GitHub App kurulumundan dönüş (?github=installed) — IdeShell projeyi aktive
  // edince burada repo seçim adımını otomatik açıyoruz.
  useEffect(() => {
    if (!pendingGithubInstall || pendingGithubInstall.projectId !== activeProjectId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL'den gelen tek seferlik yönlendirme sonucu, sorgu kütüphanesi yok
    setGithubDialogOpen(true);
    onConsumePendingGithubInstall?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnızca eşleşme değiştiğinde tetiklensin, onConsume referansı stabil değil
  }, [pendingGithubInstall, activeProjectId]);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  async function commitCreate() {
    if (!draft.trim()) {
      setAdding(false);
      return;
    }
    const id = await create(draft.trim(), fqbn, files, libraries);
    onActivate(id);
    onSaved?.(id, files, fqbn, libraries);
    setDraft("");
    setAdding(false);
  }

  async function handleLoad(id: string) {
    try {
      const detail = await loadProject(id);
      onActivate(id, detail.files, detail.fqbn, detail.libraries);
    } catch (err) {
      onActivate(id);
      toast.error("Proje açılamadı", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function handleRestore(versionId: string) {
    if (!activeProjectId) return;
    const version = await getVersion(activeProjectId, versionId);
    onActivate(version.projectId, version.files, version.fqbn ?? undefined, version.libraries, {
      discardDraft: true,
    });
  }

  async function handleUnlink() {
    if (!activeProjectId) return;
    try {
      await unlink(activeProjectId);
      toast.success("GitHub bağlantısı kaldırıldı");
      await refresh();
    } catch (err) {
      toast.error("Kaldırılamadı", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[var(--vsc-sidebar)] p-6 text-center">
        <p className="text-xs text-[var(--vsc-fg-muted)]">
          Sketch&apos;lerini kaydetmek ve versiyon geçmişini görmek için GitHub ile giriş yap.
        </p>
        <button
          onClick={onLogin}
          disabled={authLoading}
          className="flex items-center gap-2 rounded-[8px] bg-[var(--vsc-accent)] px-3.5 py-2 text-xs font-medium text-white transition-transform active:scale-[0.97] disabled:opacity-40"
        >
          <LogIn size={14} strokeWidth={2.25} />
          GitHub ile giriş yap
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--vsc-sidebar)] text-[var(--vsc-fg)]">
      <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-[var(--vsc-border)] px-3">
        <div className="flex min-w-0 items-center gap-2">
          {user.avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full" />
          )}
          <span className="truncate text-xs font-medium text-[var(--vsc-fg-active)]">{user.login}</span>
        </div>
        <button
          onClick={onLogout}
          title="Çıkış yap"
          className="shrink-0 rounded p-1 text-[var(--vsc-fg-muted)] hover:bg-[var(--vsc-selected)] hover:text-[var(--vsc-fg-active)]"
        >
          <LogOut size={13} strokeWidth={2.25} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-[family-name:var(--font-data)] text-[9.5px] font-medium tracking-[0.12em] text-[var(--vsc-fg-muted)]">
            PROJELERİM ({user.quota.projects.used}/{user.quota.projects.max})
          </span>
          <button
            onClick={() => setAdding(true)}
            title="Bu sketch'i kaydet"
            className="rounded p-0.5 text-[var(--vsc-fg-muted)] hover:bg-[var(--vsc-selected)] hover:text-[var(--vsc-fg-active)]"
          >
            <Save size={13} strokeWidth={2.5} />
          </button>
        </div>

        {adding && (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitCreate}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitCreate();
              if (e.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
            placeholder="Proje adı"
            className="mb-2 w-full rounded-[8px] border border-[var(--vsc-accent)] bg-[var(--vsc-selected)] px-2.5 py-2 text-xs text-[var(--vsc-fg-active)]"
          />
        )}

        {loading && <p className="text-xs text-[var(--vsc-fg-muted)]">Yükleniyor…</p>}
        {!loading && projects.length === 0 && (
          <p className="text-xs text-[var(--vsc-fg-muted)]">Henüz kaydedilmiş proje yok.</p>
        )}

        <ul className="flex flex-col gap-0.5">
          {projects.map((p) => (
            <li key={p.id} className="group">
              <div
                className={`flex items-center gap-2 rounded-[8px] px-2.5 py-2 ${
                  p.id === activeProjectId
                    ? "bg-[var(--vsc-selected-file)] text-[var(--vsc-fg-active)]"
                    : "text-[var(--vsc-fg)] hover:bg-[var(--vsc-selected)]/60"
                }`}
              >
                <button
                  onClick={() => void handleLoad(p.id)}
                  className="flex flex-1 items-center gap-1.5 truncate text-left text-[13px]"
                >
                  <span className="truncate">{p.name}</span>
                  <ProviderBadge project={p} />
                  {p.storageProvider === "postgres" && (
                    <span className="text-[10px] text-[var(--vsc-fg-muted)]">v{p.versionCount}</span>
                  )}
                </button>
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={() => void remove(p.id)}
                  className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/10"
                >
                  <Trash2 size={12} strokeWidth={2.25} />
                </span>
              </div>
            </li>
          ))}
        </ul>

        {activeProject && (
          <div className="mt-4 flex flex-col gap-2">
            {activeProject.githubLinkBroken && (
              <div className="flex items-center gap-2 rounded-[8px] border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-500">
                <AlertTriangle size={13} strokeWidth={2.25} className="shrink-0" />
                <span className="flex-1">GitHub bağlantısı koptu.</span>
                <button
                  onClick={() => setGithubDialogOpen(true)}
                  className="shrink-0 font-medium underline underline-offset-2"
                >
                  Yeniden bağla
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCommitDialogOpen(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-[var(--vsc-border-ghost)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--vsc-fg)] hover:bg-[var(--vsc-selected)]"
              >
                <GitCommitHorizontal size={12} strokeWidth={2.25} />
                Commit&apos;le
              </button>
              {activeProject.storageProvider === "github" ? (
                <button
                  onClick={() => void handleUnlink()}
                  title="GitHub bağlantısını kaldır"
                  className="shrink-0 rounded-[8px] border border-[var(--vsc-border-ghost)] p-1.5 text-[var(--vsc-fg-muted)] hover:bg-[var(--vsc-selected)] hover:text-[var(--vsc-fg-active)]"
                >
                  <Link2Off size={12} strokeWidth={2.25} />
                </button>
              ) : (
                <button
                  onClick={() => setGithubDialogOpen(true)}
                  title="GitHub'a bağla"
                  className="shrink-0 rounded-[8px] border border-[var(--vsc-border-ghost)] p-1.5 text-[var(--vsc-fg-muted)] hover:bg-[var(--vsc-selected)] hover:text-[var(--vsc-fg-active)]"
                >
                  <Database size={12} strokeWidth={2.25} />
                </button>
              )}
            </div>

            {activeProject.storageProvider === "github" && activeProject.githubRepoFullName && (
              <p className="truncate text-[10px] text-[var(--vsc-fg-muted)] [font-family:var(--font-data)]">
                {activeProject.githubRepoFullName} · {activeProject.githubBranch}
              </p>
            )}
          </div>
        )}

        {activeProjectId && versions && versions.length > 0 && (
          <div className="mt-4">
            <span className="mb-2 flex items-center gap-1.5 font-[family-name:var(--font-data)] text-[9.5px] font-medium tracking-[0.12em] text-[var(--vsc-fg-muted)]">
              <History size={12} strokeWidth={2.5} />
              VERSİYON GEÇMİŞİ
            </span>
            <ul className="flex flex-col gap-0.5">
              {versions.map((v, i) => (
                <li key={v.id} className="flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 truncate text-[var(--vsc-fg-muted)]">
                    {activeProject?.storageProvider === "github" ? (
                      <>
                        <span className="font-[family-name:var(--font-data)] text-[var(--vsc-accent-mono)]">
                          {v.id.slice(0, 7)}
                        </span>{" "}
                        {v.note ?? ""}
                      </>
                    ) : (
                      <span className="font-[family-name:var(--font-data)]">
                        v{versions.length - i} · {new Date(v.createdAt).toLocaleString("tr-TR")}
                      </span>
                    )}
                  </span>
                  {v.url && (
                    <a
                      href={v.url}
                      target="_blank"
                      rel="noreferrer"
                      title="GitHub'da aç"
                      className="shrink-0 rounded p-1 text-[var(--vsc-fg-muted)] hover:bg-[var(--vsc-selected)] hover:text-[var(--vsc-fg-active)]"
                    >
                      <ExternalLink size={12} strokeWidth={2.25} />
                    </a>
                  )}
                  <button
                    onClick={() => void handleRestore(v.id)}
                    title="Bu versiyonu geri yükle"
                    className="shrink-0 rounded p-1 text-[var(--vsc-fg-muted)] hover:bg-[var(--vsc-selected)] hover:text-[var(--vsc-fg-active)]"
                  >
                    <RotateCcw size={12} strokeWidth={2.25} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {activeProjectId && (
        <>
          <GithubLinkDialog
            open={githubDialogOpen}
            onOpenChange={setGithubDialogOpen}
            projectId={activeProjectId}
            preselectInstallationId={
              pendingGithubInstall?.projectId === activeProjectId ? pendingGithubInstall.installationId : null
            }
            onLinked={async () => {
              await refresh();
              setVersions(await listVersions(activeProjectId));
            }}
          />
          <CommitDialog
            open={commitDialogOpen}
            onOpenChange={setCommitDialogOpen}
            provider={activeProject?.storageProvider ?? "postgres"}
            onCommit={async (message, force) => {
              const result = await commit(activeProjectId, { message, files, fqbn, libraries, force });
              if (result.ok) {
                await refresh();
                setVersions(await listVersions(activeProjectId));
                onSaved?.(activeProjectId, files, fqbn, libraries);
              }
              return result;
            }}
          />
        </>
      )}
    </div>
  );
}
