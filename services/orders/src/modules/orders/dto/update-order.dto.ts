import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateOrderDto {
  @ApiPropertyOptional({
    enum: ['created', 'paid', 'processing', 'fulfilled', 'closed', 'canceled'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['created', 'paid', 'processing', 'fulfilled', 'closed', 'canceled'])
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shippingAddressId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  billingAddressId?: string;
}
