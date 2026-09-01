import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdatePortalContentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  banner?: string | null;
}
