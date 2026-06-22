'use client';

/**
 * Instrument — the document's one typographic action grammar (D4: weight, size,
 * and colour carry emphasis; never chrome, never a button fill, never a shadow).
 *
 * The rows of mono micro-actions scattered across the document (proposal
 * instruments, letterhead instruments, the account band, the margin) all share
 * three tiers so a phase's lead act reads first and the seconds stay quiet:
 *
 *   · primary   — clay, larger, semibold. The phase's ONE dominant next step.
 *   · secondary — aged-oak/muted, small. Everything that isn't the lead act.
 *   · doorway   — primary weight + the three-line Strata tick (D14): "a place
 *                 you walk into" (the Drafting Room, the Library drawer).
 *
 * It is always a <button> — documents carry no nav links inside them (D1).
 */

import type { ReactNode } from 'react';

export type InstrumentVariant = 'primary' | 'secondary' | 'doorway';

const VARIANT_CLS: Record<InstrumentVariant, string> = {
  primary:
    'font-mono text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-clay)] hover:text-[var(--color-mocha)]',
  secondary:
    'font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-clay)]',
  doorway:
    'font-mono text-[10.5px] font-semibold uppercase tracking-[0.09em] text-[var(--color-clay)] hover:text-[var(--color-mocha)]',
};

/**
 * The doorway spine-tick (D14): three diminishing clay lines marking "a place
 * you walk into" — identical grammar to the Library's drawer doorway.
 */
export function DoorwayTick() {
  return (
    <span aria-hidden className="inline-flex flex-col gap-[2px]">
      <i className="block h-[2px] w-[15px] rounded-[1px] bg-[var(--color-clay)]" />
      <i className="block h-[2px] w-[11px] rounded-[1px] bg-[var(--color-clay)] opacity-60" />
      <i className="block h-[2px] w-[7px] rounded-[1px] bg-[var(--color-clay)] opacity-30" />
    </span>
  );
}

export interface InstrumentProps {
  variant?: InstrumentVariant;
  onClick?: () => void;
  children: ReactNode;
  /** glyph after the label, e.g. '→' or '↗' */
  trailing?: ReactNode;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  title?: string;
}

export function Instrument({
  variant = 'secondary',
  onClick,
  children,
  trailing,
  disabled,
  className,
  'aria-label': ariaLabel,
  title,
}: InstrumentProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title}
      className={[
        'inline-flex items-center gap-[0.4rem] whitespace-nowrap transition-colors disabled:cursor-default disabled:opacity-50',
        VARIANT_CLS[variant],
        className ?? '',
      ].join(' ')}
    >
      {variant === 'doorway' && <DoorwayTick />}
      <span>{children}</span>
      {trailing && (
        <span aria-hidden className="font-mono text-[10px] text-[var(--color-clay)] opacity-70">
          {trailing}
        </span>
      )}
    </button>
  );
}

/**
 * A row of instruments — a baseline-aligned wrapping flex with the document's
 * standard gap. Keeps the mono rows from reflowing into an undifferentiated pile
 * at narrow widths (the tier weights still separate the lead act from seconds).
 */
export function InstrumentRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={['flex flex-wrap items-center gap-x-4 gap-y-1.5', className ?? ''].join(' ')}>
      {children}
    </div>
  );
}
