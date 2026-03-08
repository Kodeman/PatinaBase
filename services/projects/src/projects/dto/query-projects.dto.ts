import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { type ProjectStatus } from '@patina/types';
import { ProjectStatusEnum } from './create-project.dto';

export class QueryProjectsDto {
  @ApiPropertyOptional({ description: 'Filter by client ID' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ description: 'Filter by designer ID' })
  @IsOptional()
  @IsUUID()
  designerId?: string;

  @ApiPropertyOptional({ description: 'Filter by status', enum: Object.values(ProjectStatusEnum) })
  @IsOptional()
  @IsEnum(ProjectStatusEnum)
  status?: ProjectStatus;

  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
