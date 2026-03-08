import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsEnum } from 'class-validator';

export enum ActivityType {
  VIEW = 'view',
  COMMENT = 'comment',
  APPROVE = 'approve',
  REJECT = 'reject',
  UPLOAD = 'upload',
  DOWNLOAD = 'download',
  DISCUSS = 'discuss',
}

export enum EntityType {
  SEGMENT = 'segment',
  APPROVAL = 'approval',
  DOCUMENT = 'document',
  TASK = 'task',
  MILESTONE = 'milestone',
}

export class LogActivityDto {
  @ApiPropertyOptional({ description: 'Timeline segment ID (if applicable)' })
  @IsString()
  @IsOptional()
  segmentId?: string;

  @ApiProperty({ description: 'Activity type', enum: ActivityType })
  @IsEnum(ActivityType)
  activityType: ActivityType;

  @ApiPropertyOptional({ description: 'Entity type being acted upon', enum: EntityType })
  @IsEnum(EntityType)
  @IsOptional()
  entityType?: EntityType;

  @ApiPropertyOptional({ description: 'Entity ID being acted upon' })
  @IsString()
  @IsOptional()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Duration in seconds (for view activities)', minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  duration?: number;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}
