import { IsString, IsOptional, IsEnum, IsNumber, IsArray, IsBoolean, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum MediaKind {
  IMAGE = 'image',
  VIDEO = 'video',
  MODEL_3D = 'model3d',
}

export enum MediaRole {
  HERO = 'hero',
  ANGLE = 'angle',
  LIFESTYLE = 'lifestyle',
  DETAIL = 'detail',
  AR_PREVIEW = 'ar-preview',
}

export class UploadMediaDto {
  @ApiProperty({
    description: 'Type of media asset',
    enum: MediaKind,
    example: MediaKind.IMAGE,
  })
  @IsEnum(MediaKind)
  kind: MediaKind;

  @ApiProperty({
    description: 'Original filename of the asset',
    example: 'modern-sofa-hero.jpg',
  })
  @IsString()
  @MaxLength(255)
  filename: string;

  @ApiPropertyOptional({
    description: 'File size in bytes',
    example: 2048576,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fileSize?: number;

  @ApiPropertyOptional({
    description: 'MIME type of the file',
    example: 'image/jpeg',
  })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({
    description: 'Product ID this asset belongs to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({
    description: 'Variant ID this asset belongs to',
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiPropertyOptional({
    description: 'Role/purpose of the media asset',
    enum: MediaRole,
    example: MediaRole.HERO,
  })
  @IsOptional()
  @IsEnum(MediaRole)
  role?: MediaRole;

  @ApiPropertyOptional({
    description: 'Tags for asset organization',
    type: [String],
    example: ['furniture', 'modern', 'living-room'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Whether the asset should be publicly accessible',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    description: 'License type for the asset',
    example: 'commercial',
  })
  @IsOptional()
  @IsString()
  licenseType?: string;

  @ApiPropertyOptional({
    description: 'Attribution text if required',
    example: 'Photo by John Doe',
  })
  @IsOptional()
  @IsString()
  attribution?: string;
}

export class BatchUploadMediaDto {
  @ApiProperty({
    description: 'Array of media assets to upload',
    type: [UploadMediaDto],
  })
  @IsArray()
  uploads: UploadMediaDto[];
}
