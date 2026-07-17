'use client';

import { inspectionCountdown } from '@patina/fulfillment';

// DeadlineClock (S5, spec §5.4 + BOH-DECISIONS I5: "DeadlineClock display
// variant = loudest type on the board"). The Shipment Board's one deliberately
// oversized element — an open inspection window is the thing an operator can
// still act on (dispute damage/shortage before the claims window shuts), so
// its countdown reads louder than everything else on the row by CONTRAST
// (size + weight), not ornament: no icon, no background fill, no border. Sage
// while there's runway, terracotta at <=2 days (the same threshold
// money-strip.tsx uses for its floor warning — one vocabulary for "this
// number is now urgent" across Back of House).
//
// Renders nothing for a shipment with no window (not yet delivered, or a mode
// with no window ever opened) — the row's status sentence covers that case;
// this component is only ever mounted on rows package S5 scope calls "open
// inspection window" rows.

export interface DeadlineClockProps {
  closesAt: string | null;
  nowMs?: number;
}

export function DeadlineClock({ closesAt, nowMs }: DeadlineClockProps) {
  const now = nowMs ?? Date.now();
  const countdown = inspectionCountdown(closesAt, now);
  if (!countdown) return null;

  const color = countdown.terracotta
    ? 'var(--color-terracotta, var(--color-error))'
    : 'var(--color-sage, var(--color-success))';

  return (
    <div
      data-testid="deadline-clock"
      data-open={countdown.isOpen}
      data-terracotta={countdown.terracotta}
      className="flex flex-col items-end"
    >
      <span
        className="text-[0.53rem] uppercase tracking-[0.13em] text-[var(--text-muted)]"
        style={{ fontFamily: 'var(--font-meta)' }}
      >
        Inspection window
      </span>
      {/* The loudest type on the board — deliberately larger than the row's
          slip figure or any other mono value (S2's money-strip tops out at
          0.9rem; this is 1.35rem, the single visual outlier by design). */}
      <span
        data-testid="deadline-clock-value"
        className="deadline-clock-loud mt-0.5 leading-none tabular-nums"
        style={{ fontFamily: 'var(--font-meta)', color, fontSize: '1.35rem', fontWeight: 600 }}
      >
        {countdown.label}
      </span>
    </div>
  );
}
