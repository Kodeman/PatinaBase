/**
 * Shared currency UI helpers for the FF&E board + item drawer (W3-T3a
 * consolidation). UI works in dollars, the API in cents. Empty string ⇄ NULL
 * ("unknown") for the 00185 dual-pricing inputs.
 */

export function formatDollars(cents: number): string {
  return `$${((cents || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/** "-$420" for negative cents (formatDollars alone would render "$-420"). */
export function formatSignedDollars(cents: number): string {
  return cents < 0 ? `-${formatDollars(Math.abs(cents))}` : formatDollars(cents);
}

// ── Dual-pricing input helpers (00185) ──────────────────────────────────────

/** Cents → dollars input string. null/undefined → '' (field empty when NULL). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

/** Dollars input → cents. Empty/invalid/negative → null. */
export function parseDollarsToCents(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/** Percent input → number rounded to 2 decimals. Empty/invalid → null. */
export function parsePercentInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
