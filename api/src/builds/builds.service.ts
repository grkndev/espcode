import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ArtifactStoreService,
  type ArtifactKind,
} from './artifact-store.service';
import { CORE_VERSION } from '../compile/build-key';

@Injectable()
export class BuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly artifacts: ArtifactStoreService,
  ) {}

  // CompileService, başarılı her derlemeden (cache hit dahil) sonra çağırır.
  async recordBuild(
    buildKey: string,
    fqbn: string,
    flashBytes: number,
    bin: Buffer,
    elf: Buffer | null,
  ) {
    await this.prisma.build.upsert({
      where: { buildKey },
      create: { buildKey, fqbn, coreVersion: CORE_VERSION, flashBytes },
      update: { lastUsedAt: new Date() },
    });

    if (!(await this.artifacts.exists(buildKey, 'bin'))) {
      await this.artifacts.write(buildKey, 'bin', bin);
    }
    if (elf && !(await this.artifacts.exists(buildKey, 'elf'))) {
      await this.artifacts.write(buildKey, 'elf', elf);
    }
  }

  // Faz 6.1 §4.1 — sahiplik artık project_versions'tan bağımsız: GitHub
  // sağlayıcılı projeler oraya hiç yazmıyor, ve postgres tarafında 30'luk
  // budama en eski versiyonu (ve onunla birlikte indirme hakkını) silebiliyordu.
  // CompileService her başarılı derlemede (cache hit dahil) userId varsa çağırır.
  async recordOwner(userId: string, buildKey: string): Promise<void> {
    await this.prisma.buildOwner.upsert({
      where: { userId_buildKey: { userId, buildKey } },
      create: { userId, buildKey },
      update: {},
    });
  }

  async getSignedDownloadPath(
    userId: string,
    buildKey: string,
    kind: ArtifactKind,
  ): Promise<string> {
    const owns = await this.prisma.buildOwner.findUnique({
      where: { userId_buildKey: { userId, buildKey } },
      select: { userId: true },
    });
    if (!owns) throw new NotFoundException('build_not_found');
    if (!(await this.artifacts.exists(buildKey, kind)))
      throw new NotFoundException('artifact_expired');
    return this.artifacts.buildSignedPath(buildKey, kind);
  }
}
