import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ALLOWED_FQBN } from '../allowed-fqbn';

// frontend.plan.md §3.2 — düz dosya adı, izin verilen uzantı (worker.js'in
// FILE_NAME_RE'siyle aynı).
const FILE_NAME_RE = /^[\w.-]+\.(ino|cpp|h|hpp)$/;

// master.plan.md §3 Kotalar — sketch toplam boyutu 256 KB
const MAX_TOTAL_BYTES = 256 * 1024;
const MAX_FILES = 20;

export class SketchFileDto {
  @IsString()
  @Matches(FILE_NAME_RE, { message: 'invalid_file_name' })
  path: string;

  @IsString()
  @MaxLength(MAX_TOTAL_BYTES)
  content: string;
}

export class CompileRequestDto {
  @ValidateNested({ each: true })
  @Type(() => SketchFileDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_FILES)
  files: SketchFileDto[];

  @IsString()
  @IsIn(Array.from(ALLOWED_FQBN), { message: 'unsupported_board' })
  fqbn: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, string>;

  // master.plan.md §5 — verilirse ve derleme başarılıysa sunucu bu proje için
  // bir project_versions satırı yazar (yalnızca giriş yapılmışsa; §6).
  @IsOptional()
  @IsString()
  projectId?: string;
}

export function totalSourceBytes(files: SketchFileDto[]): number {
  return files.reduce(
    (sum, f) => sum + Buffer.byteLength(f.content, 'utf8'),
    0,
  );
}

export const MAX_TOTAL_SOURCE_BYTES = MAX_TOTAL_BYTES;
