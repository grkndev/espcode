import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { BuildsService } from './builds.service';
import {
  ArtifactStoreService,
  type ArtifactKind,
} from './artifact-store.service';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/request-user';

function parseAsset(asset?: string): ArtifactKind {
  if (asset === 'bin' || asset === 'elf') return asset;
  throw new BadRequestException('invalid_asset');
}

@Controller('api')
export class BuildsController {
  constructor(
    private readonly builds: BuildsService,
    private readonly artifacts: ArtifactStoreService,
  ) {}

  // master.plan.md §5 — 302 → imzalı (yerel stand-in) indirme URL'i, 5 dk.
  @Get('builds/:key/download')
  @UseGuards(RequireAuthGuard)
  async download(
    @CurrentUser() user: RequestUser,
    @Param('key') key: string,
    @Query('asset') asset: string,
    @Res() res: Response,
  ) {
    const kind = parseAsset(asset);
    const signedPath = await this.builds.getSignedDownloadPath(
      user.id,
      key,
      kind,
    );
    res.redirect(302, signedPath);
  }

  // İmzalı URL'in kendisi — auth gerektirmez, kısa ömürlü imza yeterli
  // (gerçek R2 presigned URL'in davranışıyla aynı).
  @Get('artifacts/:key')
  async serve(
    @Param('key') key: string,
    @Query('asset') asset: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    const kind = parseAsset(asset);
    if (!this.artifacts.verify(key, kind, Number(exp), sig ?? '')) {
      res.status(403).json({ error: 'invalid_or_expired_signature' });
      return;
    }
    const data = await this.artifacts.read(key, kind);
    if (!data) {
      res.status(404).json({ error: 'artifact_not_found' });
      return;
    }
    res.set({
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="${key}.${kind}"`,
    });
    res.send(data);
  }
}
