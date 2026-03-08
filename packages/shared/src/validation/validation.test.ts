import { describe, it, expect } from 'vitest';
import {
  captureRequestSchema,
  productCreateSchema,
  productFilterSchema,
  paginationSchema,
} from './index';

describe('captureRequestSchema', () => {
  it('validates a valid capture request', () => {
    const input = {
      url: 'https://example.com/product',
      title: 'Test Product',
      price: '$199.99',
      images: ['https://example.com/img.jpg'],
      description: 'A great product',
      dimensions: '24" x 18" x 12"',
    };
    expect(captureRequestSchema.safeParse(input).success).toBe(true);
  });

  it('requires url and title', () => {
    expect(captureRequestSchema.safeParse({}).success).toBe(false);
    expect(captureRequestSchema.safeParse({ url: 'https://example.com' }).success).toBe(false);
  });

  it('validates url format', () => {
    const input = {
      url: 'not-a-url',
      title: 'Test',
      price: null,
      images: [],
      description: null,
      dimensions: null,
    };
    expect(captureRequestSchema.safeParse(input).success).toBe(false);
  });
});

describe('productCreateSchema', () => {
  it('validates product creation input', () => {
    const input = {
      name: 'Modern Chair',
      sourceUrl: 'https://example.com/chair',
      images: ['https://example.com/chair.jpg'],
    };
    const result = productCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts optional fields', () => {
    const input = {
      name: 'Modern Chair',
      sourceUrl: 'https://example.com/chair',
      images: ['https://example.com/chair.jpg'],
      description: 'A beautiful chair',
      priceRetail: 19999,
      materials: ['wood', 'leather'],
    };
    const result = productCreateSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('validates price is positive', () => {
    const input = {
      name: 'Chair',
      sourceUrl: 'https://example.com/chair',
      images: ['https://example.com/chair.jpg'],
      priceRetail: -100,
    };
    expect(productCreateSchema.safeParse(input).success).toBe(false);
  });

  it('requires at least one image', () => {
    const input = {
      name: 'Chair',
      sourceUrl: 'https://example.com/chair',
      images: [],
    };
    expect(productCreateSchema.safeParse(input).success).toBe(false);
  });
});

describe('productFilterSchema', () => {
  it('validates filter options', () => {
    const input = {
      search: 'chair',
      priceMin: 1000,
      priceMax: 50000,
    };
    expect(productFilterSchema.safeParse(input).success).toBe(true);
  });

  it('accepts empty filter', () => {
    expect(productFilterSchema.safeParse({}).success).toBe(true);
  });

  it('validates vendor IDs as UUIDs', () => {
    const input = {
      vendorIds: ['123e4567-e89b-12d3-a456-426614174000'],
    };
    expect(productFilterSchema.safeParse(input).success).toBe(true);
  });

  it('rejects invalid UUIDs', () => {
    const input = {
      vendorIds: ['not-a-uuid'],
    };
    expect(productFilterSchema.safeParse(input).success).toBe(false);
  });
});

describe('paginationSchema', () => {
  it('validates pagination input', () => {
    const input = { page: 1, pageSize: 20 };
    expect(paginationSchema.safeParse(input).success).toBe(true);
  });

  it('requires positive page number', () => {
    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
    expect(paginationSchema.safeParse({ page: -1 }).success).toBe(false);
  });

  it('limits pageSize to 100', () => {
    expect(paginationSchema.safeParse({ pageSize: 100 }).success).toBe(true);
    expect(paginationSchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it('uses defaults when not provided', () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
  });
});
