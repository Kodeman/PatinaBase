import { describe, it, expect } from 'vitest';
import {
  validatePriceFormat,
  validateProductCapture,
  validateVendorCapture,
  hasFieldError,
  getFieldError,
} from '../../lib/capture-validation';
import type { ProductValidationInput, VendorValidationInput } from '../../lib/capture-validation';

// ─── Price Format ────────────────────────────────────────────────────────────

describe('validatePriceFormat', () => {
  it('accepts empty string (price is optional)', () => {
    expect(validatePriceFormat('')).toBeNull();
    expect(validatePriceFormat('  ')).toBeNull();
  });

  it('accepts valid whole numbers', () => {
    expect(validatePriceFormat('100')).toBeNull();
    expect(validatePriceFormat('0')).toBeNull();
    expect(validatePriceFormat('1299')).toBeNull();
  });

  it('accepts valid decimals', () => {
    expect(validatePriceFormat('1299.99')).toBeNull();
    expect(validatePriceFormat('0.50')).toBeNull();
    expect(validatePriceFormat('100.5')).toBeNull();
  });

  it('rejects multiple decimal points', () => {
    expect(validatePriceFormat('1.2.3')).not.toBeNull();
  });

  it('rejects more than 2 decimal places', () => {
    expect(validatePriceFormat('10.999')).not.toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(validatePriceFormat('abc')).not.toBeNull();
    expect(validatePriceFormat('$100')).not.toBeNull();
  });

  it('rejects negative prices', () => {
    expect(validatePriceFormat('-50')).not.toBeNull();
  });

  it('rejects just a decimal point', () => {
    expect(validatePriceFormat('.')).not.toBeNull();
  });

  it('rejects unreasonably high prices', () => {
    expect(validatePriceFormat('99999999')).not.toBeNull();
  });

  it('accepts maximum reasonable price', () => {
    expect(validatePriceFormat('9999999.99')).toBeNull();
  });

  it('rejects leading decimal', () => {
    expect(validatePriceFormat('.99')).not.toBeNull();
  });
});

// ─── Product Validation ──────────────────────────────────────────────────────

function makeProductInput(overrides: Partial<ProductValidationInput> = {}): ProductValidationInput {
  return {
    productName: 'Test Chair',
    price: '1299.99',
    sourceUrl: 'https://example.com/product/chair',
    imageCount: 3,
    confidence: 'high',
    ...overrides,
  };
}

describe('validateProductCapture', () => {
  it('passes with all valid fields', () => {
    const result = validateProductCapture(makeProductInput());
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when product name is empty', () => {
    const result = validateProductCapture(makeProductInput({ productName: '' }));
    expect(result.isValid).toBe(false);
    expect(hasFieldError(result, 'productName')).toBe(true);
  });

  it('fails when product name is whitespace only', () => {
    const result = validateProductCapture(makeProductInput({ productName: '   ' }));
    expect(result.isValid).toBe(false);
    expect(hasFieldError(result, 'productName')).toBe(true);
  });

  it('fails when product name is too short', () => {
    const result = validateProductCapture(makeProductInput({ productName: 'X' }));
    expect(result.isValid).toBe(false);
    expect(getFieldError(result, 'productName')).toBe('Product name is too short');
  });

  it('fails when source URL is missing', () => {
    const result = validateProductCapture(makeProductInput({ sourceUrl: '' }));
    expect(result.isValid).toBe(false);
    expect(hasFieldError(result, 'sourceUrl')).toBe(true);
  });

  it('fails when price format is invalid', () => {
    const result = validateProductCapture(makeProductInput({ price: '1.2.3' }));
    expect(result.isValid).toBe(false);
    expect(hasFieldError(result, 'price')).toBe(true);
  });

  it('passes with empty price (optional)', () => {
    const result = validateProductCapture(makeProductInput({ price: '' }));
    expect(result.isValid).toBe(true);
    expect(hasFieldError(result, 'price')).toBe(false);
  });

  it('warns when no images found', () => {
    const result = validateProductCapture(makeProductInput({ imageCount: 0 }));
    expect(result.isValid).toBe(true); // Warning, not error
    expect(result.warnings.some(w => w.field === 'images')).toBe(true);
  });

  it('warns on low confidence', () => {
    const result = validateProductCapture(makeProductInput({ confidence: 'low' }));
    expect(result.isValid).toBe(true);
    expect(result.warnings.some(w => w.field === 'confidence')).toBe(true);
  });

  it('does not warn on high confidence', () => {
    const result = validateProductCapture(makeProductInput({ confidence: 'high' }));
    expect(result.warnings.some(w => w.field === 'confidence')).toBe(false);
  });

  it('warns when price is empty', () => {
    const result = validateProductCapture(makeProductInput({ price: '' }));
    expect(result.warnings.some(w => w.field === 'price')).toBe(true);
  });

  it('collects multiple errors', () => {
    const result = validateProductCapture(makeProductInput({
      productName: '',
      price: 'bad',
      sourceUrl: '',
    }));
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Vendor Validation ───────────────────────────────────────────────────────

function makeVendorInput(overrides: Partial<VendorValidationInput> = {}): VendorValidationInput {
  return {
    name: 'Herman Miller',
    website: 'https://hermanmiller.com',
    ...overrides,
  };
}

describe('validateVendorCapture', () => {
  it('passes with valid fields', () => {
    const result = validateVendorCapture(makeVendorInput());
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when name is empty', () => {
    const result = validateVendorCapture(makeVendorInput({ name: '' }));
    expect(result.isValid).toBe(false);
    expect(hasFieldError(result, 'name')).toBe(true);
  });

  it('fails when name is too short', () => {
    const result = validateVendorCapture(makeVendorInput({ name: 'A' }));
    expect(result.isValid).toBe(false);
    expect(getFieldError(result, 'name')).toBe('Vendor name is too short');
  });

  it('fails when website is empty', () => {
    const result = validateVendorCapture(makeVendorInput({ website: '' }));
    expect(result.isValid).toBe(false);
    expect(hasFieldError(result, 'website')).toBe(true);
  });

  it('collects multiple errors', () => {
    const result = validateVendorCapture(makeVendorInput({ name: '', website: '' }));
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

describe('hasFieldError / getFieldError', () => {
  it('returns true for fields with errors', () => {
    const result = validateProductCapture(makeProductInput({ productName: '' }));
    expect(hasFieldError(result, 'productName')).toBe(true);
    expect(hasFieldError(result, 'price')).toBe(false);
  });

  it('returns error message for field', () => {
    const result = validateProductCapture(makeProductInput({ productName: '' }));
    expect(getFieldError(result, 'productName')).toBe('Product name is required');
  });

  it('returns null when no error for field', () => {
    const result = validateProductCapture(makeProductInput());
    expect(getFieldError(result, 'productName')).toBeNull();
  });
});
