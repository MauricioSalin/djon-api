import { IsObject } from 'class-validator';

export class UpdateLandingContentDto {
  @IsObject()
  data!: Record<string, unknown>;
}
