/**
 * Create Shipment DTOs
 */

import {
  IsArray,
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  ValidateNested,
  IsDateString,
  IsUUID,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AddressDto } from './address.dto';
import { ParcelDto } from './parcel.dto';

export class ShipmentOptionsDto {
  @ApiPropertyOptional({ enum: ['PDF', 'PNG', 'ZPL'], example: 'PDF' })
  @IsOptional()
  @IsEnum(['PDF', 'PNG', 'ZPL'])
  labelFormat?: 'PDF' | 'PNG' | 'ZPL';

  @ApiPropertyOptional({ enum: ['4x6', '4x8'], example: '4x6' })
  @IsOptional()
  @IsEnum(['4x6', '4x8'])
  labelSize?: '4x6' | '4x8';

  @ApiPropertyOptional({ example: 100, description: 'Insurance amount in dollars' })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  insurance?: number;

  @ApiPropertyOptional({ enum: ['STANDARD', 'ADULT'], example: 'STANDARD' })
  @IsOptional()
  @IsEnum(['STANDARD', 'ADULT'])
  signature?: 'STANDARD' | 'ADULT';

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  saturdayDelivery?: boolean;

  @ApiPropertyOptional({ example: '2025-10-15T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  labelDate?: Date;
}

export class CustomsItemDto {
  @ApiProperty({ example: 'Handcrafted wooden chair' })
  @IsString()
  @MaxLength(500)
  description: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 250.00, description: 'Value in USD' })
  @IsNumber()
  @Type(() => Number)
  @Min(0.01)
  value: number;

  @ApiProperty({ example: 256, description: 'Weight in ounces' })
  @IsNumber()
  @Type(() => Number)
  @Min(0.1)
  weight: number;

  @ApiPropertyOptional({ example: '9403.60', description: 'HS tariff code' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  hsCode?: string;

  @ApiProperty({ example: 'US' })
  @IsString()
  @MaxLength(2)
  originCountry: string;
}

export class CustomsInfoDto {
  @ApiProperty({
    enum: ['merchandise', 'returned_goods', 'documents', 'gift', 'sample'],
    example: 'merchandise'
  })
  @IsEnum(['merchandise', 'returned_goods', 'documents', 'gift', 'sample'])
  contentsType: 'merchandise' | 'returned_goods' | 'documents' | 'gift' | 'sample';

  @ApiPropertyOptional({ example: 'Custom furniture piece' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  contentsExplanation?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  customsCertify: boolean;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MaxLength(100)
  customsSigner: string;

  @ApiProperty({ enum: ['return', 'abandon'], example: 'return' })
  @IsEnum(['return', 'abandon'])
  nonDeliveryOption: 'return' | 'abandon';

  @ApiPropertyOptional({
    enum: ['none', 'other', 'quarantine', 'sanitary_phytosanitary_inspection'],
    example: 'none'
  })
  @IsOptional()
  @IsEnum(['none', 'other', 'quarantine', 'sanitary_phytosanitary_inspection'])
  restrictionType?: 'none' | 'other' | 'quarantine' | 'sanitary_phytosanitary_inspection';

  @ApiPropertyOptional({ example: 'NOEEI 30.37(a)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  eelPfc?: string;

  @ApiProperty({ type: [CustomsItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomsItemDto)
  customsItems: CustomsItemDto[];
}

export class CreateShipmentDto {
  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  fromAddress: AddressDto;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  toAddress: AddressDto;

  @ApiProperty({ type: ParcelDto })
  @ValidateNested()
  @Type(() => ParcelDto)
  parcel: ParcelDto;

  @ApiPropertyOptional({ example: 'USPS', description: 'Carrier name' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  carrier?: string;

  @ApiPropertyOptional({ example: 'Priority', description: 'Service level' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  service?: string;

  @ApiPropertyOptional({ example: 'rate_abc123', description: 'Pre-selected rate ID' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  rateId?: string;

  @ApiPropertyOptional({ type: CustomsInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomsInfoDto)
  customsInfo?: CustomsInfoDto;

  @ApiPropertyOptional({ example: 'ORDER-12345' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @ApiPropertyOptional({ type: ShipmentOptionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ShipmentOptionsDto)
  options?: ShipmentOptionsDto;

  @ApiProperty({
    example: [{ orderItemId: 'uuid', qty: 2 }],
    description: 'Items included in this shipment'
  })
  @IsArray()
  items: Array<{ orderItemId: string; qty: number }>;
}

export class GetRatesDto {
  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  fromAddress: AddressDto;

  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  toAddress: AddressDto;

  @ApiProperty({ type: ParcelDto })
  @ValidateNested()
  @Type(() => ParcelDto)
  parcel: ParcelDto;

  @ApiPropertyOptional({ type: CustomsInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomsInfoDto)
  customsInfo?: CustomsInfoDto;
}
