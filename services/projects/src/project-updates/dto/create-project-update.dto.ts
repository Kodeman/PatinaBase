import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Media item for project update
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

/**
 * DTO for creating a project update
 */
export class CreateProjectUpdateDto {
  @ApiProperty({ description: 'Update title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Update content' })
  @IsString()
  content: string;

  @ApiPropertyOptional({
    description: 'Media attachments',
    type: [MediaItemDto],
    example: [{ id: 'media-123', url: 'https://...', type: 'image', caption: 'Progress photo' }]
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
