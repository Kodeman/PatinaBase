/**
 * FulfillmentStatus Value Object
 *
 * Represents the fulfillment status of an order.
 */

import { InvalidOrderStatusError } from '../exceptions/order.exceptions';

export type FulfillmentStatusValue = 'unfulfilled' | 'partial' | 'fulfilled';

export class FulfillmentStatus {
  private static readonly VALID_STATUSES: FulfillmentStatusValue[] = ['unfulfilled', 'partial', 'fulfilled'];

  private constructor(private readonly value: FulfillmentStatusValue) {
    this.validate();
  }

  private validate(): void {
    if (!FulfillmentStatus.VALID_STATUSES.includes(this.value)) {
      throw new InvalidOrderStatusError(`Invalid fulfillment status: ${this.value}`);
    }
  }

  getValue(): FulfillmentStatusValue {
    return this.value;
  }

  isUnfulfilled(): boolean {
    return this.value === 'unfulfilled';
  }

  isPartial(): boolean {
    return this.value === 'partial';
  }

  isFulfilled(): boolean {
    return this.value === 'fulfilled';
  }

  equals(other: FulfillmentStatus): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  static create(status: FulfillmentStatusValue): FulfillmentStatus {
    return new FulfillmentStatus(status);
  }

  static createInitial(): FulfillmentStatus {
    return new FulfillmentStatus('unfulfilled');
  }

  static isValidStatus(status: string): status is FulfillmentStatusValue {
    return FulfillmentStatus.VALID_STATUSES.includes(status as FulfillmentStatusValue);
  }
}
