import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class ApproveDto {
  @ApiPropertyOptional({ description: 'Approval comments' })
  @IsString()
  @IsOptional()
  comments?: string;

  @ApiPropertyOptional({ description: 'Digital signature data' })
  @IsObject()
  @IsOptional()
  signature?: {
    data: string;
    timestamp: string;
    ipAddress?: string;
  };

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class RejectDto {
  @ApiProperty({ description: 'Reason for rejection' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ description: 'Additional comments' })
  @IsString()
  @IsOptional()
  comments?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class DiscussDto {
  @ApiProperty({ description: 'Discussion comment' })
  @IsString()
  @IsNotEmpty()
  comment: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class SignatureDto {
  @ApiProperty({ description: 'Signature data (base64 encoded image or signature object)' })
  @IsString()
  @IsNotEmpty()
  data: string;

  @ApiPropertyOptional({ description: 'Signer name' })
  @IsString()
  @IsOptional()
  signerName?: string;

  @ApiPropertyOptional({ description: 'Additional metadata' })
  @IsOptional()
  metadata?: Record<string, any>;
}
