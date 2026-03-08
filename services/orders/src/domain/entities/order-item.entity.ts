/**
 * OrderItem Entity
 *
 * Represents an individual item in an order.
 * Part of the Order aggregate.
 */

import { Money } from '@patina/types';
import { InvalidOrderItemError } from '../exceptions/order.exceptions';

export interface OrderItemProps {
  id: string;
  orderId: string;
  productId: string;
  variantId: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  unitPrice: Money;
  taxAmount: Money;
  discountAmount: Money;
  subtotal: Money;
  total: Money;
  snapshot: any; // Product snapshot at order time
  metadata: Record<string, any> | null;
  quantityFulfilled: number;
  quantityRefunded: number;
  createdAt: Date;
}

export interface CreateOrderItemProps {
  productId: string;
  variantId?: string | null;
  name: string;
  sku?: string | null;
  quantity: number;
  unitPrice: Money;
  taxAmount?: Money;
  discountAmount?: Money;
  snapshot?: any;
  metadata?: Record<string, any>;
}

export class OrderItem {
  private props: OrderItemProps;

  private constructor(props: OrderItemProps) {
    this.props = props;
    this.validate();
  }

  private validate(): void {
    if (!this.props.productId) {
      throw new InvalidOrderItemError('Product ID is required');
    }

    if (!this.props.name || this.props.name.trim().length === 0) {
      throw new InvalidOrderItemError('Product name is required');
    }

    if (this.props.quantity <= 0) {
      throw new InvalidOrderItemError('Quantity must be greater than zero');
    }

    if (this.props.unitPrice.isNegative()) {
      throw new InvalidOrderItemError('Unit price cannot be negative');
    }

    if (this.props.quantityFulfilled < 0) {
      throw new InvalidOrderItemError('Quantity fulfilled cannot be negative');
    }

    if (this.props.quantityRefunded < 0) {
      throw new InvalidOrderItemError('Quantity refunded cannot be negative');
    }

    if (this.props.quantityFulfilled > this.props.quantity) {
      throw new InvalidOrderItemError('Quantity fulfilled cannot exceed ordered quantity');
    }

    if (this.props.quantityRefunded > this.props.quantity) {
      throw new InvalidOrderItemError('Quantity refunded cannot exceed ordered quantity');
    }
  }

  // Getters
  getId(): string {
    return this.props.id;
  }

  getOrderId(): string {
    return this.props.orderId;
  }

  getProductId(): string {
    return this.props.productId;
  }

  getVariantId(): string | null {
    return this.props.variantId;
  }

  getName(): string {
    return this.props.name;
  }

  getSku(): string | null {
    return this.props.sku;
  }

  getQuantity(): number {
    return this.props.quantity;
  }

  getUnitPrice(): Money {
    return this.props.unitPrice;
  }

  getTaxAmount(): Money {
    return this.props.taxAmount;
  }

  getDiscountAmount(): Money {
    return this.props.discountAmount;
  }

  getSubtotal(): Money {
    return this.props.subtotal;
  }

  getTotal(): Money {
    return this.props.total;
  }

  getSnapshot(): any {
    return this.props.snapshot;
  }

  getMetadata(): Record<string, any> | null {
    return this.props.metadata;
  }

  getQuantityFulfilled(): number {
    return this.props.quantityFulfilled;
  }

  getQuantityRefunded(): number {
    return this.props.quantityRefunded;
  }

  getQuantityRemaining(): number {
    return this.props.quantity - this.props.quantityFulfilled - this.props.quantityRefunded;
  }

  getCreatedAt(): Date {
    return this.props.createdAt;
  }

  // Business logic methods
  updateQuantity(newQuantity: number): void {
    if (newQuantity <= 0) {
      throw new InvalidOrderItemError('Quantity must be greater than zero');
    }

    this.props.quantity = newQuantity;
    this.recalculateTotals();
    this.validate();
  }

  updateUnitPrice(newPrice: Money): void {
    if (newPrice.isNegative()) {
      throw new InvalidOrderItemError('Unit price cannot be negative');
    }

    this.props.unitPrice = newPrice;
    this.recalculateTotals();
  }

  applyDiscount(discountAmount: Money): void {
    if (discountAmount.isNegative()) {
      throw new InvalidOrderItemError('Discount amount cannot be negative');
    }

    if (discountAmount.greaterThan(this.props.subtotal)) {
      throw new InvalidOrderItemError('Discount cannot exceed subtotal');
    }

    this.props.discountAmount = discountAmount;
    this.recalculateTotals();
  }

  setTaxAmount(taxAmount: Money): void {
    if (taxAmount.isNegative()) {
      throw new InvalidOrderItemError('Tax amount cannot be negative');
    }

    this.props.taxAmount = taxAmount;
    this.recalculateTotals();
  }

  fulfill(quantity: number): void {
    if (quantity <= 0) {
      throw new InvalidOrderItemError('Fulfill quantity must be greater than zero');
    }

    const newFulfilled = this.props.quantityFulfilled + quantity;
    if (newFulfilled > this.props.quantity) {
      throw new InvalidOrderItemError('Cannot fulfill more than ordered quantity');
    }

    this.props.quantityFulfilled = newFulfilled;
  }

  refund(quantity: number): void {
    if (quantity <= 0) {
      throw new InvalidOrderItemError('Refund quantity must be greater than zero');
    }

    const newRefunded = this.props.quantityRefunded + quantity;
    if (newRefunded > this.props.quantity) {
      throw new InvalidOrderItemError('Cannot refund more than ordered quantity');
    }

    this.props.quantityRefunded = newRefunded;
  }

  isFulfilled(): boolean {
    return this.props.quantityFulfilled === this.props.quantity;
  }

  isPartiallyFulfilled(): boolean {
    return this.props.quantityFulfilled > 0 && this.props.quantityFulfilled < this.props.quantity;
  }

  isRefunded(): boolean {
    return this.props.quantityRefunded === this.props.quantity;
  }

  isPartiallyRefunded(): boolean {
    return this.props.quantityRefunded > 0 && this.props.quantityRefunded < this.props.quantity;
  }

  private recalculateTotals(): void {
    // Subtotal = quantity * unit price
    this.props.subtotal = this.props.unitPrice.multiply(this.props.quantity);

    // Total = subtotal - discount + tax
    this.props.total = this.props.subtotal.subtract(this.props.discountAmount).add(this.props.taxAmount);
  }

  toProps(): OrderItemProps {
    return { ...this.props };
  }

  // Factory methods
  static create(createProps: CreateOrderItemProps, orderId: string, id?: string): OrderItem {
    const currency = createProps.unitPrice.getCurrency();

    const subtotal = createProps.unitPrice.multiply(createProps.quantity);
    const taxAmount = createProps.taxAmount || Money.zero(currency);
    const discountAmount = createProps.discountAmount || Money.zero(currency);
    const total = subtotal.subtract(discountAmount).add(taxAmount);

    const props: OrderItemProps = {
      id: id || '', // Will be set by repository
      orderId,
      productId: createProps.productId,
      variantId: createProps.variantId || null,
      name: createProps.name,
      sku: createProps.sku || null,
      quantity: createProps.quantity,
      unitPrice: createProps.unitPrice,
      taxAmount,
      discountAmount,
      subtotal,
      total,
      snapshot: createProps.snapshot || null,
      metadata: createProps.metadata || null,
      quantityFulfilled: 0,
      quantityRefunded: 0,
      createdAt: new Date(),
    };

    return new OrderItem(props);
  }

  static reconstitute(props: OrderItemProps): OrderItem {
    return new OrderItem(props);
  }
}
