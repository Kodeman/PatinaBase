/**
 * Address DTOs
 */

import { IsString, IsOptional, IsEmail, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddressDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: 'Acme Corp' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @ApiProperty({ example: '123 Main St' })
  @IsString()
  @MaxLength(200)
  street1: string;

  @ApiPropertyOptional({ example: 'Suite 100' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  street2?: string;

  @ApiProperty({ example: 'San Francisco' })
  @IsString()
  @MaxLength(100)
  city: string;

  @ApiProperty({ example: 'CA' })
  @IsString()
  @MaxLength(50)
  state: string;

  @ApiProperty({ example: '94102' })
  @IsString()
  @Matches(/^[0-9]{5}(-[0-9]{4})?$/, { message: 'Invalid ZIP code format' })
  zip: string;

  @ApiProperty({ example: 'US' })
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'Country must be 2-letter ISO code (e.g., US, CA)' })
  country: string;

  @ApiPropertyOptional({ example: '+1-415-555-0123' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'john.doe@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class ValidateAddressDto extends AddressDto {}
