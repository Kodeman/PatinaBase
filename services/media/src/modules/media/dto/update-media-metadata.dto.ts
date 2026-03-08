import { IsString, IsOptional, IsArray, IsBoolean, IsEnum, IsObject, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MediaRole } from './upload-media.dto';

export class UpdateMediaMetadataDto {
  @ApiPropertyOptional({
    description: 'New role for the media asset',
    enum: MediaRole,
  })
  @IsOptional()
  @IsEnum(MediaRole)
  role?: MediaRole;

  @ApiPropertyOptional({
    description: 'Updated tags for the asset',
    type: [String],
    example: ['furniture', 'modern', 'sofa'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Updated public access setting',
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    description: 'Updated license type',
  })
  @IsOptional()
  @IsString()
  licenseType?: string;

  @ApiPropertyOptional({
    description: 'Updated attribution text',
  })
  @IsOptional()
  @IsString()
  attribution?: string;

  @ApiPropertyOptional({
    description: 'Custom metadata to merge with existing metadata',
    example: {
      photographer: 'John Doe',
      location: 'Studio A',
      shootDate: '2025-10-01',
    },
  })
  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Image width (for manual correction)',
  })
  @IsOptional()
  @IsNumber()
  width?: number;

  @ApiPropertyOptional({
    description: 'Image height (for manual correction)',
  })
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional({
    description: 'Asset format/extension',
  })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional({
    description: 'Access control permissions',
    example: {
      users: ['user-id-1', 'user-id-2'],
      roles: ['designer', 'admin'],
    },
  })
  @IsOptional()
  @IsObject()
  permissions?: Record<string, any>;
}
