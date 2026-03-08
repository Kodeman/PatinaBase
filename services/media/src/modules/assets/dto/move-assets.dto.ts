import { IsArray, IsString, IsOptional, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MoveAssetsDto {
  @ApiProperty({
    description: 'Array of asset IDs to move',
    type: [String],
    example: ['uuid1', 'uuid2', 'uuid3']
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one asset ID must be provided' })
  @IsString({ each: true })
  assetIds: string[];

  @ApiProperty({
    description: 'Source product ID (optional, for validation)',
    required: false
  })
  @IsOptional()
  @IsString()
  fromProductId?: string;

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
    description: 'Preserve sort order from source',
    default: true
  })
  @IsOptional()
  preserveOrder?: boolean;
}
