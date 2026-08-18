import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
