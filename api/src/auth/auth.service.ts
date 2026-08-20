import {
  Injectable,
  Logger,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import IORedis from 'ioredis';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';

const STATE_TTL_SEC = 10 * 60;
const SESSION_TTL = '30d';

interface GithubTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GithubUserResponse {
  id: number;
  login: string;
  avatar_url: string;
}

export interface SessionPayload {
  sub: string;
}

// master.plan.md §4.1 — sunucu tarafı OAuth, client secret tarayıcıya inmiyor.
// state Redis'te 10 dk TTL ile tutulur, tek kullanımlık (callback'te silinir).
@Injectable()
export class AuthService implements OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private readonly redis: IORedis;
  private readonly sessionSecret: string;

  constructor(private readonly prisma: PrismaService) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL tanımlı değil');
    const sessionSecret = process.env.SESSION_SECRET;
    if (!sessionSecret) throw new Error('SESSION_SECRET tanımlı değil');
    this.redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
    this.sessionSecret = sessionSecret;
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async buildAuthorizeUrl(): Promise<string> {
    const state = randomBytes(24).toString('hex');
    await this.redis.set(`oauth-state:${state}`, '1', 'EX', STATE_TTL_SEC);

    const clientId = process.env.GITHUB_CLIENT_ID;
    const callbackUrl = process.env.GITHUB_CALLBACK_URL;
    if (!clientId || !callbackUrl)
      throw new Error('GitHub OAuth env değişkenleri eksik');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: 'read:user',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  private async consumeState(state: string): Promise<void> {
    const deleted = await this.redis.del(`oauth-state:${state}`);
    if (deleted === 0)
      throw new UnauthorizedException('invalid_or_expired_state');
  }

  async handleCallback(code: string, state: string) {
    await this.consumeState(state);

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret)
      throw new Error('GitHub OAuth env değişkenleri eksik');

    const tokenRes = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      },
    );
    const tokenBody = (await tokenRes.json()) as GithubTokenResponse;
    if (!tokenBody.access_token) {
      this.logger.warn(
        `github token exchange başarısız: ${tokenBody.error ?? tokenRes.status}`,
      );
      throw new UnauthorizedException('github_token_exchange_failed');
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        authorization: `Bearer ${tokenBody.access_token}`,
        accept: 'application/vnd.github+json',
      },
    });
    if (!userRes.ok)
      throw new UnauthorizedException('github_user_fetch_failed');
    const githubUser = (await userRes.json()) as GithubUserResponse;

    // GitHub erişim tokenı burada işi bitiyor — saklanmıyor (§4.1: depolama
    // GitHub'da olmadığı sürece sonradan kullanılacak bir yer yok).
    const user = await this.prisma.user.upsert({
      where: { githubId: BigInt(githubUser.id) },
      create: {
        githubId: BigInt(githubUser.id),
        login: githubUser.login,
        avatarUrl: githubUser.avatar_url,
      },
      update: {
        login: githubUser.login,
        avatarUrl: githubUser.avatar_url,
        lastSeenAt: new Date(),
      },
    });

    return { token: this.signSession(user.id), user };
  }

  signSession(userId: string): string {
    return jwt.sign(
      { sub: userId } satisfies SessionPayload,
      this.sessionSecret,
      {
        expiresIn: SESSION_TTL,
      },
    );
  }

  verifySession(token: string): SessionPayload | null {
    try {
      return jwt.verify(token, this.sessionSecret) as SessionPayload;
    } catch {
      return null;
    }
  }
}
