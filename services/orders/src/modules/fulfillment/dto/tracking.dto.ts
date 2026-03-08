/**
 * Tracking DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TrackingLocationDto {
  @ApiPropertyOptional({ example: 'San Francisco' })
  city?: string;

  @ApiPropertyOptional({ example: 'CA' })
  state?: string;

  @ApiPropertyOptional({ example: 'US' })
  country?: string;

  @ApiPropertyOptional({ example: '94102' })
  zip?: string;
}

export class TrackingEventDto {
  @ApiProperty({ example: 'in_transit' })
  status: string;

  @ApiPropertyOptional({ example: 'Arrived at USPS Facility' })
  statusDetail?: string;

  @ApiPropertyOptional({ example: 'Package arrived at facility and is in transit' })
  description?: string;

  @ApiPropertyOptional({ type: TrackingLocationDto })
  location?: TrackingLocationDto;

  @ApiProperty({ example: '2025-10-15T14:30:00Z' })
  datetime: Date;
}

export class TrackingDetailsDto {
  @ApiProperty({ example: '9400111899562537845962' })
  trackingNumber: string;

  @ApiProperty({ example: 'USPS' })
  carrier: string;

  @ApiProperty({
    example: 'in_transit',
    enum: [
      'pre_transit',
      'in_transit',
      'out_for_delivery',
      'delivered',
      'available_for_pickup',
      'return_to_sender',
      'failure',
      'cancelled',
      'error',
      'unknown'
    ]
  })
  status: string;

  @ApiPropertyOptional({ example: 'Package is in transit to destination' })
  statusDetail?: string;

  @ApiPropertyOptional({ example: '2025-10-17T17:00:00Z' })
  estimatedDelivery?: Date;

  @ApiPropertyOptional({ example: 'John Doe' })
  signedBy?: string;

  @ApiPropertyOptional({ example: 256, description: 'Weight in ounces' })
  weight?: number;

  @ApiProperty({ type: [TrackingEventDto] })
  trackingEvents: TrackingEventDto[];

  @ApiPropertyOptional({ example: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899562537845962' })
  publicUrl?: string;
}
