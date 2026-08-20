import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ALLOWED_FQBN } from '../../compile/allowed-fqbn';
import { ProjectFileDto } from './project-file.dto';
import { LibraryDepDto } from '../../libraries/dto/library-dep.dto';

const MAX_FILES = 20;

// POST /api/projects/:id/commit — flash'tan bağımsız manuel kaydetme.
export class CommitProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  message: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectFileDto)
  @ArrayMaxSize(MAX_FILES)
  files: ProjectFileDto[];

  @IsString()
  @IsIn(Array.from(ALLOWED_FQBN), { message: 'unsupported_board' })
  fqbn: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LibraryDepDto)
  @ArrayMaxSize(20)
  libraries?: LibraryDepDto[];

  // github sağlayıcısında sha çakışmasından sonra kullanıcı onayıyla tekrar
  // gönderilir — master.plan.md §3.1 "otomatik merge yok".
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
