import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CartItemDto {
  @ApiProperty({ description: 'Product ID' })
  @IsString()
  productId: string;

  @ApiProperty({ description: 'Variant ID', required: false })
  @IsString()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ description: 'Quantity', default: 1 })
  @IsOptional()
  qty?: number;
}

export class CreateCartDto {
  @ApiProperty({ description: 'User ID', required: false })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiProperty({ description: 'Initial items', type: [CartItemDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  @IsOptional()
  items?: CartItemDto[];

  @ApiProperty({ description: 'Currency code', default: 'USD', required: false })
  @IsString()
  @IsOptional()
  currency?: string;
}
