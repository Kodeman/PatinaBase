import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateTaskCommentDto {
  @ApiProperty({
    description: 'The comment text',
    example: 'This task needs additional clarification on the requirements.',
  })
  @IsNotEmpty()
  @IsString()
  text: string;

  @ApiProperty({
    description: 'Optional mentions of user IDs',
    example: ['user-123', 'user-456'],
    required: false,
  })
  @IsOptional()
  @IsString({ each: true })
  mentions?: string[];
}

export class TaskCommentDto {
  @ApiProperty({
    description: 'Unique identifier for the comment',
    example: 'comment-123',
  })
  id: string;

  @ApiProperty({
    description: 'The comment text',
    example: 'This task needs additional clarification on the requirements.',
  })
  text: string;

  @ApiProperty({
    description: 'User ID who created the comment',
    example: 'user-123',
  })
  userId: string;

  @ApiProperty({
    description: 'User name who created the comment',
    example: 'John Doe',
    required: false,
  })
  userName?: string;

  @ApiProperty({
    description: 'Mentioned user IDs',
    example: ['user-456'],
    required: false,
  })
  mentions?: string[];

  @ApiProperty({
    description: 'When the comment was created',
    example: '2024-01-15T10:30:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'When the comment was last updated',
    example: '2024-01-15T10:35:00Z',
  })
  updatedAt: Date;

  @ApiProperty({
    description: 'Whether the comment has been edited',
    example: false,
  })
  edited: boolean;
}

export interface TaskComment {
  id: string;
  text: string;
  userId: string;
  userName?: string;
  mentions?: string[];
  createdAt: Date;
  updatedAt: Date;
  edited: boolean;
}