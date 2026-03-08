import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRFIDto, RFIStatus } from './dto/create-rfi.dto';
import { UpdateRFIDto } from './dto/update-rfi.dto';

@Injectable()
export class RfisService {
  private readonly logger = new Logger(RfisService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(projectId: string, createDto: CreateRFIDto, requestedBy: string) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.status === 'closed') {
      throw new BadRequestException('Cannot create RFIs for a closed project');
    }

    const rfi = await this.prisma.rFI.create({
      data: {
        ...createDto,
        projectId,
        requestedBy,
      },
    });

    // Emit event
    this.eventEmitter.emit('rfi.created', {
      rfiId: rfi.id,
      projectId,
      assignedTo: rfi.assignedTo,
      requestedBy,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'rfi',
        entityId: rfi.id,
        action: 'created',
        actor: requestedBy,
        metadata: { projectId },
      },
    });

    return rfi;
  }

  async findAll(projectId: string, status?: RFIStatus) {
    const where: any = { projectId };
    if (status) {
      where.status = status;
    }

    return this.prisma.rFI.findMany({
      where,
      orderBy: [
        { priority: 'desc' }, // Urgent first
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(id: string) {
    const rfi = await this.prisma.rFI.findUnique({
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

    if (!rfi) {
      throw new NotFoundException('RFI not found');
    }

    return rfi;
  }

  async update(id: string, updateDto: UpdateRFIDto, userId: string) {
    const existing = await this.prisma.rFI.findUnique({
      where: { id },
      select: { id: true, status: true, projectId: true },
    });

    if (!existing) {
      throw new NotFoundException('RFI not found');
    }

    // If answering, set answeredAt timestamp
    const answeredAt = updateDto.answer && !existing.status.includes('answered')
      ? new Date()
      : undefined;

    const rfi = await this.prisma.rFI.update({
      where: { id },
      data: {
        ...updateDto,
        answeredAt,
      },
    });

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

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'rfi',
        entityId: id,
        action: 'updated',
        actor: userId,
        changes: updateDto as any,
      },
    });

    return rfi;
  }

  async getOverdue(projectId?: string) {
    const where: any = {
      status: { in: ['open'] },
      dueDate: { lt: new Date() },
    };

    if (projectId) {
      where.projectId = projectId;
    }

    return this.prisma.rFI.findMany({
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
    });
  }
}
