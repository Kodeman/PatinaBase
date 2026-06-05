import * as React from 'react';
import { cn } from '@/lib/utils';

export type StatusTone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'accent';

/** Tone → CSS custom property holding the tone color. */
const TONE_VAR: Record<StatusTone, string> = {
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  info: 'var(--color-info)',
  accent: 'var(--accent-primary)',
  neutral: 'var(--text-muted)',
};

export interface StatusBadgeProps {
  tone?: StatusTone;
  /** Render a 6px leading dot in the tone color. */
  dot?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Canonical status chip. Text color is the tone var; background is a
 * ~10% tint of the same tone via color-mix. Uses `.type-meta`
 * (mono/uppercase/tracking) for the label.
 */
export function StatusBadge({
  tone = 'neutral',
  dot = false,
  className,
  children,
}: StatusBadgeProps) {
  const toneVar = TONE_VAR[tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 type-meta',
        className
      )}
      style={{
        color: toneVar,
        backgroundColor: `color-mix(in srgb, ${toneVar} 10%, transparent)`,
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="inline-block shrink-0 rounded-full"
          style={{ width: '6px', height: '6px', backgroundColor: toneVar }}
        />
      )}
      {children}
    </span>
  );
}

/**
 * Map a project phase slug/label to a status tone.
 * Phases use the --phase-* palette; we map to the nearest semantic tone.
 *   consultation → info       (dusty-blue family)
 *   concept       → accent     (clay)
 *   refinement    → neutral    (aged-oak)
 *   procurement   → warning    (golden-hour)
 *   installation  → error*     (terracotta family — attention, not failure)
 *   walkthrough   → success    (sage)
 * (*terracotta is the closest existing tone var to the installation phase color.)
 */
export function phaseToTone(phase: string): StatusTone {
  const p = (phase || '').toLowerCase().replace(/[\s_-]+/g, '');
  switch (true) {
    case p.includes('consult'):
      return 'info';
    case p.includes('concept'):
      return 'accent';
    case p.includes('refine'):
      return 'neutral';
    case p.includes('procure'):
      return 'warning';
    case p.includes('install'):
      return 'error';
    case p.includes('walkthrough') || p.includes('handoff') || p.includes('complete'):
      return 'success';
    default:
      return 'neutral';
  }
}

/**
 * Map a decision status to a status tone. Mirrors the bands used by
 * `decision-deadline.ts` (decided → success/sage; overdue → error; etc.).
 *   decided / responded / approved → success
 *   pending / awaiting / sent / open → warning
 *   overdue / rejected / declined   → error
 *   draft / unknown                  → neutral
 */
export function decisionStatusToTone(status: string): StatusTone {
  const s = (status || '').toLowerCase().replace(/[\s_-]+/g, '');
  switch (true) {
    case s.includes('decided') ||
      s.includes('responded') ||
      s.includes('approved') ||
      s.includes('resolved') ||
      s.includes('signed'):
      return 'success';
    case s.includes('overdue') || s.includes('rejected') || s.includes('declined'):
      return 'error';
    case s.includes('pending') ||
      s.includes('awaiting') ||
      s.includes('sent') ||
      s.includes('open') ||
      s.includes('review'):
      return 'warning';
    default:
      return 'neutral';
  }
}
