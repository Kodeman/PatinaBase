/**
 * Domain Exceptions for Orders
 *
 * These exceptions represent domain-level business rule violations.
 */

export class InvalidOrderStatusError extends Error {
  constructor(status: string) {
    super(`Invalid order status: ${status}`);
    this.name = 'InvalidOrderStatusError';
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid status transition from ${from} to ${to}`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export class OrderCannotBeModifiedError extends Error {
  constructor(orderId: string, reason: string) {
    super(`Order ${orderId} cannot be modified: ${reason}`);
    this.name = 'OrderCannotBeModifiedError';
  }
}

export class InvalidOrderItemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderItemError';
  }
}

export class InvalidPaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPaymentError';
  }
}

export class OrderNotFoundError extends Error {
  constructor(identifier: string) {
    super(`Order not found: ${identifier}`);
    this.name = 'OrderNotFoundError';
  }
}

export class InvalidOrderOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderOperationError';
  }
}
