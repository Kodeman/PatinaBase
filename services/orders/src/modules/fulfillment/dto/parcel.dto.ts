/**
 * Parcel DTOs
 */

import { IsNumber, IsOptional, IsString, Min, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ParcelDto {
  @ApiProperty({ example: 10, description: 'Length in inches' })
  @IsNumber()
  @Type(() => Number)
  @Min(0.1)
  length: number;

  @ApiProperty({ example: 8, description: 'Width in inches' })
  @IsNumber()
  @Type(() => Number)
  @Min(0.1)
  width: number;

  @ApiProperty({ example: 6, description: 'Height in inches' })
  @IsNumber()
  @Type(() => Number)
  @Min(0.1)
  height: number;

  @ApiProperty({ example: 16, description: 'Weight in ounces' })
  @IsNumber()
  @Type(() => Number)
  @Min(0.1)
  weight: number;

  @ApiPropertyOptional({
    example: 'USPSMEDIUMFLATRATEBOX',
    description: 'Predefined package type (USPS, FedEx, UPS)'
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  predefinedPackage?: string;
}
