'use client';

/**
 * THE STATE WORD — one primitive for all four word families.
 *
 * Reach, consent, stage and paper each print as ONE BORDERED MONO WORD in one
 * of four pigments (direction §3.8, SPEC §2.2's `.word--*` rules). Three
 * palettes and a bare colour dot are replaced by this: the word is ALWAYS
 * printed, its border pigment and its word always agree, and no state is ever
 * carried by colour alone (SPEC §7 #9).
 *
 * Never a fill — a border and text on a transparent ground (SPEC §8 #10). Zero
 * box-shadow. The word and the pigment come from `resolveStateWord` in
 * @patina/types, so the label is never a literal here and two surfaces cannot
 * reduce the same value differently.
 *
 * A value that names no word in its family renders NOTHING (`null`). That is
 * the rule R-V and R-BB both rest on: an absent fact prints its own sentence
 * somewhere else, and "Not asked" over a studio's dated refusal is exactly the
 * fail-open word this program removed.
 */

import { resolveStateWord, type StateWordFamily } from '@patina/types';

export interface StateWordProps {
  family: StateWordFamily;
  /** The raw family value: a `reach_state`, a consent status, a stored
   *  `stage`, a `paper_state`. */
  value: string | null | undefined;
  /**
   * At 390 a person row's words print as three PLAIN inline words, middle-dot
   * separated, with no border (R-M / C23 / SPEC §6.2). Same word, same
   * pigment, no box.
   */
  plain?: boolean;
  className?: string;
}

export function StateWord({ family, value, plain = false, className }: StateWordProps) {
  const resolved = resolveStateWord(family, value);
  if (!resolved) return null;

  const { label, pigment, tokens } = resolved;

  if (plain) {
    return (
      <span
        data-state-word={resolved.value}
        data-state-family={family}
        data-state-pigment={pigment}
        className={`font-mono text-[11px] font-medium uppercase tracking-[0.06em] ${className ?? ''}`}
        style={{ color: tokens.color }}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      data-state-word={resolved.value}
      data-state-family={family}
      data-state-pigment={pigment}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[3px] border px-[6px] py-[4px] text-center font-mono text-[11px] font-medium uppercase tracking-[0.06em] ${className ?? ''}`}
      style={{
        borderColor: tokens.border,
        color: tokens.color,
        background: 'transparent',
      }}
    >
      {label}
    </span>
  );
}

/**
 * Authority is NEVER a state word (direction §3.8). It prints as plain,
 * uncoloured text — "Signs money to $2,500", "Selections", "Prepares only",
 * "Holds a key" — and this is the primitive that keeps it off the four
 * pigments rather than leaving each surface to remember.
 */
export function PlainFact({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[11px] font-normal tracking-normal text-[var(--ink-subtle)] ${className ?? ''}`}
    >
      {children}
    </span>
  );
}
