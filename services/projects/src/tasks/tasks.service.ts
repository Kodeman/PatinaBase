import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, TaskStatus } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateTaskCommentDto, TaskCommentDto, TaskComment } from './dto/create-task-comment.dto';
import { v4 as uuid } from 'uuid';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(projectId: string, createDto: CreateTaskDto, userId: string) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.status === 'closed') {
      throw new BadRequestException('Cannot add tasks to a closed project');
    }

    const task = await this.prisma.task.create({
      data: {
        ...createDto,
        projectId,
      },
    });

    // Emit event
    this.eventEmitter.emit('task.created', {
      taskId: task.id,
      projectId,
      assigneeId: task.assigneeId,
      userId,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'task',
        entityId: task.id,
        action: 'created',
        actor: userId,
        metadata: { projectId },
      },
    });

    return task;
  }

  async findAll(projectId: string, status?: TaskStatus) {
    const where: any = { projectId };
    if (status) {
      where.status = status;
    }

    return this.prisma.task.findMany({
      where,
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    return task;
  }

  async update(id: string, updateDto: UpdateTaskDto, userId: string) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      select: { id: true, status: true, projectId: true },
    });

    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    // Validate status transition
    if (updateDto.status) {
      this.validateStatusTransition(existing.status, updateDto.status);
    }

    const task = await this.prisma.task.update({
      where: { id },
      data: {
        ...updateDto,
        completedAt: updateDto.status === TaskStatus.DONE ? new Date() : undefined,
      },
    });

    // Emit event if status changed
    if (updateDto.status && updateDto.status !== existing.status) {
      this.eventEmitter.emit('task.status_changed', {
        taskId: id,
        projectId: existing.projectId,
        oldStatus: existing.status,
        newStatus: updateDto.status,
        userId,
        timestamp: new Date(),
      });

      // Special event for completion
      if (updateDto.status === TaskStatus.DONE) {
        this.eventEmitter.emit('task.completed', {
          taskId: id,
          projectId: existing.projectId,
          userId,
          timestamp: new Date(),
        });
      }
    }

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'task',
        entityId: id,
        action: 'updated',
        actor: userId,
        changes: updateDto as any,
      },
    });

    return task;
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.task.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });

    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    await this.prisma.task.delete({
      where: { id },
    });

    // Emit event
    this.eventEmitter.emit('task.deleted', {
      taskId: id,
      projectId: existing.projectId,
      userId,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'task',
        entityId: id,
        action: 'deleted',
        actor: userId,
        metadata: { projectId: existing.projectId },
      },
    });

    return { message: 'Task deleted successfully' };
  }

  async bulkUpdateStatus(projectId: string, taskIds: string[], status: TaskStatus, userId: string) {
    // Verify all tasks belong to project
    const tasks = await this.prisma.task.findMany({
      where: {
        id: { in: taskIds },
        projectId,
      },
      select: { id: true },
    });

    if (tasks.length !== taskIds.length) {
      throw new BadRequestException('Some tasks not found or do not belong to this project');
    }

    const updated = await this.prisma.task.updateMany({
      where: {
        id: { in: taskIds },
      },
      data: {
        status,
        completedAt: status === TaskStatus.DONE ? new Date() : undefined,
      },
    });

    // Emit bulk event
    this.eventEmitter.emit('task.bulk_updated', {
      projectId,
      taskIds,
      status,
      userId,
      timestamp: new Date(),
    });

    return { updated: updated.count, taskIds };
  }

  private validateStatusTransition(currentStatus: string, newStatus: string) {
    const validTransitions: Record<string, string[]> = {
      todo: ['in_progress', 'cancelled'],
      in_progress: ['blocked', 'done', 'todo', 'cancelled'],
      blocked: ['in_progress', 'cancelled'],
      done: ['in_progress'], // Allow reopening
      cancelled: ['todo'], // Allow uncancelling
    };

    const allowed = validTransitions[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from '${currentStatus}' to '${newStatus}'`,
      );
    }
  }

  // Task Comment Methods

  async addComment(
    projectId: string,
    taskId: string,
    createCommentDto: CreateTaskCommentDto,
    userId: string,
    userName?: string,
  ): Promise<TaskCommentDto> {
    // Verify task exists and belongs to project
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        projectId,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found in this project');
    }

    // Parse existing comments from metadata
    const metadata = task.metadata as any || {};
    const comments: TaskComment[] = metadata.comments || [];

    // Create new comment
    const newComment: TaskComment = {
      id: uuid(),
      text: createCommentDto.text,
      userId,
      userName,
      mentions: createCommentDto.mentions,
      createdAt: new Date(),
      updatedAt: new Date(),
      edited: false,
    };

    // Add comment to list
    comments.push(newComment);

    // Update task with new comments
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        metadata: {
          ...metadata,
          comments,
        },
      },
    });

    // Emit event
    this.eventEmitter.emit('task.comment_added', {
      taskId,
      projectId,
      commentId: newComment.id,
      userId,
      mentions: createCommentDto.mentions,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'task_comment',
        entityId: newComment.id,
        action: 'created',
        actor: userId,
        metadata: { taskId, projectId },
      },
    });

    return newComment as TaskCommentDto;
  }

  async getComments(projectId: string, taskId: string): Promise<TaskCommentDto[]> {
    // Verify task exists and belongs to project
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        projectId,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found in this project');
    }

    // Parse comments from metadata
    const metadata = task.metadata as any || {};
    const comments: TaskComment[] = metadata.comments || [];

    // Sort by creation date (newest first)
    return comments.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ) as TaskCommentDto[];
  }

  async deleteComment(
    projectId: string,
    taskId: string,
    commentId: string,
    userId: string,
    userRole?: string,
  ): Promise<void> {
    // Verify task exists and belongs to project
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        projectId,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found in this project');
    }

    // Parse comments from metadata
    const metadata = task.metadata as any || {};
    const comments: TaskComment[] = metadata.comments || [];

    // Find comment
    const commentIndex = comments.findIndex(c => c.id === commentId);
    if (commentIndex === -1) {
      throw new NotFoundException('Comment not found');
    }

    const comment = comments[commentIndex];

    // Check permissions - only author or admin can delete
    if (comment.userId !== userId && userRole !== 'admin') {
      throw new ForbiddenException('Only comment author or admin can delete comments');
    }

    // Remove comment
    comments.splice(commentIndex, 1);

    // Update task
    await this.prisma.task.update({
      where: { id: taskId },
      data: {
        metadata: {
          ...metadata,
          comments,
        },
      },
    });

    // Emit event
    this.eventEmitter.emit('task.comment_deleted', {
      taskId,
      projectId,
      commentId,
      userId,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'task_comment',
        entityId: commentId,
        action: 'deleted',
        actor: userId,
        metadata: { taskId, projectId },
      },
    });
  }
}
