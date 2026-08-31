import {
  IsDateString,
  IsDivisibleBy,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BookingStatus, BookingType } from '../schemas/booking.schema';

export class CreateBookingDto {
  @IsOptional()
  @IsMongoId()
  studentId?: string;

  @IsOptional()
  @IsMongoId()
  professorId?: string;

  @IsOptional()
  @IsMongoId()
  equipmentId?: string;

  @IsOptional()
  @IsMongoId()
  unitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  resourceKey?: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsDateString()
  date!: string;

  @Matches(/^([01]\d|2[0-3]):(?:00|30)$/)
  time!: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(480)
  @IsDivisibleBy(30)
  durationMinutes?: number;

  @IsEnum(BookingType)
  type!: BookingType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
