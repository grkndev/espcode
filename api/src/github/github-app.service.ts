import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
import IORedis from 'ioredis';

const GITHUB_API = 'https://api.github.com';
const APP_JWT_TTL_SEC = 9 * 60; // GitHub tavanı 10 dk (§3.1)
const INSTALLATION_TOKEN_CACHE_KEY = (id: bigint) => `gh-inst-token:${id}`;

export class GithubApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: unknown,
  ) {
    super(`github_api_error:${status}`);
    this.name = 'GithubApiError';
  }
}

interface InstallationTokenResponse {
  token: string;
  expires_at: string;
}

// master.plan.md §3.1 — GitHub App katmanı: kimlik OAuth'undan (AuthService)
// tamamen ayrı bir yetkilendirme. App JWT (RS256, app private key) →
// installation access token (~1h, Redis'te cache'lenir) → API çağrıları.
//
// GitHub App yapılandırması opsiyonel (proje bazlı opt-in özellik) — App
// kurulmamış bir yerel/deploy ortamında ide-api'nin geri kalanı (auth,
// derleme, postgres versiyonlama) hiç etkilenmemeli. Bu yüzden env eksikse
// constructor'da DEĞİL, ilk gerçek kullanımda hata fırlatılır.
@Injectable()
export class GithubAppService implements OnModuleDestroy {
  private readonly logger = new Logger(GithubAppService.name);
  private redis: IORedis | null = null;
  private appId: string | null = null;
  private privateKey: string | null = null;

  async onModuleDestroy() {
    await this.redis?.quit();
  }

  private ensureConfigured(): {
    appId: string;
    privateKey: string;
    redis: IORedis;
  } {
    if (this.appId && this.privateKey && this.redis) {
      return {
        appId: this.appId,
        privateKey: this.privateKey,
        redis: this.redis,
      };
    }
    const redisUrl = process.env.REDIS_URL;
    const appId = process.env.GITHUB_APP_ID;
    const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
    if (!redisUrl || !appId || !keyPath) {
      throw new Error(
        'GitHub App yapılandırılmamış: REDIS_URL / GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY_PATH gerekli',
      );
    }
    this.appId = appId;
    this.privateKey = readFileSync(keyPath, 'utf8');
    this.redis ??= new IORedis(redisUrl, { maxRetriesPerRequest: null });
    return {
      appId: this.appId,
      privateKey: this.privateKey,
      redis: this.redis,
    };
  }

  private appJwt(): string {
    const { appId, privateKey } = this.ensureConfigured();
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      { iat: now - 60, exp: now + APP_JWT_TTL_SEC, iss: appId },
      privateKey,
      { algorithm: 'RS256' },
    );
  }

  async installationToken(installationId: bigint): Promise<string> {
    const { redis } = this.ensureConfigured();
    const cacheKey = INSTALLATION_TOKEN_CACHE_KEY(installationId);
    const cached = await redis.get(cacheKey);
    if (cached) return cached;
    return this.refreshInstallationToken(installationId);
  }

  private async refreshInstallationToken(
    installationId: bigint,
  ): Promise<string> {
    const { redis } = this.ensureConfigured();
    const url = `${GITHUB_API}/app/installations/${installationId}/access_tokens`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.appJwt()}`,
        accept: 'application/vnd.github+json',
      },
    });
    if (!res.ok) {
      throw new GithubApiError(res.status, url, await res.text());
    }
    const body = (await res.json()) as InstallationTokenResponse;
    const ttlSec = Math.max(
      60,
      Math.floor((Date.parse(body.expires_at) - Date.now()) / 1000) - 60,
    );
    await redis
      .set(
        INSTALLATION_TOKEN_CACHE_KEY(installationId),
        body.token,
        'EX',
        ttlSec,
      )
      .catch((err) =>
        this.logger.warn(`installation token cache yazılamadı: ${err}`),
      );
    return body.token;
  }

  // 401'de token'ı bir kez tazeleyip tekrar dener; diğer durumlarda ham
  // Response'u döner — çağıran taraf (GithubStorageService) 404/409/422'yi
  // bağlama göre yorumlar (repo silinmiş / dosya henüz yok / sha çakışması
  // aynı HTTP koduyla gelebiliyor, tek anlam burada verilemez).
  async raw(
    installationId: bigint,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const doFetch = async (token: string) =>
      fetch(`${GITHUB_API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

    const token = await this.installationToken(installationId);
    let res = await doFetch(token);
    if (res.status === 401) {
      const fresh = await this.refreshInstallationToken(installationId);
      res = await doFetch(fresh);
    }
    return res;
  }

  // Non-2xx her zaman beklenmedik kabul edilir (kurulum listesi, branch
  // oluşturma gibi uçlar) — contents API'nin bağlamsal 404/409'u için raw().
  async json<T>(
    installationId: bigint,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await this.raw(installationId, method, path, body);
    if (!res.ok) {
      throw new GithubApiError(res.status, path, await res.text());
    }
    return res.json() as Promise<T>;
  }

  async appJson<T>(method: string, path: string): Promise<T> {
    const res = await fetch(`${GITHUB_API}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.appJwt()}`,
        accept: 'application/vnd.github+json',
      },
    });
    if (!res.ok) {
      throw new GithubApiError(res.status, path, await res.text());
    }
    return res.json() as Promise<T>;
  }
}
