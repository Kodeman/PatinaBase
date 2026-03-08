import { describe, it, expect } from 'vitest';
import {
  formatPrice,
  parsePrice,
  formatDimensions,
  slugify,
  truncate,
  deepMerge,
  safeJsonParse,
} from './index';

describe('formatPrice', () => {
  it('formats cents to USD currency', () => {
    expect(formatPrice(1999)).toBe('$19.99');
    expect(formatPrice(100)).toBe('$1.00');
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('handles large amounts', () => {
    expect(formatPrice(999999)).toBe('$9,999.99');
  });
});

describe('parsePrice', () => {
  it('parses price strings to cents', () => {
    expect(parsePrice('$19.99')).toBe(1999);
    expect(parsePrice('19.99')).toBe(1999);
    expect(parsePrice('$1,999.99')).toBe(199999);
  });

  it('returns null for invalid input', () => {
    expect(parsePrice('invalid')).toBe(null);
    expect(parsePrice('')).toBe(null);
  });

  it('handles whole numbers', () => {
    expect(parsePrice('$20')).toBe(2000);
  });
});

describe('formatDimensions', () => {
  it('formats dimensions with all values', () => {
    expect(formatDimensions({ width: 30, height: 24, depth: 18, unit: 'in' })).toBe('30" × 24" × 18"');
  });

  it('handles null values', () => {
    expect(formatDimensions({ width: 30, height: null, depth: 18, unit: 'in' })).toBe('30" × 18"');
    expect(formatDimensions(null)).toBe('');
  });
});

describe('slugify', () => {
  it('converts text to slug', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('Mid-Century Modern')).toBe('mid-century-modern');
  });

  it('removes special characters', () => {
    expect(slugify('Chair (Oak)')).toBe('chair-oak');
    expect(slugify('Price: $199')).toBe('price-199');
  });

  it('handles multiple spaces', () => {
    expect(slugify('too   many   spaces')).toBe('too-many-spaces');
  });
});

describe('truncate', () => {
  it('truncates long text', () => {
    expect(truncate('This is a very long text', 10)).toBe('This is...');
  });

  it('returns original if within limit', () => {
    expect(truncate('Short', 10)).toBe('Short');
  });

  it('handles exact length', () => {
    expect(truncate('Exactly10!', 10)).toBe('Exactly10!');
  });
});

describe('deepMerge', () => {
  it('merges objects deeply', () => {
    const target = { a: 1, b: { c: 2, d: 3 } };
    const source: Partial<typeof target> = { b: { c: 5, d: 3 } };
    expect(deepMerge(target, source)).toEqual({ a: 1, b: { c: 5, d: 3 } });
  });

  it('handles arrays as values', () => {
    const target = { items: [1, 2] };
    const source: Partial<typeof target> = { items: [3, 4] };
    expect(deepMerge(target, source)).toEqual({ items: [3, 4] });
  });

  it('adds new top-level properties', () => {
    const target = { a: 1 } as Record<string, unknown>;
    const source = { b: 2 };
    expect(deepMerge(target, source)).toEqual({ a: 1, b: 2 });
  });
});

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeJsonParse('invalid', { default: true })).toEqual({ default: true });
  });
});
