import { IsBoolean, IsOptional, IsString, IsUrl } from 'class-validator';

export class PushSubscriptionDto {
  @IsUrl({ require_tld: false })
  endpoint!: string;

  @IsString()
  p256dh!: string;

  @IsString()
  auth!: string;

  @IsOptional()
  @IsBoolean()
  confirmActivation?: boolean;
}
