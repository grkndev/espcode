import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { PostgresProjectStorage } from './storage/postgres-storage.service';
import { AuthModule } from '../auth/auth.module';
import { GithubModule } from '../github/github.module';

@Module({
  imports: [AuthModule, GithubModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, PostgresProjectStorage],
  exports: [ProjectsService],
})
export class ProjectsModule {}
