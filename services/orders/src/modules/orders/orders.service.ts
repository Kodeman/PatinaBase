import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { OrdersAuthorizationResolver } from '../../common/authorization/orders-authorization.resolver';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaClient,
    private configService: ConfigService,
    @Inject('EVENTS_SERVICE') private eventsService: any,
    private readonly authorization: OrdersAuthorizationResolver,
  ) {}

  /**
   * Find order by ID
   */
  async findOne(id: string, subject: string) {
    return this.authorization.authorize(subject, 'read', (database, _auth, scope) =>
      this.authorization.requireOrder(database, scope, { id }, {
        items: true,
        payments: true,
        refunds: true,
        shipments: true,
        shippingAddress: true,
        billingAddress: true,
      }),
    );
  }

  /**
   * Find order by order number
   */
  async findByOrderNumber(orderNumber: string, subject: string) {
    return this.authorization.authorize(subject, 'read', (database, _auth, scope) =>
      this.authorization.requireOrder(database, scope, { orderNumber }, {
        items: true,
        payments: true,
        refunds: true,
        shipments: true,
        shippingAddress: true,
        billingAddress: true,
      }),
    );
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
  }, subject: string) {
    const where: any = {};

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

    return this.authorization.authorize(subject, 'read', async (database, _auth, scope) => {
      const scopedWhere = { AND: [scope, where] };
      const skip = Math.max(0, Number(filters.skip) || 0);
      const take = Math.min(100, Math.max(1, Number(filters.take) || 50));
      const [orders, total] = await Promise.all([
        database.order.findMany({
          where: scopedWhere,
          include: {
            items: true,
            payments: { take: 1, orderBy: { createdAt: 'desc' } },
            shipments: { take: 1, orderBy: { createdAt: 'desc' } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        database.order.count({ where: scopedWhere }),
      ]);
      return { data: orders, pagination: { total, skip, take } };
    });
  }

  /**
   * Update order status
   */
  async update(
    orderId: string,
    input: {
      status?: string;
      fulfillmentStatus?: string;
      shippingMethod?: string;
      customerNotes?: string;
      internalNotes?: string;
    },
    subject: string,
  ) {
    return this.authorization.authorize(subject, 'manage', async (database, _auth, scope) => {
      const order = await this.authorization.requireOrder(database, scope, { id: orderId });
      if (input.status !== undefined) this.validateStatusTransition(order.status, input.status);
      const data = {
        status: input.status,
        fulfillmentStatus: input.fulfillmentStatus,
        shippingMethod: input.shippingMethod,
        customerNotes: input.customerNotes,
        internalNotes: input.internalNotes,
      };
      if (Object.values(data).every((value) => value === undefined)) {
        throw new BadRequestException('No supported order fields supplied');
      }
      const updated = await database.order.update({
        where: { id: orderId },
        data,
        include: { items: true, payments: true, refunds: true, shipments: true },
      });
      await database.auditLog.create({
        data: {
          entityType: 'order',
          entityId: orderId,
          action: 'updated',
          actor: subject,
          actorType: 'user',
          changes: { fields: Object.keys(data).filter((key) => data[key as keyof typeof data] !== undefined) },
        },
      });
      return updated;
    });
  }

  async updateStatus(orderId: string, status: string, subject: string) {
    const { order, updated } = await this.authorization.authorize(
      subject,
      'manage',
      async (database, _auth, scope) => {
        const order = await this.authorization.requireOrder(database, scope, { id: orderId });
        this.validateStatusTransition(order.status, status);
        const updates: any = { status };
        if (status === 'paid' && !order.paidAt) updates.paidAt = new Date();
        else if (status === 'fulfilled' && !order.fulfilledAt) {
          updates.fulfilledAt = new Date();
          updates.fulfillmentStatus = 'fulfilled';
        } else if (status === 'closed' && !order.closedAt) updates.closedAt = new Date();
        else if (status === 'canceled' && !order.canceledAt) updates.canceledAt = new Date();

        const updated = await database.order.update({
          where: { id: orderId },
          data: updates,
          include: { items: true, payments: true, refunds: true, shipments: true },
        });
        await database.auditLog.create({
          data: {
            entityType: 'order',
            entityId: orderId,
            action: 'status_changed',
            actor: subject,
            actorType: 'user',
            changes: { field: 'status', from: order.status, to: status },
          },
        });
        return { order, updated };
      },
    );

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
  async cancel(orderId: string, reason: string | undefined, subject: string) {
    const order = await this.authorization.authorize(
      subject,
      'manage',
      (database, _auth, scope) =>
        this.authorization.requireOrder(database, scope, { id: orderId }),
    );

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

    await this.updateStatus(orderId, 'canceled', subject);

    await this.eventsService.publish('order.canceled', {
      id: uuidv4(),
      type: 'order.canceled',
      timestamp: new Date(),
      resource: `order:${orderId}`,
      payload: {
        orderId,
        orderNumber: order.orderNumber,
        reason,
        actor: subject,
      },
    });

    return this.findOne(orderId, subject);
  }

  /**
   * Get orders by multiple IDs (bulk fetch)
   */
  async findByIds(ids: string[], subject: string) {
    return this.authorization.authorize(subject, 'read', (database, _auth, scope) =>
      database.order.findMany({
        where: { AND: [{ id: { in: ids } }, scope] },
        include: {
          items: true,
          payments: { take: 1, orderBy: { createdAt: 'desc' } },
          shipments: { take: 1, orderBy: { createdAt: 'desc' } },
          shippingAddress: true,
          billingAddress: true,
        },
      }),
    );
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
