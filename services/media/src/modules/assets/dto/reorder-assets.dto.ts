import { IsArray, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderAssetsDto {
  @ApiProperty({
    description: 'Array of asset IDs in desired order. The order of IDs in this array determines the new sortOrder.',
    type: [String],
    example: ['uuid3', 'uuid1', 'uuid2']
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one asset ID must be provided' })
  @IsString({ each: true })
  assetIds: string[];
}
