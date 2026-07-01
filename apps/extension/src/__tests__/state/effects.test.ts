import { describe, it, expect } from 'vitest';
import {
  productRow,
  captureInput,
  decisionInput,
  decisionOptionInput,
} from '../../state/effects';
import { draftFromExtraction } from '../../state/draft';
import { initialCaptureState } from '../../state/reducer';
import type { ExtractedProductData } from '@patina/shared';

function extraction(
  overrides: Partial<ExtractedProductData> = {}
): ExtractedProductData {
  return {
    productName: 'Test Chair',
    description: 'desc',
    price: { value: 129900, currency: 'USD', raw: '$1,299' },
    dimensions: null,
    materials: ['Oak'],
    colors: null,
    finish: null,
    availableColors: null,
    images: [
      { url: 'https://x/a.jpg', score: 90, width: 1, height: 1, alt: '' },
      { url: 'https://x/b.jpg', score: 80, width: 1, height: 1, alt: '' },
    ],
    manufacturer: null,
    url: 'https://shop.example/p/1',
    extractedAt: '2026-06-29T00:00:00Z',
    confidence: 'high',
    ...overrides,
  } as unknown as ExtractedProductData;
}

const routing = () => initialCaptureState().routing;

describe('productRow', () => {
  it('stamps the requested status + owner and converts price to cents', () => {
    const row = productRow(draftFromExtraction(extraction()), 'user-1', 'published');
    expect(row.status).toBe('published');
    expect(row.price_retail).toBe(129900);
    expect(row.owner_user_id).toBe('user-1');
    expect(row.layer).toBe('personal');
  });

  it('supports the draft (inbox) status', () => {
    const row = productRow(draftFromExtraction(extraction()), 'user-1', 'draft');
    expect(row.status).toBe('draft');
  });

  it('orders selected images first', () => {
    const draft = draftFromExtraction(extraction());
    draft.images.selected = [1, 0];
    const row = productRow(draft, 'user-1', 'published');
    expect(row.images).toEqual(['https://x/b.jpg', 'https://x/a.jpg']);
  });
});

describe('captureInput', () => {
  it('threads inbox routing + thumbnail into the capture payload input', () => {
    const draft = draftFromExtraction(extraction());
    const r = { ...routing(), proposalId: 'prop-1', scopeRoomId: 'room-1', ffeCategorySlug: 'seating' };
    const input = captureInput(draft, r, 'designer-1', 'prod-1');
    expect(input.designerId).toBe('designer-1');
    expect(input.productId).toBe('prod-1');
    expect(input.proposalId).toBe('prop-1');
    expect(input.ffeCategorySlug).toBe('seating');
    expect(input.thumbnailUrl).toBe('https://x/a.jpg');
    expect(input.sourceUrl).toBe('https://shop.example/p/1');
  });
});

describe('decisionInput', () => {
  it('falls back to an "Approve: <name>" title and sends immediately', () => {
    const draft = draftFromExtraction(extraction());
    const r = { ...routing(), decision: { ...routing().decision, designerClientId: 'dc-1', title: '' } };
    const input = decisionInput(draft, r);
    expect(input.designerClientId).toBe('dc-1');
    expect(input.title).toBe('Approve: Test Chair');
    expect(input.status).toBe('pending');
  });

  it('keeps an explicit decision title', () => {
    const draft = draftFromExtraction(extraction());
    const r = { ...routing(), decision: { ...routing().decision, designerClientId: 'dc-1', title: 'Pick a chair' } };
    expect(decisionInput(draft, r).title).toBe('Pick a chair');
  });
});

describe('decisionOptionInput', () => {
  it('links the option to the product with the first image + price', () => {
    const draft = draftFromExtraction(extraction());
    const input = decisionOptionInput(draft, 'dec-1', 'prod-1');
    expect(input.decisionId).toBe('dec-1');
    expect(input.productId).toBe('prod-1');
    expect(input.imageUrl).toBe('https://x/a.jpg');
    expect(input.priceCents).toBe(129900);
  });
});
