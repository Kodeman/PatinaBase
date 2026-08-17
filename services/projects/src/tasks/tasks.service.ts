import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, TaskStatus } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CreateTaskCommentDto, TaskCommentDto, TaskComment } from './dto/create-task-comment.dto';
import { v4 as uuid } from 'uuid';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private readonly authorization: ProjectsAuthorizationResolver,
  ) {}

  async create(projectId: string, createDto: CreateTaskDto, userId: string) {
    const task = await this.authorization.withProjectAccess(
      userId,
      projectId,
      'manage',
      async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true, status: true },
        });
        if (!project) throw new NotFoundException('Project not found');
        if (project.status === 'closed') {
          throw new BadRequestException('Cannot add tasks to a closed project');
        }
        const created = await tx.task.create({ data: { ...createDto, projectId } });
        await tx.auditLog.create({
          data: {
            entityType: 'task',
            entityId: created.id,
            action: 'created',
            actor: userId,
            metadata: { projectId },
          },
        });
        return created;
      },
    );

    this.eventEmitter.emit('task.created', {
      taskId: task.id,
      projectId,
      assigneeId: task.assigneeId,
      userId,
      timestamp: new Date(),
    });

    return task;
  }

  async findAll(projectId: string, userId: string, status?: TaskStatus) {
    const where: any = { projectId };
    if (status) {
      where.status = status;
    }

    return this.authorization.withProjectAccess(userId, projectId, 'read', (tx) =>
      tx.task.findMany({ where, orderBy: [{ order: 'asc' }, { createdAt: 'desc' }] }),
    );
  }

  async findOne(projectId: string, id: string, userId: string) {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const task = await tx.task.findFirst({
        where: { id, projectId },
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
      if (!task) throw new NotFoundException('Task not found');
      return task;
    });
  }

  async update(projectId: string, id: string, updateDto: UpdateTaskDto, userId: string) {
    const { existing, task } = await this.authorization.withProjectAccess(
      userId,
      projectId,
      'manage',
      async (tx) => {
        const existing = await tx.task.findFirst({
          where: { id, projectId },
          select: { id: true, status: true, projectId: true },
        });
        if (!existing) throw new NotFoundException('Task not found');
        if (updateDto.status) this.validateStatusTransition(existing.status, updateDto.status);
        await tx.task.updateMany({
          where: { id, projectId },
          data: {
            ...updateDto,
            completedAt: updateDto.status === TaskStatus.DONE ? new Date() : undefined,
          },
        });
        const task = await tx.task.findFirstOrThrow({ where: { id, projectId } });
        await tx.auditLog.create({
          data: {
            entityType: 'task',
            entityId: id,
            action: 'updated',
            actor: userId,
            changes: updateDto as any,
            metadata: { projectId },
          },
        });
        return { existing, task };
      },
    );

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

    return task;
  }

  async remove(projectId: string, id: string, userId: string) {
    const existing = await this.authorization.withProjectAccess(
      userId,
      projectId,
      'manage',
      async (tx) => {
        const existing = await tx.task.findFirst({
          where: { id, projectId },
          select: { id: true, projectId: true },
        });
        if (!existing) throw new NotFoundException('Task not found');
        await tx.task.deleteMany({ where: { id, projectId } });
        await tx.auditLog.create({
          data: {
            entityType: 'task',
            entityId: id,
            action: 'deleted',
            actor: userId,
            metadata: { projectId },
          },
        });
        return existing;
      },
    );

    // Emit event
    this.eventEmitter.emit('task.deleted', {
      taskId: id,
      projectId: existing.projectId,
      userId,
      timestamp: new Date(),
    });

    return { message: 'Task deleted successfully' };
  }

  async bulkUpdateStatus(projectId: string, taskIds: string[], status: TaskStatus, userId: string) {
    const updated = await this.authorization.withProjectAccess(
      userId,
      projectId,
      'manage',
      async (tx) => {
        const tasks = await tx.task.findMany({
          where: { id: { in: taskIds }, projectId },
          select: { id: true },
        });
        if (tasks.length !== taskIds.length) {
          throw new BadRequestException('One or more tasks are unavailable');
        }
        return tx.task.updateMany({
          where: { id: { in: taskIds }, projectId },
          data: {
            status,
            completedAt: status === TaskStatus.DONE ? new Date() : undefined,
          },
        });
      },
    );

    // Emit bulk event
    this.eventEmitter.emit('task.bulk_updated', {
      projectId,
      taskIds,
      status,
      userId,
      timestamp: new Date(),
    });

    return { updated: updated.count };
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

    await this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, projectId } });
      if (!task) throw new NotFoundException('Task not found');
      const metadata = (task.metadata as any) || {};
      const comments: TaskComment[] = metadata.comments || [];
      comments.push(newComment);
      await tx.task.updateMany({
        where: { id: taskId, projectId },
        data: { metadata: { ...metadata, comments } },
      });
      await tx.auditLog.create({
        data: {
          entityType: 'task_comment',
          entityId: newComment.id,
          action: 'created',
          actor: userId,
          metadata: { taskId, projectId },
        },
      });
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

    return newComment as TaskCommentDto;
  }

  async getComments(projectId: string, taskId: string, userId: string): Promise<TaskCommentDto[]> {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, projectId } });
      if (!task) throw new NotFoundException('Task not found');
      const metadata = (task.metadata as any) || {};
      const comments: TaskComment[] = metadata.comments || [];
      return comments.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ) as TaskCommentDto[];
    });
  }

  async deleteComment(
    projectId: string,
    taskId: string,
    commentId: string,
    userId: string,
  ): Promise<void> {
    await this.authorization.withProjectAccess(userId, projectId, 'manage', async (tx) => {
      const task = await tx.task.findFirst({ where: { id: taskId, projectId } });
      if (!task) throw new NotFoundException('Task not found');
      const metadata = (task.metadata as any) || {};
      const comments: TaskComment[] = metadata.comments || [];
      const commentIndex = comments.findIndex((comment) => comment.id === commentId);
      if (commentIndex === -1) throw new NotFoundException('Comment not found');
      comments.splice(commentIndex, 1);
      await tx.task.updateMany({
        where: { id: taskId, projectId },
        data: { metadata: { ...metadata, comments } },
      });
      await tx.auditLog.create({
        data: {
          entityType: 'task_comment',
          entityId: commentId,
          action: 'deleted',
          actor: userId,
          metadata: { taskId, projectId },
        },
      });
    });

    // Emit event
    this.eventEmitter.emit('task.comment_deleted', {
      taskId,
      projectId,
      commentId,
      userId,
      timestamp: new Date(),
    });
  }
}
