import { IsString, IsOptional, IsEnum, IsObject, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ProcessingPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export class ProcessMediaDto {
  @ApiProperty({
    description: 'Media asset ID to process',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  assetId: string;

  @ApiPropertyOptional({
    description: 'Processing priority level',
    enum: ProcessingPriority,
    default: ProcessingPriority.NORMAL,
  })
  @IsOptional()
  @IsEnum(ProcessingPriority)
  priority?: ProcessingPriority;

  @ApiPropertyOptional({
    description: 'Whether to force reprocessing even if already processed',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceReprocess?: boolean;

  @ApiPropertyOptional({
    description: 'Processing options (transformations, optimizations, etc.)',
    example: {
      generateThumbnails: true,
      extractMetadata: true,
      optimizeQuality: 85,
      generateWebP: true,
    },
  })
  @IsOptional()
  @IsObject()
  options?: {
    generateThumbnails?: boolean;
    extractMetadata?: boolean;
    optimizeQuality?: number;
    generateWebP?: boolean;
    generate3DPreview?: boolean;
    extractColorPalette?: boolean;
    generatePerceptualHash?: boolean;
    runVirusScan?: boolean;
  };
}

export class BatchProcessMediaDto {
  @ApiProperty({
    description: 'Array of asset IDs to process',
    type: [String],
  })
  assetIds: string[];

  @ApiPropertyOptional({
    description: 'Processing priority for the batch',
    enum: ProcessingPriority,
  })
  @IsOptional()
  @IsEnum(ProcessingPriority)
  priority?: ProcessingPriority;

  @ApiPropertyOptional({
    description: 'Processing options applied to all assets',
  })
  @IsOptional()
  @IsObject()
  options?: ProcessMediaDto['options'];
}
