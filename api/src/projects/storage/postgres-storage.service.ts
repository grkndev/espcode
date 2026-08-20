import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Prisma, Project } from '../../generated/prisma/client';
import type { SketchFileInput } from '../projects.service';
import type {
  CommitInput,
  CommitResult,
  ProjectStorage,
  VersionDetail,
  VersionSummary,
} from './project-storage';

export const MAX_VERSIONS_PER_PROJECT = 30;

function toJson(files: unknown): Prisma.InputJsonValue {
  return files as Prisma.InputJsonValue;
}

function toFiles(files: unknown): SketchFileInput[] {
  return files as SketchFileInput[];
}

// master.plan.md §3 — varsayılan sağlayıcı. Gerçek kaynak project_versions;
// projects.files yalnızca "en son taslak" önbelleği.
@Injectable()
export class PostgresProjectStorage implements ProjectStorage {
  constructor(private readonly prisma: PrismaService) {}

  readFiles(
    project: Project,
  ): Promise<{ files: SketchFileInput[]; fqbn: string }> {
    return Promise.resolve({
      files: toFiles(project.files ?? []),
      fqbn: project.fqbn,
    });
  }

  async saveDraft(
    project: Project,
    files: SketchFileInput[],
    fqbn: string,
  ): Promise<void> {
    await this.prisma.project.update({
      where: { id: project.id },
      data: { files: toJson(files), fqbn },
    });
  }

  async commit(project: Project, input: CommitInput): Promise<CommitResult> {
    const version = await this.prisma.$transaction(async (tx) => {
      const created = await tx.projectVersion.create({
        data: {
          projectId: project.id,
          files: toJson(input.files),
          fqbn: input.fqbn,
          buildKey: input.buildKey,
          note: input.message,
        },
      });
      await tx.project.update({
        where: { id: project.id },
        data: { files: toJson(input.files), fqbn: input.fqbn },
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
    return {
      id: version.id,
      projectId: version.projectId,
      createdAt: version.createdAt.toISOString(),
      fqbn: version.fqbn,
      note: version.note,
      buildKey: version.buildKey,
      author: null,
      url: null,
      files: toFiles(version.files),
    };
  }
}
