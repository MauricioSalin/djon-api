import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { MaterialCategoryType } from '../schemas/material-category.schema';

export class CategoryDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsEnum(MaterialCategoryType)
  type?: MaterialCategoryType;
}

export class DeleteCategoryDto {
  @IsOptional()
  @IsMongoId()
  transferToCategoryId?: string;
}
