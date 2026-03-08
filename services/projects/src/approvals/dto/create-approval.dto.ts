import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsDateString, IsEnum, IsArray } from 'class-validator';
import {
  APPROVAL_TYPE_VALUES,
  APPROVAL_PRIORITY_VALUES,
  type ApprovalType,
  type ApprovalPriority,
} from '@patina/types';

// Re-export for backwards compatibility
export { type ApprovalType, type ApprovalPriority, type ApprovalStatus } from '@patina/types';

// Enum objects for class-validator - values match @patina/types
export const ApprovalTypeEnum = {
  DESIGN_CONCEPT: 'design_concept' as const,
  MATERIAL_SELECTION: 'material_selection' as const,
  BUDGET_CHANGE: 'budget_change' as const,
  TIMELINE_CHANGE: 'timeline_change' as const,
  FINAL_DELIVERY: 'final_delivery' as const,
  MILESTONE: 'milestone' as const,
  CHANGE_ORDER: 'change_order' as const,
  GENERAL: 'general' as const,
};

export const ApprovalPriorityEnum = {
  LOW: 'low' as const,
  NORMAL: 'normal' as const,
  HIGH: 'high' as const,
  URGENT: 'urgent' as const,
};

// Validation helpers
export const isValidApprovalType = (value: string): value is ApprovalType =>
  APPROVAL_TYPE_VALUES.includes(value as ApprovalType);

export const isValidApprovalPriority = (value: string): value is ApprovalPriority =>
  APPROVAL_PRIORITY_VALUES.includes(value as ApprovalPriority);

export class CreateApprovalDto {
  @ApiPropertyOptional({ description: 'Timeline segment ID (if related to a segment)' })
  @IsString()
  @IsOptional()
  segmentId?: string;

  @ApiProperty({ description: 'Approval title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Approval description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Approval type',
    enum: Object.values(ApprovalTypeEnum),
  })
  @IsEnum(ApprovalTypeEnum)
  approvalType: ApprovalType;

  @ApiProperty({
    description: 'Priority',
    enum: Object.values(ApprovalPriorityEnum),
  })
  @IsEnum(ApprovalPriorityEnum)
  @IsOptional()
  priority?: ApprovalPriority;

  @ApiProperty({ description: 'Client user ID to assign approval to' })
  @IsString()
  @IsNotEmpty()
  assignedTo: string;

  @ApiPropertyOptional({ description: 'Due date for approval' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Array of document IDs/keys', type: [String] })
  @IsArray()
  @IsOptional()
  documents?: string[];

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}
