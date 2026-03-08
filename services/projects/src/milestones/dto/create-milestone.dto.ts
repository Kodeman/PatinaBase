import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsInt, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Media item for milestone
 */
export class MediaItemDto {
  @ApiProperty({ description: 'Media ID' })
  @IsString()
  id: string;

  @ApiProperty({ description: 'Media URL' })
  @IsString()
  url: string;

  @ApiProperty({ description: 'Media type', enum: ['image', 'video'] })
  @IsString()
  type: 'image' | 'video';

  @ApiPropertyOptional({ description: 'Media caption' })
  @IsOptional()
  @IsString()
  caption?: string;
}

export class CreateMilestoneDto {
  @ApiProperty({ description: 'Milestone title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Milestone description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Target completion date' })
  @IsDateString()
  targetDate: string;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({
    description: 'Media attachments',
    type: [MediaItemDto],
    example: [{ id: 'media-123', url: 'https://...', type: 'image', caption: 'Milestone photo' }]
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
