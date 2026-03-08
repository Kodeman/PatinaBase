import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsEnum, IsArray } from 'class-validator';

export enum Weather {
  GOOD = 'Good',
  FAIR = 'Fair',
  POOR = 'Poor',
  NA = 'N/A',
}

export class CreateDailyLogDto {
  @ApiProperty({ description: 'Date of log entry' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ description: 'Notes/observations' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Weather conditions', enum: Weather })
  @IsOptional()
  @IsEnum(Weather)
  weather?: Weather;

  @ApiPropertyOptional({ description: 'Array of photo keys from object storage' })
  @IsOptional()
  @IsArray()
  photos?: string[];

  @ApiPropertyOptional({ description: 'Array of attendee user IDs' })
  @IsOptional()
  @IsArray()
  attendees?: string[];

  @ApiPropertyOptional({ description: 'Array of activity descriptions' })
  @IsOptional()
  @IsArray()
  activities?: string[];
}
