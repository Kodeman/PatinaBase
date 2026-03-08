/**
 * Order Entity (Aggregate Root)
 *
 * Represents a customer order with items, payments, and fulfillments.
 * All modifications to order items must go through this aggregate root.
 */

import { Money, AddressVO as Address } from '@patina/types';
import {
  OrderCannotBeModifiedError,
  InvalidOrderOperationError,
  InvalidOrderItemError,
} from '../exceptions/order.exceptions';
import { OrderStatus, OrderStatusValue } from '../value-objects/order-status.vo';
import { PaymentStatus, PaymentStatusValue } from '../value-objects/payment-status.vo';
import { FulfillmentStatus, FulfillmentStatusValue } from '../value-objects/fulfillment-status.vo';
import { OrderItem, CreateOrderItemProps } from './order-item.entity';

export interface OrderProps {
  id: string;
  orderNumber: string;
  userId: string;
  cartId: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  currency: string;
  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  shippingTotal: Money;
  total: Money;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  shippingMethod: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  metadata: Record<string, any> | null;
  snapshot: any; // Order snapshot
  items: OrderItem[];
  // Payment integration fields
  paymentIntentId: string | null;
  checkoutSessionId: string | null;
  customerId: string | null;
  // Timestamps
  paidAt: Date | null;
  fulfilledAt: Date | null;
  closedAt: Date | null;
  canceledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderProps {
  userId: string;
  cartId?: string | null;
  currency?: string;
  shippingAddress: Address;
  billingAddress?: Address;
  shippingMethod?: string;
  customerNotes?: string;
  items: CreateOrderItemProps[];
  metadata?: Record<string, any>;
}

export class Order {
  private props: OrderProps;

  private constructor(props: OrderProps) {
    this.props = props;
    this.validate();
  }

  private validate(): void {
    if (!this.props.userId) {
      throw new InvalidOrderOperationError('User ID is required');
    }

    if (!this.props.orderNumber) {
      throw new InvalidOrderOperationError('Order number is required');
    }

    if (this.props.items.length === 0) {
      throw new InvalidOrderOperationError('Order must have at least one item');
    }

    if (!this.props.shippingAddress) {
      throw new InvalidOrderOperationError('Shipping address is required');
    }
  }

  // Getters
  getId(): string {
    return this.props.id;
  }

  getOrderNumber(): string {
    return this.props.orderNumber;
  }

  getUserId(): string {
    return this.props.userId;
  }

  getCartId(): string | null {
    return this.props.cartId;
  }

  getStatus(): OrderStatus {
    return this.props.status;
  }

  getPaymentStatus(): PaymentStatus {
    return this.props.paymentStatus;
  }

  getFulfillmentStatus(): FulfillmentStatus {
    return this.props.fulfillmentStatus;
  }

  getCurrency(): string {
    return this.props.currency;
  }

  getSubtotal(): Money {
    return this.props.subtotal;
  }

  getDiscountTotal(): Money {
    return this.props.discountTotal;
  }

  getTaxTotal(): Money {
    return this.props.taxTotal;
  }

  getShippingTotal(): Money {
    return this.props.shippingTotal;
  }

  getTotal(): Money {
    return this.props.total;
  }

  getShippingAddress(): Address | null {
    return this.props.shippingAddress;
  }

  getBillingAddress(): Address | null {
    return this.props.billingAddress;
  }

  getShippingMethod(): string | null {
    return this.props.shippingMethod;
  }

  getCustomerNotes(): string | null {
    return this.props.customerNotes;
  }

  getInternalNotes(): string | null {
    return this.props.internalNotes;
  }

  getMetadata(): Record<string, any> | null {
    return this.props.metadata;
  }

  getSnapshot(): any {
    return this.props.snapshot;
  }

  getItems(): ReadonlyArray<OrderItem> {
    return [...this.props.items];
  }

  getPaymentIntentId(): string | null {
    return this.props.paymentIntentId;
  }

  getCheckoutSessionId(): string | null {
    return this.props.checkoutSessionId;
  }

  getCustomerId(): string | null {
    return this.props.customerId;
  }

  getPaidAt(): Date | null {
    return this.props.paidAt;
  }

  getFulfilledAt(): Date | null {
    return this.props.fulfilledAt;
  }

  getClosedAt(): Date | null {
    return this.props.closedAt;
  }

  getCanceledAt(): Date | null {
    return this.props.canceledAt;
  }

  getCreatedAt(): Date {
    return this.props.createdAt;
  }

  getUpdatedAt(): Date {
    return this.props.updatedAt;
  }

  // Business logic methods

  /**
   * Check if order can be modified
   */
  canBeModified(): boolean {
    return this.props.status.allowsModifications();
  }

  /**
   * Ensure order can be modified, throw if not
   */
  private ensureCanBeModified(): void {
    if (!this.canBeModified()) {
      throw new OrderCannotBeModifiedError(
        this.props.id,
        `Order is in ${this.props.status.getValue()} status`,
      );
    }
  }

  /**
   * Add item to order
   */
  addItem(itemProps: CreateOrderItemProps): void {
    this.ensureCanBeModified();

    const newItem = OrderItem.create(itemProps, this.props.id);
    this.props.items.push(newItem);
    this.recalculateTotals();
    this.props.updatedAt = new Date();
  }

  /**
   * Remove item from order
   */
  removeItem(itemId: string): void {
    this.ensureCanBeModified();

    const initialLength = this.props.items.length;
    this.props.items = this.props.items.filter((item) => item.getId() !== itemId);

    if (this.props.items.length === initialLength) {
      throw new InvalidOrderItemError(`Item ${itemId} not found in order`);
    }

    if (this.props.items.length === 0) {
      throw new InvalidOrderOperationError('Order must have at least one item');
    }

    this.recalculateTotals();
    this.props.updatedAt = new Date();
  }

  /**
   * Update item quantity
   */
  updateItemQuantity(itemId: string, newQuantity: number): void {
    this.ensureCanBeModified();

    const item = this.props.items.find((i) => i.getId() === itemId);
    if (!item) {
      throw new InvalidOrderItemError(`Item ${itemId} not found in order`);
    }

    item.updateQuantity(newQuantity);
    this.recalculateTotals();
    this.props.updatedAt = new Date();
  }

  /**
   * Apply discount to order
   */
  applyDiscount(discountAmount: Money): void {
    this.ensureCanBeModified();

    if (discountAmount.isNegative()) {
      throw new InvalidOrderOperationError('Discount amount cannot be negative');
    }

    if (discountAmount.greaterThan(this.props.subtotal)) {
      throw new InvalidOrderOperationError('Discount cannot exceed subtotal');
    }

    this.props.discountTotal = discountAmount;
    this.recalculateTotals();
    this.props.updatedAt = new Date();
  }

  /**
   * Set shipping cost
   */
  setShippingCost(shippingCost: Money): void {
    this.ensureCanBeModified();

    if (shippingCost.isNegative()) {
      throw new InvalidOrderOperationError('Shipping cost cannot be negative');
    }

    this.props.shippingTotal = shippingCost;
    this.recalculateTotals();
    this.props.updatedAt = new Date();
  }

  /**
   * Update shipping address
   */
  updateShippingAddress(address: Address): void {
    this.ensureCanBeModified();
    this.props.shippingAddress = address;
    this.props.updatedAt = new Date();
  }

  /**
   * Update billing address
   */
  updateBillingAddress(address: Address): void {
    this.ensureCanBeModified();
    this.props.billingAddress = address;
    this.props.updatedAt = new Date();
  }

  /**
   * Transition order status
   */
  transitionStatus(newStatus: OrderStatusValue): void {
    this.props.status = this.props.status.transitionTo(newStatus);
    this.updateStatusTimestamps(newStatus);
    this.props.updatedAt = new Date();
  }

  /**
   * Mark order as paid
   */
  markAsPaid(paymentIntentId?: string, customerId?: string): void {
    if (this.props.paymentStatus.isCaptured()) {
      throw new InvalidOrderOperationError('Order is already paid');
    }

    this.transitionStatus('paid');
    this.props.paymentStatus = PaymentStatus.create('captured');
    this.props.paidAt = new Date();

    if (paymentIntentId) {
      this.props.paymentIntentId = paymentIntentId;
    }
    if (customerId) {
      this.props.customerId = customerId;
    }

    this.props.updatedAt = new Date();
  }

  /**
   * Mark order as fulfilled
   */
  markAsFulfilled(): void {
    if (!this.props.status.isPaid()) {
      throw new InvalidOrderOperationError('Order must be paid before fulfillment');
    }

    this.transitionStatus('fulfilled');
    this.props.fulfillmentStatus = FulfillmentStatus.create('fulfilled');
    this.props.fulfilledAt = new Date();
    this.props.updatedAt = new Date();
  }

  /**
   * Cancel order
   */
  cancel(reason?: string): void {
    if (this.props.status.isTerminal()) {
      throw new InvalidOrderOperationError('Cannot cancel order in terminal status');
    }

    if (this.props.paymentStatus.isCaptured()) {
      throw new InvalidOrderOperationError('Cannot cancel paid order without refund');
    }

    this.transitionStatus('canceled');
    this.props.canceledAt = new Date();

    if (reason && this.props.internalNotes) {
      this.props.internalNotes += `\nCancellation reason: ${reason}`;
    } else if (reason) {
      this.props.internalNotes = `Cancellation reason: ${reason}`;
    }

    this.props.updatedAt = new Date();
  }

  /**
   * Refund order
   */
  refund(): void {
    if (!this.props.paymentStatus.isCaptured()) {
      throw new InvalidOrderOperationError('Cannot refund unpaid order');
    }

    this.transitionStatus('refunded');
    this.props.paymentStatus = PaymentStatus.create('refunded');
    this.props.updatedAt = new Date();
  }

  /**
   * Close order (final state)
   */
  close(): void {
    if (!this.props.status.isFulfilled()) {
      throw new InvalidOrderOperationError('Only fulfilled orders can be closed');
    }

    this.transitionStatus('closed');
    this.props.closedAt = new Date();
    this.props.updatedAt = new Date();
  }

  /**
   * Add internal notes
   */
  addInternalNotes(notes: string): void {
    if (this.props.internalNotes) {
      this.props.internalNotes += `\n${notes}`;
    } else {
      this.props.internalNotes = notes;
    }
    this.props.updatedAt = new Date();
  }

  /**
   * Set payment integration fields
   */
  setPaymentIntegration(paymentIntentId: string, checkoutSessionId?: string): void {
    this.props.paymentIntentId = paymentIntentId;
    if (checkoutSessionId) {
      this.props.checkoutSessionId = checkoutSessionId;
    }
    this.props.updatedAt = new Date();
  }

  /**
   * Update payment status
   */
  updatePaymentStatus(status: PaymentStatusValue): void {
    this.props.paymentStatus = PaymentStatus.create(status);
    this.props.updatedAt = new Date();
  }

  /**
   * Update fulfillment status based on items
   */
  updateFulfillmentStatus(): void {
    const totalItems = this.props.items.reduce((sum, item) => sum + item.getQuantity(), 0);
    const fulfilledItems = this.props.items.reduce((sum, item) => sum + item.getQuantityFulfilled(), 0);

    if (fulfilledItems === 0) {
      this.props.fulfillmentStatus = FulfillmentStatus.create('unfulfilled');
    } else if (fulfilledItems < totalItems) {
      this.props.fulfillmentStatus = FulfillmentStatus.create('partial');
    } else {
      this.props.fulfillmentStatus = FulfillmentStatus.create('fulfilled');
      this.props.fulfilledAt = new Date();
    }

    this.props.updatedAt = new Date();
  }

  /**
   * Recalculate order totals based on items
   */
  private recalculateTotals(): void {
    const currency = this.props.currency;

    // Calculate subtotal from items
    this.props.subtotal = this.props.items.reduce(
      (sum, item) => sum.add(item.getSubtotal()),
      Money.zero(currency as any),
    );

    // Calculate tax total from items
    this.props.taxTotal = this.props.items.reduce(
      (sum, item) => sum.add(item.getTaxAmount()),
      Money.zero(currency as any),
    );

    // Total = subtotal - discount + tax + shipping
    this.props.total = this.props.subtotal
      .subtract(this.props.discountTotal)
      .add(this.props.taxTotal)
      .add(this.props.shippingTotal);
  }

  /**
   * Update timestamps based on status
   */
  private updateStatusTimestamps(status: OrderStatusValue): void {
    const now = new Date();
    switch (status) {
      case 'paid':
        if (!this.props.paidAt) {
          this.props.paidAt = now;
        }
        break;
      case 'fulfilled':
        if (!this.props.fulfilledAt) {
          this.props.fulfilledAt = now;
        }
        break;
      case 'closed':
        if (!this.props.closedAt) {
          this.props.closedAt = now;
        }
        break;
      case 'canceled':
        if (!this.props.canceledAt) {
          this.props.canceledAt = now;
        }
        break;
    }
  }

  toProps(): OrderProps {
    return {
      ...this.props,
      items: [...this.props.items],
    };
  }

  // Factory methods

  /**
   * Create a new order
   */
  static create(createProps: CreateOrderProps, orderNumber?: string, id?: string): Order {
    const currency = createProps.currency || 'USD';

    const items = createProps.items.map((itemProps) => OrderItem.create(itemProps, id || '', undefined));

    const subtotal = items.reduce(
      (sum, item) => sum.add(item.getSubtotal()),
      Money.zero(currency as any),
    );

    const taxTotal = items.reduce(
      (sum, item) => sum.add(item.getTaxAmount()),
      Money.zero(currency as any),
    );

    const props: OrderProps = {
      id: id || '', // Will be set by repository
      orderNumber: orderNumber || '', // Will be generated by repository
      userId: createProps.userId,
      cartId: createProps.cartId || null,
      status: OrderStatus.createInitial(),
      paymentStatus: PaymentStatus.createInitial(),
      fulfillmentStatus: FulfillmentStatus.createInitial(),
      currency,
      subtotal,
      discountTotal: Money.zero(currency as any),
      taxTotal,
      shippingTotal: Money.zero(currency as any),
      total: subtotal.add(taxTotal),
      shippingAddress: createProps.shippingAddress,
      billingAddress: createProps.billingAddress || createProps.shippingAddress,
      shippingMethod: createProps.shippingMethod || null,
      customerNotes: createProps.customerNotes || null,
      internalNotes: null,
      metadata: createProps.metadata || null,
      snapshot: {}, // Will be populated with order snapshot
      items,
      paymentIntentId: null,
      checkoutSessionId: null,
      customerId: null,
      paidAt: null,
      fulfilledAt: null,
      closedAt: null,
      canceledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return new Order(props);
  }

  /**
   * Reconstitute order from persistence
   */
  static reconstitute(props: OrderProps): Order {
    return new Order(props);
  }
}
