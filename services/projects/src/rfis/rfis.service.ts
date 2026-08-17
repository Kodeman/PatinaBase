import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRFIDto, RFIStatus } from './dto/create-rfi.dto';
import { UpdateRFIDto } from './dto/update-rfi.dto';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

@Injectable()
export class RfisService {
  private readonly logger = new Logger(RfisService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private readonly authorization: ProjectsAuthorizationResolver,
  ) {}

  async create(projectId: string, createDto: CreateRFIDto, requestedBy: string) {
    const rfi = await this.authorization.withProjectAccess(
      requestedBy,
      projectId,
      'manage',
      async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true, status: true },
        });
        if (!project) throw new NotFoundException('Project not found');
        if (project.status === 'closed') {
          throw new BadRequestException('Cannot create RFIs for a closed project');
        }
        const created = await tx.rFI.create({ data: { ...createDto, projectId, requestedBy } });
        await tx.auditLog.create({
          data: {
            entityType: 'rfi',
            entityId: created.id,
            action: 'created',
            actor: requestedBy,
            metadata: { projectId },
          },
        });
        return created;
      },
    );

    // Emit event
    this.eventEmitter.emit('rfi.created', {
      rfiId: rfi.id,
      projectId,
      assignedTo: rfi.assignedTo,
      requestedBy,
      timestamp: new Date(),
    });

    return rfi;
  }

  async findAll(projectId: string, userId: string, status?: RFIStatus) {
    const where: any = { projectId };
    if (status) {
      where.status = status;
    }

    return this.authorization.withProjectAccess(userId, projectId, 'read', (tx) =>
      tx.rFI.findMany({ where, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }] }),
    );
  }

  async findOne(projectId: string, id: string, userId: string) {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const rfi = await tx.rFI.findFirst({
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

      if (!rfi) {
        throw new NotFoundException('RFI not found');
      }

      return rfi;
    });
  }

  async update(projectId: string, id: string, updateDto: UpdateRFIDto, userId: string) {
    const { existing, rfi } = await this.authorization.withProjectAccess(
      userId,
      projectId,
      'manage',
      async (tx) => {
        const existing = await tx.rFI.findFirst({
          where: { id, projectId },
          select: { id: true, status: true, projectId: true },
        });
        if (!existing) throw new NotFoundException('RFI not found');
        const answeredAt =
          updateDto.answer && !existing.status.includes('answered') ? new Date() : undefined;
        await tx.rFI.updateMany({ where: { id, projectId }, data: { ...updateDto, answeredAt } });
        const rfi = await tx.rFI.findFirstOrThrow({ where: { id, projectId } });
        await tx.auditLog.create({
          data: {
            entityType: 'rfi',
            entityId: id,
            action: 'updated',
            actor: userId,
            changes: updateDto as any,
            metadata: { projectId },
          },
        });
        return { existing, rfi };
      },
    );

    // Emit event if status changed
    if (updateDto.status && updateDto.status !== existing.status) {
      this.eventEmitter.emit('rfi.status_changed', {
        rfiId: id,
        projectId: existing.projectId,
        oldStatus: existing.status,
        newStatus: updateDto.status,
        userId,
        timestamp: new Date(),
      });

      // Special event for answered
      if (updateDto.status === RFIStatus.ANSWERED) {
        this.eventEmitter.emit('rfi.answered', {
          rfiId: id,
          projectId: existing.projectId,
          userId,
          timestamp: new Date(),
        });
      }
    }

    return rfi;
  }

  async getOverdue(projectId: string, userId: string) {
    const where: any = {
      status: { in: ['open'] },
      dueDate: { lt: new Date() },
    };

    where.projectId = projectId;

    return this.authorization.withProjectAccess(userId, projectId, 'read', (tx) =>
      tx.rFI.findMany({
        where,
        orderBy: { dueDate: 'asc' },
        include: {
          project: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      }),
    );
  }
}
