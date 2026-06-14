/**
 * The Composing Page's progress (R40) — the ONLY progress indicator there is.
 *
 * The three movements map to the three Strata lines, and the state reads
 * Capture → Draft → Catalog-ready off the same fill the mark shows:
 *   · line 1 — the record  (identity + the piece)
 *   · line 2 — the catalog (commerce + the folio)
 *   · line 3 — the eye     (the teaching)
 *
 * Pure + dependency-free (mirrors the prototype's recompute()). No Next, no
 * Back, no Step N of M — just how full each line is.
 */

export interface ComposeSections {
  /** name + maker written */
  identity: boolean;
  /** dimensions + materials written */
  piece: boolean;
  /** trade + retail + lead time written */
  commerce: boolean;
  /** at least one image/cut sheet */
  folio: boolean;
  /** taught — at least one style */
  eye: boolean;
}

export type ComposeStateLabel = 'Capture' | 'Draft' | 'Catalog-ready';

/** [line1, line2, line3] fill fractions for the Strata Mark. */
export function composeFill(s: ComposeSections): [number, number, number] {
  const line1 = (s.identity ? 0.5 : 0) + (s.piece ? 0.5 : 0);
  const line2 = (s.commerce ? 0.5 : 0) + (s.folio ? 0.5 : 0);
  const line3 = s.eye ? 1 : 0;
  return [line1, line2, line3];
}

export function composePct(fill: [number, number, number]): number {
  return Math.round(((fill[0] + fill[1] + fill[2]) / 3) * 100);
}

/** The state band reads off the same fill — never a separate stepper. */
export function composeStateLabel(pct: number): ComposeStateLabel {
  if (pct <= 0) return 'Capture';
  if (pct >= 100) return 'Catalog-ready';
  return 'Draft';
}

/** The librarian's offer line: what's still open, in plain words (never blocks). */
export function composeGaps(s: ComposeSections): string[] {
  const gaps: string[] = [];
  if (!s.identity) gaps.push('a name & maker');
  if (!s.piece) gaps.push('dimensions');
  if (!s.commerce) gaps.push('a price');
  if (!s.folio) gaps.push('an image');
  if (!s.eye) gaps.push('its style');
  return gaps;
}
