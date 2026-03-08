import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Media item for response
 */
export class MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  caption?: string;
}

/**
 * Author information
 */
export class AuthorInfo {
  id: string;
  name: string;
  avatar?: string;
}

/**
 * Response DTO for project update
 */
export class ProjectUpdateResponseDto {
  @ApiProperty({ description: 'Update ID' })
  id: string;

  @ApiProperty({ description: 'Project ID' })
  projectId: string;

  @ApiProperty({ description: 'Update title' })
  title: string;

  @ApiProperty({ description: 'Update content' })
  content: string;

  @ApiProperty({ description: 'Author ID' })
  authorId: string;

  @ApiPropertyOptional({ description: 'Media attachments', type: [MediaItem] })
  media?: MediaItem[];

  @ApiPropertyOptional({ description: 'Author information' })
  author?: AuthorInfo;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  metadata?: Record<string, any>;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  updatedAt: Date;
}
