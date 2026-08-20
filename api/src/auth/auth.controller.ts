import { Controller, Get, Query, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RequireAuthGuard } from './require-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { RequestUser } from './request-user';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_PROJECTS_PER_USER } from '../projects/projects.service';
import { SESSION_COOKIE } from './auth.middleware';

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// ngrok gibi bir tünelle API'yi ayrı bir origin'den yayınlarken (frontend
// hâlâ localhost'ta) çerez cross-site sayılır — SameSite=Lax bunu göndermez.
// Bu durumda COOKIE_SAMESITE=none + COOKIE_SECURE=true (ngrok zaten https)
// ayarlanmalı; varsayılan aynı-host kurulum (localtest.me) için Lax kalır.
function cookieOptions() {
  const domain = process.env.COOKIE_DOMAIN || undefined;
  const secure = process.env.COOKIE_SECURE !== 'false';
  const sameSite =
    (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none' | undefined) ??
    'lax';
  return {
    httpOnly: true,
    sameSite,
    secure,
    domain,
    path: '/',
  };
}

@Controller('api')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  // master.plan.md §4.1 adım 1-2
  @Get('auth/github')
  async start(@Res() res: Response) {
    const url = await this.authService.buildAuthorizeUrl();
    res.redirect(url);
  }

  // §4.1 adım 3-8
  @Get('auth/github/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const { token } = await this.authService.handleCallback(code, state);
    res.cookie(SESSION_COOKIE, token, {
      ...cookieOptions(),
      maxAge: SESSION_MAX_AGE_MS,
    });
    res.redirect(process.env.APP_ORIGIN ?? '/');
  }

  @Post('auth/logout')
  logout(@Res() res: Response) {
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.status(204).send();
  }

  @Get('me')
  @UseGuards(RequireAuthGuard)
  async me(@CurrentUser() user: RequestUser) {
    const [record, projectCount] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      this.prisma.project.count({ where: { userId: user.id } }),
    ]);
    return {
      id: record.id,
      login: record.login,
      avatarUrl: record.avatarUrl,
      quota: { projects: { used: projectCount, max: MAX_PROJECTS_PER_USER } },
    };
  }
}
