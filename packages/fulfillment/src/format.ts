// @patina/fulfillment — Workbench formatters (S2, spec §5.2/§5.3).
//
// These three formatters are the TS mirror of what the database writes at
// confirm-split time (00353 fulfillment_confirm_split). They MUST stay
// byte-identical to the RPC's stored output:
//
//   po_number  = 'PO-' || to_char(now(),'YYYY') || '-' ||
//                lpad(order_no::text, 5, '0') || '-' || chr(64 + seq)
//   side_mark  = upper(surname) || '-' || order_no
//                where surname = the LAST whitespace-separated token of
//                client_name when it has more than one token, else the full
//                (single-token) name unchanged (R3.5, C1 fix) — a blind-ship
//                label the vendor sees; the full client name overexposes the
//                relationship for a multi-word name, and a bare surname is
//                what a delivery crew actually reads off a shipping label.
//
// The anti-drift tripwire lives in __tests__/format.test.ts: it asserts these
// formatters produce exactly the strings fulfillment_confirm_split stored on
// the seeded 5-vendor order (PO-2026-00001-A … -E, side_mark 'ANAND-1'). If
// either side changes the format, that golden test goes red.

/**
 * A vendor PO number, matching fulfillment_confirm_split's stored value:
 * `PO-{yyyy}-{orderNo padded to 5}-{A..Z}`. `seq` is 1-based (A = 1), matching
 * the RPC's `chr(64 + v_idx)` where v_idx starts at 1.
 *
 * @example formatPoNumber(2026, 1, 1) → 'PO-2026-00001-A'
 * @example formatPoNumber(2026, 147, 6) → 'PO-2026-00147-F'
 */
export function formatPoNumber(year: number, orderNo: number, seq: number): string {
  const padded = String(orderNo).padStart(5, '0');
  // chr(64 + seq): 1→A … 26→Z. Beyond Z the RPC would emit non-letter chars
  // (chr(91)='['); a real order never splits to >26 vendors (max 6, spec §1),
  // so we mirror the RPC's arithmetic exactly rather than inventing AA/AB.
  const letter = String.fromCharCode(64 + seq);
  return `PO-${year}-${padded}-${letter}`;
}

/**
 * The side-mark stamped on every PO of an order, matching
 * fulfillment_confirm_split: `{SURNAME}-{orderNo}`. Surname = the last
 * whitespace-separated token of `clientName` when it has more than one
 * token; a single-token name (no space) falls back to the full name
 * unchanged. Both cases are uppercased. The blind-ship label the vendor
 * sees — a bare surname identifies the destination without exposing Patina's
 * full client relationship or the other vendors in the order (R3.5).
 *
 * @example formatSideMark('Priya Anand', 1) → 'ANAND-1'
 * @example formatSideMark('Whitfield', 147) → 'WHITFIELD-147'
 */
export function formatSideMark(clientName: string, orderNo: number): string {
  const trimmed = clientName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const surname = parts.length > 1 ? parts[parts.length - 1] : trimmed;
  return `${surname.toUpperCase()}-${orderNo}`;
}

// Circled-number glyphs ①…⑳ (U+2460 … U+2473). The "thread" that ties a client
// order line on the left of the Workbench to its PO line on the right (spec
// §5.2 "small mono indexes carry the thread across the hairline").
const CIRCLED_BASE = 0x2460; // ①
const CIRCLED_MAX = 20; // ⑳ — the Unicode run of consecutive circled digits ends here

/**
 * The circled index glyph for a 1-based line number: 1 → '①' … 20 → '⑳'.
 * Out of that range (n < 1 or n > 20) falls back to a parenthesised number
 * `(n)` — an order never has more than a handful of lines, so the fallback is
 * a safety net, not a real path.
 *
 * @example circledIndex(1) → '①'
 * @example circledIndex(5) → '⑤'
 */
export function circledIndex(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > CIRCLED_MAX) return `(${n})`;
  return String.fromCodePoint(CIRCLED_BASE + n - 1);
}

/** Cents → a `$1,234.56` display string. Whole-dollar amounts keep the `.00`
 *  so the money strip's five figures stay decimal-aligned as they recompute. */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** A fraction (0.1975) → a whole-percent display string ('20%'). Used for the
 *  margin figure in the money strip's terracotta floor warning. */
export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}
