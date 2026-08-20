import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ArtifactKind = 'bin' | 'elf';

// master.plan.md §5 "Artifact erişimi: imzalı URL, public değil" — R2 henüz
// bağlı değil (backend.plan.md §6.2), bu servis onun yerini tutan yerel disk
// stand-in'i. Sözleşme aynı kalıyor (içerik-adresli anahtar, kısa ömürlü
// imzalı URL) — gerçek R2'ye geçişte yalnızca bu dosyanın içi değişir.
@Injectable()
export class ArtifactStoreService {
  private readonly dir =
    process.env.ARTIFACT_DIR ?? path.join(process.cwd(), '.artifacts');
  private readonly signTtlSec = Number(
    process.env.ARTIFACT_SIGN_TTL_SEC ?? '300',
  );
  private readonly secret =
    process.env.SESSION_SECRET ?? 'dev-only-insecure-secret';

  private artifactPath(buildKey: string, kind: ArtifactKind): string {
    return path.join(this.dir, `${buildKey}.${kind}`);
  }

  async write(
    buildKey: string,
    kind: ArtifactKind,
    data: Buffer,
  ): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.artifactPath(buildKey, kind), data);
  }

  async exists(buildKey: string, kind: ArtifactKind): Promise<boolean> {
    try {
      await stat(this.artifactPath(buildKey, kind));
      return true;
    } catch {
      return false;
    }
  }

  async read(buildKey: string, kind: ArtifactKind): Promise<Buffer | null> {
    try {
      return await readFile(this.artifactPath(buildKey, kind));
    } catch {
      return null;
    }
  }

  private sign(
    buildKey: string,
    kind: ArtifactKind,
    expiresAt: number,
  ): string {
    return createHmac('sha256', this.secret)
      .update(`${buildKey}:${kind}:${expiresAt}`)
      .digest('hex');
  }

  // Gerçek imzalı R2 URL'in yerini tutan token — {exp, sig} query paramları.
  buildSignedPath(buildKey: string, kind: ArtifactKind): string {
    const expiresAt = Date.now() + this.signTtlSec * 1000;
    const sig = this.sign(buildKey, kind, expiresAt);
    const params = new URLSearchParams({
      asset: kind,
      exp: String(expiresAt),
      sig,
    });
    return `/api/artifacts/${buildKey}?${params.toString()}`;
  }

  verify(
    buildKey: string,
    kind: ArtifactKind,
    expiresAt: number,
    sig: string,
  ): boolean {
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
    const expected = Buffer.from(this.sign(buildKey, kind, expiresAt), 'hex');
    const actual = Buffer.from(sig, 'hex');
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  }
}
