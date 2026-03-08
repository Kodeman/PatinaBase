import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsEnum } from 'class-validator';

export enum IssueSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum IssueStatus {
  OPEN = 'open',
  INVESTIGATING = 'investigating',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  WONT_FIX = 'wont_fix',
}

export class CreateIssueDto {
  @ApiProperty({ description: 'Issue title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Issue description' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'User ID to assign issue to' })
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Issue severity', enum: IssueSeverity, default: 'medium' })
  @IsOptional()
  @IsEnum(IssueSeverity)
  severity?: IssueSeverity;

  @ApiPropertyOptional({ description: 'Additional metadata (photos, location, etc.)' })
  @IsOptional()
  metadata?: Record<string, any>;
}
