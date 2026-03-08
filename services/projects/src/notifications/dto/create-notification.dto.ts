import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsObject } from 'class-validator';

export enum NotificationType {
  APPROVAL_REQUESTED = 'approval_requested',
  STATUS_UPDATE = 'status_update',
  COMMENT = 'comment',
  MILESTONE = 'milestone',
  DEADLINE = 'deadline',
  DOCUMENT_UPLOADED = 'document_uploaded',
  CHANGE_ORDER = 'change_order',
  RFI = 'rfi',
  ISSUE = 'issue',
  DAILY_LOG = 'daily_log',
}

export enum NotificationPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export class NotificationChannels {
  @ApiPropertyOptional({ description: 'Send via email' })
  email?: boolean;

  @ApiPropertyOptional({ description: 'Send via SMS' })
  sms?: boolean;

  @ApiPropertyOptional({ description: 'Send via push notification' })
  push?: boolean;
}

export class CreateNotificationDto {
  @ApiProperty({ description: 'User ID to send notification to' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({ description: 'Project ID (if related to a project)' })
  @IsString()
  @IsOptional()
  projectId?: string;

  @ApiProperty({ description: 'Notification type', enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ description: 'Notification priority', enum: NotificationPriority })
  @IsEnum(NotificationPriority)
  @IsOptional()
  priority?: NotificationPriority;

  @ApiProperty({ description: 'Notification title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'Notification message' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiPropertyOptional({ description: 'Action URL (deep link)' })
  @IsString()
  @IsOptional()
  actionUrl?: string;

  @ApiPropertyOptional({ description: 'Delivery channels', type: NotificationChannels })
  @IsObject()
  @IsOptional()
  channels?: NotificationChannels;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}
