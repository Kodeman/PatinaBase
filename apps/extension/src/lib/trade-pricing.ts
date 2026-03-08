/**
 * Pure utility functions for trade pricing calculations.
 * Separated from the hook to avoid transitive Supabase import in tests.
 */

/**
 * Calculate trade price from retail price and discount.
 * Both prices in cents.
 */
export function calculateTradePrice(
  retailPriceCents: number,
  discountPercent: number
): number {
  return Math.round(retailPriceCents * (1 - discountPercent / 100));
}

/**
 * Format cents to dollar display string.
 */
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
