import { StatusDot } from '@/components/portal/status-dot';

// Confidence bands (matches WP-1.1 card anatomy):
//   >= 0.85          → sage        (high)
//   0.60 .. 0.84     → clay        (medium)
//   <  0.60          → terracotta  (low)
//   null             → muted em-dash (no confidence reported)
// Boundaries are inclusive at the top of each band: 0.85 → sage, 0.60 → clay.

export type ConfidenceBand = 'sage' | 'clay' | 'terracotta';

const BAND_TOKEN: Record<ConfidenceBand, string> = {
  sage: 'var(--color-sage)',
  clay: 'var(--color-clay)',
  terracotta: 'var(--color-terracotta)',
};

/** Pure band resolver — unit-tested for the 0.85 / 0.60 exact edges. */
export function confidenceBand(confidence: number | null | undefined): ConfidenceBand | null {
  if (confidence == null || Number.isNaN(confidence)) return null;
  if (confidence >= 0.85) return 'sage';
  if (confidence >= 0.6) return 'clay';
  return 'terracotta';
}

interface ConfidenceBadgeProps {
  confidence: number | null | undefined;
  className?: string;
}

export function ConfidenceBadge({ confidence, className = '' }: ConfidenceBadgeProps) {
  const band = confidenceBand(confidence);

  if (band === null) {
    return (
      <span
        className={`text-[var(--text-muted)] ${className}`}
        style={{ fontFamily: 'var(--font-meta)' }}
        aria-label="no confidence"
        data-testid="confidence-badge"
        data-band="none"
      >
        —
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      data-testid="confidence-badge"
      data-band={band}
      aria-label={`confidence ${(confidence as number).toFixed(2)}`}
    >
      <StatusDot color={BAND_TOKEN[band]} size="sm" />
      <span
        className="text-[0.72rem] tabular-nums text-[var(--text-primary)]"
        style={{ fontFamily: 'var(--font-meta)' }}
      >
        {(confidence as number).toFixed(2)}
      </span>
    </span>
  );
}
