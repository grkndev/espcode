import { Module } from '@nestjs/common';
import { GithubController } from './github.controller';
import { GithubAppService } from './github-app.service';
import { GithubInstallService } from './github-install.service';
import { GithubStorageService } from './github-storage.service';

@Module({
  controllers: [GithubController],
  providers: [GithubAppService, GithubInstallService, GithubStorageService],
  exports: [GithubAppService, GithubStorageService],
})
export class GithubModule {}
