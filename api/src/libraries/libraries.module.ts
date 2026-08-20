import { Module } from '@nestjs/common';
import { LibrariesController } from './libraries.controller';
import { LibraryIndexService } from './library-index.service';
import { LibraryStoreService } from './library-store.service';

@Module({
  controllers: [LibrariesController],
  providers: [LibraryIndexService, LibraryStoreService],
  exports: [LibraryIndexService, LibraryStoreService],
})
export class LibrariesModule {}
