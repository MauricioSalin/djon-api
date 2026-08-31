import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

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

  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  spotify?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  pressKit?: string;
}
