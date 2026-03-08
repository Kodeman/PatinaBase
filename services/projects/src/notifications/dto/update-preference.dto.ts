import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsString, IsOptional, IsObject, IsEnum } from 'class-validator';

export enum NotificationFrequency {
  IMMEDIATE = 'immediate',
  DAILY_DIGEST = 'daily_digest',
  WEEKLY_DIGEST = 'weekly_digest',
}

export class QuietHours {
  @ApiPropertyOptional({ description: 'Start time (HH:MM format)' })
  start?: string;

  @ApiPropertyOptional({ description: 'End time (HH:MM format)' })
  end?: string;
}

export class UpdatePreferenceDto {
  @ApiPropertyOptional({ description: 'Enable email notifications' })
  @IsBoolean()
  @IsOptional()
  email?: boolean;

  @ApiPropertyOptional({ description: 'Email address for notifications' })
  @IsString()
  @IsOptional()
  emailAddress?: string;

  @ApiPropertyOptional({ description: 'Enable SMS notifications' })
  @IsBoolean()
  @IsOptional()
  sms?: boolean;

  @ApiPropertyOptional({ description: 'Phone number for SMS' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Enable push notifications' })
  @IsBoolean()
  @IsOptional()
  push?: boolean;

  @ApiPropertyOptional({ description: 'Array of push notification device tokens' })
  @IsOptional()
  pushTokens?: string[];

  @ApiPropertyOptional({ description: 'Granular channel preferences by notification type' })
  @IsObject()
  @IsOptional()
  channels?: Record<string, { email?: boolean; sms?: boolean; push?: boolean }>;

  @ApiPropertyOptional({ description: 'Notification frequency', enum: NotificationFrequency })
  @IsEnum(NotificationFrequency)
  @IsOptional()
  frequency?: NotificationFrequency;

  @ApiPropertyOptional({ description: 'Quiet hours configuration', type: QuietHours })
  @IsObject()
  @IsOptional()
  quietHours?: QuietHours;
}
