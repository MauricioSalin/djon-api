import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { EventType } from '../schemas/event.schema';

export class CreateEventDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsDateString()
  date!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  time!: string;

  @IsString()
  @MaxLength(300)
  location!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  instagram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  description?: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;
}
