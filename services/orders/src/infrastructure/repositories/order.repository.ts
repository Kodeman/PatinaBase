/**
 * Order Repository - Prisma Implementation
 *
 * Infrastructure implementation of IOrderRepository.
 * Handles all Prisma-specific code and uses OrderMapper for conversions.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { PrismaClient } from '../../generated/prisma-client';
import {
  IOrderRepository,
  FindOrdersOptions,
  TransactionContext,
  PaginatedResult,
} from '../../domain/repositories/order.repository.interface';
import { Order } from '../../domain/entities/order.entity';
import { OrderStatusValue } from '../../domain/value-objects/order-status.vo';
import { OrderMapper, PrismaOrderWithRelations } from '../mappers/order.mapper';

/**
 * Prisma transaction context
 */
type PrismaTransaction = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use'>;

@Injectable()
export class OrderRepository implements IOrderRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Get Prisma client or transaction
   */
  private getClient(tx?: TransactionContext): PrismaClient | PrismaTransaction {
    return (tx as unknown as PrismaTransaction) || this.prisma;
  }

  /**
   * Default include for order queries
   */
  private get defaultInclude(): Prisma.OrderInclude {
    return {
      items: {
        orderBy: { createdAt: 'asc' },
      },
      shippingAddress: true,
      billingAddress: true,
    };
  }

  async findById(id: string, tx?: TransactionContext): Promise<Order | null> {
    const client = this.getClient(tx);

    const prismaOrder = await client.order.findUnique({
      where: { id },
      include: this.defaultInclude,
    });

    if (!prismaOrder) {
      return null;
    }

    return OrderMapper.toDomain(prismaOrder as PrismaOrderWithRelations);
  }

  async findByOrderNumber(orderNumber: string, tx?: TransactionContext): Promise<Order | null> {
    const client = this.getClient(tx);

    const prismaOrder = await client.order.findUnique({
      where: { orderNumber },
      include: this.defaultInclude,
    });

    if (!prismaOrder) {
      return null;
    }

    return OrderMapper.toDomain(prismaOrder as PrismaOrderWithRelations);
  }

  async findByUserId(
    userId: string,
    options?: FindOrdersOptions,
    tx?: TransactionContext,
  ): Promise<PaginatedResult<Order>> {
    const mergedOptions: FindOrdersOptions = {
      ...options,
      userId,
    };

    return this.findMany(mergedOptions, tx);
  }

  async findMany(options: FindOrdersOptions, tx?: TransactionContext): Promise<PaginatedResult<Order>> {
    const client = this.getClient(tx);

    const where: Prisma.OrderWhereInput = this.buildWhereClause(options);

    const orderBy = this.buildOrderBy(options);

    const [prismaOrders, total] = await Promise.all([
      client.order.findMany({
        where,
        include: this.defaultInclude,
        skip: options.skip || 0,
        take: options.take || 50,
        orderBy,
      }),
      client.order.count({ where }),
    ]);

    const orders = OrderMapper.toDomainArray(prismaOrders as PrismaOrderWithRelations[]);

    return {
      data: orders,
      total,
      skip: options.skip || 0,
      take: options.take || 50,
    };
  }

  async findByStatus(status: OrderStatusValue, tx?: TransactionContext): Promise<Order[]> {
    const client = this.getClient(tx);

    const prismaOrders = await client.order.findMany({
      where: { status },
      include: this.defaultInclude,
      orderBy: { createdAt: 'desc' },
    });

    return OrderMapper.toDomainArray(prismaOrders as PrismaOrderWithRelations[]);
  }

  async findByIds(ids: string[], tx?: TransactionContext): Promise<Order[]> {
    const client = this.getClient(tx);

    const prismaOrders = await client.order.findMany({
      where: {
        id: { in: ids },
      },
      include: this.defaultInclude,
    });

    return OrderMapper.toDomainArray(prismaOrders as PrismaOrderWithRelations[]);
  }

  async save(order: Order, tx?: TransactionContext): Promise<Order> {
    const client = this.getClient(tx);

    const { order: orderData, items } = OrderMapper.toPrismaCreate(order);

    // Create order with items in a transaction
    const prismaOrder = await client.order.create({
      data: {
        ...orderData,
        items: {
          createMany: {
            data: items,
          },
        },
      },
      include: this.defaultInclude,
    });

    return OrderMapper.toDomain(prismaOrder as PrismaOrderWithRelations);
  }

  async update(order: Order, tx?: TransactionContext): Promise<Order> {
    const client = this.getClient(tx);

    const { order: orderData, items } = OrderMapper.toPrismaUpdate(order);

    // Update order and replace items
    const prismaOrder = await client.order.update({
      where: { id: order.getId() },
      data: {
        ...orderData,
        items: {
          // Delete existing items and create new ones
          deleteMany: {},
          createMany: {
            data: items,
          },
        },
      },
      include: this.defaultInclude,
    });

    return OrderMapper.toDomain(prismaOrder as PrismaOrderWithRelations);
  }

  async delete(id: string, tx?: TransactionContext): Promise<void> {
    const client = this.getClient(tx);

    // Soft delete by setting status to canceled and adding timestamp
    await client.order.update({
      where: { id },
      data: {
        status: 'canceled',
        canceledAt: new Date(),
      },
    });
  }

  async exists(id: string, tx?: TransactionContext): Promise<boolean> {
    const client = this.getClient(tx);

    const count = await client.order.count({
      where: { id },
    });

    return count > 0;
  }

  async count(options?: FindOrdersOptions, tx?: TransactionContext): Promise<number> {
    const client = this.getClient(tx);

    const where: Prisma.OrderWhereInput = options ? this.buildWhereClause(options) : {};

    return client.order.count({ where });
  }

  async generateOrderNumber(): Promise<string> {
    // Generate order number in format: ORD-YYYYMMDD-XXXX
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;

    // Find the last order number for today
    const lastOrder = await this.prisma.order.findFirst({
      where: {
        orderNumber: {
          startsWith: `ORD-${datePrefix}`,
        },
      },
      orderBy: {
        orderNumber: 'desc',
      },
    });

    let sequence = 1;
    if (lastOrder) {
      const lastSequence = parseInt(lastOrder.orderNumber.split('-')[2], 10);
      sequence = lastSequence + 1;
    }

    const sequenceStr = String(sequence).padStart(4, '0');
    return `ORD-${datePrefix}-${sequenceStr}`;
  }

  async runInTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (prismaTransaction) => {
      return work(prismaTransaction as unknown as TransactionContext);
    });
  }

  /**
   * Build WHERE clause from find options
   */
  private buildWhereClause(options: FindOrdersOptions): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = {};

    if (options.userId) {
      where.userId = options.userId;
    }

    if (options.status) {
      where.status = options.status;
    }

    if (options.paymentStatus) {
      where.paymentStatus = options.paymentStatus;
    }

    if (options.fulfillmentStatus) {
      where.fulfillmentStatus = options.fulfillmentStatus;
    }

    if (options.fromDate || options.toDate) {
      where.createdAt = {};
      if (options.fromDate) {
        where.createdAt.gte = options.fromDate;
      }
      if (options.toDate) {
        where.createdAt.lte = options.toDate;
      }
    }

    return where;
  }

  /**
   * Build ORDER BY clause from find options
   */
  private buildOrderBy(options: FindOrdersOptions): Prisma.OrderOrderByWithRelationInput {
    const orderBy = options.orderBy || 'createdAt';
    const direction = options.orderDirection || 'desc';

    return {
      [orderBy]: direction,
    };
  }
}
