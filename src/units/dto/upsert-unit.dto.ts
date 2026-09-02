import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpsertUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  key?: string;

  @IsString()
  @MaxLength(150)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  shortLabel?: string;

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
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  instagram?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  facebook?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  openingHours?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
