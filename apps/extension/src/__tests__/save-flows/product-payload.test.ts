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
  // 00152 three-layer catalog
  'layer', 'owner_user_id',
  // 00232 field-capture origin (now also written by the extension, P2-8)
  'capture_source', 'capture_provenance',
  // 00060 catalog columns — CL-R1 writes the captured SKU here, NOT the
  // normalizer-owned vendor_sku from 00306.
  'sku',
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
    availableFinishes: ['Matte', 'Polished'],
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

  describe('sku (CL-R1)', () => {
    function withSku(sku?: string | null) {
      return buildProductInsertPayload({
        productName: 'Chair',
        extractedData: makeExtractedData(),
        price: '',
        sku,
        images: [],
        vendorId: null,
        retailerId: null,
        userId: 'u1',
      });
    }

    it('writes a trimmed sku', () => {
      expect(withSku('  H4614 ').sku).toBe('H4614');
    });

    it('writes null for a blank, whitespace-only, or absent sku', () => {
      expect(withSku('').sku).toBeNull();
      expect(withSku('   ').sku).toBeNull();
      expect(withSku(null).sku).toBeNull();
      expect(withSku().sku).toBeNull();
    });

    it('never writes vendor_sku — that column belongs to the catalog normalizer (00306)', () => {
      const payload = withSku('H4614');
      expect('vendor_sku' in payload).toBe(false);
    });
  });

  describe('capture_source / capture_provenance (P2-8)', () => {
    it('marks every extension capture with capture_source: web_extension', () => {
      const payload = buildProductInsertPayload({
        productName: 'Chair',
        extractedData: makeExtractedData(),
        price: '',
        images: [],
        vendorId: null,
        retailerId: null,
        userId: 'u1',
      });
      expect(payload.capture_source).toBe('web_extension');
    });

    it('lands the full scraped option lists under capture_provenance.captureOptions', () => {
      const payload = buildProductInsertPayload({
        productName: 'Chair',
        extractedData: makeExtractedData({
          materials: ['Oak', 'Leather'],
          availableColors: ['Walnut', 'Ebony'],
          availableFinishes: ['Matte', 'Polished', 'Brushed'],
        }),
        price: '',
        images: [],
        vendorId: null,
        retailerId: null,
        userId: 'u1',
      });

      expect(payload.capture_provenance.captureOptions).toEqual({
        colors: ['Walnut', 'Ebony'],
        finishes: ['Matte', 'Polished', 'Brushed'],
        materials: ['Oak', 'Leather'],
        source: 'web_extension',
        capturedAt: expect.any(String),
      });
    });

    it('defaults captureOptions lists to empty arrays when nothing was scraped', () => {
      const payload = buildProductInsertPayload({
        productName: 'Chair',
        extractedData: makeExtractedData({
          materials: [],
          availableColors: null,
          availableFinishes: null,
        }),
        price: '',
        images: [],
        vendorId: null,
        retailerId: null,
        userId: 'u1',
      });

      expect(payload.capture_provenance.captureOptions).toMatchObject({
        colors: [],
        finishes: [],
        materials: [],
      });
    });

    it('keeps the flat finish scalar and available_colors for back-compat', () => {
      const payload = buildProductInsertPayload({
        productName: 'Chair',
        extractedData: makeExtractedData({
          availableColors: ['Walnut', 'Ebony'],
          availableFinishes: ['Matte', 'Polished'],
        }),
        price: '',
        images: [],
        vendorId: null,
        retailerId: null,
        userId: 'u1',
      });

      expect(payload.finish).toBe('Matte');
      expect(payload.available_colors).toEqual(['Walnut', 'Ebony']);
    });
  });

  describe('capture note lives in capture_provenance.note, not usage_notes (CL-R1 / c)', () => {
    it('trims and carries the capture note into capture_provenance.note', () => {
      const payload = buildProductInsertPayload({
        productName: 'Chair',
        extractedData: makeExtractedData(),
        price: '',
        images: [],
        vendorId: null,
        retailerId: null,
        userId: 'u1',
        note: '  Check the client likes the walnut finish  ',
      });
      expect(payload.capture_provenance.note).toBe('Check the client likes the walnut finish');
    });

    it('omits capture_provenance.note when no note is provided', () => {
      const payload = buildProductInsertPayload({
        productName: 'Chair',
        extractedData: makeExtractedData(),
        price: '',
        images: [],
        vendorId: null,
        retailerId: null,
        userId: 'u1',
      });
      expect(payload.capture_provenance.note).toBeUndefined();
      expect('note' in payload.capture_provenance).toBe(false);
    });

    it('treats a whitespace-only note as omitted', () => {
      const payload = buildProductInsertPayload({
        productName: 'Chair',
        extractedData: makeExtractedData(),
        price: '',
        images: [],
        vendorId: null,
        retailerId: null,
        userId: 'u1',
        note: '   ',
      });
      expect('note' in payload.capture_provenance).toBe(false);
    });

    it('never writes products.usage_notes — that column belongs to studio promotion, not capture', () => {
      const payload = buildProductInsertPayload({
        productName: 'Chair',
        extractedData: makeExtractedData(),
        price: '',
        images: [],
        vendorId: null,
        retailerId: null,
        userId: 'u1',
        note: 'Check the finish sample',
      });
      expect('usage_notes' in payload).toBe(false);
    });
  });
});
