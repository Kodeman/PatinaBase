import { describe, it, expect } from 'vitest';
import { ocrTextToFields } from '../../lib/ocr';

describe('ocrTextToFields', () => {
  const text = [
    'Eames Lounge Chair',
    '$1,299.00',
    'Materials: solid oak and full-grain leather',
    'Dimensions: 32 x 33 x 32 in',
  ].join('\n');

  it('pulls a price in cents from OCR text', () => {
    const fields = ocrTextToFields(text);
    expect(fields.price?.value).toBe(129900);
  });

  it('pulls materials from OCR text', () => {
    const fields = ocrTextToFields(text);
    expect(fields.materials && fields.materials.length).toBeGreaterThan(0);
  });

  it('pulls dimensions from OCR text', () => {
    const fields = ocrTextToFields(text);
    expect(fields.dimensions).toBeTruthy();
  });

  it('uses the first substantial non-price line as the name', () => {
    const fields = ocrTextToFields(text);
    expect(fields.name).toBe('Eames Lounge Chair');
  });

  it('returns an empty result for blank text', () => {
    const fields = ocrTextToFields('   ');
    expect(fields.price).toBeUndefined();
    expect(fields.name).toBeUndefined();
  });
});
