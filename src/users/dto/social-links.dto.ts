import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SocialLinksDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  instagram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  soundcloud?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  youtube?: string;
}
