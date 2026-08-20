import { Body, Controller, Param, Post, Sse } from '@nestjs/common';
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

  // frontend.plan.md §8.2 — SSE. projectId/userId artık job'ın kendi verisinde
  // taşınıyor (bkz. compile.service.ts), bu yüzden burada query param/oturum
  // gerekmiyor — hangi istemci izlerse izlesin aynı, önceden hazırlanmış
  // sonucu okur.
  @Sse('jobs/:id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return this.compileService.streamJob(id);
  }
}
