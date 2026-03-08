/**
 * Order Application Service
 *
 * Orchestrates use cases and coordinates domain logic.
 * Depends on IOrderRepository (not PrismaService!).
 * Testable without a database.
 */

import { Injectable, Inject, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import {
  IOrderRepository,
  ORDER_REPOSITORY,
  PaginatedResult,
} from '../../domain/repositories/order.repository.interface';
import { Order } from '../../domain/entities/order.entity';
import { Money, AddressVO as Address } from '@patina/types';
import { OrderNotFoundError } from '../../domain/exceptions/order.exceptions';
import { CreateOrderItemProps } from '../../domain/entities/order-item.entity';
import {
  CreateOrderCommand,
  CreateOrderItemCommand,
} from '../commands/create-order.command';
import { UpdateOrderStatusCommand } from '../commands/update-order-status.command';
import { CancelOrderCommand } from '../commands/cancel-order.command';
import { MarkOrderPaidCommand } from '../commands/mark-order-paid.command';
import {
  UpdateOrderItemQuantityCommand,
  RemoveOrderItemCommand,
} from '../commands/update-order-items.command';
import {
  GetOrderByIdQuery,
  GetOrderByOrderNumberQuery,
} from '../queries/get-order.query';
import { ListOrdersQuery } from '../queries/list-orders.query';

/**
 * Simple event emitter interface
 */
interface EventEmitter {
  emit(event: string, payload: any): void;
}

@Injectable()
export class OrderApplicationService {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orderRepository: IOrderRepository,
    @Optional() private readonly eventEmitter?: EventEmitter,
  ) {}

  /**
   * Query: Get order by ID
   */
  async getOrderById(query: GetOrderByIdQuery): Promise<Order> {
    const order = await this.orderRepository.findById(query.orderId);

    if (!order) {
      throw new NotFoundException(`Order not found: ${query.orderId}`);
    }

    return order;
  }

  /**
   * Query: Get order by order number
   */
  async getOrderByOrderNumber(query: GetOrderByOrderNumberQuery): Promise<Order> {
    const order = await this.orderRepository.findByOrderNumber(query.orderNumber);

    if (!order) {
      throw new NotFoundException(`Order not found: ${query.orderNumber}`);
    }

    return order;
  }

  /**
   * Query: List orders with filters
   */
  async listOrders(query: ListOrdersQuery): Promise<PaginatedResult<Order>> {
    return this.orderRepository.findMany({
      userId: query.userId,
      status: query.status,
      paymentStatus: query.paymentStatus,
      fulfillmentStatus: query.fulfillmentStatus,
      fromDate: query.fromDate,
      toDate: query.toDate,
      skip: query.skip,
      take: query.take,
      orderBy: query.orderBy,
      orderDirection: query.orderDirection,
    });
  }

  /**
   * Command: Create new order
   */
  async createOrder(command: CreateOrderCommand): Promise<Order> {
    // Generate order number
    const orderNumber = await this.orderRepository.generateOrderNumber();

    // Convert command items to domain props
    const items: CreateOrderItemProps[] = command.items.map((item) =>
      this.mapCommandItemToProps(item),
    );

    // Create shipping address
    const shippingAddress = Address.create(command.shippingAddress);

    // Create billing address (use shipping if not provided)
    const billingAddress = command.billingAddress
      ? Address.create(command.billingAddress)
      : shippingAddress;

    // Create domain entity
    const order = Order.create(
      {
        userId: command.userId,
        cartId: command.cartId,
        currency: command.currency,
        shippingAddress,
        billingAddress,
        shippingMethod: command.shippingMethod,
        customerNotes: command.customerNotes,
        items,
        metadata: command.metadata,
      },
      orderNumber,
    );

    // Persist
    const savedOrder = await this.orderRepository.save(order);

    // Emit event
    this.eventEmitter?.emit('order.created', {
      orderId: savedOrder.getId(),
      orderNumber: savedOrder.getOrderNumber(),
      userId: savedOrder.getUserId(),
      total: savedOrder.getTotal().getAmount(),
      currency: savedOrder.getCurrency(),
    });

    return savedOrder;
  }

  /**
   * Command: Update order status
   */
  async updateOrderStatus(command: UpdateOrderStatusCommand): Promise<Order> {
    return this.orderRepository.runInTransaction(async (tx) => {
      // Fetch order
      const order = await this.orderRepository.findById(command.orderId, tx);
      if (!order) {
        throw new NotFoundException(`Order not found: ${command.orderId}`);
      }

      const previousStatus = order.getStatus().getValue();

      // Transition status (domain logic validates transition)
      order.transitionStatus(command.newStatus);

      // Add internal notes if reason provided
      if (command.reason) {
        order.addInternalNotes(
          `Status changed from ${previousStatus} to ${command.newStatus}. Reason: ${command.reason}`,
        );
      }

      // Persist
      const updatedOrder = await this.orderRepository.update(order, tx);

      // Emit event
      this.eventEmitter?.emit('order.status_changed', {
        orderId: updatedOrder.getId(),
        orderNumber: updatedOrder.getOrderNumber(),
        previousStatus,
        newStatus: command.newStatus,
        actorId: command.actorId,
      });

      return updatedOrder;
    });
  }

  /**
   * Command: Mark order as paid
   */
  async markOrderAsPaid(command: MarkOrderPaidCommand): Promise<Order> {
    return this.orderRepository.runInTransaction(async (tx) => {
      const order = await this.orderRepository.findById(command.orderId, tx);
      if (!order) {
        throw new NotFoundException(`Order not found: ${command.orderId}`);
      }

      // Mark as paid (domain logic validates state)
      order.markAsPaid(command.paymentIntentId, command.customerId);

      // Persist
      const updatedOrder = await this.orderRepository.update(order, tx);

      // Emit event
      this.eventEmitter?.emit('order.paid', {
        orderId: updatedOrder.getId(),
        orderNumber: updatedOrder.getOrderNumber(),
        total: updatedOrder.getTotal().getAmount(),
        currency: updatedOrder.getCurrency(),
        paymentIntentId: command.paymentIntentId,
      });

      return updatedOrder;
    });
  }

  /**
   * Command: Cancel order
   */
  async cancelOrder(command: CancelOrderCommand): Promise<Order> {
    return this.orderRepository.runInTransaction(async (tx) => {
      const order = await this.orderRepository.findById(command.orderId, tx);
      if (!order) {
        throw new NotFoundException(`Order not found: ${command.orderId}`);
      }

      // Cancel order (domain logic validates)
      order.cancel(command.reason);

      // Persist
      const updatedOrder = await this.orderRepository.update(order, tx);

      // Emit event
      this.eventEmitter?.emit('order.canceled', {
        orderId: updatedOrder.getId(),
        orderNumber: updatedOrder.getOrderNumber(),
        reason: command.reason,
        actorId: command.actorId,
      });

      return updatedOrder;
    });
  }

  /**
   * Command: Update order item quantity
   */
  async updateOrderItemQuantity(command: UpdateOrderItemQuantityCommand): Promise<Order> {
    return this.orderRepository.runInTransaction(async (tx) => {
      const order = await this.orderRepository.findById(command.orderId, tx);
      if (!order) {
        throw new NotFoundException(`Order not found: ${command.orderId}`);
      }

      // Update item quantity (domain logic validates)
      order.updateItemQuantity(command.itemId, command.newQuantity);

      // Persist
      const updatedOrder = await this.orderRepository.update(order, tx);

      // Emit event
      this.eventEmitter?.emit('order.item_updated', {
        orderId: updatedOrder.getId(),
        orderNumber: updatedOrder.getOrderNumber(),
        itemId: command.itemId,
        newQuantity: command.newQuantity,
      });

      return updatedOrder;
    });
  }

  /**
   * Command: Remove order item
   */
  async removeOrderItem(command: RemoveOrderItemCommand): Promise<Order> {
    return this.orderRepository.runInTransaction(async (tx) => {
      const order = await this.orderRepository.findById(command.orderId, tx);
      if (!order) {
        throw new NotFoundException(`Order not found: ${command.orderId}`);
      }

      // Remove item (domain logic validates)
      order.removeItem(command.itemId);

      // Persist
      const updatedOrder = await this.orderRepository.update(order, tx);

      // Emit event
      this.eventEmitter?.emit('order.item_removed', {
        orderId: updatedOrder.getId(),
        orderNumber: updatedOrder.getOrderNumber(),
        itemId: command.itemId,
      });

      return updatedOrder;
    });
  }

  /**
   * Command: Mark order as fulfilled
   */
  async markOrderAsFulfilled(orderId: string): Promise<Order> {
    return this.orderRepository.runInTransaction(async (tx) => {
      const order = await this.orderRepository.findById(orderId, tx);
      if (!order) {
        throw new NotFoundException(`Order not found: ${orderId}`);
      }

      // Mark as fulfilled (domain logic validates)
      order.markAsFulfilled();

      // Persist
      const updatedOrder = await this.orderRepository.update(order, tx);

      // Emit event
      this.eventEmitter?.emit('order.fulfilled', {
        orderId: updatedOrder.getId(),
        orderNumber: updatedOrder.getOrderNumber(),
      });

      return updatedOrder;
    });
  }

  /**
   * Command: Close order
   */
  async closeOrder(orderId: string): Promise<Order> {
    return this.orderRepository.runInTransaction(async (tx) => {
      const order = await this.orderRepository.findById(orderId, tx);
      if (!order) {
        throw new NotFoundException(`Order not found: ${orderId}`);
      }

      // Close order (domain logic validates)
      order.close();

      // Persist
      const updatedOrder = await this.orderRepository.update(order, tx);

      // Emit event
      this.eventEmitter?.emit('order.closed', {
        orderId: updatedOrder.getId(),
        orderNumber: updatedOrder.getOrderNumber(),
      });

      return updatedOrder;
    });
  }

  /**
   * Helper: Map command item to domain props
   */
  private mapCommandItemToProps(item: CreateOrderItemCommand): CreateOrderItemProps {
    const currency = item.currency || 'USD';

    return {
      productId: item.productId,
      variantId: item.variantId,
      name: item.name,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: Money.create(item.unitPrice, currency as any),
      taxAmount: item.taxAmount ? Money.create(item.taxAmount, currency as any) : undefined,
      discountAmount: item.discountAmount ? Money.create(item.discountAmount, currency as any) : undefined,
      snapshot: item.snapshot,
      metadata: item.metadata,
    };
  }
}
