import { Module } from '@nestjs/common';
import { CompileController } from './compile.controller';
import { CompileService } from './compile.service';
import { BuildsModule } from '../builds/builds.module';
import { ProjectsModule } from '../projects/projects.module';
import { LibrariesModule } from '../libraries/libraries.module';

@Module({
  imports: [BuildsModule, ProjectsModule, LibrariesModule],
  controllers: [CompileController],
  providers: [CompileService],
})
export class CompileModule {}
