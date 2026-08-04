'use client';

/**
 * The reach chip (Call Sheet Wave 3, slide 11's mnote 4) — "eight and a half
 * pixels of mono, on every row, saying whether this person logs in, opens a
 * link, or only ever gets a call. Nothing else in the product says it at all."
 *
 * A bordered mono word, three tints and no fourth:
 *   · ACCOUNT     sage        — they log in
 *   · FIELD LINK  golden hour — a no-login link is live
 *   · ON PAPER    pearl       — a phone number and a hope
 *
 * Zero shadows (D4); the border and a 14%-wash are the only depth. Labels come
 * from @patina/types REACH_STATE_LABELS — never a literal here.
 */

import { REACH_STATE_LABELS, type ReachState } from '@patina/types';

const TINT: Record<ReachState, { color: string; border: string; background: string }> = {
  account: {
    color: '#6f8069',
    border: 'var(--color-sage)',
    background: 'rgba(168,181,160,0.14)',
  },
  field_link: {
    color: '#8a7126',
    border: 'var(--color-golden-hour)',
    background: 'rgba(212,180,84,0.14)',
  },
  on_paper: {
    color: 'var(--color-aged-oak)',
    border: 'var(--color-pearl)',
    background: 'transparent',
  },
};

export function ReachChip({ state }: { state: ReachState }) {
  const tint = TINT[state];
  return (
    <span
      data-reach-state={state}
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-[3px] border px-[7px] py-[2px] font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em]"
      style={{ color: tint.color, borderColor: tint.border, background: tint.background }}
    >
      {REACH_STATE_LABELS[state]}
    </span>
  );
}
