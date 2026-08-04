/**
 * The Drafting Room's progress (R42) — the ONLY progress indicator there is.
 *
 * The three movements map to the three Strata lines, and the state reads
 * Outline → Drafting → Ready to send off the same fill the mark shows:
 *   · line 1 — SCOPE      (the rooms + what fills them)
 *   · line 2 — THE OFFER  (commerce: phases, exclusions, payments, terms)
 *   · line 3 — THE VISION (palette + boards)
 *
 * Pure + dependency-free (mirrors the prototype's recompute()). No Next, no
 * Back, no Step N of M — just how full each line is.
 */

export interface DraftingFacets {
  /** rooms named in scope */
  rooms: boolean;
  /** an FF&E schedule written */
  ffe: boolean;
  /** phases & fees laid out */
  phases: boolean;
  /** exclusions stated */
  exclusions: boolean;
  /** a payment schedule set */
  payments: boolean;
  /** change-order terms written */
  terms: boolean;
  /** a palette chosen */
  palette: boolean;
  /** mood boards attached */
  boards: boolean;
}

export type DraftingStateLabel = 'Outline' | 'Drafting' | 'Ready to send';

/** [line1, line2, line3] fill fractions for the Strata Mark. */
export function draftingFill(f: DraftingFacets): [number, number, number] {
  const line1 = (f.rooms ? 0.5 : 0) + (f.ffe ? 0.5 : 0);
  const line2 =
    (f.phases ? 0.25 : 0) +
    (f.exclusions ? 0.25 : 0) +
    (f.payments ? 0.25 : 0) +
    (f.terms ? 0.25 : 0);
  const line3 = (f.palette ? 0.5 : 0) + (f.boards ? 0.5 : 0);
  return [line1, line2, line3];
}

export function draftingPct(fill: [number, number, number]): number {
  return Math.round(((fill[0] + fill[1] + fill[2]) / 3) * 100);
}

/** The state band reads off the same fill — never a separate stepper. */
export function draftingStateLabel(pct: number): DraftingStateLabel {
  if (pct <= 0) return 'Outline';
  if (pct >= 100) return 'Ready to send';
  return 'Drafting';
}

/**
 * Legacy retirement: no new legacy sending, so the underlying state literal
 * 'Ready to send' (still returned by draftingStateLabel above — other
 * consumers key off it) no longer describes a real act once fully drafted.
 * Every DISPLAY surface reads through this shared mapping so a third
 * consumer can't drift back to the retired wording independently.
 */
export function displayDraftingState(state: DraftingStateLabel | string): string {
  return state === 'Ready to send' ? 'Fully drafted' : state;
}

/** The drafter's offer line: what's still open, in plain words (never blocks). */
export function draftingGaps(f: DraftingFacets): string[] {
  const gaps: string[] = [];
  if (!f.rooms) gaps.push('rooms in scope');
  if (!f.ffe) gaps.push('an FF&E schedule');
  if (!f.phases) gaps.push('phases & fees');
  if (!f.exclusions) gaps.push('exclusions');
  if (!f.payments) gaps.push('a payment schedule');
  if (!f.terms) gaps.push('change-order terms');
  if (!f.palette) gaps.push('a palette');
  if (!f.boards) gaps.push('mood boards');
  return gaps;
}
