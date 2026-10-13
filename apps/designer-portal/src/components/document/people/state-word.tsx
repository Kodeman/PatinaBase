"use client";

/**
 * THE STATE WORD — one primitive for all four word families.
 *
 * Reach, consent, stage and paper each print as ONE UNBOXED MONO WORD IN INK
 * (V20 U-Q13, US-28 S10; house sheet §G-11). The word is the state: it is
 * always printed and never a chip, a border or a grading pigment. Terracotta-
 * ink marks only a blocked or do-not-contact word (a lapsed paper, an opted-
 * out number), and the sentence beside it says so, so meaning never rests on
 * colour (WCAG 1.4.1).
 *
 * The word and its ink come from `resolveStateWord` in @patina/types, and the
 * class from `STATE_WORD_INK_TOKENS` (the `.word` rules in globals.css' US-28
 * S1 block), so the label is never a literal here and two surfaces cannot
 * reduce the same value differently.
 *
 * A value that names no word in its family renders NOTHING (`null`). That is
 * the rule R-V and R-BB both rest on: an absent fact prints its own sentence
 * somewhere else, and "Not asked" over a studio's dated refusal is exactly the
 * fail-open word this program removed.
 */

import {
  STATE_WORD_INK_TOKENS,
  resolveStateWord,
  type StateWordFamily,
} from "@patina/types";

export interface StateWordProps {
  family: StateWordFamily;
  /** The raw family value: a `reach_state`, a consent status, a stored
   *  `stage`, a `paper_state`. */
  value: string | null | undefined;
  /**
   * Kept for the callers that print a row's words inline at 390 (R-M). Since
   * U-Q13 the word is never boxed at any width, so a plain word and a column
   * word are the same ink word.
   */
  plain?: boolean;
  className?: string;
}

export function StateWord({ family, value, className }: StateWordProps) {
  const resolved = resolveStateWord(family, value);
  if (!resolved) return null;

  const { label, pigment, ink } = resolved;
  const inkClass = STATE_WORD_INK_TOKENS[ink].className;

  return (
    <span
      data-state-word={resolved.value}
      data-state-family={family}
      data-state-pigment={pigment}
      data-state-ink={ink}
      className={className ? `${inkClass} ${className}` : inkClass}
    >
      {label}
    </span>
  );
}

/**
 * Authority is NEVER a state word (direction §3.8). It prints as plain,
 * uncoloured text — "Signs money to $2,500", "Selections", "Prepares only",
 * "Holds a key" — and this is the primitive that keeps it off the state words
 * rather than leaving each surface to remember.
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
      className={`font-mono text-[11px] font-normal tracking-normal text-[var(--ink-subtle)] ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
