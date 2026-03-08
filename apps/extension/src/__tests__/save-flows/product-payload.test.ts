import { describe, it, expect } from 'vitest';
import { buildProductInsertPayload } from '../../lib/payloads';
import type { ExtractedProductData } from '@patina/shared';

// Columns that exist on the `products` table
const PRODUCTS_COLUMNS = new Set([
  'id', 'name', 'description', 'source_url', 'images', 'price_retail',
  'materials', 'colors', 'finish', 'available_colors', 'dimensions',
  'vendor_id', 'retailer_id', 'captured_by', 'captured_at',
  'created_at', 'updated_at',
  // 00004 catalog enhancements
  'category', 'subcategory', 'tags', 'lead_time_weeks',
  // 00015 product colors
  'primary_color', 'secondary_colors',
]);

function makeExtractedData(overrides: Partial<ExtractedProductData> = {}): ExtractedProductData {
  return {
    productName: 'Test Chair',
    description: 'A nice chair',
    url: 'https://example.com/chair',
    images: [
      { url: 'https://example.com/img1.jpg', score: 90, width: 800, height: 600, alt: 'Chair' },
    ],
    price: { value: 129900, currency: 'USD', raw: '$1,299.00' },
    materials: ['Oak', 'Leather'],
    colors: [{ name: 'Walnut', isPrimary: true, confidence: 0.9, source: 'text' as const }],
    finish: { name: 'Matte', type: 'wood' as const, confidence: 0.8 },
    availableColors: ['Walnut', 'Ebony'],
    dimensions: {
      width: 24,
      height: 36,
      depth: 22,
      unit: 'in',
      raw: '24" x 36" x 22"',
    },
    manufacturer: 'TestCo',
    extractedAt: new Date().toISOString(),
    confidence: 'high',
    ...overrides,
  };
}

describe('buildProductInsertPayload', () => {
  it('only includes columns that exist on the products table', () => {
    const payload = buildProductInsertPayload({
      productName: 'Test Chair',
      extractedData: makeExtractedData(),
      price: '1299.00',
      images: ['https://example.com/img1.jpg'],
      vendorId: 'vendor-1',
      retailerId: 'retailer-1',
      userId: 'user-1',
    });

    for (const key of Object.keys(payload)) {
      expect(
        PRODUCTS_COLUMNS.has(key),
        `"${key}" is not a column on the products table`
      ).toBe(true);
    }
  });

  it('converts price string to cents integer', () => {
    const payload = buildProductInsertPayload({
      productName: 'Chair',
      extractedData: makeExtractedData(),
      price: '1299.99',
      images: [],
      vendorId: null,
      retailerId: null,
      userId: 'u1',
    });
    expect(payload.price_retail).toBe(129999);
  });

  it('limits images to 10', () => {
    const images = Array.from({ length: 15 }, (_, i) => `https://img.com/${i}.jpg`);
    const payload = buildProductInsertPayload({
      productName: 'Chair',
      extractedData: makeExtractedData(),
      price: '',
      images,
      vendorId: null,
      retailerId: null,
      userId: 'u1',
    });
    expect(payload.images).toHaveLength(10);
  });

  it('handles empty price as null', () => {
    const payload = buildProductInsertPayload({
      productName: 'Chair',
      extractedData: makeExtractedData(),
      price: '',
      images: [],
      vendorId: null,
      retailerId: null,
      userId: 'u1',
    });
    expect(payload.price_retail).toBeNull();
  });

  it('handles null dimensions', () => {
    const payload = buildProductInsertPayload({
      productName: 'Chair',
      extractedData: makeExtractedData({ dimensions: null }),
      price: '',
      images: [],
      vendorId: null,
      retailerId: null,
      userId: 'u1',
    });
    expect(payload.dimensions).toBeNull();
  });

  it('uses productName override when provided', () => {
    const payload = buildProductInsertPayload({
      productName: 'My Custom Name',
      extractedData: makeExtractedData({ productName: 'Extracted Name' }),
      price: '',
      images: [],
      vendorId: null,
      retailerId: null,
      userId: 'u1',
    });
    expect(payload.name).toBe('My Custom Name');
  });

  it('falls back to extracted name when productName is empty', () => {
    const payload = buildProductInsertPayload({
      productName: '',
      extractedData: makeExtractedData({ productName: 'Extracted Name' }),
      price: '',
      images: [],
      vendorId: null,
      retailerId: null,
      userId: 'u1',
    });
    expect(payload.name).toBe('Extracted Name');
  });
});
