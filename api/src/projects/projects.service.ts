import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, type Project } from '../generated/prisma/client';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CommitProjectDto } from './dto/commit-project.dto';
import { GithubLinkDto } from './dto/github-link.dto';
import {
  PostgresProjectStorage,
  embedLibraries,
} from './storage/postgres-storage.service';
import { GithubStorageService } from '../github/github-storage.service';
import { GithubLinkBrokenError } from '../github/github-errors';
import { slugifyProjectName } from './storage/slug';
import type {
  CommitResult,
  LibraryDep,
  ProjectStorage,
  VersionDetail,
  VersionSummary,
} from './storage/project-storage';

// master.plan.md §3 Kotalar (portföy kapsamı)
export const MAX_PROJECTS_PER_USER = 20;

export interface SketchFileInput {
  path: string;
  content: string;
}

// class-validator DTO örnekleri (ProjectFileDto[]) yapısal olarak JSON'dur
// ama Prisma'nın InputJsonValue'su dizi/instance'lar için index signature
// istiyor — çalışma zamanında zaten düz JSON, yalnızca tip seviyesinde cast.
function toJson(files: unknown): Prisma.InputJsonValue {
  return files as Prisma.InputJsonValue;
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly postgres: PostgresProjectStorage,
    private readonly github: GithubStorageService,
  ) {}

  private storageFor(project: Project): ProjectStorage {
    return project.storageProvider === 'github' ? this.github : this.postgres;
  }

  private serializeSummary(project: Project) {
    return {
      id: project.id,
      name: project.name,
      fqbn: project.fqbn,
      updatedAt: project.updatedAt,
      storageProvider: project.storageProvider,
      githubRepoFullName: project.githubRepoFullName,
      githubBranch: project.githubBranch,
      githubLinkBroken: project.githubLinkBroken,
    };
  }

  private async markLinkBroken(projectId: string): Promise<void> {
    await this.prisma.project
      .update({ where: { id: projectId }, data: { githubLinkBroken: true } })
      .catch((err) =>
        this.logger.warn(`githubLinkBroken işaretlenemedi: ${err}`),
      );
  }

  // GithubLinkBrokenError'ı tek bir yerde 409'a çevirir — get/listVersions/
  // getVersion'ın hepsi aynı davranışı paylaşır.
  private async withLinkBrokenHandling<T>(
    project: Project,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof GithubLinkBrokenError) {
        await this.markLinkBroken(project.id);
        throw new ConflictException('github_link_broken');
      }
      throw err;
    }
  }

  async list(userId: string) {
    const projects = await this.prisma.project.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { versions: true } } },
    });
    return projects.map((p) => ({
      ...this.serializeSummary(p),
      versionCount: p._count.versions,
    }));
  }

  async create(userId: string, dto: CreateProjectDto) {
    const count = await this.prisma.project.count({ where: { userId } });
    if (count >= MAX_PROJECTS_PER_USER) {
      throw new BadRequestException('project_quota_exceeded');
    }
    const project = await this.prisma.project.create({
      data: {
        userId,
        name: dto.name,
        fqbn: dto.fqbn,
        files: toJson(
          embedLibraries(dto.files ?? [], dto.fqbn, dto.libraries ?? []),
        ),
      },
    });
    return { id: project.id };
  }

  private async findOwned(userId: string, id: string): Promise<Project> {
    const project = await this.prisma.project.findUnique({ where: { id } });
    // §5 not: 403 kaydın varlığını sızdırır — başkasının projesi de 404 döner.
    if (!project || project.userId !== userId)
      throw new NotFoundException('project_not_found');
    return project;
  }

  async get(userId: string, id: string) {
    const project = await this.findOwned(userId, id);
    const storage = this.storageFor(project);

    const current = await this.withLinkBrokenHandling(project, () =>
      storage.readFiles(project),
    );
    let allVersions: VersionSummary[] = [];
    try {
      allVersions = await storage.listVersions(project);
    } catch (err) {
      if (!(err instanceof GithubLinkBrokenError)) throw err;
      await this.markLinkBroken(project.id);
    }

    return {
      ...this.serializeSummary(project),
      createdAt: project.createdAt,
      fqbn: current.fqbn,
      files: current.files,
      libraries: current.libraries,
      versionCount: allVersions.length,
      versions: allVersions.slice(0, 10),
    };
  }

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    const project = await this.findOwned(userId, id);
    const nextFqbn = dto.fqbn ?? project.fqbn;

    if (dto.files !== undefined) {
      // libraries verilmediyse mevcut proje kütüphanelerini koru — saveDraft
      // dosya listesini tam olarak değiştiriyor, sessizce sıfırlamamalı.
      const nextLibraries =
        dto.libraries ??
        (await this.storageFor(project).readFiles(project)).libraries;
      await this.storageFor(project).saveDraft(
        project,
        dto.files,
        nextFqbn,
        nextLibraries,
      );
    }
    if (dto.name === undefined && dto.fqbn === undefined) {
      return {
        id: project.id,
        name: project.name,
        fqbn: nextFqbn,
        updatedAt: project.updatedAt,
      };
    }

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.fqbn !== undefined ? { fqbn: dto.fqbn } : {}),
      },
    });
    return {
      id: updated.id,
      name: updated.name,
      fqbn: updated.fqbn,
      updatedAt: updated.updatedAt,
    };
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.project.delete({ where: { id } });
    return { ok: true };
  }

  async listVersions(userId: string, id: string): Promise<VersionSummary[]> {
    const project = await this.findOwned(userId, id);
    return this.withLinkBrokenHandling(project, () =>
      this.storageFor(project).listVersions(project),
    );
  }

  // Yeni: GET /projects/:id/versions/:versionId — her iki sağlayıcıda da
  // çalışır (github'da versionId commit sha'sı).
  async getVersionInProject(
    userId: string,
    projectId: string,
    versionId: string,
  ): Promise<VersionDetail> {
    const project = await this.findOwned(userId, projectId);
    return this.withLinkBrokenHandling(project, () =>
      this.storageFor(project).getVersion(project, versionId),
    );
  }

  // Eski: GET /versions/:id — yalnızca postgres'te anlamlı (uuid ile doğrudan
  // project_versions'tan okur), github commit sha'ları için kullanılmaz.
  async getVersion(userId: string, versionId: string) {
    const version = await this.prisma.projectVersion.findUnique({
      where: { id: versionId },
      include: { project: true },
    });
    if (!version || version.project.userId !== userId) {
      throw new NotFoundException('version_not_found');
    }
    return version;
  }

  // master.plan.md §6 "Flash sonrası versiyon kaydı" — CompileService başarılı
  // bir derlemeden sonra (yalnızca "Derle ve Yükle" akışında projectId
  // gönderildiğinde) çağırır. Sahiplik uyuşmazlığında null döner — bozuk bir
  // projectId derleme/flash akışını kesmemeli, yalnızca kayıt atlanır.
  async autoCommit(
    userId: string,
    projectId: string,
    files: SketchFileInput[],
    fqbn: string,
    libraries: LibraryDep[],
    buildKey: string | null,
  ): Promise<CommitResult | null> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project || project.userId !== userId) {
      this.logger.warn(
        `autoCommit: proje sahiplik uyuşmazlığı veya yok — projectId=${projectId}`,
      );
      return null;
    }

    const message = `espcode: flash ${fqbn} ${new Date().toISOString()}`;
    try {
      return await this.storageFor(project).commit(project, {
        files,
        fqbn,
        libraries,
        message,
        buildKey,
      });
    } catch (err) {
      if (err instanceof GithubLinkBrokenError) {
        await this.markLinkBroken(project.id);
        return { ok: false, reason: 'link_broken' };
      }
      throw err;
    }
  }

  // POST /projects/:id/commit — flash'tan bağımsız manuel kaydetme, her iki
  // sağlayıcıda da çalışır.
  async commit(
    userId: string,
    projectId: string,
    dto: CommitProjectDto,
  ): Promise<CommitResult> {
    const project = await this.findOwned(userId, projectId);
    try {
      return await this.storageFor(project).commit(project, {
        files: dto.files,
        fqbn: dto.fqbn,
        libraries: dto.libraries ?? [],
        message: dto.message,
        buildKey: null,
        force: dto.force,
      });
    } catch (err) {
      if (err instanceof GithubLinkBrokenError) {
        await this.markLinkBroken(project.id);
        return { ok: false, reason: 'link_broken' };
      }
      throw err;
    }
  }

  // POST /projects/:id/github-link — §3.1 adım 6-7. Branch'i oluşturur,
  // mevcut taslağı ilk commit olarak repo'ya taşır, başarısızsa geri alır.
  async linkGithub(userId: string, projectId: string, dto: GithubLinkDto) {
    const project = await this.findOwned(userId, projectId);
    const installationId = BigInt(dto.installationId);

    const installation = await this.prisma.githubInstallation.findUnique({
      where: { installationId },
    });
    if (!installation || installation.userId !== userId) {
      throw new NotFoundException('installation_not_found');
    }

    const dir = slugifyProjectName(project.name);
    const branch = `espcode/${dir}`;

    // Postgres'teki files sütunu, kütüphane varsa gömülü bir sketch.yaml
    // girişi içerebilir (bkz. postgres-storage.service.ts embedLibraries) —
    // ham diziyi olduğu gibi github.commit()'e geçirmek onu düz bir sketch
    // dosyası gibi ikinci kez, github'ın kendi ürettiği sketch.yaml'ın
    // üzerine yazardı. readFiles() ile düzgün ayrıştırılmış hâli kullanılır.
    const current = await this.postgres.readFiles(project);

    await this.github.ensureBranch(installationId, dto.repoFullName, branch);

    const linked = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        storageProvider: 'github',
        githubInstallationId: installationId,
        githubRepoFullName: dto.repoFullName,
        githubBranch: branch,
        githubDir: dir,
        githubLinkBroken: false,
      },
    });

    try {
      await this.github.commit(linked, {
        files: current.files,
        fqbn: current.fqbn,
        libraries: current.libraries,
        message: 'espcode: GitHub deposuna bağlandı',
        buildKey: null,
      });
    } catch (err) {
      // İlk commit başarısızsa bağlantıyı geri al — yarı bağlı proje bırakma.
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          storageProvider: 'postgres',
          githubInstallationId: null,
          githubRepoFullName: null,
          githubBranch: null,
          githubDir: null,
        },
      });
      throw err;
    }

    const final = await this.prisma.project.update({
      where: { id: projectId },
      data: { files: Prisma.DbNull },
    });
    return this.serializeSummary(final);
  }

  // DELETE /projects/:id/github-link — bağlantıyı kaldırır, GitHub'daki son
  // hali postgres'e indirir (master.plan "source boş kalır" diyor ama son
  // hali çekmek bir ek GET'e mal oluyor ve veri kaybını önlüyor).
  async unlinkGithub(userId: string, projectId: string) {
    const project = await this.findOwned(userId, projectId);
    if (project.storageProvider !== 'github') {
      throw new BadRequestException('project_not_github_linked');
    }

    let files: SketchFileInput[] = [];
    let fqbn = project.fqbn;
    let libraries: LibraryDep[] = [];
    if (!project.githubLinkBroken) {
      try {
        const current = await this.github.readFiles(project);
        files = current.files;
        fqbn = current.fqbn;
        libraries = current.libraries;
      } catch (err) {
        if (!(err instanceof GithubLinkBrokenError)) throw err;
      }
    }

    const updated = await this.prisma.project.update({
      where: { id: projectId },
      data: {
        storageProvider: 'postgres',
        githubInstallationId: null,
        githubRepoFullName: null,
        githubBranch: null,
        githubDir: null,
        githubLinkBroken: false,
        files: toJson(embedLibraries(files, fqbn, libraries)),
        fqbn,
      },
    });
    return this.serializeSummary(updated);
  }
}
