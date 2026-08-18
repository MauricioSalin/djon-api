import {
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateNotificationDto {
  @IsMongoId({ each: true })
  recipientIds!: string[];

  @IsString()
  @MaxLength(100)
  type!: string;

  @IsString()
  @MaxLength(150)
  title!: string;

  @IsString()
  @MaxLength(1000)
  body!: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
