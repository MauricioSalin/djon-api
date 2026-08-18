import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { MaterialAttachmentType } from '../schemas/material.schema';

export class MaterialAttachmentDto {
  @IsOptional()
  @IsString()
  legacyId?: string;

  @IsString()
  @MaxLength(255)
  name!: string;

  @IsEnum(MaterialAttachmentType)
  type!: MaterialAttachmentType;

  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  size?: string;
}
