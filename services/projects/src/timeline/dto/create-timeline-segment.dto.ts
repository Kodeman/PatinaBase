import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsDateString, IsOptional, IsInt, Min, Max, IsArray, IsEnum } from 'class-validator';

export enum TimelinePhase {
  PLANNING = 'planning',
  DESIGN = 'design',
  PROCUREMENT = 'procurement',
  CONSTRUCTION = 'construction',
  COMPLETION = 'completion',
}

export class CreateTimelineSegmentDto {
  @ApiProperty({ description: 'Segment title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ description: 'Segment description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Project phase', enum: TimelinePhase })
  @IsEnum(TimelinePhase)
  phase: TimelinePhase;

  @ApiProperty({ description: 'Segment start date' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Segment end date' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Progress percentage (0-100)', minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  progress?: number;

  @ApiPropertyOptional({ description: 'Array of dependent segment IDs', type: [String] })
  @IsArray()
  @IsOptional()
  dependencies?: string[];

  @ApiPropertyOptional({ description: 'Array of deliverable descriptions', type: [String] })
  @IsArray()
  @IsOptional()
  deliverables?: string[];

  @ApiPropertyOptional({ description: 'Display order' })
  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}
