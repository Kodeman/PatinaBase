import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto, MilestoneStatusEnum } from './dto/update-milestone.dto';

@Injectable()
export class MilestonesService {
  private readonly logger = new Logger(MilestonesService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(projectId: string, createDto: CreateMilestoneDto, userId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, designerId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Create milestone and outbox event in a transaction
    const milestone = await this.prisma.$transaction(async (tx) => {
      const newMilestone = await tx.milestone.create({
        data: {
          projectId,
          title: createDto.title,
          description: createDto.description,
          targetDate: new Date(createDto.targetDate),
          order: createDto.order ?? 0,
          media: createDto.media ? JSON.parse(JSON.stringify(createDto.media)) : null,
          metadata: createDto.metadata,
        },
      });

      // Create outbox event for reliable event publishing
      await tx.outboxEvent.create({
        data: {
          type: 'project.milestone.created',
          payload: {
            milestoneId: newMilestone.id,
            projectId,
            title: newMilestone.title,
            targetDate: newMilestone.targetDate,
            clientId: project.clientId,
            designerId: project.designerId,
            createdBy: userId,
          },
          headers: {
            timestamp: new Date().toISOString(),
            source: 'projects-service',
          },
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: 'milestone',
          entityId: newMilestone.id,
          action: 'created',
          actor: userId,
          metadata: { projectId },
        },
      });

      return newMilestone;
    });

    // Emit in-process event for immediate handling
    this.eventEmitter.emit('milestone.created', {
      milestoneId: milestone.id,
      projectId,
      userId,
      timestamp: new Date(),
    });

    this.logger.log(`Milestone created: ${milestone.id} for project ${projectId}`);

    return milestone;
  }

  async findAll(projectId: string) {
    return this.prisma.milestone.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });
  }

  async findOne(id: string) {
    const milestone = await this.prisma.milestone.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, title: true },
        },
      },
    });

    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    return milestone;
  }

  async update(id: string, updateDto: UpdateMilestoneDto, userId: string) {
    const existing = await this.prisma.milestone.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        projectId: true,
        project: {
          select: {
            clientId: true,
            designerId: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Milestone not found');
    }

    // Check if status is changing to completed
    const isCompleting = updateDto.status === MilestoneStatusEnum.COMPLETED && existing.status !== MilestoneStatusEnum.COMPLETED;

    // Update milestone and create outbox event if status changed
    const milestone = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.milestone.update({
        where: { id },
        data: {
          title: updateDto.title,
          description: updateDto.description,
          targetDate: updateDto.targetDate ? new Date(updateDto.targetDate) : undefined,
          status: updateDto.status,
          order: updateDto.order,
          media: updateDto.media !== undefined ? JSON.parse(JSON.stringify(updateDto.media)) : undefined,
          metadata: updateDto.metadata,
          completedAt: isCompleting ? new Date() : undefined,
        },
      });

      // Create outbox event for status changes
      if (updateDto.status && updateDto.status !== existing.status) {
        await tx.outboxEvent.create({
          data: {
            type: 'project.milestone.status_changed',
            payload: {
              milestoneId: id,
              projectId: existing.projectId,
              oldStatus: existing.status,
              newStatus: updateDto.status,
              clientId: existing.project.clientId,
              designerId: existing.project.designerId,
              updatedBy: userId,
            },
            headers: {
              timestamp: new Date().toISOString(),
              source: 'projects-service',
            },
          },
        });

        // Additional event for completion
        if (isCompleting) {
          await tx.outboxEvent.create({
            data: {
              type: 'project.milestone.completed',
              payload: {
                milestoneId: id,
                projectId: existing.projectId,
                title: updated.title,
                completedAt: updated.completedAt,
                clientId: existing.project.clientId,
                designerId: existing.project.designerId,
                completedBy: userId,
              },
              headers: {
                timestamp: new Date().toISOString(),
                source: 'projects-service',
              },
            },
          });
        }
      }

      // Create audit log
      await tx.auditLog.create({
        data: {
          entityType: 'milestone',
          entityId: id,
          action: 'updated',
          actor: userId,
          changes: updateDto as any,
        },
      });

      return updated;
    });

    // Emit in-process events
    if (updateDto.status && updateDto.status !== existing.status) {
      this.eventEmitter.emit('milestone.status_changed', {
        milestoneId: id,
        projectId: existing.projectId,
        oldStatus: existing.status,
        newStatus: updateDto.status,
        userId,
        timestamp: new Date(),
      });

      if (isCompleting) {
        this.eventEmitter.emit('milestone.completed', {
          milestoneId: id,
          projectId: existing.projectId,
          userId,
          timestamp: new Date(),
        });
      }
    }

    this.logger.log(`Milestone updated: ${id}`);

    return milestone;
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.milestone.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });

    if (!existing) {
      throw new NotFoundException('Milestone not found');
    }

    await this.prisma.milestone.delete({
      where: { id },
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'milestone',
        entityId: id,
        action: 'deleted',
        actor: userId,
        metadata: { projectId: existing.projectId },
      },
    });

    return { message: 'Milestone deleted successfully' };
  }
}
