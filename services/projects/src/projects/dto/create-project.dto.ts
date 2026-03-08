import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsNumber, IsUUID, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { PROJECT_STATUS_VALUES, type ProjectStatus } from '@patina/types';

// Re-export for backwards compatibility with existing imports
export { type ProjectStatus } from '@patina/types';

// Enum for class-validator - values match @patina/types ProjectStatus
export const ProjectStatusEnum = {
  DRAFT: 'draft' as const,
  PENDING_APPROVAL: 'pending_approval' as const,
  ACTIVE: 'active' as const,
  ON_HOLD: 'on_hold' as const,
  COMPLETED: 'completed' as const,
  CLOSED: 'closed' as const,
  CANCELLED: 'cancelled' as const,
  SUBSTANTIAL_COMPLETION: 'substantial_completion' as const,
};

// Validation helper
export const isValidProjectStatus = (value: string): value is ProjectStatus =>
  PROJECT_STATUS_VALUES.includes(value as ProjectStatus);

export class CreateProjectDto {
  @ApiPropertyOptional({ description: 'ID of approved proposal to import from' })
  @IsOptional()
  @IsUUID()
  proposalId?: string;

  @ApiProperty({ description: 'Project title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Client user ID' })
  @IsUUID()
  clientId: string;

  @ApiProperty({ description: 'Designer user ID' })
  @IsUUID()
  designerId: string;

  @ApiPropertyOptional({ description: 'Project start date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Estimated end date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Project budget' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  budget?: number;

  @ApiPropertyOptional({ description: 'Currency code', default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Project description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}
