import { describe, it, expect } from 'vitest';
import { formatPoNumber, formatSideMark, circledIndex, formatCents, formatPct } from '../format';

// ─── The anti-drift tripwire (S2) ────────────────────────────────────────────
// These golden strings were read from the LIVE database after running
// fulfillment_confirm_split (00353) on the seeded 5-vendor order (order_no 1,
// client "Priya Anand", vendors …101/102/103/111/118). Captured 2026-07-17 via:
//
//   BEGIN;
//   SELECT public.fulfillment_confirm_split('809faacc-…','verify');
//   SELECT po_number, side_mark FROM public.fulfillment_vendor_pos
//     WHERE order_id='809faacc-…' ORDER BY po_number;
//   ROLLBACK;   -- → PO-2026-00001-A … -E, side_mark 'PRIYA ANAND-1'
//
// If confirm_split's format changes (or these formatters drift from it), this
// test goes red — the TS layer and the RPC must agree byte-for-byte, because
// the Workbench previews the PO number the RPC WILL mint, before it mints it.

const GOLDEN_PO_NUMBERS = [
  'PO-2026-00001-A',
  'PO-2026-00001-B',
  'PO-2026-00001-C',
  'PO-2026-00001-D',
  'PO-2026-00001-E',
];
const GOLDEN_SIDE_MARK = 'PRIYA ANAND-1';

describe('formatPoNumber — matches confirm_split stored po_number', () => {
  it('reproduces the 5-vendor order golden po_numbers A…E', () => {
    for (let seq = 1; seq <= 5; seq++) {
      expect(formatPoNumber(2026, 1, seq)).toBe(GOLDEN_PO_NUMBERS[seq - 1]);
    }
  });

  it('pads the order number to 5 digits (chr(64+seq) letter)', () => {
    expect(formatPoNumber(2026, 147, 6)).toBe('PO-2026-00147-F');
    expect(formatPoNumber(2026, 12345, 1)).toBe('PO-2026-12345-A');
  });
});

describe('formatSideMark — matches confirm_split stored side_mark', () => {
  it('reproduces the golden side-mark for the 5-vendor order', () => {
    expect(formatSideMark('Priya Anand', 1)).toBe(GOLDEN_SIDE_MARK);
  });

  it('uppercases the client name and appends the order number', () => {
    expect(formatSideMark('Whitfield', 147)).toBe('WHITFIELD-147');
  });
});

describe('circledIndex', () => {
  it('threads the 5-vendor order lines ①…⑤', () => {
    expect([1, 2, 3, 4, 5].map(circledIndex)).toEqual(['①', '②', '③', '④', '⑤']);
  });
  it('covers the full ①…⑳ Unicode run', () => {
    expect(circledIndex(20)).toBe('⑳');
  });
  it('falls back to (n) outside 1…20', () => {
    expect(circledIndex(0)).toBe('(0)');
    expect(circledIndex(21)).toBe('(21)');
  });
});

describe('formatCents / formatPct', () => {
  it('formats the 5-vendor order money strip figures', () => {
    expect(formatCents(1309900)).toBe('$13,099.00'); // captured
    expect(formatCents(963920)).toBe('$9,639.20'); // vendor cost
    expect(formatCents(240980)).toBe('$2,409.80'); // projected commission
  });
  it('rounds a fraction to a whole percent', () => {
    expect(formatPct(0.19754)).toBe('20%');
    expect(formatPct(0.25)).toBe('25%');
  });
});
