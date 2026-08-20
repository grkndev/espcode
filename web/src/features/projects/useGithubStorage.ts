import { useCallback } from "react";
import { API_BASE, apiFetch } from "@/lib/api-config";

export interface GithubInstallationSummary {
  id: string;
  accountLogin: string;
  createdAt: string;
}

export interface GithubRepoSummary {
  fullName: string;
  defaultBranch: string;
  private: boolean;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message?.[0] ?? body.error ?? `request_failed:${res.status}`);
  }
  return res.json();
}

// master.plan.md §3.1 — proje bazlı GitHub depolama: App kurulum akışı,
// repo listesi, bağlama/bağlantı kaldırma. useAuth.login()'deki tam sayfa
// gezinme deseniyle aynı — GitHub App kurulum sayfası bir iframe/fetch değil.
export function useGithubStorage() {
  const startInstall = useCallback((projectId: string) => {
    window.location.href = `${API_BASE}/api/github/install?projectId=${encodeURIComponent(projectId)}`;
  }, []);

  const installations = useCallback(async (): Promise<GithubInstallationSummary[]> => {
    const res = await apiFetch("/api/github/installations");
    return json<GithubInstallationSummary[]>(res);
  }, []);

  const repos = useCallback(async (installationId: string): Promise<GithubRepoSummary[]> => {
    const res = await apiFetch(`/api/github/installations/${installationId}/repos`);
    return json<GithubRepoSummary[]>(res);
  }, []);

  const link = useCallback(
    async (projectId: string, installationId: string, repoFullName: string) => {
      const res = await apiFetch(`/api/projects/${projectId}/github-link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ installationId, repoFullName }),
      });
      return json(res);
    },
    [],
  );

  const unlink = useCallback(async (projectId: string) => {
    const res = await apiFetch(`/api/projects/${projectId}/github-link`, { method: "DELETE" });
    return json(res);
  }, []);

  return { startInstall, installations, repos, link, unlink };
}
