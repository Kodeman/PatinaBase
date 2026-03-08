import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Task Response DTO
 * Excludes sensitive internal fields
 */
@Exclude()
export class TaskResponseDto {
  @Expose()
  @ApiProperty({ description: 'Task ID', example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @Expose()
  @ApiProperty({ description: 'Project ID', example: '123e4567-e89b-12d3-a456-426614174001' })
  projectId: string;

  @Expose()
  @ApiProperty({ description: 'Task title', example: 'Install hardwood flooring' })
  title: string;

  @Expose()
  @ApiProperty({ description: 'Task description', nullable: true, example: 'Install oak hardwood in living room' })
  description: string | null;

  @Expose()
  @ApiProperty({ description: 'Assignee user ID', nullable: true, example: '123e4567-e89b-12d3-a456-426614174002' })
  assigneeId: string | null;

  @Expose()
  @ApiProperty({ description: 'Task due date', nullable: true })
  dueDate: Date | null;

  @Expose()
  @ApiProperty({
    description: 'Task status',
    enum: ['todo', 'in_progress', 'blocked', 'done', 'cancelled'],
    example: 'in_progress',
  })
  status: string;

  @Expose()
  @ApiProperty({
    description: 'Task priority',
    enum: ['low', 'medium', 'high', 'urgent'],
    example: 'high',
  })
  priority: string;

  @Expose()
  @ApiProperty({ description: 'Sort order', example: 1 })
  order: number;

  @Expose()
  @ApiProperty({ description: 'Task completion date', nullable: true })
  completedAt: Date | null;

  @Expose()
  @ApiProperty({ description: 'Task creation date' })
  createdAt: Date;

  @Expose()
  @ApiProperty({ description: 'Task last update date' })
  updatedAt: Date;

  // EXCLUDED FIELDS:
  // - metadata (internal)

  static fromPrisma(task: any): TaskResponseDto | undefined {
    if (!task) return undefined;
    const dto = new TaskResponseDto();

    dto.id = task.id;
    dto.projectId = task.projectId;
    dto.title = task.title;
    dto.description = task.description;
    dto.assigneeId = task.assigneeId;
    dto.dueDate = task.dueDate;
    dto.status = task.status;
    dto.priority = task.priority;
    dto.order = task.order;
    dto.completedAt = task.completedAt;
    dto.createdAt = task.createdAt;
    dto.updatedAt = task.updatedAt;

    return dto;
  }

  static fromPrismaMany(tasks: any[]): TaskResponseDto[] {
    return tasks?.map((t) => this.fromPrisma(t)).filter((t): t is TaskResponseDto => t !== undefined) || [];
  }
}
