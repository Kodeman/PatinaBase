/**
 * Money Value Object
 *
 * Immutable value object representing monetary amounts.
 * Ensures proper decimal precision and currency handling.
 * Provides arithmetic operations with currency validation.
 */

export class InvalidMoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoneyError';
  }
}

export class CurrencyMismatchError extends Error {
  constructor(currency1: Currency, currency2: Currency) {
    super(`Cannot perform operation on different currencies: ${currency1} and ${currency2}`);
    this.name = 'CurrencyMismatchError';
  }
}

export type Currency = 'USD' | 'CAD' | 'EUR' | 'GBP' | 'AUD';

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  CAD: 'CA$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
};

export const CURRENCY_DECIMALS: Record<Currency, number> = {
  USD: 2,
  CAD: 2,
  EUR: 2,
  GBP: 2,
  AUD: 2,
};

export class Money {
  private static readonly MAX_SAFE_AMOUNT = Number.MAX_SAFE_INTEGER / 100;
  private static readonly MIN_SAFE_AMOUNT = Number.MIN_SAFE_INTEGER / 100;

  private constructor(
    private readonly amount: number,
    private readonly currency: Currency,
  ) {
    this.validate();
  }

  private validate(): void {
    if (!isFinite(this.amount)) {
      throw new InvalidMoneyError('Amount must be finite');
    }

    if (isNaN(this.amount)) {
      throw new InvalidMoneyError('Amount cannot be NaN');
    }

    if (this.amount < Money.MIN_SAFE_AMOUNT || this.amount > Money.MAX_SAFE_AMOUNT) {
      throw new InvalidMoneyError('Amount exceeds safe integer range');
    }

    if (!this.currency || !CURRENCY_SYMBOLS[this.currency]) {
      throw new InvalidMoneyError(`Invalid currency: ${this.currency}`);
    }
  }

  /**
   * Get the amount value
   */
  getAmount(): number {
    return this.amount;
  }

  /**
   * Get the currency code
   */
  getCurrency(): Currency {
    return this.currency;
  }

  /**
   * Get the currency symbol
   */
  getCurrencySymbol(): string {
    return CURRENCY_SYMBOLS[this.currency];
  }

  /**
   * Check if the amount is zero
   */
  isZero(): boolean {
    return this.amount === 0;
  }

  /**
   * Check if the amount is positive
   */
  isPositive(): boolean {
    return this.amount > 0;
  }

  /**
   * Check if the amount is negative
   */
  isNegative(): boolean {
    return this.amount < 0;
  }

  /**
   * Add another money value
   */
  add(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  /**
   * Subtract another money value
   */
  subtract(other: Money): Money {
    this.ensureSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  /**
   * Multiply by a factor
   */
  multiply(factor: number): Money {
    if (!isFinite(factor) || isNaN(factor)) {
      throw new InvalidMoneyError('Multiplication factor must be finite');
    }
    return new Money(this.amount * factor, this.currency);
  }

  /**
   * Divide by a divisor
   */
  divide(divisor: number): Money {
    if (divisor === 0) {
      throw new InvalidMoneyError('Cannot divide by zero');
    }
    if (!isFinite(divisor) || isNaN(divisor)) {
      throw new InvalidMoneyError('Division divisor must be finite');
    }
    return new Money(this.amount / divisor, this.currency);
  }

  /**
   * Get absolute value
   */
  abs(): Money {
    return new Money(Math.abs(this.amount), this.currency);
  }

  /**
   * Negate the amount
   */
  negate(): Money {
    return new Money(-this.amount, this.currency);
  }

  /**
   * Compare with another money value
   * Returns: -1 if less, 0 if equal, 1 if greater
   */
  compare(other: Money): number {
    this.ensureSameCurrency(other);
    if (this.amount < other.amount) return -1;
    if (this.amount > other.amount) return 1;
    return 0;
  }

  /**
   * Check if equal to another money value
   */
  equals(other: Money): boolean {
    return this.amount === other.amount && this.currency === other.currency;
  }

  /**
   * Check if greater than another money value
   */
  greaterThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this.amount > other.amount;
  }

  /**
   * Check if greater than or equal to another money value
   */
  greaterThanOrEqual(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this.amount >= other.amount;
  }

  /**
   * Check if less than another money value
   */
  lessThan(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this.amount < other.amount;
  }

  /**
   * Check if less than or equal to another money value
   */
  lessThanOrEqual(other: Money): boolean {
    this.ensureSameCurrency(other);
    return this.amount <= other.amount;
  }

  /**
   * Allocate money into portions based on ratios
   * Ensures no money is lost due to rounding
   */
  allocate(ratios: number[]): Money[] {
    if (ratios.length === 0) {
      throw new InvalidMoneyError('Cannot allocate with empty ratios');
    }

    if (ratios.some((r) => r < 0)) {
      throw new InvalidMoneyError('Allocation ratios must be non-negative');
    }

    const total = ratios.reduce((sum, ratio) => sum + ratio, 0);
    if (total === 0) {
      throw new InvalidMoneyError('Total allocation ratio cannot be zero');
    }

    const decimals = CURRENCY_DECIMALS[this.currency];
    const multiplier = Math.pow(10, decimals);
    const amountInCents = Math.round(this.amount * multiplier);

    let remainder = amountInCents;
    const results: Money[] = [];

    for (let i = 0; i < ratios.length; i++) {
      const share = Math.floor((amountInCents * ratios[i]) / total);
      results.push(new Money(share / multiplier, this.currency));
      remainder -= share;
    }

    // Distribute remainder
    for (let i = 0; i < remainder; i++) {
      const index = i % results.length;
      results[index] = results[index].add(new Money(1 / multiplier, this.currency));
    }

    return results;
  }

  /**
   * Format as string with currency symbol
   */
  format(options: { showSymbol?: boolean; decimals?: number } = {}): string {
    const { showSymbol = true, decimals = CURRENCY_DECIMALS[this.currency] } = options;
    const formattedAmount = this.amount.toFixed(decimals);
    return showSymbol ? `${this.getCurrencySymbol()}${formattedAmount}` : formattedAmount;
  }

  /**
   * Convert to string representation
   */
  toString(): string {
    return this.format();
  }

  /**
   * Convert to JSON representation
   */
  toJSON(): { amount: number; currency: Currency } {
    return {
      amount: this.amount,
      currency: this.currency,
    };
  }

  /**
   * Ensure two money values have the same currency
   */
  private ensureSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(this.currency, other.currency);
    }
  }

  /**
   * Factory method to create a Money value object
   */
  static create(amount: number, currency: Currency = 'USD'): Money {
    const decimals = CURRENCY_DECIMALS[currency];
    const roundedAmount = Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
    return new Money(roundedAmount, currency);
  }

  /**
   * Create a zero money value
   */
  static zero(currency: Currency = 'USD'): Money {
    return new Money(0, currency);
  }

  /**
   * Create money from cents/minor units
   */
  static fromCents(cents: number, currency: Currency = 'USD'): Money {
    const decimals = CURRENCY_DECIMALS[currency];
    return new Money(cents / Math.pow(10, decimals), currency);
  }

  /**
   * Create money from string
   */
  static fromString(value: string, currency: Currency = 'USD'): Money {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const amount = parseFloat(cleaned);

    if (isNaN(amount)) {
      throw new InvalidMoneyError(`Cannot parse money value: ${value}`);
    }

    return Money.create(amount, currency);
  }

  /**
   * Sum an array of money values
   */
  static sum(values: Money[]): Money {
    if (values.length === 0) {
      throw new InvalidMoneyError('Cannot sum empty array');
    }

    return values.reduce((sum, value) => sum.add(value), Money.zero(values[0].currency));
  }

  /**
   * Get the minimum of multiple money values
   */
  static min(...values: Money[]): Money {
    if (values.length === 0) {
      throw new InvalidMoneyError('Cannot get minimum of empty array');
    }

    return values.reduce((min, value) => (value.lessThan(min) ? value : min));
  }

  /**
   * Get the maximum of multiple money values
   */
  static max(...values: Money[]): Money {
    if (values.length === 0) {
      throw new InvalidMoneyError('Cannot get maximum of empty array');
    }

    return values.reduce((max, value) => (value.greaterThan(max) ? value : max));
  }
}
