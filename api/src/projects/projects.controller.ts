import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CommitProjectDto } from './dto/commit-project.dto';
import { GithubLinkDto } from './dto/github-link.dto';
import { RequireAuthGuard } from '../auth/require-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/request-user';

@Controller('api')
@UseGuards(RequireAuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get('projects')
  list(@CurrentUser() user: RequestUser) {
    return this.projects.list(user.id);
  }

  @Post('projects')
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user.id, dto);
  }

  @Get('projects/:id')
  get(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.projects.get(user.id, id);
  }

  @Patch('projects/:id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(user.id, id, dto);
  }

  @Delete('projects/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.projects.remove(user.id, id);
  }

  @Get('projects/:id/versions')
  listVersions(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.projects.listVersions(user.id, id);
  }

  @Get('projects/:id/versions/:versionId')
  getVersionInProject(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.projects.getVersionInProject(user.id, id, versionId);
  }

  // Eski uç — yalnızca postgres sağlayıcılı projelerin uuid versiyon
  // kimlikleri için anlamlı, github commit sha'ları için kullanılmaz.
  @Get('versions/:id')
  getVersion(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.projects.getVersion(user.id, id);
  }

  // Flash'tan bağımsız manuel kaydetme — her iki sağlayıcıda da çalışır.
  @Post('projects/:id/commit')
  async commit(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CommitProjectDto,
  ) {
    const result = await this.projects.commit(user.id, id, dto);
    if (result.ok) return result;
    if (result.reason === 'conflict') {
      throw new ConflictException({
        error: 'github_conflict',
        paths: result.paths,
      });
    }
    throw new ConflictException({ error: 'github_link_broken' });
  }

  @Post('projects/:id/github-link')
  linkGithub(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: GithubLinkDto,
  ) {
    return this.projects.linkGithub(user.id, id, dto);
  }

  @Delete('projects/:id/github-link')
  unlinkGithub(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.projects.unlinkGithub(user.id, id);
  }
}
