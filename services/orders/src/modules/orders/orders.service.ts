import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaClient,
    private configService: ConfigService,
    @Inject('EVENTS_SERVICE') private eventsService: any,
  ) {}

  /**
   * Find order by ID
   */
  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        payments: true,
        refunds: true,
        shipments: true,
        shippingAddress: true,
        billingAddress: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }

    return order;
  }

  /**
   * Find order by order number
   */
  async findByOrderNumber(orderNumber: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: true,
        payments: true,
        refunds: true,
        shipments: true,
        shippingAddress: true,
        billingAddress: true,
      },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderNumber} not found`);
    }

    return order;
  }

  /**
   * List orders with filters
   */
  async findAll(filters: {
    userId?: string;
    status?: string;
    paymentStatus?: string;
    from?: Date;
    to?: Date;
    skip?: number;
    take?: number;
  }) {
    const where: any = {};

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.paymentStatus) {
      where.paymentStatus = filters.paymentStatus;
    }

    if (filters.from || filters.to) {
      where.createdAt = {};
      if (filters.from) {
        where.createdAt.gte = filters.from;
      }
      if (filters.to) {
        where.createdAt.lte = filters.to;
      }
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          items: true,
          payments: { take: 1, orderBy: { createdAt: 'desc' } },
          shipments: { take: 1, orderBy: { createdAt: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
        skip: filters.skip || 0,
        take: filters.take || 50,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders,
      pagination: {
        total,
        skip: filters.skip || 0,
        take: filters.take || 50,
      },
    };
  }

  /**
   * Update order status
   */
  async updateStatus(orderId: string, status: string, actor?: string) {
    const order = await this.findOne(orderId);

    // Validate state transition
    this.validateStatusTransition(order.status, status);

    const updates: any = { status };

    // Set timestamps based on status
    if (status === 'paid' && !order.paidAt) {
      updates.paidAt = new Date();
    } else if (status === 'fulfilled' && !order.fulfilledAt) {
      updates.fulfilledAt = new Date();
      updates.fulfillmentStatus = 'fulfilled';
    } else if (status === 'closed' && !order.closedAt) {
      updates.closedAt = new Date();
    } else if (status === 'canceled' && !order.canceledAt) {
      updates.canceledAt = new Date();
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: updates,
      include: {
        items: true,
        payments: true,
        refunds: true,
        shipments: true,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        entityType: 'order',
        entityId: orderId,
        action: 'status_changed',
        actor: actor || 'system',
        actorType: actor ? 'admin' : 'system',
        changes: {
          field: 'status',
          from: order.status,
          to: status,
        },
      },
    });

    // Emit event
    await this.eventsService.publish(`order.${status}`, {
      id: uuidv4(),
      type: `order.${status}`,
      timestamp: new Date(),
      resource: `order:${orderId}`,
      payload: {
        orderId,
        orderNumber: order.orderNumber,
        status,
        previousStatus: order.status,
      },
    });

    return updated;
  }

  /**
   * Cancel order
   */
  async cancel(orderId: string, reason?: string, actor?: string) {
    const order = await this.findOne(orderId);

    if (!['created', 'paid', 'processing'].includes(order.status)) {
      throw new BadRequestException(
        `Cannot cancel order in ${order.status} status`,
      );
    }

    // If paid, would need to process refund
    if (order.paymentStatus === 'captured' || order.paymentStatus === 'authorized') {
      throw new BadRequestException(
        'Cannot cancel paid order without refund. Use refund endpoint.',
      );
    }

    await this.updateStatus(orderId, 'canceled', actor);

    await this.eventsService.publish('order.canceled', {
      id: uuidv4(),
      type: 'order.canceled',
      timestamp: new Date(),
      resource: `order:${orderId}`,
      payload: {
        orderId,
        orderNumber: order.orderNumber,
        reason,
        actor,
      },
    });

    return this.findOne(orderId);
  }

  /**
   * Get orders by multiple IDs (bulk fetch)
   */
  async findByIds(ids: string[]) {
    return this.prisma.order.findMany({
      where: { id: { in: ids } },
      include: {
        items: true,
        payments: { take: 1, orderBy: { createdAt: 'desc' } },
        shipments: { take: 1, orderBy: { createdAt: 'desc' } },
        shippingAddress: true,
        billingAddress: true,
      },
    });
  }

  /**
   * Validate status transition
   */
  private validateStatusTransition(currentStatus: string, newStatus: string) {
    const validTransitions: Record<string, string[]> = {
      created: ['paid', 'canceled'],
      paid: ['processing', 'fulfilled', 'refunded', 'canceled'],
      processing: ['fulfilled', 'refunded', 'canceled'],
      fulfilled: ['closed', 'refunded'],
      closed: [],
      refunded: ['closed'],
      canceled: [],
    };

    const allowed = validTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
      );
    }
  }
}
