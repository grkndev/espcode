import { Injectable, NotFoundException } from '@nestjs/common';
import { GithubAppService, GithubApiError } from './github-app.service';
import { GithubLinkBrokenError } from './github-errors';
import type { Project } from '../generated/prisma/client';
import type { SketchFileInput } from '../projects/projects.service';
import type {
  CommitInput,
  CommitResult,
  ProjectStorage,
  VersionDetail,
  VersionSummary,
} from '../projects/storage/project-storage';

// web/src/features/editor/sketch-files.ts PRIMARY_FILE ile birebir aynı
// olmalı — burada tekrarlanıyor çünkü api paketi web koduna erişemiyor.
const PRIMARY_FILE = 'sketch.ino';
const SKETCH_YAML = 'sketch.yaml';

interface GithubContentEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha: string;
}

interface GithubContentFile {
  content: string;
  encoding: string;
}

interface GithubCommitListItem {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { date?: string };
    committer?: { date?: string };
  };
  author: { login: string; avatar_url: string } | null;
}

interface LinkedProjectContext {
  installationId: bigint;
  repo: string;
  branch: string;
  dir: string;
}

function toRepoFileName(dir: string, editorPath: string): string {
  return editorPath === PRIMARY_FILE ? `${dir}.ino` : editorPath;
}

function toEditorFileName(dir: string, repoFileName: string): string {
  return repoFileName === `${dir}.ino` ? PRIMARY_FILE : repoFileName;
}

function renderSketchYaml(fqbn: string): string {
  return `default_fqbn: ${fqbn}\n`;
}

function parseSketchYamlFqbn(content: string): string | null {
  const match = content.match(/^default_fqbn:\s*(\S+)\s*$/m);
  return match ? match[1] : null;
}

// master.plan.md §3.1 — proje bazlı GitHub depolama. Gerçek kaynak repo;
// project_versions'a hiç yazılmaz, versiyon geçmişi Commits API'sinden gelir.
@Injectable()
export class GithubStorageService implements ProjectStorage {
  constructor(private readonly github: GithubAppService) {}

  private ctx(project: Project): LinkedProjectContext {
    const {
      storageProvider,
      githubInstallationId,
      githubRepoFullName,
      githubBranch,
      githubDir,
    } = project;
    if (
      storageProvider !== 'github' ||
      githubInstallationId === null ||
      !githubRepoFullName ||
      !githubBranch ||
      !githubDir
    ) {
      // Yalnızca ProjectsService yanlış yönlendirirse oluşur — kullanıcıya
      // hiç sızmaması gereken bir çalışma zamanı tutarsızlığı.
      throw new Error('github_project_not_linked');
    }
    return {
      installationId: githubInstallationId,
      repo: githubRepoFullName,
      branch: githubBranch,
      dir: githubDir,
    };
  }

  private async readFileAt(
    installationId: bigint,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string> {
    const res = await this.github.raw(
      installationId,
      'GET',
      `/repos/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`,
    );
    if (!res.ok) throw new GithubApiError(res.status, path, await res.text());
    const body = (await res.json()) as GithubContentFile;
    return Buffer.from(body.content, 'base64').toString('utf8');
  }

  private async listDirEntries(
    installationId: bigint,
    repo: string,
    dir: string,
    ref: string,
  ): Promise<GithubContentEntry[] | null> {
    const res = await this.github.raw(
      installationId,
      'GET',
      `/repos/${repo}/contents/${encodeURIComponent(dir)}?ref=${encodeURIComponent(ref)}`,
    );
    // 404: dizin/ref yok. 409: "Git Repository is empty" — tamamen boş repo'da
    // aynı anlama gelir (henüz hiçbir şey yok). İkisi de "boş" kabul edilir.
    if (res.status === 404 || res.status === 409) return null;
    if (!res.ok) throw new GithubApiError(res.status, dir, await res.text());
    return res.json() as Promise<GithubContentEntry[]>;
  }

  // §3.1 bağlama akışı adım 7 — branch yoksa default branch HEAD'inden
  // oluşturur. installationId/repo doğrudan verilir çünkü çağrıldığı anda
  // proje henüz DB'de 'github' sağlayıcısına geçmemiş olabilir (ctx() bu
  // yüzden kullanılmıyor).
  //
  // Tamamen boş bir repo'da (hiç commit yok — "Initialize with README"
  // işaretlenmeden açılmış) GitHub ref sorgusuna 404 değil 409 "Git
  // Repository is empty" döner; branşlanacak bir HEAD da yoktur. Bu durumda
  // ref oluşturmayı atlıyoruz — Contents API'nin ilk PUT'u boş bir repoda
  // hedef branch'i kendiliğinden oluşturuyor (doğrulandı), commit() zaten bunu yapıyor.
  async ensureBranch(
    installationId: bigint,
    repo: string,
    branch: string,
  ): Promise<void> {
    const check = await this.github.raw(
      installationId,
      'GET',
      `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    if (check.ok) return;
    if (check.status === 409) return; // repo tamamen boş — ilk commit branch'i oluşturur
    if (check.status !== 404) {
      throw new GithubApiError(check.status, branch, await check.text());
    }

    const repoInfo = await this.github.json<{ default_branch: string }>(
      installationId,
      'GET',
      `/repos/${repo}`,
    );
    const defaultRef = await this.github.raw(
      installationId,
      'GET',
      `/repos/${repo}/git/ref/heads/${encodeURIComponent(repoInfo.default_branch)}`,
    );
    if (defaultRef.status === 409) return; // default branch da henüz yok — yine boş repo
    if (!defaultRef.ok) {
      throw new GithubApiError(
        defaultRef.status,
        repoInfo.default_branch,
        await defaultRef.text(),
      );
    }
    const { object } = (await defaultRef.json()) as { object: { sha: string } };
    await this.github.json(installationId, 'POST', `/repos/${repo}/git/refs`, {
      ref: `refs/heads/${branch}`,
      sha: object.sha,
    });
  }

  async readFiles(
    project: Project,
  ): Promise<{ files: SketchFileInput[]; fqbn: string }> {
    const { installationId, repo, branch, dir } = this.ctx(project);
    const entries = await this.listDirEntries(
      installationId,
      repo,
      dir,
      branch,
    );
    if (entries === null) throw new GithubLinkBrokenError();

    const files: SketchFileInput[] = [];
    let fqbn: string | null = null;
    for (const entry of entries) {
      if (entry.type !== 'file') continue;
      const content = await this.readFileAt(
        installationId,
        repo,
        entry.path,
        branch,
      );
      if (entry.name === SKETCH_YAML) {
        fqbn = parseSketchYamlFqbn(content);
        continue;
      }
      files.push({ path: toEditorFileName(dir, entry.name), content });
    }
    return { files, fqbn: fqbn ?? project.fqbn };
  }

  // GitHub gerçekten depolama — flash edilmeyen ara taslak için ayrı bir yer
  // yok (master.plan §3 notu). commit() dışında yazılacak bir şey yok.
  saveDraft(): Promise<void> {
    return Promise.resolve();
  }

  async commit(project: Project, input: CommitInput): Promise<CommitResult> {
    const { installationId, repo, branch, dir } = this.ctx(project);

    const wanted = [
      {
        repoPath: `${dir}/${SKETCH_YAML}`,
        content: renderSketchYaml(input.fqbn),
      },
      ...input.files.map((f) => ({
        repoPath: `${dir}/${toRepoFileName(dir, f.path)}`,
        content: f.content,
      })),
    ];

    const existing = await this.listDirEntries(
      installationId,
      repo,
      dir,
      branch,
    );
    if (existing === null) {
      // Dizin/branch 404 ya da 409 üç farklı şeyi ifade edebilir: (a) branch
      // var ama bu sketch'in ilk commit'i henüz atılmadı; (b) repo hâlâ
      // tamamen boş (link sırasında ilk commit başarısız kalmışsa); ikisi de
      // normal — boş kabul edilir. (c) repo/branch tamamen silinmiş —
      // bağlantı koptu, yalnızca bu durumda 404 döner. Ayırt etmek için
      // branch'in kendisini kontrol ediyoruz.
      const branchCheck = await this.github.raw(
        installationId,
        'GET',
        `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
      );
      if (branchCheck.status === 404) throw new GithubLinkBrokenError();
      if (!branchCheck.ok && branchCheck.status !== 409) {
        throw new GithubApiError(
          branchCheck.status,
          branch,
          await branchCheck.text(),
        );
      }
    }
    const existingByPath = new Map(
      (existing ?? []).map((e) => [e.path, e.sha]),
    );

    const conflicts: string[] = [];
    for (const item of wanted) {
      let sha = existingByPath.get(item.repoPath);
      if (input.force) {
        const res = await this.github.raw(
          installationId,
          'GET',
          `/repos/${repo}/contents/${encodeURIComponent(item.repoPath)}?ref=${encodeURIComponent(branch)}`,
        );
        if (res.status === 404) sha = undefined;
        else if (res.ok) sha = ((await res.json()) as GithubContentEntry).sha;
        else
          throw new GithubApiError(res.status, item.repoPath, await res.text());
      }

      const res = await this.github.raw(
        installationId,
        'PUT',
        `/repos/${repo}/contents/${encodeURIComponent(item.repoPath)}`,
        {
          message: input.message,
          content: Buffer.from(item.content, 'utf8').toString('base64'),
          branch,
          ...(sha ? { sha } : {}),
        },
      );
      if (res.status === 409 || res.status === 422) {
        conflicts.push(item.repoPath);
        continue;
      }
      if (res.status === 404) throw new GithubLinkBrokenError();
      if (!res.ok)
        throw new GithubApiError(res.status, item.repoPath, await res.text());
    }

    if (existing) {
      const wantedPaths = new Set(wanted.map((w) => w.repoPath));
      for (const entry of existing) {
        if (entry.type !== 'file' || wantedPaths.has(entry.path)) continue;
        // Silme hatası kritik değil — bir sonraki commit'te tekrar denenir.
        await this.github
          .raw(
            installationId,
            'DELETE',
            `/repos/${repo}/contents/${encodeURIComponent(entry.path)}`,
            {
              message: input.message,
              sha: entry.sha,
              branch,
            },
          )
          .catch(() => undefined);
      }
    }

    if (conflicts.length > 0)
      return { ok: false, reason: 'conflict', paths: conflicts };

    const head = await this.github.json<{ object: { sha: string } }>(
      installationId,
      'GET',
      `/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    );
    return { ok: true, versionId: head.object.sha };
  }

  async listVersions(project: Project): Promise<VersionSummary[]> {
    const { installationId, repo, branch, dir } = this.ctx(project);
    const res = await this.github.raw(
      installationId,
      'GET',
      `/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&path=${encodeURIComponent(dir)}&per_page=30`,
    );
    if (res.status === 404) throw new GithubLinkBrokenError();
    // 409 "Git Repository is empty." — branch daha yeni oluşturuldu, henüz
    // hiç commit yok. Bağlantı kopmadı, yalnızca liste boş.
    if (res.status === 409) return [];
    if (!res.ok)
      throw new GithubApiError(res.status, 'commits', await res.text());
    const commits = (await res.json()) as GithubCommitListItem[];
    return commits.map((c) => ({
      id: c.sha,
      createdAt:
        c.commit.author?.date ??
        c.commit.committer?.date ??
        new Date(0).toISOString(),
      fqbn: null,
      note: c.commit.message,
      buildKey: null,
      author: c.author
        ? { login: c.author.login, avatarUrl: c.author.avatar_url }
        : null,
      url: c.html_url,
    }));
  }

  async getVersion(
    project: Project,
    versionId: string,
  ): Promise<VersionDetail> {
    const { installationId, repo, dir } = this.ctx(project);
    const entries = await this.listDirEntries(
      installationId,
      repo,
      dir,
      versionId,
    );
    if (entries === null) throw new NotFoundException('version_not_found');

    const files: SketchFileInput[] = [];
    let fqbn: string | null = null;
    for (const entry of entries) {
      if (entry.type !== 'file') continue;
      const content = await this.readFileAt(
        installationId,
        repo,
        entry.path,
        versionId,
      );
      if (entry.name === SKETCH_YAML) {
        fqbn = parseSketchYamlFqbn(content);
        continue;
      }
      files.push({ path: toEditorFileName(dir, entry.name), content });
    }

    const commit = await this.github.json<GithubCommitListItem>(
      installationId,
      'GET',
      `/repos/${repo}/commits/${versionId}`,
    );

    return {
      id: versionId,
      projectId: project.id,
      createdAt:
        commit.commit.author?.date ??
        commit.commit.committer?.date ??
        new Date(0).toISOString(),
      fqbn: fqbn ?? project.fqbn,
      note: commit.commit.message,
      buildKey: null,
      author: commit.author
        ? { login: commit.author.login, avatarUrl: commit.author.avatar_url }
        : null,
      url: commit.html_url,
      files,
    };
  }
}
