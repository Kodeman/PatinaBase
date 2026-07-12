// ─────────────────────────────────────────────────────────────────────────────
// vitals-format — pure, band-independent formatting for the Marketplace
// Vitals strip (WP-1.2). Band color/threshold logic intentionally lives in
// Postgres (get_marketplace_vitals(), 00301) and is asserted there
// (supabase/tests/agent_os/vitals_test.sql) — this module only turns a
// numeric value + unit into display strings, and a (value, prev_value) pair
// into a delta string + trend direction. No SQL, no React, no fetch.
// ─────────────────────────────────────────────────────────────────────────────

export type VitalUnit = 'ratio' | 'usd' | 'pct';
export type VitalTrend = 'up' | 'down' | 'neutral';

const EM_DASH = '—';
const MINUS = '−'; // proper minus sign, distinct from a hyphen

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Formats a metric's headline value per its unit. Null/undefined/NaN (the
 * inactive placeholder tile, or a metric with no data yet) always renders
 * as an em dash — never "0" or "NaN".
 *   ratio -> "1.8 : 1"
 *   usd   -> "$4,120"   (whole dollars, comma-grouped — value is already in
 *                        dollars; the DB layer divides cents by 100)
 *   pct   -> "16.2%"
 */
export function formatVitalValue(unit: VitalUnit, value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return EM_DASH;

  switch (unit) {
    case 'ratio':
      return `${value.toFixed(1)} : 1`;
    case 'usd':
      return `$${Math.round(value).toLocaleString('en-US')}`;
    case 'pct':
      return `${value.toFixed(1)}%`;
  }
}

/**
 * Formats the trailing-30d delta (value vs. prev_value) as a signed string,
 * e.g. "+0.2 vs. prior 30d", "−5.4 pts vs. prior 30d". Returns undefined
 * when either side is missing (no prior-period comparison to show) — callers
 * should omit the change line rather than render "vs. prior 30d" with no
 * number.
 */
export function formatVitalDelta(
  unit: VitalUnit,
  value: number | null | undefined,
  prevValue: number | null | undefined,
): string | undefined {
  if (!isFiniteNumber(value) || !isFiniteNumber(prevValue)) return undefined;

  const delta = value - prevValue;
  if (delta === 0) return 'No change vs. prior 30d';

  const sign = delta > 0 ? '+' : MINUS;
  const abs = Math.abs(delta);

  switch (unit) {
    case 'ratio':
      return `${sign}${abs.toFixed(1)} vs. prior 30d`;
    case 'usd':
      return `${sign}$${Math.round(abs).toLocaleString('en-US')} vs. prior 30d`;
    case 'pct':
      return `${sign}${abs.toFixed(1)} pts vs. prior 30d`;
  }
}

/**
 * Trend direction for the value vs. prev_value. Neutral whenever either side
 * is missing or they're equal — never guesses a direction from incomplete
 * data.
 */
export function vitalTrend(
  value: number | null | undefined,
  prevValue: number | null | undefined,
): VitalTrend {
  if (!isFiniteNumber(value) || !isFiniteNumber(prevValue)) return 'neutral';
  if (value > prevValue) return 'up';
  if (value < prevValue) return 'down';
  return 'neutral';
}
