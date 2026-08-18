import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpsertUnitDto {
  @IsString()
  @MaxLength(50)
  key!: string;

  @IsString()
  @MaxLength(150)
  label!: string;

  @IsString()
  @MaxLength(50)
  shortLabel!: string;

  @IsString()
  @MaxLength(300)
  address!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  mapSrc?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  mapsHref?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
