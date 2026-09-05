import type { CSSProperties, ReactNode } from 'react';

/* ── THE STAMP ───────────────────────────────────────────────────────────────
   One inspection stamp, eleven states, four dials: border weight (single or
   doubled), border pigment, word ink, and rotation. No fill, no shadow, no
   checkmark, no badge — a stamp is ink pressed onto paper, and paper has no
   depth.

   The pigments are ruled (R13): SIGNED is mocha, not sage — sage is a material
   pigment and a green mark on the most consequential state is the traffic
   light VISION §6 refuses. `--color-terracotta-ink` appears exactly once, on
   DECLINED, and never opposite a sage counterpart, so no red/green pair is
   available to read.

   AWAITING carries no word. It is the un-stamped state: an upright hairline
   outline, deliberately not yet pressed. Screen readers are told what it is —
   an empty box is a mark to the eye and nothing at all to the ear.

   Aging is one step, at thirty days, and then it stops: the outer border falls
   0.88 → 0.74 and the doubled inner rule 0.42 → 0.26. The WORD never fades —
   patina settles, it does not become illegible. States that are still asking
   something (awaiting, returned, held, reviewed) do not age at all, however
   old they are.
   ────────────────────────────────────────────────────────────────────────── */

export type StampState =
  | 'awaiting'
  | 'approved'
  | 'returned'
  | 'held'
  | 'signed'
  | 'signed_on_paper'
  | 'reviewed'
  | 'withdrawn'
  | 'superseded'
  | 'expired'
  | 'declined';

export interface StampDial {
  /** The word pressed into the paper. `null` on the one un-stamped state. */
  word: string | null;
  /** A second mono line inside the rule, for a mark made somewhere else. */
  underWord: string | null;
  /** Border pigment. */
  border: string;
  /** Word ink. Never degrades. */
  ink: string;
  weight: 'single' | 'doubled';
  /** Degrees. Non-zero only where the mark was pressed on this surface. */
  rotation: number;
  /** Terminal states settle; states still asking something stay at full ink. */
  ages: boolean;
  /** A struck word — the mark was taken back. */
  struck: boolean;
  /** What the mark says out loud. */
  label: string;
}

const MOCHA = 'var(--color-mocha)';
const CHARCOAL = 'var(--color-charcoal)';
const MUTED = 'var(--text-muted)';

export const STAMP_DIALS: Record<StampState, StampDial> = {
  awaiting: {
    word: null,
    underWord: null,
    border: 'var(--color-golden-hour-ink)',
    ink: CHARCOAL,
    weight: 'single',
    rotation: 0,
    ages: false,
    struck: false,
    label: 'Awaiting you',
  },
  approved: {
    word: 'APPROVED',
    underWord: null,
    border: MOCHA,
    ink: MOCHA,
    weight: 'doubled',
    rotation: -1.1,
    ages: true,
    struck: false,
    label: 'Approved',
  },
  returned: {
    word: 'RETURNED',
    underWord: null,
    border: 'var(--color-clay-ink)',
    ink: CHARCOAL,
    weight: 'single',
    rotation: -1.1,
    ages: false,
    struck: false,
    label: 'Returned',
  },
  held: {
    word: 'HELD',
    underWord: null,
    border: 'var(--color-golden-hour-ink)',
    ink: CHARCOAL,
    weight: 'doubled',
    rotation: -1.1,
    ages: false,
    struck: false,
    label: 'Held',
  },
  signed: {
    word: 'SIGNED',
    underWord: null,
    border: MOCHA,
    ink: MOCHA,
    weight: 'doubled',
    rotation: -1.1,
    ages: true,
    struck: false,
    label: 'Signed',
  },
  signed_on_paper: {
    word: 'SIGNED',
    underWord: 'ON PAPER',
    border: MOCHA,
    ink: MOCHA,
    weight: 'doubled',
    // Upright, because it was not stamped on this surface.
    rotation: 0,
    ages: true,
    struck: false,
    label: 'Signed on paper',
  },
  reviewed: {
    word: 'REVIEWED',
    underWord: null,
    border: MUTED,
    ink: MUTED,
    weight: 'single',
    rotation: -1.1,
    ages: false,
    struck: false,
    label: 'Reviewed',
  },
  withdrawn: {
    word: 'WITHDRAWN',
    underWord: null,
    border: MUTED,
    ink: MUTED,
    weight: 'single',
    rotation: 0,
    ages: true,
    struck: true,
    label: 'Withdrawn',
  },
  superseded: {
    word: 'SUPERSEDED',
    underWord: null,
    border: MUTED,
    ink: MUTED,
    weight: 'single',
    rotation: 0,
    ages: true,
    struck: false,
    label: 'Superseded',
  },
  expired: {
    word: 'EXPIRED',
    underWord: null,
    border: MUTED,
    ink: MUTED,
    weight: 'single',
    rotation: 0,
    ages: true,
    struck: false,
    label: 'Expired',
  },
  declined: {
    word: 'DECLINED',
    underWord: null,
    border: 'var(--color-terracotta-ink)',
    ink: CHARCOAL,
    weight: 'single',
    rotation: -1.1,
    ages: true,
    struck: false,
    label: 'Declined',
  },
};

/** Thirty days, in milliseconds — the one aging step, and the only one. */
const AGING_STEP_MS = 30 * 24 * 60 * 60 * 1000;

export const STAMP_OPACITY = {
  border: 0.88,
  borderAged: 0.74,
  inner: 0.42,
  innerAged: 0.26,
} as const;

/**
 * Has this mark taken its one aging step? A state that is still asking
 * something never does, and neither does a mark with no date behind it — a
 * stamp of unknown age is drawn fresh rather than guessed at.
 */
export function stampHasAged(
  state: StampState,
  since: Date | null | undefined,
  now: Date,
): boolean {
  if (!STAMP_DIALS[state].ages) return false;
  if (!since || Number.isNaN(since.getTime())) return false;
  return now.getTime() - since.getTime() >= AGING_STEP_MS;
}

/** A pigment at a stated strength, with the paper showing through the rest. */
function atStrength(pigment: string, opacity: number): string {
  return `color-mix(in srgb, ${pigment} ${Math.round(opacity * 100)}%, transparent)`;
}

/**
 * Which of the eleven a Stage-2 approval stands at.
 *
 * The precedence is `projectApprovalAttentionLabel`'s own
 * (`lib/client-attention.ts`): withdrawn and superseded stand AHEAD of any
 * outcome, so a superseded edition never reads plainly RETURNED beside the
 * live edition that replaced it.
 */
export function stampStateForApproval(approval: {
  disposition: string;
  outcome: string | null;
}): StampState {
  if (approval.disposition === 'withdrawn') return 'withdrawn';
  if (approval.disposition === 'superseded') return 'superseded';
  if (approval.outcome === 'approved') return 'approved';
  if (approval.outcome === 'changes_requested') return 'returned';
  if (approval.outcome === 'needs_discussion') return 'held';
  return 'awaiting';
}

export interface StampProps {
  state: StampState;
  /** When the mark was made. Drives the one aging step, and nothing else. */
  since?: Date | null;
  /** The date beside the word, already in words. */
  dateLabel?: string | null;
  /** Injectable clock, so the aging step is testable without waiting a month. */
  now?: Date;
  /** What the mark is about, printed under it in the paper's own voice. */
  children?: ReactNode;
  'data-testid'?: string;
  className?: string;
}

export function Stamp({
  state,
  since = null,
  dateLabel = null,
  now,
  children,
  'data-testid': testId,
  className,
}: StampProps) {
  const dial = STAMP_DIALS[state];
  const aged = stampHasAged(state, since, now ?? new Date());
  const borderOpacity = aged ? STAMP_OPACITY.borderAged : STAMP_OPACITY.border;
  const innerOpacity = aged ? STAMP_OPACITY.innerAged : STAMP_OPACITY.inner;

  // The dials are parked as custom properties as well as applied, so the mark
  // states its own settings — a stamp that claims to be aged and is not is a
  // thing a test can catch.
  const style = {
    '--stamp-border': dial.border,
    '--stamp-ink': dial.ink,
    '--stamp-border-opacity': String(borderOpacity),
    '--stamp-inner-opacity': String(innerOpacity),
    '--stamp-rotation': `${dial.rotation}deg`,
    borderColor: atStrength(dial.border, borderOpacity),
    color: dial.ink,
    transform: dial.rotation === 0 ? undefined : `rotate(${dial.rotation}deg)`,
  } as CSSProperties;

  return (
    <span
      data-testid={testId}
      data-stamp-state={state}
      data-stamp-aged={aged ? 'true' : 'false'}
      data-stamp-weight={dial.weight}
      {...(dial.word === null ? { role: 'img', 'aria-label': dial.label } : {})}
      className={`relative inline-block max-w-[38ch] border border-solid px-2.5 pb-1 pt-1.5 font-mono text-[11px] uppercase leading-relaxed tracking-[0.1em] ${
        dial.word === null ? 'min-h-[26px] min-w-[52px]' : ''
      }${className ? ` ${className}` : ''}`}
      style={style}
    >
      {dial.weight === 'doubled' && (
        <span
          aria-hidden="true"
          data-testid="stamp-inner-rule"
          className="pointer-events-none absolute inset-[2.5px] border border-solid"
          style={{ borderColor: atStrength(dial.border, innerOpacity) }}
        />
      )}
      {dial.word !== null && (
        <span className="relative">
          <span className={dial.struck ? 'line-through decoration-1' : undefined}>
            {dial.word}
          </span>
          {dateLabel ? ` ${dateLabel}` : ''}
        </span>
      )}
      {dial.underWord !== null && (
        <span className="relative block tracking-[0.14em]">{dial.underWord}</span>
      )}
      {children !== undefined && children !== null && (
        <span className="relative block font-normal normal-case tracking-[0.04em]">
          {children}
        </span>
      )}
    </span>
  );
}
