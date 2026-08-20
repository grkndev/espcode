import { IsString, Matches, MaxLength } from 'class-validator';

// POST /api/projects/:id/github-link — §3.1 adım 6. installationId JSON'da
// BigInt serileşmediği için string taşınır, servis içinde BigInt()'e çevrilir.
export class GithubLinkDto {
  @IsString()
  @Matches(/^\d+$/, { message: 'invalid_installation_id' })
  installationId: string;

  @IsString()
  @MaxLength(200)
  @Matches(/^[^/\s]+\/[^/\s]+$/, { message: 'invalid_repo_full_name' })
  repoFullName: string;
}
