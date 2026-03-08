/**
 * PaymentStatus Value Object
 *
 * Represents the payment status of an order.
 */

import { InvalidOrderStatusError } from '../exceptions/order.exceptions';

export type PaymentStatusValue =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'refunded'
  | 'failed'
  | 'canceled'
  | 'partially_refunded';

export class PaymentStatus {
  private static readonly VALID_STATUSES: PaymentStatusValue[] = [
    'pending',
    'authorized',
    'captured',
    'refunded',
    'failed',
    'canceled',
    'partially_refunded',
  ];

  private constructor(private readonly value: PaymentStatusValue) {
    this.validate();
  }

  private validate(): void {
    if (!PaymentStatus.VALID_STATUSES.includes(this.value)) {
      throw new InvalidOrderStatusError(`Invalid payment status: ${this.value}`);
    }
  }

  getValue(): PaymentStatusValue {
    return this.value;
  }

  isPending(): boolean {
    return this.value === 'pending';
  }

  isAuthorized(): boolean {
    return this.value === 'authorized';
  }

  isCaptured(): boolean {
    return this.value === 'captured';
  }

  isRefunded(): boolean {
    return this.value === 'refunded' || this.value === 'partially_refunded';
  }

  isFailed(): boolean {
    return this.value === 'failed';
  }

  isCanceled(): boolean {
    return this.value === 'canceled';
  }

  isSuccessful(): boolean {
    return ['authorized', 'captured'].includes(this.value);
  }

  equals(other: PaymentStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  static create(status: PaymentStatusValue): PaymentStatus {
    return new PaymentStatus(status);
  }

  static createInitial(): PaymentStatus {
    return new PaymentStatus('pending');
  }

  static isValidStatus(status: string): status is PaymentStatusValue {
    return PaymentStatus.VALID_STATUSES.includes(status as PaymentStatusValue);
  }
}
