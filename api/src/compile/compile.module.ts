import { Module } from '@nestjs/common';
import { CompileController } from './compile.controller';
import { CompileService } from './compile.service';
import { BuildsModule } from '../builds/builds.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [BuildsModule, ProjectsModule],
  controllers: [CompileController],
  providers: [CompileService],
})
export class CompileModule {}
