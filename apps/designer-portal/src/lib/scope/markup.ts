/**
 * Financial lens math (Track S² · S9) — pure, cents-integer money helpers for
 * the pre-sale schedule (proposal_items). Trade → client via markup; line margin
 * mirrors the post-sale FF&E page's shape (line_total − trade × qty) so the two
 * lenses read the same. Allowance/TBD lines have no unit trade price, so markup
 * and margin are undefined for them.
 *
 * Pure + dependency-free (jest-friendly). Reused by the money-view toggle and
 * the bulk-markup act.
 */

export type LineType = 'fixed' | 'allowance' | 'tbd';

export interface MarkupInput {
  item_type?: LineType | null;
  /** Trade unit price, cents. */
  unit_price?: number | null;
  quantity?: number | null;
}

export interface MarkupResult {
  markup_percent: number;
  /** Client unit price, cents. */
  unit_sell_price: number;
  line_total_cents: number;
}

/**
 * Recompute a fixed line's client price + line total from its trade price and a
 * markup percent: `client = round(trade × (1 + markup/100))`, `line = qty ×
 * client`. Allowance/TBD → null (skip; they carry no unit trade price). A
 * negative or absent trade price is treated as 0 (client becomes 0, an honest
 * "unpriced" line rather than a throw).
 */
export function computeMarkupUpdate(
  item: MarkupInput,
  markupPercent: number,
): MarkupResult | null {
  if ((item.item_type ?? 'fixed') !== 'fixed') return null;
  const trade = Math.max(0, item.unit_price ?? 0);
  const qty = item.quantity ?? 1;
  const sell = Math.round(trade * (1 + markupPercent / 100));
  return {
    markup_percent: markupPercent,
    unit_sell_price: sell,
    line_total_cents: qty * sell,
  };
}

export interface MarginLine {
  item_type?: LineType | null;
  line_total_cents?: number | null;
  /** Trade unit price, cents. */
  unit_price?: number | null;
  quantity?: number | null;
}

/**
 * A fixed line's margin in cents: `line_total − trade × qty`. Non-fixed lines,
 * or fixed lines with no trade price on file, return null (margin is meaningless
 * — mirrors the FF&E page's `cardMarginLabel` gate).
 */
export function lineMarginCents(item: MarginLine): number | null {
  if ((item.item_type ?? 'fixed') !== 'fixed') return null;
  if (item.unit_price === null || item.unit_price === undefined) return null;
  return (item.line_total_cents ?? 0) - item.unit_price * (item.quantity ?? 1);
}

export interface LensTotals {
  clientTotalCents: number;
  /** Σ margin over lines that HAVE a margin (fixed w/ trade). */
  marginTotalCents: number;
  /** Whether every counted line contributed a margin (else the total is partial). */
  marginComplete: boolean;
}

/** Fold a set of lines into client + margin totals (a room subtotal or the doc total). */
export function lensTotals(lines: MarginLine[]): LensTotals {
  let clientTotalCents = 0;
  let marginTotalCents = 0;
  let marginComplete = true;
  for (const line of lines) {
    clientTotalCents += line.line_total_cents ?? 0;
    const m = lineMarginCents(line);
    if (m === null) marginComplete = false;
    else marginTotalCents += m;
  }
  return { clientTotalCents, marginTotalCents, marginComplete };
}
