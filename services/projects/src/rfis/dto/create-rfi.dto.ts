import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsUUID, IsEnum } from 'class-validator';

export enum RFIStatus {
  OPEN = 'open',
  ANSWERED = 'answered',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

export enum RFIPriority {
  NORMAL = 'normal',
  URGENT = 'urgent',
}

export class CreateRFIDto {
  @ApiProperty({ description: 'RFI title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'RFI question/description' })
  @IsString()
  question: string;

  @ApiPropertyOptional({ description: 'User ID to assign RFI to' })
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Due date for response' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Priority level', enum: RFIPriority, default: 'normal' })
  @IsOptional()
  @IsEnum(RFIPriority)
  priority?: RFIPriority;

  @ApiPropertyOptional({ description: 'Additional metadata (attachments, etc.)' })
  @IsOptional()
  metadata?: Record<string, any>;
}
