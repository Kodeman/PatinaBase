import { describe, it, expect } from 'vitest';
import { draftFromExtraction, draftToProductPayload } from '../../state/draft';
import { buildProductInsertPayload } from '../../lib/payloads';
import type { ExtractedProductData } from '@patina/shared';

function makeExtraction(
  overrides: Partial<ExtractedProductData> = {}
): ExtractedProductData {
  return {
    productName: 'Eames Lounge Chair',
    description: 'A classic mid-century lounge.',
    price: { value: 549900, currency: 'USD', raw: '$5,499.00' },
    dimensions: {
      width: 32,
      height: 33,
      depth: 32,
      unit: 'in',
      raw: '32 x 33 x 32',
    },
    materials: ['Walnut', 'Leather'],
    colors: [{ name: 'Black', isPrimary: true, confidence: 0.9, source: 'selector' }],
    finish: { name: 'Matte', type: 'wood', confidence: 0.8 },
    availableColors: ['Black', 'Brown'],
    images: [
      { url: 'https://x/a.jpg', score: 90, width: 800, height: 800, alt: '' },
      { url: 'https://x/b.jpg', score: 60, width: 600, height: 600, alt: '' },
    ],
    manufacturer: 'Herman Miller',
    url: 'https://example.com/p/1',
    extractedAt: '2026-06-29T00:00:00Z',
    confidence: 'high',
    ...overrides,
  } as unknown as ExtractedProductData;
}

describe('draftFromExtraction', () => {
  it('maps the product name as a present, extracted field', () => {
    const draft = draftFromExtraction(makeExtraction());
    expect(draft.fields.name.value).toBe('Eames Lounge Chair');
    expect(draft.fields.name.status).toBe('extracted');
    expect(draft.fields.name.source).toBe('extracted');
  });

  it('converts cents price.value to a dollar string (matches legacy)', () => {
    const draft = draftFromExtraction(makeExtraction());
    expect(draft.fields.price.value).toBe('5499.00');
  });

  it('flags absent fields as missing', () => {
    const draft = draftFromExtraction(
      makeExtraction({ productName: null, price: null } as Partial<ExtractedProductData>)
    );
    expect(draft.fields.name.value).toBe('');
    expect(draft.fields.name.status).toBe('missing');
    expect(draft.fields.price.value).toBe('');
    expect(draft.fields.price.status).toBe('missing');
  });

  it('maps colors and finish to plain string values', () => {
    const draft = draftFromExtraction(makeExtraction());
    expect(draft.fields.colors.value).toEqual(['Black']);
    expect(draft.fields.finish.value).toBe('Matte');
    expect(draft.fields.materials.value).toEqual(['Walnut', 'Leather']);
  });

  it('keeps raw extraction + source url and defaults to a product capture', () => {
    const data = makeExtraction();
    const draft = draftFromExtraction(data);
    expect(draft.raw).toBe(data);
    expect(draft.sourceUrl).toBe('https://example.com/p/1');
    expect(draft.captureKind).toBe('product');
    expect(draft.confidence).toBe('high');
  });

  it('loads all images and selects the first by default', () => {
    const draft = draftFromExtraction(makeExtraction());
    expect(draft.images.all).toHaveLength(2);
    expect(draft.images.selected).toEqual([0]);
  });

  it('selects no image when none were extracted', () => {
    const draft = draftFromExtraction(
      makeExtraction({ images: [] } as Partial<ExtractedProductData>)
    );
    expect(draft.images.selected).toEqual([]);
  });
});

describe('draftToProductPayload', () => {
  it('produces a BuildProductPayloadInput that reflects edited fields', () => {
    const draft = draftFromExtraction(makeExtraction());
    // user edits the name + price inline (C4)
    draft.fields.name.value = 'Eames Lounge (Walnut)';
    draft.fields.price.value = '5200.00';

    const input = draftToProductPayload(draft, 'user-123');

    expect(input.userId).toBe('user-123');
    expect(input.productName).toBe('Eames Lounge (Walnut)');
    expect(input.price).toBe('5200.00');
    // only the selected image flows through
    expect(input.images).toEqual(['https://x/a.jpg']);
  });

  it('feeds buildProductInsertPayload so edits land on the row', () => {
    const draft = draftFromExtraction(makeExtraction());
    draft.fields.name.value = 'Renamed Chair';
    draft.fields.price.value = '100.00';

    const row = buildProductInsertPayload(draftToProductPayload(draft, 'user-123'));

    expect(row.name).toBe('Renamed Chair');
    expect(row.price_retail).toBe(10000); // dollars → cents
    expect(row.owner_user_id).toBe('user-123');
    expect(row.layer).toBe('personal');
    expect(row.source_url).toBe('https://example.com/p/1');
  });
});
