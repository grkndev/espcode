import type { Project } from '../../generated/prisma/client';
import type { SketchFileInput } from '../projects.service';
import type { LibraryDep } from './sketch-yaml';

export type { LibraryDep };

// master.plan.md §3.1 — proje bazlı depolama sağlayıcısı soyutlaması.
// 'postgres': project_versions tablosu gerçek kaynak. 'github': bağlı repo
// gerçek kaynak, project_versions'a hiç yazılmaz.

export interface VersionSummary {
  id: string; // postgres: ProjectVersion uuid | github: commit sha
  createdAt: string;
  fqbn: string | null; // github: sketch.yaml'dan okunur, bulunamazsa null
  note: string | null; // github: commit mesajı
  buildKey: string | null; // github: her zaman null
  author: { login: string; avatarUrl: string | null } | null;
  url: string | null; // github: commit html_url
}

export interface VersionDetail extends VersionSummary {
  projectId: string;
  files: SketchFileInput[];
  libraries: LibraryDep[];
}

export interface CommitInput {
  files: SketchFileInput[];
  fqbn: string;
  libraries: LibraryDep[];
  message: string;
  buildKey: string | null;
  /** sha çakışmasında üzerine yaz — kullanıcı onayından sonra tekrar gönderilir. */
  force?: boolean;
}

export type CommitResult =
  | { ok: true; versionId: string }
  | { ok: false; reason: 'conflict'; paths: string[] }
  | { ok: false; reason: 'link_broken' };

export interface ProjectStorage {
  readFiles(project: Project): Promise<{
    files: SketchFileInput[];
    fqbn: string;
    libraries: LibraryDep[];
  }>;
  /** Flash edilmeden ara kaydetme — yalnızca postgres'te anlamlı, github'da no-op. */
  saveDraft(
    project: Project,
    files: SketchFileInput[],
    fqbn: string,
    libraries: LibraryDep[],
  ): Promise<void>;
  commit(project: Project, input: CommitInput): Promise<CommitResult>;
  listVersions(project: Project): Promise<VersionSummary[]>;
  getVersion(project: Project, versionId: string): Promise<VersionDetail>;
}
