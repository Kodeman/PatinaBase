/**
 * Pre-save validation for product and vendor captures.
 * Pure functions — no DOM or Supabase dependencies.
 */

import type { ExtractionConfidence } from '@patina/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationError[];
  warnings: ValidationWarning[];
  isValid: boolean;
}

// ─── Price Validation ────────────────────────────────────────────────────────

/**
 * Validate a price string. Returns null if valid, error message if invalid.
 * Empty string is valid (price is optional).
 */
export function validatePriceFormat(price: string): string | null {
  if (!price || price.trim() === '') return null;

  // Must be a valid positive number
  const num = parseFloat(price);
  if (isNaN(num)) return 'Enter a valid price';
  if (num < 0) return 'Price cannot be negative';
  if (num > 9999999.99) return 'Price is too high';

  // Check format: allow digits with optional single decimal point and up to 2 decimal places
  if (!/^\d+(\.\d{0,2})?$/.test(price)) {
    return 'Use format: 1299.99';
  }

  return null;
}

// ─── Product Validation ──────────────────────────────────────────────────────

export interface ProductValidationInput {
  productName: string;
  price: string;
  sourceUrl: string;
  imageCount: number;
  confidence: ExtractionConfidence;
}

export function validateProductCapture(input: ProductValidationInput): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Required: product name
  if (!input.productName.trim()) {
    errors.push({ field: 'productName', message: 'Product name is required' });
  } else if (input.productName.trim().length < 2) {
    errors.push({ field: 'productName', message: 'Product name is too short' });
  }

  // Required: source URL
  if (!input.sourceUrl) {
    errors.push({ field: 'sourceUrl', message: 'Source URL is missing' });
  }

  // Price format (optional but must be valid if provided)
  const priceError = validatePriceFormat(input.price);
  if (priceError) {
    errors.push({ field: 'price', message: priceError });
  }

  // Warnings (non-blocking)
  if (input.imageCount === 0) {
    warnings.push({ field: 'images', message: 'No images found — product will save without photos' });
  }

  if (input.confidence === 'low') {
    warnings.push({ field: 'confidence', message: 'Low extraction confidence — review fields before saving' });
  }

  if (!input.price.trim()) {
    warnings.push({ field: 'price', message: 'No price set' });
  }

  return {
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}

// ─── Vendor Validation ───────────────────────────────────────────────────────

export interface VendorValidationInput {
  name: string;
  website: string;
}

export function validateVendorCapture(input: VendorValidationInput): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input.name.trim()) {
    errors.push({ field: 'name', message: 'Vendor name is required' });
  } else if (input.name.trim().length < 2) {
    errors.push({ field: 'name', message: 'Vendor name is too short' });
  }

  if (!input.website.trim()) {
    errors.push({ field: 'website', message: 'Website is required' });
  }

  return {
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Check if a specific field has an error */
export function hasFieldError(result: ValidationResult, field: string): boolean {
  return result.errors.some(e => e.field === field);
}

/** Get error message for a specific field */
export function getFieldError(result: ValidationResult, field: string): string | null {
  return result.errors.find(e => e.field === field)?.message ?? null;
}
