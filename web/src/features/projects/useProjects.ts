import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api-config";
import type { SketchFile } from "@/features/editor/sketch-files";

export type StorageProvider = "postgres" | "github";

export interface ProjectSummary {
  id: string;
  name: string;
  fqbn: string;
  updatedAt: string;
  versionCount: number;
  storageProvider: StorageProvider;
  githubRepoFullName: string | null;
  githubBranch: string | null;
  githubLinkBroken: boolean;
}

export interface ProjectVersionSummary {
  id: string;
  createdAt: string;
  fqbn: string | null;
  note: string | null;
  buildKey: string | null;
  author: { login: string; avatarUrl: string | null } | null;
  url: string | null;
}

export interface ProjectVersionDetail extends ProjectVersionSummary {
  projectId: string;
  files: SketchFile[];
}

export interface ProjectDetail extends ProjectSummary {
  files: SketchFile[];
  versions: ProjectVersionSummary[];
}

export type CommitResult =
  | { ok: true; versionId: string }
  | { ok: false; reason: "conflict"; paths: string[] }
  | { ok: false; reason: "link_broken" };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message?.[0] ?? body.error ?? `request_failed:${res.status}`);
  }
  return res.json();
}

// master.plan.md §6 — proje CRUD + versiyon geçmişi. Yalnızca girişliyken
// çağrılmalı (401 döner, kullanıcı zaten AuthGate arkasında görmüyor).
export function useProjects() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/projects");
      setProjects(await json<ProjectSummary[]>(res));
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(
    async (name: string, fqbn: string, files: SketchFile[]): Promise<string> => {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, fqbn, files }),
      });
      const { id } = await json<{ id: string }>(res);
      await refresh();
      return id;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, patch: { name?: string; fqbn?: string; files?: SketchFile[] }) => {
      const res = await apiFetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      return json<{ id: string; name: string; fqbn: string; updatedAt: string }>(res);
    },
    [],
  );

  // useEffect bağımlılığı olarak kullanılıyor (ProjectsPanel) — her render'da
  // yeni referans üretirse effect gereksiz yere tekrar tetiklenir.
  const listVersions = useCallback(async (id: string): Promise<ProjectVersionSummary[]> => {
    const res = await apiFetch(`/api/projects/${id}/versions`);
    return json<ProjectVersionSummary[]>(res);
  }, []);

  const getVersion = useCallback(
    async (projectId: string, versionId: string): Promise<ProjectVersionDetail> => {
      const res = await apiFetch(`/api/projects/${projectId}/versions/${versionId}`);
      return json<ProjectVersionDetail>(res);
    },
    [],
  );

  // ProjectsPanel'in "aç" tıklaması ve IdeShell'in ?project= ile açılışı aynı
  // yolu kullanır: GET /api/projects/:id sağlayıcıya göre gerçek kaynaktan
  // (postgres taslağı ya da bağlı repo) o anki dosyaları döndürür.
  const loadProject = useCallback(async (id: string): Promise<ProjectDetail> => {
    const res = await apiFetch(`/api/projects/${id}`);
    return json<ProjectDetail>(res);
  }, []);

  // Flash'tan bağımsız manuel kaydetme — her iki sağlayıcıda da çalışır.
  // Çakışma/kopuk-bağlantı 409 ile { error, paths? } gövdesinde gelir.
  const commit = useCallback(
    async (
      id: string,
      input: { message: string; files: SketchFile[]; fqbn: string; force?: boolean },
    ): Promise<CommitResult> => {
      const res = await apiFetch(`/api/projects/${id}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        return body.error === "github_conflict"
          ? { ok: false, reason: "conflict", paths: body.paths ?? [] }
          : { ok: false, reason: "link_broken" };
      }
      const versionId = await json<{ ok: true; versionId: string }>(res);
      return versionId;
    },
    [],
  );

  return {
    projects,
    loading,
    refresh,
    create,
    remove,
    update,
    listVersions,
    getVersion,
    loadProject,
    commit,
  };
}
