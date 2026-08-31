import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class LatestReleaseDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  link?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cover?: string;
}
