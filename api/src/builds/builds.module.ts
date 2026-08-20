import { Module } from '@nestjs/common';
import { BuildsController } from './builds.controller';
import { BuildsService } from './builds.service';
import { ArtifactStoreService } from './artifact-store.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [BuildsController],
  providers: [BuildsService, ArtifactStoreService],
  exports: [BuildsService],
})
export class BuildsModule {}
