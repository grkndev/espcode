import { Body, Controller, Param, Post, Query, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { CompileService } from './compile.service';
import { CompileRequestDto } from './dto/compile-request.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/request-user';

@Controller('api')
export class CompileController {
  constructor(private readonly compileService: CompileService) {}

  // frontend.plan.md §8.1 — { cached: true, ... } veya { cached: false, jobId }
  // Auth zorunlu değil (§4.2, anonim kullanım) — projectId yalnızca girişliyken anlamlı.
  @Post('compile')
  async compile(
    @Body() dto: CompileRequestDto,
    @CurrentUser() user: RequestUser | null,
  ) {
    return this.compileService.compile(dto, user?.id ?? null);
  }

  // frontend.plan.md §8.2 — SSE, ?buildKey= başarı durumunda cache'e yazmak için
  @Sse('jobs/:id/stream')
  stream(
    @Param('id') id: string,
    @Query('buildKey') buildKey: string | undefined,
    @Query('projectId') projectId: string | undefined,
    @CurrentUser() user: RequestUser | null,
  ): Observable<MessageEvent> {
    return this.compileService.streamJob(
      id,
      buildKey ?? '',
      user?.id ?? null,
      projectId,
    );
  }
}
