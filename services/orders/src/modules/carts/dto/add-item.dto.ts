import { IsString, IsInt, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsString()
  productId: string;

  @ApiProperty({ description: 'Variant ID', required: false })
  @IsString()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ description: 'Quantity', default: 1 })
  @IsInt()
  @Min(1)
  qty: number = 1;
}
