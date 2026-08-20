import { IsOptional, IsString, MaxLength } from 'class-validator';

export class InfoLibrariesDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  names?: string; // virgülle ayrılmış kütüphane adları
}
