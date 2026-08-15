import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChangeOrderDto, ChangeOrderStatus } from './dto/create-change-order.dto';
import { ApproveChangeOrderDto, ApprovalAction } from './dto/approve-change-order.dto';
import { Decimal } from 'decimal.js';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

@Injectable()
export class ChangeOrdersService {
  private readonly logger = new Logger(ChangeOrdersService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private readonly authorization: ProjectsAuthorizationResolver,
  ) {}

  async create(projectId: string, createDto: CreateChangeOrderDto, requestedBy: string) {
    const { costImpact, ...data } = createDto;
    const { project, changeOrder } = await this.authorization.withProjectAccess(
      requestedBy,
      projectId,
      'manage',
      async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true, status: true, clientId: true },
        });
        if (!project) throw new NotFoundException('Project not found');
        if (project.status === 'closed') {
          throw new BadRequestException('Cannot create change orders for a closed project');
        }
        const changeOrder = await tx.changeOrder.create({
          data: {
            ...data,
            projectId,
            requestedBy,
            costImpact: costImpact ? new Decimal(costImpact) : null,
          },
        });
        await tx.auditLog.create({
          data: {
            entityType: 'change_order',
            entityId: changeOrder.id,
            action: 'created',
            actor: requestedBy,
            metadata: { projectId },
          },
        });
        return { project, changeOrder };
      },
    );

    // Emit event
    this.eventEmitter.emit('change_order.created', {
      changeOrderId: changeOrder.id,
      projectId,
      clientId: project.clientId,
      requestedBy,
      timestamp: new Date(),
    });

    return changeOrder;
  }

  async findAll(projectId: string, userId: string, status?: ChangeOrderStatus) {
    const where: any = { projectId };
    if (status) {
      where.status = status;
    }

    return this.authorization.withProjectAccess(userId, projectId, 'read', (tx) =>
      tx.changeOrder.findMany({ where, orderBy: { createdAt: 'desc' } }),
    );
  }

  async findOne(projectId: string, id: string, userId: string) {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const changeOrder = await tx.changeOrder.findFirst({
        where: { id, projectId },
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
    });
  }

  async submit(projectId: string, id: string, userId: string) {
    const { changeOrder, updated, project } = await this.authorization.withProjectAccess(
      userId,
      projectId,
      'manage',
      async (tx) => {
        const changeOrder = await tx.changeOrder.findFirst({
          where: { id, projectId },
          select: { id: true, status: true, projectId: true },
        });
        if (!changeOrder) throw new NotFoundException('Change order not found');
        if (changeOrder.status !== ChangeOrderStatus.DRAFT) {
          throw new BadRequestException('Only draft change orders can be submitted');
        }
        await tx.changeOrder.updateMany({
          where: { id, projectId },
          data: { status: ChangeOrderStatus.SUBMITTED },
        });
        const updated = await tx.changeOrder.findFirstOrThrow({ where: { id, projectId } });
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { clientId: true },
        });
        await tx.auditLog.create({
          data: {
            entityType: 'change_order',
            entityId: id,
            action: 'submitted',
            actor: userId,
            metadata: { projectId },
          },
        });
        return { changeOrder, updated, project };
      },
    );

    // Emit event
    this.eventEmitter.emit('change_order.submitted', {
      changeOrderId: id,
      projectId: changeOrder.projectId,
      clientId: project?.clientId,
      userId,
      timestamp: new Date(),
    });

    return updated;
  }

  async approve(projectId: string, id: string, approvalDto: ApproveChangeOrderDto, userId: string) {
    const { changeOrder, updated } = await this.prisma.$transaction(async (tx) => {
      await this.authorization.assertProjectAccess(userId, projectId, 'read', tx);
      await this.authorization.assertProjectApprovalAccess(userId, projectId, tx);
      const changeOrder = await tx.changeOrder.findFirst({
        where: { id, projectId },
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

      const newStatus =
        approvalDto.action === ApprovalAction.APPROVE
          ? ChangeOrderStatus.APPROVED
          : ChangeOrderStatus.REJECTED;

      await tx.changeOrder.updateMany({
        where: { id, projectId },
        data: {
          status: newStatus,
          approvedBy: userId,
          approvedAt: new Date(),
          reason: approvalDto.reason,
        },
      });
      const updated = await tx.changeOrder.findFirstOrThrow({ where: { id, projectId } });

      await tx.auditLog.create({
        data: {
          entityType: 'change_order',
          entityId: id,
          action: approvalDto.action === ApprovalAction.APPROVE ? 'approved' : 'rejected',
          actor: userId,
          metadata: { projectId },
        },
      });
      return { changeOrder, updated };
    });

    // Emit event
    const eventName =
      approvalDto.action === ApprovalAction.APPROVE
        ? 'change_order.approved'
        : 'change_order.rejected';

    this.eventEmitter.emit(eventName, {
      changeOrderId: id,
      projectId: changeOrder.project.id,
      approvedBy: userId,
      reason: approvalDto.reason,
      timestamp: new Date(),
    });

    return updated;
  }

  async markImplemented(projectId: string, id: string, userId: string) {
    const { changeOrder, updated } = await this.authorization.withProjectAccess(
      userId,
      projectId,
      'manage',
      async (tx) => {
        const changeOrder = await tx.changeOrder.findFirst({
          where: { id, projectId },
          select: { id: true, status: true, projectId: true },
        });
        if (!changeOrder) throw new NotFoundException('Change order not found');
        if (changeOrder.status !== ChangeOrderStatus.APPROVED) {
          throw new BadRequestException('Only approved change orders can be marked as implemented');
        }
        await tx.changeOrder.updateMany({
          where: { id, projectId },
          data: { status: ChangeOrderStatus.IMPLEMENTED },
        });
        const updated = await tx.changeOrder.findFirstOrThrow({ where: { id, projectId } });
        await tx.auditLog.create({
          data: {
            entityType: 'change_order',
            entityId: id,
            action: 'implemented',
            actor: userId,
            metadata: { projectId },
          },
        });
        return { changeOrder, updated };
      },
    );

    // Emit event
    this.eventEmitter.emit('change_order.implemented', {
      changeOrderId: id,
      projectId: changeOrder.projectId,
      userId,
      timestamp: new Date(),
    });

    return updated;
  }

  async getPendingApprovals(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const projectIds = await this.authorization.accessibleProjectIds(userId, 'read', tx);
      return tx.changeOrder.findMany({
        where: {
          status: ChangeOrderStatus.SUBMITTED,
          projectId: { in: projectIds },
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
    });
  }
}
