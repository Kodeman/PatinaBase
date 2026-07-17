import { describe, it, expect } from 'vitest';
import { formatPoNumber, formatSideMark, circledIndex, formatCents, formatPct } from '../format';

// ─── The anti-drift tripwire (S2; RE-PINNED 2026-07-17 for R3.5, C1 fix) ─────
// These golden strings were read from the LIVE database after running
// fulfillment_confirm_split (00353) on the seeded 5-vendor order (order_no 1,
// client "Priya Anand", vendors …101/102/103/111/118). Captured via:
//
//   BEGIN;
//   SELECT public.fulfillment_confirm_split('<order-1-id>','verify');
//   SELECT po_number, side_mark FROM public.fulfillment_vendor_pos
//     WHERE order_id='<order-1-id>' ORDER BY po_number;
//   ROLLBACK;   -- → PO-2026-00001-A … -E, side_mark 'ANAND-1'
//
// side_mark changed from the old `upper(client_name)` ('PRIYA ANAND-1') to a
// surname-only mark (R3.5) — re-pinned against a fresh confirm_split run
// after the R3.2 seed re-price + reseed; PO numbers are unaffected by either
// change. If confirm_split's format changes (or these formatters drift from
// it), this test goes red — the TS layer and the RPC must agree byte-for-
// byte, because the Workbench previews the PO number the RPC WILL mint,
// before it mints it.

const GOLDEN_PO_NUMBERS = [
  'PO-2026-00001-A',
  'PO-2026-00001-B',
  'PO-2026-00001-C',
  'PO-2026-00001-D',
  'PO-2026-00001-E',
];
const GOLDEN_SIDE_MARK = 'ANAND-1';

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

  it('uses the surname (last token) for a multi-word name', () => {
    expect(formatSideMark('Odalys Ferreira', 3)).toBe('FERREIRA-3');
    expect(formatSideMark('Nora Lindqvist', 5)).toBe('LINDQVIST-5');
  });

  it('falls back to the full uppercased name when no surname parses (single token)', () => {
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
  it('formats the 5-vendor order money strip figures (R3.2 re-priced)', () => {
    expect(formatCents(1309900)).toBe('$13,099.00'); // captured (unaffected by price_trade)
    expect(formatCents(777569)).toBe('$7,775.69'); // vendor cost
    expect(formatCents(427331)).toBe('$4,273.31'); // projected commission
  });
  it('rounds a fraction to a whole percent', () => {
    expect(formatPct(0.19754)).toBe('20%');
    expect(formatPct(0.25)).toBe('25%');
  });
});
