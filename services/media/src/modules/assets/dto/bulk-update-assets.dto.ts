import { IsArray, IsOptional, IsString, IsBoolean, IsEnum, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { AssetRole } from '../../../generated/prisma-client';

export class AssetUpdates {
  @ApiProperty({ description: 'Asset role', required: false, enum: AssetRole })
  @IsOptional()
  @IsEnum(AssetRole)
  role?: AssetRole;

  @ApiProperty({ description: 'Product ID', required: false })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty({ description: 'Variant ID', required: false })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({ description: 'Public visibility', required: false })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiProperty({ description: 'Tags array', required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ description: 'Sort order', required: false })
  @IsOptional()
  sortOrder?: number;

  @ApiProperty({ description: 'License information', required: false })
  @IsOptional()
  license?: any;
}

export class BulkUpdateAssetsDto {
  @ApiProperty({
    description: 'Array of asset IDs to update',
    type: [String],
    example: ['uuid1', 'uuid2', 'uuid3']
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one asset ID must be provided' })
  @IsString({ each: true })
  assetIds: string[];

  @ApiProperty({
    description: 'Updates to apply to all assets',
    type: AssetUpdates
  })
  @ValidateNested()
  @Type(() => AssetUpdates)
  updates: AssetUpdates;
}
