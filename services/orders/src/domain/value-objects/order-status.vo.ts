/**
 * OrderStatus Value Object
 *
 * Represents the status of an order with state machine validation.
 * Ensures only valid state transitions can occur.
 */

import { InvalidOrderStatusError, InvalidStatusTransitionError } from '../exceptions/order.exceptions';

export type OrderStatusValue =
  | 'created'
  | 'paid'
  | 'processing'
  | 'fulfilled'
  | 'closed'
  | 'refunded'
  | 'canceled';

export class OrderStatus {
  /**
   * Valid state transitions map
   * Key: current status, Value: array of allowed next statuses
   */
  private static readonly VALID_TRANSITIONS: Record<OrderStatusValue, OrderStatusValue[]> = {
    created: ['paid', 'canceled'],
    paid: ['processing', 'fulfilled', 'refunded', 'canceled'],
    processing: ['fulfilled', 'refunded', 'canceled'],
    fulfilled: ['closed', 'refunded'],
    closed: [], // Terminal state
    refunded: ['closed'],
    canceled: [], // Terminal state
  };

  /**
   * Terminal states (no further transitions allowed)
   */
  private static readonly TERMINAL_STATES: OrderStatusValue[] = ['closed', 'canceled'];

  private constructor(private readonly value: OrderStatusValue) {
    this.validate();
  }

  private validate(): void {
    if (!OrderStatus.VALID_TRANSITIONS.hasOwnProperty(this.value)) {
      throw new InvalidOrderStatusError(this.value);
    }
  }

  /**
   * Get the status value
   */
  getValue(): OrderStatusValue {
    return this.value;
  }

  /**
   * Check if transition to a new status is allowed
   */
  canTransitionTo(newStatus: OrderStatusValue): boolean {
    const allowedTransitions = OrderStatus.VALID_TRANSITIONS[this.value];
    return allowedTransitions.includes(newStatus);
  }

  /**
   * Transition to a new status (returns new OrderStatus instance)
   */
  transitionTo(newStatus: OrderStatusValue): OrderStatus {
    if (!this.canTransitionTo(newStatus)) {
      throw new InvalidStatusTransitionError(this.value, newStatus);
    }
    return new OrderStatus(newStatus);
  }

  /**
   * Check if status is terminal (no further transitions allowed)
   */
  isTerminal(): boolean {
    return OrderStatus.TERMINAL_STATES.includes(this.value);
  }

  /**
   * Check if status allows modifications
   */
  allowsModifications(): boolean {
    return ['created', 'paid'].includes(this.value);
  }

  /**
   * Check if status is paid
   */
  isPaid(): boolean {
    return ['paid', 'processing', 'fulfilled', 'closed'].includes(this.value);
  }

  /**
   * Check if status is fulfilled
   */
  isFulfilled(): boolean {
    return ['fulfilled', 'closed'].includes(this.value);
  }

  /**
   * Check if status is canceled or refunded
   */
  isCanceledOrRefunded(): boolean {
    return ['canceled', 'refunded'].includes(this.value);
  }

  /**
   * Check equality with another OrderStatus
   */
  equals(other: OrderStatus): boolean {
    return this.value === other.value;
  }

  /**
   * Convert to string
   */
  toString(): string {
    return this.value;
  }

  /**
   * Convert to JSON
   */
  toJSON(): string {
    return this.value;
  }

  /**
   * Factory method to create OrderStatus
   */
  static create(status: OrderStatusValue): OrderStatus {
    return new OrderStatus(status);
  }

  /**
   * Create initial status for new orders
   */
  static createInitial(): OrderStatus {
    return new OrderStatus('created');
  }

  /**
   * Get all valid statuses
   */
  static getAllStatuses(): OrderStatusValue[] {
    return Object.keys(OrderStatus.VALID_TRANSITIONS) as OrderStatusValue[];
  }

  /**
   * Get valid transitions from a given status
   */
  static getValidTransitions(from: OrderStatusValue): OrderStatusValue[] {
    return OrderStatus.VALID_TRANSITIONS[from] || [];
  }

  /**
   * Check if a status value is valid
   */
  static isValidStatus(status: string): status is OrderStatusValue {
    return OrderStatus.VALID_TRANSITIONS.hasOwnProperty(status);
  }
}
