import { PartialType } from '@nestjs/swagger';
import { CreateTimelineSegmentDto } from './create-timeline-segment.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum TimelineSegmentStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  DELAYED = 'delayed',
}

export class UpdateTimelineSegmentDto extends PartialType(CreateTimelineSegmentDto) {
  @ApiPropertyOptional({ description: 'Segment status', enum: TimelineSegmentStatus })
  @IsEnum(TimelineSegmentStatus)
  @IsOptional()
  status?: TimelineSegmentStatus;
}
