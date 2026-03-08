import { IsArray, IsString, IsOptional, IsBoolean, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CopyAssetsDto {
  @ApiProperty({
    description: 'Array of asset IDs to copy',
    type: [String],
    example: ['uuid1', 'uuid2', 'uuid3']
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one asset ID must be provided' })
  @IsString({ each: true })
  assetIds: string[];

  @ApiProperty({
    description: 'Destination product ID',
    required: true
  })
  @IsString()
  toProductId: string;

  @ApiProperty({
    description: 'Optional destination variant ID',
    required: false
  })
  @IsOptional()
  @IsString()
  toVariantId?: string;

  @ApiProperty({
    description: 'Copy files in storage (false = reference same files)',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  copyFiles?: boolean;

  @ApiProperty({
    description: 'Copy all renditions',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  copyRenditions?: boolean;
}
