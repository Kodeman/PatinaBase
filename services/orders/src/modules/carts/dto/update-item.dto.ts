import { IsInt, IsOptional, Min, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateItemDto {
  @ApiProperty({
    description: 'Quantity of the item',
    example: 2,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  qty: number;

  @ApiPropertyOptional({
    description: 'Additional metadata for the item',
    example: { customization: 'engraving' },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
