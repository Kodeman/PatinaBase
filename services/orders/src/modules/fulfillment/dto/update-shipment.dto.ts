/**
 * Update Shipment DTOs
 */

import { IsString, IsOptional, IsEnum, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateShipmentStatusDto {
  @ApiProperty({
    enum: ['pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned'],
    example: 'in_transit'
  })
  @IsEnum(['pending', 'in_transit', 'out_for_delivery', 'delivered', 'exception', 'returned'])
  status: string;

  @ApiPropertyOptional({ example: 'Package arrived at distribution center' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  statusDetail?: string;

  @ApiPropertyOptional({ example: '2025-10-17T17:00:00Z' })
  @IsOptional()
  @IsDateString()
  estimatedDelivery?: Date;
}

export class UpdateShipmentDto {
  @ApiPropertyOptional({ example: 'USPS' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  carrier?: string;

  @ApiPropertyOptional({ example: '9400111899562537845962' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingNumber?: string;

  @ApiPropertyOptional({ example: 'https://tools.usps.com/...' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  trackingUrl?: string;

  @ApiPropertyOptional({ example: 'Priority' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  method?: string;

  @ApiPropertyOptional({ example: 'Internal note about shipment' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
