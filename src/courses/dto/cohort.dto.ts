import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDivisibleBy,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateCohortDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsMongoId()
  courseId!: string;

  @IsMongoId()
  unitId!: string;

  @IsMongoId()
  professorId!: string;

  @IsMongoId()
  equipmentId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsMongoId({ each: true })
  studentIds!: string[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  lessonCount!: number;

  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(480)
  @IsDivisibleBy(30)
  durationMinutes!: number;
}

export class ConfigureLessonDto {
  @IsMongoId()
  materialId!: string;

  @IsDateString()
  date!: string;

  @Matches(/^([01]\d|2[0-3]):(?:00|30)$/)
  time!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class ConfigureCohortLessonsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ConfigureLessonDto)
  lessons!: ConfigureLessonDto[];
}

export class CreateCohortWithLessonsDto extends CreateCohortDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ConfigureLessonDto)
  lessons!: ConfigureLessonDto[];
}

export class UpdateAttendanceDto {
  @IsMongoId()
  studentId!: string;

  @IsOptional()
  @IsBoolean()
  present?: boolean;

  @IsOptional()
  @IsBoolean()
  materialReleased?: boolean;
}
