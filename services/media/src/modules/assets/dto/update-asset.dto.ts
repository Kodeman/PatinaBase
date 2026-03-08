import { IsOptional, IsString, IsBoolean, IsEnum, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AssetRole } from '../../../generated/prisma-client';

export class UpdateAssetDto {
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

  @ApiProperty({ description: 'License information', required: false })
  @IsOptional()
  license?: any;

  @ApiProperty({ description: 'Sort order', required: false })
  @IsOptional()
  sortOrder?: number;
}
