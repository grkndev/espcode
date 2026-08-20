import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ALLOWED_FQBN } from '../../compile/allowed-fqbn';
import { ProjectFileDto } from './project-file.dto';

const MAX_FILES = 20;

export class CreateProjectDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsIn(Array.from(ALLOWED_FQBN), { message: 'unsupported_board' })
  fqbn: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectFileDto)
  @ArrayMaxSize(MAX_FILES)
  files?: ProjectFileDto[];
}
