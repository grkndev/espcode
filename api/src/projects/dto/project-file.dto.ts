import { IsString, Matches, MaxLength } from 'class-validator';

// api/src/compile/dto/compile-request.dto.ts'teki SketchFileDto ile aynı kural.
const FILE_NAME_RE = /^[\w.-]+\.(ino|cpp|h|hpp)$/;
const MAX_FILE_BYTES = 256 * 1024;

export class ProjectFileDto {
  @IsString()
  @Matches(FILE_NAME_RE, { message: 'invalid_file_name' })
  path: string;

  @IsString()
  @MaxLength(MAX_FILE_BYTES)
  content: string;
}
