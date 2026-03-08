import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export enum ChangeOrderStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  IMPLEMENTED = 'implemented',
}

export class CreateChangeOrderDto {
  @ApiProperty({ description: 'Change order title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Detailed description of the change' })
  @IsString()
  description: string;

  @ApiPropertyOptional({ description: 'Cost impact (positive or negative)', example: 5000.00 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  costImpact?: number;

  @ApiPropertyOptional({ description: 'Schedule impact in days (positive = delay, negative = acceleration)' })
  @IsOptional()
  @IsInt()
  scheduleImpact?: number;

  @ApiPropertyOptional({ description: 'Additional metadata (attachments, drawings, etc.)' })
  @IsOptional()
  metadata?: Record<string, any>;
}
