/**
 * Order Repository Interface
 *
 * Defines the contract for persisting and retrieving Order aggregates.
 * Infrastructure layer provides the implementation.
 */

import { Order } from '../entities/order.entity';
import { OrderStatusValue } from '../value-objects/order-status.vo';
import { PaymentStatusValue } from '../value-objects/payment-status.vo';
import { FulfillmentStatusValue } from '../value-objects/fulfillment-status.vo';

/**
 * Transaction context for running operations in a transaction
 */
export interface TransactionContext {
  // Opaque type - actual implementation depends on persistence layer
  __brand: 'TransactionContext';
}

export interface FindOrdersOptions {
  userId?: string;
  status?: OrderStatusValue;
  paymentStatus?: PaymentStatusValue;
  fulfillmentStatus?: FulfillmentStatusValue;
  fromDate?: Date;
  toDate?: Date;
  skip?: number;
  take?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'total';
  orderDirection?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  skip: number;
  take: number;
}

/**
 * Order Repository Interface
 */
export interface IOrderRepository {
  /**
   * Find order by ID
   */
  findById(id: string, tx?: TransactionContext): Promise<Order | null>;

  /**
   * Find order by order number
   */
  findByOrderNumber(orderNumber: string, tx?: TransactionContext): Promise<Order | null>;

  /**
   * Find orders by user ID
   */
  findByUserId(userId: string, options?: FindOrdersOptions, tx?: TransactionContext): Promise<PaginatedResult<Order>>;

  /**
   * Find multiple orders with filters
   */
  findMany(options: FindOrdersOptions, tx?: TransactionContext): Promise<PaginatedResult<Order>>;

  /**
   * Find orders by status
   */
  findByStatus(status: OrderStatusValue, tx?: TransactionContext): Promise<Order[]>;

  /**
   * Find orders by multiple IDs
   */
  findByIds(ids: string[], tx?: TransactionContext): Promise<Order[]>;

  /**
   * Save a new order
   */
  save(order: Order, tx?: TransactionContext): Promise<Order>;

  /**
   * Update an existing order
   */
  update(order: Order, tx?: TransactionContext): Promise<Order>;

  /**
   * Delete an order (soft delete recommended)
   */
  delete(id: string, tx?: TransactionContext): Promise<void>;

  /**
   * Check if order exists
   */
  exists(id: string, tx?: TransactionContext): Promise<boolean>;

  /**
   * Count orders with filters
   */
  count(options?: FindOrdersOptions, tx?: TransactionContext): Promise<number>;

  /**
   * Generate unique order number
   */
  generateOrderNumber(): Promise<string>;

  /**
   * Run operations in a transaction
   */
  runInTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

/**
 * Dependency injection token
 */
export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');
