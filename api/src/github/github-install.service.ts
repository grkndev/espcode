import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { GithubAppService } from './github-app.service';

const STATE_TTL_SEC = 10 * 60;
const STATE_KEY = (state: string) => `gh-install-state:${state}`;

interface InstallState {
  userId: string;
  projectId: string;
}

interface GithubInstallationInfo {
  account: { login: string };
}

interface GithubRepositoriesResponse {
  repositories: {
    full_name: string;
    default_branch: string;
    private: boolean;
  }[];
}

// master.plan.md §3.1 adım 1-5 — App kurulum akışı. AuthService.buildAuthorizeUrl/
// consumeState deseninin aynısı: state Redis'te 10 dk TTL, tek kullanımlık.
@Injectable()
export class GithubInstallService implements OnModuleDestroy {
  private readonly redis: IORedis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly github: GithubAppService,
  ) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error('REDIS_URL tanımlı değil');
    this.redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async buildInstallUrl(userId: string, projectId: string): Promise<string> {
    const slug = process.env.GITHUB_APP_SLUG;
    if (!slug) throw new Error('GITHUB_APP_SLUG tanımlı değil');

    const state = randomBytes(24).toString('hex');
    await this.redis.set(
      STATE_KEY(state),
      JSON.stringify({ userId, projectId } satisfies InstallState),
      'EX',
      STATE_TTL_SEC,
    );
    return `https://github.com/apps/${slug}/installations/new?state=${state}`;
  }

  private async peekState(state: string): Promise<InstallState | null> {
    const key = STATE_KEY(state);
    const raw = await this.redis.get(key);
    if (!raw) return null;
    await this.redis.del(key);
    return JSON.parse(raw) as InstallState;
  }

  // §3.1 adım 3-4 — kimlik öncelikle state'ten okunur (GitHub yönlendirmesi
  // güvenilir bir same-site bağlamda gelmeyebilir diye cookie'ye değil).
  //
  // Ama GitHub'ın gerçek davranışı canlı testte ortaya çıktı: App zaten
  // hesaba kuruluysa `installations/new?state=…` state'i hiç taşımadan
  // doğrudan kurulum ayarlar sayfasına düşürüyor — yani "zaten kurulu,
  // başka bir projeyi bağlamak istiyorum" senaryosunda state YOK. Aynı
  // şekilde "Redirect on update" da kurulum github.com'dan doğrudan
  // yönetildiğinde bize hiç ait olmayan bir state ile (ya da hiç state'siz)
  // döner. Bu durumlarda ikinci bir kimlik kaynağına düşülür: çağrının
  // kendisiyle gelen espcode oturum çerezi (varsa) — aynı tarayıcıda GitHub'a
  // gidip dönen bir kullanıcı için bu neredeyse her zaman doğru sahibi verir.
  // Hiçbiri yoksa (üçüncü bir kullanıcı kurulumu elden yönetiyor) yalnızca
  // var olan kaydı senkronize ederiz, körlemesine yeni sahiplik atanmaz.
  async completeInstallation(
    state: string | undefined,
    installationId: bigint,
    fallbackUserId: string | null,
  ): Promise<InstallState | null> {
    const pending = state ? await this.peekState(state) : null;
    const info = await this.github.appJson<GithubInstallationInfo>(
      'GET',
      `/app/installations/${installationId}`,
    );

    const ownerId = pending?.userId ?? fallbackUserId;
    if (ownerId) {
      await this.prisma.githubInstallation.upsert({
        where: { installationId },
        create: {
          userId: ownerId,
          installationId,
          accountLogin: info.account.login,
        },
        update: { accountLogin: info.account.login },
      });
    } else {
      await this.prisma.githubInstallation.updateMany({
        where: { installationId },
        data: { accountLogin: info.account.login },
      });
    }
    return pending;
  }

  async listInstallations(userId: string) {
    const rows = await this.prisma.githubInstallation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.installationId.toString(),
      accountLogin: r.accountLogin,
      createdAt: r.createdAt,
    }));
  }

  async listRepos(userId: string, installationId: bigint) {
    const installation = await this.prisma.githubInstallation.findUnique({
      where: { installationId },
    });
    if (!installation || installation.userId !== userId) {
      throw new NotFoundException('installation_not_found');
    }
    const res = await this.github.json<GithubRepositoriesResponse>(
      installationId,
      'GET',
      '/installation/repositories?per_page=100',
    );
    return res.repositories.map((r) => ({
      fullName: r.full_name,
      defaultBranch: r.default_branch,
      private: r.private,
    }));
  }
}
