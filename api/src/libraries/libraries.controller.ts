import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { LibraryIndexService } from './library-index.service';
import { LibraryStoreService } from './library-store.service';
import { SearchLibrariesDto } from './dto/search-libraries.dto';
import { InfoLibrariesDto } from './dto/info-libraries.dto';
import { LibraryDepDto } from './dto/library-dep.dto';

const MAX_INFO_NAMES = 20;
import { BUNDLED_LIBRARIES } from './bundled-libraries';
import { RequireAuthGuard } from '../auth/require-auth.guard';

@Controller('api/libraries')
export class LibrariesController {
  constructor(
    private readonly index: LibraryIndexService,
    private readonly store: LibraryStoreService,
  ) {}

  @Get('search')
  search(@Query() query: SearchLibrariesDto) {
    return this.index.search(query.q ?? '', query.limit);
  }

  @Get('bundled')
  bundled() {
    return BUNDLED_LIBRARIES;
  }

  // WorkspacePanel "PROJEDE" listesi — projeye eklenmiş kütüphanelerin
  // açıklama/yazar bilgisini isme göre toplu getirir (arama sonuçlarında
  // görünmeseler bile).
  @Get('info')
  info(@Query() query: InfoLibrariesDto) {
    const names = (query.names ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, MAX_INFO_NAMES);
    return this.index.getByNames(names);
  }

  // Girişsiz kullanıcı diske yazdırmasın — anonim derleme akışı (compile
  // uçları) zaten kütüphanesiz sketch'lerle çalışır.
  @Post('install')
  @UseGuards(RequireAuthGuard)
  async install(@Body() dto: LibraryDepDto) {
    const resolved = await this.store.ensureInstalled([dto]);
    return { resolved };
  }
}
