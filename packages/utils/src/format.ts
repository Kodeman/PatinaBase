export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatPercentage(value: number, decimals = 0): string {
  return `${value.toFixed(decimals)}%`;
}

export function truncate(str: string, length: number, suffix = '...'): string {
  if (str.length <= length) {
    return str;
  }
  return str.substring(0, length - suffix.length) + suffix;
}

/**
 * Format an integer cents value as a USD dollar string with no fractional part.
 *
 * Money columns in the Supabase schema are stored as integer cents (see
 * supabase/CLAUDE.md). Call this whenever you display one of those values.
 *
 * @example formatCents(123456) // "$1,235"
 */
export function formatCents(cents: number | null | undefined): string {
  const value = (cents ?? 0) / 100;
  return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Compact USD form — collapses thousands to "$Xk" and tens-of-thousands+ to
 * whole-number "$Xk". Useful in dense list rows where the precise dollar
 * value is secondary to the order of magnitude.
 *
 * @example formatCentsCompact(123456)   // "$1.2k"
 * @example formatCentsCompact(99900)    // "$999"
 * @example formatCentsCompact(1500000)  // "$15k"
 */
export function formatCentsCompact(cents: number | null | undefined): string {
  const dollars = (cents ?? 0) / 100;
  if (dollars >= 1000) {
    return `$${(dollars / 1000).toFixed(dollars >= 10000 ? 0 : 1)}k`;
  }
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Compact short-form date — "Mar 20", "Apr 3". Use when you want a date
 * but don't need year/relative context.
 */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Human-friendly relative date — "Today", "Yesterday", "Nd ago", "Nw ago",
 * falling back to {@link formatShortDate} after 30 days.
 */
export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Normalize a free-form address string for display — collapses internal
 * whitespace and trims edges. Returns `null` for empty input so callers
 * can branch on presence.
 */
export function formatProjectAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const cleaned = addr.replace(/\s+/g, ' ').trim();
  return cleaned.length === 0 ? null : cleaned;
}
