import { IsString, IsOptional, IsEnum, IsArray, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MediaKind, MediaRole } from './upload-media.dto';
import { Type } from 'class-transformer';

export enum MediaStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ARCHIVED = 'archived',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export enum SortBy {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  FILE_SIZE = 'sizeBytes',
  VIEW_COUNT = 'viewCount',
  DOWNLOAD_COUNT = 'downloadCount',
}

export class MediaQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by media kind',
    enum: MediaKind,
  })
  @IsOptional()
  @IsEnum(MediaKind)
  kind?: MediaKind;

  @ApiPropertyOptional({
    description: 'Filter by product ID',
  })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({
    description: 'Filter by variant ID',
  })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiPropertyOptional({
    description: 'Filter by media role',
    enum: MediaRole,
  })
  @IsOptional()
  @IsEnum(MediaRole)
  role?: MediaRole;

  @ApiPropertyOptional({
    description: 'Filter by processing status',
    enum: MediaStatus,
  })
  @IsOptional()
  @IsEnum(MediaStatus)
  status?: MediaStatus;

  @ApiPropertyOptional({
    description: 'Filter by tags (any of the provided tags)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Filter by uploader user ID',
  })
  @IsOptional()
  @IsString()
  uploadedBy?: string;

  @ApiPropertyOptional({
    description: 'Filter by public/private status',
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    description: 'Search term for filename or tags',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by MIME type',
  })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({
    description: 'Minimum file size in bytes',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  minSize?: number;

  @ApiPropertyOptional({
    description: 'Maximum file size in bytes',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  maxSize?: number;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    default: 20,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Sort by field',
    enum: SortBy,
    default: SortBy.CREATED_AT,
  })
  @IsOptional()
  @IsEnum(SortBy)
  sortBy?: SortBy;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @ApiPropertyOptional({
    description: 'Include only processed assets',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  processedOnly?: boolean;
}

export class MediaResponseDto {
  id: string;
  kind: string;
  productId?: string;
  variantId?: string;
  role?: string;
  rawKey: string;
  uri?: string;
  width?: number;
  height?: number;
  format?: string;
  status: string;
  tags: string[];
  viewCount: number;
  downloadCount: number;
  sizeBytes?: string;
  mimeType?: string;
  isPublic: boolean;
  uploadedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MediaListResponseDto {
  data: MediaResponseDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
