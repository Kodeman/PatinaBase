import { IsString, IsOptional, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCheckoutDto {
  @ApiProperty({ description: 'Cart ID' })
  @IsString()
  cartId: string;

  @ApiProperty({ description: 'Return URL after successful payment' })
  @IsString()
  returnUrl: string;

  @ApiProperty({ description: 'Cancel URL if payment is cancelled' })
  @IsString()
  cancelUrl: string;

  @ApiProperty({ description: 'User ID', required: false })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiProperty({ description: 'Customer email', required: false })
  @IsString()
  @IsOptional()
  customerEmail?: string;

  @ApiProperty({ description: 'Shipping address ID', required: false })
  @IsString()
  @IsOptional()
  shippingAddressId?: string;

  @ApiProperty({ description: 'Billing address ID', required: false })
  @IsString()
  @IsOptional()
  billingAddressId?: string;

  @ApiProperty({ description: 'Additional metadata', required: false })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
