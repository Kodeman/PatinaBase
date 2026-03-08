import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsInt, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MILESTONE_STATUS_VALUES, type MilestoneStatus } from '@patina/types';

// Re-export for backwards compatibility
export { type MilestoneStatus } from '@patina/types';

// Enum object for class-validator - values match @patina/types MilestoneStatus
export const MilestoneStatusEnum = {
  PENDING: 'pending' as const,
  IN_PROGRESS: 'in_progress' as const,
  COMPLETED: 'completed' as const,
  DELAYED: 'delayed' as const,
  CANCELLED: 'cancelled' as const,
  BLOCKED: 'blocked' as const,
};

// Validation helper
export const isValidMilestoneStatus = (value: string): value is MilestoneStatus =>
  MILESTONE_STATUS_VALUES.includes(value as MilestoneStatus);

/**
 * Media item for milestone
 */
export class MediaItemDto {
  @ApiPropertyOptional({ description: 'Media ID' })
  @IsString()
  id: string;

  @ApiPropertyOptional({ description: 'Media URL' })
  @IsString()
  url: string;

  @ApiPropertyOptional({ description: 'Media type', enum: ['image', 'video'] })
  @IsString()
  type: 'image' | 'video';

  @ApiPropertyOptional({ description: 'Media caption' })
  @IsOptional()
  @IsString()
  caption?: string;
}

export class UpdateMilestoneDto {
  @ApiPropertyOptional({ description: 'Milestone title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'Milestone description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Target completion date' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({
    description: 'Milestone status',
    enum: Object.values(MilestoneStatusEnum),
  })
  @IsOptional()
  @IsEnum(MilestoneStatusEnum)
  status?: MilestoneStatus;

  @ApiPropertyOptional({ description: 'Display order' })
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({
    description: 'Media attachments',
    type: [MediaItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaItemDto)
  media?: MediaItemDto[];

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}
