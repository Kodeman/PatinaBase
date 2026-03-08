/**
 * Currency and Price Utilities
 * All amounts stored as NUMERIC(12,2) in database
 */

export const SUPPORTED_CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Format price with currency
 */
export function formatPrice(amount: number, currency: string = 'USD', locale: string = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if currency not supported
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Parse price string to number
 */
export function parsePrice(priceString: string): number | null {
  const cleaned = priceString.replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Validate price is non-negative
 */
export function isValidPrice(amount: number): boolean {
  return typeof amount === 'number' && !isNaN(amount) && amount >= 0 && isFinite(amount);
}

/**
 * Round to 2 decimal places (for database storage)
 */
export function roundPrice(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Calculate percentage
 */
export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return (part / total) * 100;
}

/**
 * Apply discount percentage
 */
export function applyDiscount(amount: number, discountPercent: number): number {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error('Discount percentage must be between 0 and 100');
  }
  const discounted = amount * (1 - discountPercent / 100);
  return roundPrice(discounted);
}

/**
 * Apply discount amount
 */
export function applyDiscountAmount(amount: number, discountAmount: number): number {
  const discounted = amount - discountAmount;
  return roundPrice(Math.max(0, discounted));
}

/**
 * Calculate tax
 */
export function calculateTax(amount: number, taxRate: number): number {
  if (taxRate < 0) {
    throw new Error('Tax rate cannot be negative');
  }
  return roundPrice(amount * taxRate);
}

/**
 * Calculate order total
 */
export function calculateOrderTotal(
  subtotal: number,
  tax: number,
  shipping: number = 0,
  discount: number = 0
): number {
  return roundPrice(subtotal + tax + shipping - discount);
}

/**
 * Validate currency code (ISO-4217)
 */
export function isValidCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/**
 * Check if currency is supported
 */
export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return SUPPORTED_CURRENCIES.includes(code as SupportedCurrency);
}

/**
 * Convert cents to dollars (for Stripe, etc.)
 */
export function centsToDollars(cents: number): number {
  return roundPrice(cents / 100);
}

/**
 * Convert dollars to cents (for Stripe, etc.)
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/**
 * Format price range
 */
export function formatPriceRange(min: number, max: number, currency: string = 'USD', locale: string = 'en-US'): string {
  if (min === max) {
    return formatPrice(min, currency, locale);
  }
  return `${formatPrice(min, currency, locale)} - ${formatPrice(max, currency, locale)}`;
}

/**
 * Budget band classification
 */
export type BudgetBand = 'starter' | 'moderate' | 'comfort' | 'premium' | 'luxury';

export function classifyBudgetBand(amount: number): BudgetBand {
  if (amount < 1000) return 'starter';
  if (amount < 5000) return 'moderate';
  if (amount < 15000) return 'comfort';
  if (amount < 50000) return 'premium';
  return 'luxury';
}

export function getBudgetBandRange(band: BudgetBand): { min: number; max: number | null } {
  switch (band) {
    case 'starter':
      return { min: 0, max: 999 };
    case 'moderate':
      return { min: 1000, max: 4999 };
    case 'comfort':
      return { min: 5000, max: 14999 };
    case 'premium':
      return { min: 15000, max: 49999 };
    case 'luxury':
      return { min: 50000, max: null };
  }
}
