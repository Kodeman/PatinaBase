import { describe, it, expect } from 'vitest';
import { extractPriceFromString } from '../../lib/extraction/price';

describe('extractPriceFromString', () => {
  it('parses USD with dollar sign', () => {
    const result = extractPriceFromString('$1,299.00');
    expect(result).not.toBeNull();
    expect(result!.value).toBe(129900);
    expect(result!.currency).toBe('USD');
  });

  it('parses USD without commas', () => {
    const result = extractPriceFromString('$499.99');
    expect(result!.value).toBe(49999);
  });

  it('parses whole dollar amount', () => {
    const result = extractPriceFromString('$1,200');
    expect(result).not.toBeNull();
    expect(result!.value).toBe(120000);
  });

  it('parses GBP', () => {
    const result = extractPriceFromString('£899.00');
    expect(result).not.toBeNull();
    expect(result!.currency).toBe('GBP');
    expect(result!.value).toBe(89900);
  });

  it('parses EUR with European decimal format', () => {
    const result = extractPriceFromString('€1.299,00');
    expect(result).not.toBeNull();
    expect(result!.currency).toBe('EUR');
    expect(result!.value).toBe(129900);
  });

  it('parses "USD" prefix', () => {
    const result = extractPriceFromString('USD 1299.00');
    expect(result).not.toBeNull();
    expect(result!.value).toBe(129900);
  });

  it('returns null for text without a price', () => {
    expect(extractPriceFromString('no price here')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractPriceFromString('')).toBeNull();
  });

  it('returns null for zero price', () => {
    expect(extractPriceFromString('$0.00')).toBeNull();
  });

  it('handles price with surrounding text', () => {
    const result = extractPriceFromString('Sale Price: $2,499.00 (was $3,200)');
    expect(result).not.toBeNull();
    expect(result!.value).toBe(249900);
  });

  it('parses price in context of "price:" label', () => {
    const result = extractPriceFromString('price: $599.99');
    expect(result!.value).toBe(59999);
  });
});
