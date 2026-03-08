import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsUUID, IsEnum } from 'class-validator';
import { RFIStatus, RFIPriority } from './create-rfi.dto';

export class UpdateRFIDto {
  @ApiPropertyOptional({ description: 'RFI title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'RFI question/description' })
  @IsOptional()
  @IsString()
  question?: string;

  @ApiPropertyOptional({ description: 'RFI answer' })
  @IsOptional()
  @IsString()
  answer?: string;

  @ApiPropertyOptional({ description: 'User ID to assign RFI to' })
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional({ description: 'Due date for response' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'RFI status', enum: RFIStatus })
  @IsOptional()
  @IsEnum(RFIStatus)
  status?: RFIStatus;

  @ApiPropertyOptional({ description: 'Priority level', enum: RFIPriority })
  @IsOptional()
  @IsEnum(RFIPriority)
  priority?: RFIPriority;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}
