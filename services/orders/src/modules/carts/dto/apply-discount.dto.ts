import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ApplyDiscountDto {
  @ApiProperty({
    description: 'Discount code to apply',
    example: 'SUMMER2025',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}
