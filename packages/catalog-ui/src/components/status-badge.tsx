'use client';

import type { CSSProperties, ReactNode } from 'react';

export type StatusBadgeVariant =
  | 'sage'
  | 'gold'
  | 'terracotta'
  | 'pearl'
  | 'clay'
  | 'dusty-blue'
  | 'muted';

export type StatusBadgeMode = 'pill' | 'dot';

export type StatusBadgeSize = 'sm' | 'md';

interface VariantStyle {
  bg: string;
  fg: string;
  dot: string;
}

const VARIANT_STYLES: Record<StatusBadgeVariant, VariantStyle> = {
  sage: {
    bg: 'rgba(122, 155, 118, 0.10)',
    fg: 'var(--color-sage, #7a9b76)',
    dot: 'var(--color-sage, #7a9b76)',
  },
  gold: {
    bg: 'rgba(196, 165, 123, 0.10)',
    fg: 'var(--accent-primary, var(--color-golden-hour, #c4a57b))',
    dot: 'var(--color-golden-hour, #e8c547)',
  },
  terracotta: {
    bg: 'rgba(199, 123, 110, 0.08)',
    fg: 'var(--color-terracotta, #c77b6e)',
    dot: 'var(--color-terracotta, #c77b6e)',
  },
  pearl: {
    bg: 'rgba(229, 226, 221, 0.4)',
    fg: 'var(--text-muted, #6f6a60)',
    dot: 'var(--color-pearl, #e5e2dd)',
  },
  clay: {
    bg: 'rgba(196, 165, 123, 0.12)',
    fg: 'var(--color-clay, #c4a57b)',
    dot: 'var(--color-clay, #c4a57b)',
  },
  'dusty-blue': {
    bg: 'rgba(139, 156, 173, 0.10)',
    fg: 'var(--color-dusty-blue, #8b9cad)',
    dot: 'var(--color-dusty-blue, #8b9cad)',
  },
  muted: {
    bg: 'rgba(139, 115, 85, 0.08)',
    fg: 'var(--text-muted, #6f6a60)',
    dot: 'var(--text-muted, #6f6a60)',
  },
};

export interface StatusBadgeProps {
  variant: StatusBadgeVariant;
  mode?: StatusBadgeMode;
  size?: StatusBadgeSize;
  /** Pill text. Required when mode='pill', optional next-to-dot label when mode='dot'. */
  label?: ReactNode;
  /** Accessible label override; defaults to `label` if it's a string. */
  ariaLabel?: string;
}

/**
 * Unified status indicator used across proposal and project surfaces.
 *
 * Replaces the old per-surface `ProposalStatusBadge` (pill) and `StatusDot`
 * (filled circle) primitives. Both modes share a variant palette so a
 * "sage" pill and a "sage" dot resolve to the same color token.
 */
export function StatusBadge({
  variant,
  mode = 'pill',
  size = 'sm',
  label,
  ariaLabel,
}: StatusBadgeProps) {
  const styles = VARIANT_STYLES[variant];
  const resolvedAria = ariaLabel ?? (typeof label === 'string' ? label : undefined);

  if (mode === 'dot') {
    const dim = size === 'sm' ? '8px' : '10px';
    const dot = (
      <span
        className="inline-block shrink-0 rounded-full"
        style={{ width: dim, height: dim, backgroundColor: styles.dot }}
        aria-label={resolvedAria}
      />
    );
    if (!label) return dot;
    return (
      <span className="inline-flex items-center gap-1.5">
        {dot}
        <span
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.55rem',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'var(--text-muted)',
          }}
        >
          {label}
        </span>
      </span>
    );
  }

  const padding: CSSProperties = size === 'sm' ? { padding: '0.10rem 0.5rem' } : { padding: '0.20rem 0.6rem' };

  return (
    <span
      className="inline-flex whitespace-nowrap rounded-sm"
      style={{
        ...padding,
        backgroundColor: styles.bg,
        color: styles.fg,
        fontFamily: 'var(--font-meta)',
        fontSize: size === 'sm' ? '0.55rem' : '0.62rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
      aria-label={resolvedAria}
    >
      {label}
    </span>
  );
}
