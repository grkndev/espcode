import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { GithubInstallService } from './github-install.service';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/request-user';

// master.plan.md §3.1/§5 — kimlik OAuth'undan (AuthController) tamamen ayrı:
// GitHub App kurulum akışı, proje bazlı depolama izni içindir.
@Controller('api/github')
export class GithubController {
  constructor(private readonly install: GithubInstallService) {}

  @Get('install')
  @UseGuards(RequireAuthGuard)
  async start(
    @CurrentUser() user: RequestUser,
    @Query('projectId') projectId: string,
    @Res() res: Response,
  ) {
    const url = await this.install.buildInstallUrl(user.id, projectId);
    res.redirect(url);
  }

  // Kimlik burada cookie'den değil, install()'un ürettiği state'ten
  // doğrulanır — GithubInstallService.completeInstallation.
  @Get('callback')
  async callback(
    @Query('installation_id') installationId: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const { projectId } = await this.install.completeInstallation(
      state,
      BigInt(installationId),
    );
    const origin = process.env.APP_ORIGIN ?? '/';
    const url = new URL(`${origin}/editor`);
    url.searchParams.set('project', projectId);
    url.searchParams.set('github', 'installed');
    url.searchParams.set('installation', installationId);
    res.redirect(url.toString());
  }

  @Get('installations')
  @UseGuards(RequireAuthGuard)
  installations(@CurrentUser() user: RequestUser) {
    return this.install.listInstallations(user.id);
  }

  @Get('installations/:id/repos')
  @UseGuards(RequireAuthGuard)
  repos(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.install.listRepos(user.id, BigInt(id));
  }
}
