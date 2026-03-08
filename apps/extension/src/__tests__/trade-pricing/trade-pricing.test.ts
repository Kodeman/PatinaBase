import { describe, it, expect } from 'vitest';
import { calculateTradePrice, formatPrice } from '../../lib/trade-pricing';

describe('calculateTradePrice', () => {
  it('calculates 20% discount correctly', () => {
    // $1,299.00 retail with 20% discount
    const result = calculateTradePrice(129900, 20);
    expect(result).toBe(103920); // $1,039.20
  });

  it('calculates 40% discount correctly', () => {
    // $500.00 retail with 40% discount
    const result = calculateTradePrice(50000, 40);
    expect(result).toBe(30000); // $300.00
  });

  it('handles 0% discount (no discount)', () => {
    const result = calculateTradePrice(100000, 0);
    expect(result).toBe(100000);
  });

  it('handles 100% discount', () => {
    const result = calculateTradePrice(100000, 100);
    expect(result).toBe(0);
  });

  it('rounds to nearest cent', () => {
    // $99.99 with 15% discount = $84.9915 → rounds to $84.99 (8499 cents)
    const result = calculateTradePrice(9999, 15);
    expect(result).toBe(8499);
  });

  it('handles fractional discount percentages', () => {
    // $1,000.00 with 22.5% discount = $775.00
    const result = calculateTradePrice(100000, 22.5);
    expect(result).toBe(77500);
  });

  it('handles small prices', () => {
    // $1.00 with 10% discount = $0.90
    const result = calculateTradePrice(100, 10);
    expect(result).toBe(90);
  });

  it('handles large prices', () => {
    // $50,000.00 with 30% discount = $35,000.00
    const result = calculateTradePrice(5000000, 30);
    expect(result).toBe(3500000);
  });
});

describe('formatPrice', () => {
  it('formats whole dollar amounts', () => {
    expect(formatPrice(100000)).toBe('$1,000.00');
  });

  it('formats cents correctly', () => {
    expect(formatPrice(129900)).toBe('$1,299.00');
  });

  it('formats with cents precision', () => {
    expect(formatPrice(103920)).toBe('$1,039.20');
  });

  it('formats zero', () => {
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('formats small amounts', () => {
    expect(formatPrice(99)).toBe('$0.99');
  });

  it('formats large amounts with commas', () => {
    expect(formatPrice(5000000)).toBe('$50,000.00');
  });
});
