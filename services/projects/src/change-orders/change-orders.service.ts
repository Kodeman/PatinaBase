import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChangeOrderDto, ChangeOrderStatus } from './dto/create-change-order.dto';
import { ApproveChangeOrderDto, ApprovalAction } from './dto/approve-change-order.dto';
import { Decimal } from 'decimal.js';

@Injectable()
export class ChangeOrdersService {
  private readonly logger = new Logger(ChangeOrdersService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(projectId: string, createDto: CreateChangeOrderDto, requestedBy: string) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, status: true, clientId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.status === 'closed') {
      throw new BadRequestException('Cannot create change orders for a closed project');
    }

    const { costImpact, ...data } = createDto;

    const changeOrder = await this.prisma.changeOrder.create({
      data: {
        ...data,
        projectId,
        requestedBy,
        costImpact: costImpact ? new Decimal(costImpact) : null,
      },
    });

    // Emit event
    this.eventEmitter.emit('change_order.created', {
      changeOrderId: changeOrder.id,
      projectId,
      clientId: project.clientId,
      requestedBy,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'change_order',
        entityId: changeOrder.id,
        action: 'created',
        actor: requestedBy,
        metadata: { projectId },
      },
    });

    return changeOrder;
  }

  async findAll(projectId: string, status?: ChangeOrderStatus) {
    const where: any = { projectId };
    if (status) {
      where.status = status;
    }

    return this.prisma.changeOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const changeOrder = await this.prisma.changeOrder.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            title: true,
            status: true,
            clientId: true,
            designerId: true,
          },
        },
      },
    });

    if (!changeOrder) {
      throw new NotFoundException('Change order not found');
    }

    return changeOrder;
  }

  async submit(id: string, userId: string) {
    const changeOrder = await this.prisma.changeOrder.findUnique({
      where: { id },
      select: { id: true, status: true, projectId: true },
    });

    if (!changeOrder) {
      throw new NotFoundException('Change order not found');
    }

    if (changeOrder.status !== ChangeOrderStatus.DRAFT) {
      throw new BadRequestException('Only draft change orders can be submitted');
    }

    const updated = await this.prisma.changeOrder.update({
      where: { id },
      data: { status: ChangeOrderStatus.SUBMITTED },
    });

    // Get client ID for notification
    const project = await this.prisma.project.findUnique({
      where: { id: changeOrder.projectId },
      select: { clientId: true },
    });

    // Emit event
    this.eventEmitter.emit('change_order.submitted', {
      changeOrderId: id,
      projectId: changeOrder.projectId,
      clientId: project?.clientId,
      userId,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'change_order',
        entityId: id,
        action: 'submitted',
        actor: userId,
      },
    });

    return updated;
  }

  async approve(id: string, approvalDto: ApproveChangeOrderDto, userId: string, userRole: string) {
    const changeOrder = await this.prisma.changeOrder.findUnique({
      where: { id },
      include: {
        project: {
          select: {
            id: true,
            clientId: true,
            status: true,
          },
        },
      },
    });

    if (!changeOrder) {
      throw new NotFoundException('Change order not found');
    }

    if (changeOrder.status !== ChangeOrderStatus.SUBMITTED) {
      throw new BadRequestException('Only submitted change orders can be approved/rejected');
    }

    // Only client or admin can approve
    if (userRole !== 'admin' && userRole !== 'client') {
      throw new ForbiddenException('Only clients can approve change orders');
    }

    // If client, must be the project client
    if (userRole === 'client' && changeOrder.project.clientId !== userId) {
      throw new ForbiddenException('You can only approve change orders for your own projects');
    }

    const newStatus = approvalDto.action === ApprovalAction.APPROVE
      ? ChangeOrderStatus.APPROVED
      : ChangeOrderStatus.REJECTED;

    const updated = await this.prisma.changeOrder.update({
      where: { id },
      data: {
        status: newStatus,
        approvedBy: userId,
        approvedAt: new Date(),
        reason: approvalDto.reason,
      },
    });

    // Emit event
    const eventName = approvalDto.action === ApprovalAction.APPROVE
      ? 'change_order.approved'
      : 'change_order.rejected';

    this.eventEmitter.emit(eventName, {
      changeOrderId: id,
      projectId: changeOrder.project.id,
      approvedBy: userId,
      reason: approvalDto.reason,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'change_order',
        entityId: id,
        action: approvalDto.action === ApprovalAction.APPROVE ? 'approved' : 'rejected',
        actor: userId,
        metadata: { reason: approvalDto.reason },
      },
    });

    return updated;
  }

  async markImplemented(id: string, userId: string) {
    const changeOrder = await this.prisma.changeOrder.findUnique({
      where: { id },
      select: { id: true, status: true, projectId: true },
    });

    if (!changeOrder) {
      throw new NotFoundException('Change order not found');
    }

    if (changeOrder.status !== ChangeOrderStatus.APPROVED) {
      throw new BadRequestException('Only approved change orders can be marked as implemented');
    }

    const updated = await this.prisma.changeOrder.update({
      where: { id },
      data: { status: ChangeOrderStatus.IMPLEMENTED },
    });

    // Emit event
    this.eventEmitter.emit('change_order.implemented', {
      changeOrderId: id,
      projectId: changeOrder.projectId,
      userId,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'change_order',
        entityId: id,
        action: 'implemented',
        actor: userId,
      },
    });

    return updated;
  }

  async getPendingApprovals(clientId: string) {
    return this.prisma.changeOrder.findMany({
      where: {
        status: ChangeOrderStatus.SUBMITTED,
        project: {
          clientId,
        },
      },
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
