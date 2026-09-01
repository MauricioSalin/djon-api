import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @Matches(/^\d{10,11}$/, {
    message: 'O WhatsApp deve conter DDD e número.',
  })
  whatsapp!: string;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  unitKey?: string;
}
