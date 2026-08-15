import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto, MilestoneStatusEnum } from './dto/update-milestone.dto';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

@Injectable()
export class MilestonesService {
  private readonly logger = new Logger(MilestonesService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private readonly authorization: ProjectsAuthorizationResolver,
  ) {}

  async create(projectId: string, createDto: CreateMilestoneDto, userId: string) {
    const milestone = await this.authorization.withProjectAccess(
      userId,
      projectId,
      'manage',
      async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true, clientId: true, designerId: true },
        });
        if (!project) throw new NotFoundException('Project not found');
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
      },
    );

    // Emit in-process event for immediate handling
    this.eventEmitter.emit('milestone.created', {
      milestoneId: milestone.id,
      projectId,
      userId,
      timestamp: new Date(),
    });

    this.logger.log('Milestone created');

    return milestone;
  }

  async findAll(projectId: string, userId: string) {
    return this.authorization.withProjectAccess(userId, projectId, 'read', (tx) =>
      tx.milestone.findMany({ where: { projectId }, orderBy: { order: 'asc' } }),
    );
  }

  async findOne(projectId: string, id: string, userId: string) {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const milestone = await tx.milestone.findFirst({
        where: { id, projectId },
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
    });
  }

  async update(projectId: string, id: string, updateDto: UpdateMilestoneDto, userId: string) {
    const { existing, milestone } = await this.authorization.withProjectAccess(
      userId,
      projectId,
      'manage',
      async (tx) => {
        const existing = await tx.milestone.findFirst({
          where: { id, projectId },
          select: {
            id: true,
            status: true,
            projectId: true,
            project: { select: { clientId: true, designerId: true } },
          },
        });
        if (!existing) throw new NotFoundException('Milestone not found');
        const isCompleting =
          updateDto.status === MilestoneStatusEnum.COMPLETED &&
          existing.status !== MilestoneStatusEnum.COMPLETED;
        await tx.milestone.updateMany({
          where: { id, projectId },
          data: {
            title: updateDto.title,
            description: updateDto.description,
            targetDate: updateDto.targetDate ? new Date(updateDto.targetDate) : undefined,
            status: updateDto.status,
            order: updateDto.order,
            media:
              updateDto.media !== undefined
                ? JSON.parse(JSON.stringify(updateDto.media))
                : undefined,
            metadata: updateDto.metadata,
            completedAt: isCompleting ? new Date() : undefined,
          },
        });
        const updated = await tx.milestone.findFirstOrThrow({ where: { id, projectId } });

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

        return { existing, milestone: updated, isCompleting };
      },
    );
    const isCompleting =
      updateDto.status === MilestoneStatusEnum.COMPLETED &&
      existing.status !== MilestoneStatusEnum.COMPLETED;

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

    this.logger.log('Milestone updated');

    return milestone;
  }

  async remove(projectId: string, id: string, userId: string) {
    await this.authorization.withProjectAccess(userId, projectId, 'manage', async (tx) => {
      const existing = await tx.milestone.findFirst({
        where: { id, projectId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Milestone not found');
      await tx.milestone.deleteMany({ where: { id, projectId } });
      await tx.auditLog.create({
        data: {
          entityType: 'milestone',
          entityId: id,
          action: 'deleted',
          actor: userId,
          metadata: { projectId },
        },
      });
    });

    return { message: 'Milestone deleted successfully' };
  }
}
