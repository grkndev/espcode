import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma, Project } from '../../generated/prisma/client';
import type { SketchFileInput } from '../projects.service';
import {
  renderSketchYaml,
  parseSketchYaml,
  type LibraryDep,
} from './sketch-yaml';
import type {
  CommitInput,
  CommitResult,
  ProjectStorage,
  VersionDetail,
  VersionSummary,
} from './project-storage';

export const MAX_VERSIONS_PER_PROJECT = 30;

const SKETCH_YAML = 'sketch.yaml';

function toJson(files: unknown): Prisma.InputJsonValue {
  return files as Prisma.InputJsonValue;
}

function toFiles(files: unknown): SketchFileInput[] {
  return files as SketchFileInput[];
}

// Prisma migration'sız kalıcılık — kütüphane listesi projects.files/
// project_versions.files JSON dizisinin içine sketch.yaml adlı sentetik bir
// giriş olarak gömülür (github sağlayıcısının repoda zaten yaptığının aynısı,
// bkz. sketch-yaml.ts). fqbn için gerek yok (postgres'te zaten kendi sütunu
// var) — yalnızca libraries.length>0 iken yazılır, boşsa hiç eklenmez.
// unlinkGithub'ın (ProjectsService) GitHub'dan gelen son hâli tek bir birleşik
// update'te postgres'e yazabilmesi için export edilir.
export function embedLibraries(
  files: SketchFileInput[],
  fqbn: string,
  libraries: LibraryDep[],
): SketchFileInput[] {
  if (libraries.length === 0) return files;
  return [
    ...files,
    { path: SKETCH_YAML, content: renderSketchYaml({ fqbn, libraries }) },
  ];
}

function splitLibraries(rawFiles: unknown): {
  files: SketchFileInput[];
  libraries: LibraryDep[];
} {
  const all = toFiles(rawFiles ?? []);
  const yamlEntry = all.find((f) => f.path === SKETCH_YAML);
  const files = all.filter((f) => f.path !== SKETCH_YAML);
  const libraries = yamlEntry
    ? (parseSketchYaml(yamlEntry.content)?.libraries ?? [])
    : [];
  return { files, libraries };
}

// master.plan.md §3 — varsayılan sağlayıcı. Gerçek kaynak project_versions;
// projects.files yalnızca "en son taslak" önbelleği.
@Injectable()
export class PostgresProjectStorage implements ProjectStorage {
  constructor(private readonly prisma: PrismaService) {}

  readFiles(project: Project): Promise<{
    files: SketchFileInput[];
    fqbn: string;
    libraries: LibraryDep[];
  }> {
    const { files, libraries } = splitLibraries(project.files);
    return Promise.resolve({ files, fqbn: project.fqbn, libraries });
  }

  async saveDraft(
    project: Project,
    files: SketchFileInput[],
    fqbn: string,
    libraries: LibraryDep[],
  ): Promise<void> {
    await this.prisma.project.update({
      where: { id: project.id },
      data: { files: toJson(embedLibraries(files, fqbn, libraries)), fqbn },
    });
  }

  async commit(project: Project, input: CommitInput): Promise<CommitResult> {
    const storedFiles = embedLibraries(
      input.files,
      input.fqbn,
      input.libraries,
    );
    const version = await this.prisma.$transaction(async (tx) => {
      const created = await tx.projectVersion.create({
        data: {
          projectId: project.id,
          files: toJson(storedFiles),
          fqbn: input.fqbn,
          buildKey: input.buildKey,
          note: input.message,
        },
      });
      await tx.project.update({
        where: { id: project.id },
        data: { files: toJson(storedFiles), fqbn: input.fqbn },
      });
      return created;
    });

    const total = await this.prisma.projectVersion.count({
      where: { projectId: project.id },
    });
    if (total > MAX_VERSIONS_PER_PROJECT) {
      const stale = await this.prisma.projectVersion.findMany({
        where: { projectId: project.id },
        orderBy: { createdAt: 'asc' },
        take: total - MAX_VERSIONS_PER_PROJECT,
        select: { id: true },
      });
      await this.prisma.projectVersion.deleteMany({
        where: { id: { in: stale.map((s) => s.id) } },
      });
    }

    return { ok: true, versionId: version.id };
  }

  async listVersions(project: Project): Promise<VersionSummary[]> {
    const rows = await this.prisma.projectVersion.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        fqbn: true,
        note: true,
        buildKey: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      fqbn: r.fqbn,
      note: r.note,
      buildKey: r.buildKey,
      author: null,
      url: null,
    }));
  }

  async getVersion(
    project: Project,
    versionId: string,
  ): Promise<VersionDetail> {
    const version = await this.prisma.projectVersion.findUnique({
      where: { id: versionId },
    });
    if (!version || version.projectId !== project.id) {
      throw new NotFoundException('version_not_found');
    }
    const { files, libraries } = splitLibraries(version.files);
    return {
      id: version.id,
      projectId: version.projectId,
      createdAt: version.createdAt.toISOString(),
      fqbn: version.fqbn,
      note: version.note,
      buildKey: version.buildKey,
      author: null,
      url: null,
      files,
      libraries,
    };
  }
}
