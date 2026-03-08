import { IsArray, IsBoolean, IsOptional, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteAssetsDto {
  @ApiProperty({
    description: 'Array of asset IDs to delete',
    type: [String],
    example: ['uuid1', 'uuid2', 'uuid3']
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one asset ID must be provided' })
  @IsString({ each: true })
  assetIds: string[];

  @ApiProperty({
    description: 'Soft delete (mark as deleted without removing from storage)',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  softDelete?: boolean;

  @ApiProperty({
    description: 'Also delete from CDN cache',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  purgeCdn?: boolean;
}
