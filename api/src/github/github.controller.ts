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

  // Kimlik öncelikle install()'un ürettiği state'ten doğrulanır. GitHub App
  // zaten hesaba kuruluysa (ya da "Redirect on update" github.com'dan
  // doğrudan yönetilen bir güncellemeyle tetiklenirse) state hiç gelmez —
  // bu durumda AuthMiddleware'in doldurduğu req.user'a (aynı tarayıcıdaki
  // espcode oturumu) yedek olarak düşülür. GithubInstallService.completeInstallation.
  @Get('callback')
  async callback(
    @CurrentUser() user: RequestUser | null,
    @Query('installation_id') installationId: string,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ) {
    const pending = await this.install.completeInstallation(
      state,
      BigInt(installationId),
      user?.id ?? null,
    );
    const origin = process.env.APP_ORIGIN ?? '/';

    if (!pending) {
      res.redirect(origin);
      return;
    }

    const url = new URL(`${origin}/editor`);
    url.searchParams.set('project', pending.projectId);
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
