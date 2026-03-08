/**
 * Shipping Label Response DTOs
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PostageLabelDto {
  @ApiProperty({ example: 'https://easypost-files.s3.amazonaws.com/label.pdf' })
  labelUrl: string;

  @ApiProperty({ example: 'application/pdf' })
  labelFileType: string;
}

export class ShippingLabelDto {
  @ApiProperty({ example: '9400111899562537845962' })
  trackingNumber: string;

  @ApiProperty({ example: 'https://easypost-files.s3.amazonaws.com/label.pdf' })
  labelUrl: string;

  @ApiProperty({ example: 'PDF' })
  labelFormat: string;

  @ApiProperty({ example: '4x6' })
  labelSize: string;

  @ApiPropertyOptional({ example: 'https://easypost-files.s3.amazonaws.com/invoice.pdf' })
  commercialInvoiceUrl?: string;

  @ApiPropertyOptional({ type: PostageLabelDto })
  postageLabel?: PostageLabelDto;
}
