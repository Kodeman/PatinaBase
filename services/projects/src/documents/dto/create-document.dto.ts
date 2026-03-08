import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsInt } from 'class-validator';

export enum DocumentCategory {
  CONTRACT = 'contract',
  DRAWING = 'drawing',
  SPEC = 'spec',
  PHOTO = 'photo',
  INVOICE = 'invoice',
  OTHER = 'other',
}

export class CreateDocumentDto {
  @ApiProperty({ description: 'Document title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Object storage key' })
  @IsString()
  key: string;

  @ApiProperty({ description: 'Document category', enum: DocumentCategory })
  @IsEnum(DocumentCategory)
  category: DocumentCategory;

  @ApiPropertyOptional({ description: 'File size in bytes' })
  @IsOptional()
  @IsInt()
  sizeBytes?: number;

  @ApiPropertyOptional({ description: 'MIME type' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}
