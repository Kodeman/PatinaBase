/**
 * Shipping Rate Response DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ShippingRateDto {
  @ApiProperty({ example: 'USPS' })
  carrier: string;

  @ApiProperty({ example: 'Priority' })
  service: string;

  @ApiProperty({ example: 7.99 })
  rate: number;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiPropertyOptional({ example: 2, description: 'Estimated delivery days' })
  deliveryDays?: number;

  @ApiPropertyOptional({ example: '2025-10-17T00:00:00Z' })
  deliveryDate?: Date;

  @ApiPropertyOptional({ example: false })
  deliveryDateGuaranteed?: boolean;

  @ApiProperty({ example: 'rate_abc123', description: 'Carrier rate ID for purchasing' })
  rateId: string;
}

export class ShippingRatesResponseDto {
  @ApiProperty({ type: [ShippingRateDto] })
  rates: ShippingRateDto[];

  @ApiPropertyOptional({ type: ShippingRateDto, description: 'Recommended lowest cost rate' })
  recommendedRate?: ShippingRateDto;
}
