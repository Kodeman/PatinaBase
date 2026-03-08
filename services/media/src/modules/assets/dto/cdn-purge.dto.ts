import { IsArray, IsString, IsOptional, IsBoolean, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PurgeCdnDto {
  @ApiProperty({
    description: 'Array of asset IDs to purge from CDN',
    type: [String],
    example: ['uuid1', 'uuid2'],
    required: false
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  assetIds?: string[];

  @ApiProperty({
    description: 'Array of URL paths to purge',
    type: [String],
    example: ['/processed/images/*', '/thumbnails/product-123/*'],
    required: false
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  paths?: string[];

  @ApiProperty({
    description: 'Product ID - purge all images for this product',
    required: false
  })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({
    description: 'Purge entire CDN cache (use with caution)',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  purgeAll?: boolean;

  @ApiProperty({
    description: 'Also purge renditions',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  includeRenditions?: boolean;
}
