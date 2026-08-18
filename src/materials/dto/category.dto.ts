import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class CategoryDto {
  @IsString()
  @MaxLength(100)
  name!: string;
}

export class DeleteCategoryDto {
  @IsOptional()
  @IsMongoId()
  transferToCategoryId?: string;
}
