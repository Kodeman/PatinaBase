import { describe, it, expect } from 'vitest';
import {
  selectValidation,
  deriveRecordScreen,
  selectCommitDefault,
} from '../../state/selectors';
import { captureReducer, initialCaptureState } from '../../state/reducer';
import type { CaptureState } from '../../state/types';
import type { ExtractedProductData } from '@patina/shared';

function extraction(
  overrides: Partial<ExtractedProductData> = {}
): ExtractedProductData {
  return {
    productName: 'Test Chair',
    description: null,
    price: { value: 10000, currency: 'USD', raw: '$100' },
    dimensions: null,
    materials: [],
    colors: null,
    finish: null,
    availableColors: null,
    images: [{ url: 'https://x/a.jpg', score: 90, width: 1, height: 1, alt: '' }],
    manufacturer: null,
    url: 'https://shop.example/p/1',
    extractedAt: '2026-06-29T00:00:00Z',
    confidence: 'high',
    ...overrides,
  } as unknown as ExtractedProductData;
}

function withExtraction(data: ExtractedProductData): CaptureState {
  let s = initialCaptureState();
  s = captureReducer(s, { type: 'EXTRACTION_SUCCESS', data });
  return s;
}

describe('selectValidation', () => {
  it('is valid for a complete capture (name + url + price + image)', () => {
    const v = selectValidation(withExtraction(extraction()));
    expect(v.isValid).toBe(true);
    expect(v.errors).toHaveLength(0);
  });

  it('flags a missing product name as an error', () => {
    const v = selectValidation(
      withExtraction(extraction({ productName: null } as Partial<ExtractedProductData>))
    );
    expect(v.isValid).toBe(false);
    expect(v.errors.some((e) => e.field === 'productName')).toBe(true);
  });

  it('returns an invalid result when there is no draft', () => {
    expect(selectValidation(initialCaptureState()).isValid).toBe(false);
  });
});

describe('deriveRecordScreen', () => {
  it('is C2 when the core fields are present', () => {
    expect(deriveRecordScreen(withExtraction(extraction()))).toBe('C2');
  });

  it('is R1 when a core field is missing', () => {
    const s = withExtraction(
      extraction({ productName: null } as Partial<ExtractedProductData>)
    );
    expect(deriveRecordScreen(s)).toBe('R1');
  });
});

describe('selectCommitDefault', () => {
  it('defaults to library when the record is clean', () => {
    expect(selectCommitDefault(withExtraction(extraction()))).toBe('library');
  });

  it('defaults to inbox when the record has gaps', () => {
    const s = withExtraction(
      extraction({ productName: null } as Partial<ExtractedProductData>)
    );
    expect(selectCommitDefault(s)).toBe('inbox');
  });
});
