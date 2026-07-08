import {
  computeMarkupUpdate,
  lineMarginCents,
  lensTotals,
} from '../markup';

// ─── S9 · bulk markup recompute ──────────────────────────────────────────────

describe('computeMarkupUpdate', () => {
  it('applies trade × (1 + markup) = client, then qty × client', () => {
    // $100 trade, 40% markup → $140 client; qty 3 → $420 line.
    expect(computeMarkupUpdate({ item_type: 'fixed', unit_price: 10000, quantity: 3 }, 40)).toEqual({
      markup_percent: 40,
      unit_sell_price: 14000,
      line_total_cents: 42000,
    });
  });

  it('rounds the client price to whole cents', () => {
    // 3333 × 1.15 = 3832.95 → 3833.
    expect(computeMarkupUpdate({ item_type: 'fixed', unit_price: 3333, quantity: 1 }, 15))
      .toMatchObject({ unit_sell_price: 3833, line_total_cents: 3833 });
  });

  it('supports a 0% markup (client = trade)', () => {
    expect(computeMarkupUpdate({ item_type: 'fixed', unit_price: 5000, quantity: 2 }, 0)).toEqual({
      markup_percent: 0,
      unit_sell_price: 5000,
      line_total_cents: 10000,
    });
  });

  it('skips allowance and tbd lines (returns null)', () => {
    expect(computeMarkupUpdate({ item_type: 'allowance', unit_price: 0, quantity: 1 }, 40)).toBeNull();
    expect(computeMarkupUpdate({ item_type: 'tbd', unit_price: 0, quantity: 1 }, 40)).toBeNull();
  });

  it('treats a missing/negative trade price as 0', () => {
    expect(computeMarkupUpdate({ item_type: 'fixed', unit_price: null, quantity: 2 }, 40)).toMatchObject({
      unit_sell_price: 0,
      line_total_cents: 0,
    });
    expect(computeMarkupUpdate({ item_type: 'fixed', unit_price: -500, quantity: 1 }, 40)).toMatchObject({
      unit_sell_price: 0,
    });
  });

  it('defaults quantity to 1', () => {
    expect(computeMarkupUpdate({ item_type: 'fixed', unit_price: 10000 }, 25)).toMatchObject({
      line_total_cents: 12500,
    });
  });
});

// ─── S9 · line margin (mirrors the FF&E page shape) ──────────────────────────

describe('lineMarginCents', () => {
  it('is line_total − trade × qty for fixed lines', () => {
    // client line $420, trade $100 × 3 = $300 → margin $120.
    expect(
      lineMarginCents({ item_type: 'fixed', line_total_cents: 42000, unit_price: 10000, quantity: 3 }),
    ).toBe(12000);
  });

  it('can be negative when sold below trade', () => {
    expect(
      lineMarginCents({ item_type: 'fixed', line_total_cents: 9000, unit_price: 10000, quantity: 1 }),
    ).toBe(-1000);
  });

  it('is null for allowance/tbd or when trade is unknown', () => {
    expect(lineMarginCents({ item_type: 'allowance', line_total_cents: 5000, unit_price: 4000, quantity: 1 })).toBeNull();
    expect(lineMarginCents({ item_type: 'fixed', line_total_cents: 5000, unit_price: null, quantity: 1 })).toBeNull();
  });
});

// ─── S9 · lens totals (room subtotal / document total) ───────────────────────

describe('lensTotals', () => {
  it('sums client line totals and margins, flagging completeness', () => {
    const lines = [
      { item_type: 'fixed' as const, line_total_cents: 42000, unit_price: 10000, quantity: 3 }, // margin 12000
      { item_type: 'fixed' as const, line_total_cents: 10000, unit_price: 6000, quantity: 1 }, // margin 4000
    ];
    expect(lensTotals(lines)).toEqual({
      clientTotalCents: 52000,
      marginTotalCents: 16000,
      marginComplete: true,
    });
  });

  it('marks the margin partial when a line has no trade price', () => {
    const lines = [
      { item_type: 'fixed' as const, line_total_cents: 42000, unit_price: 10000, quantity: 3 }, // margin 12000
      { item_type: 'allowance' as const, line_total_cents: 8000, unit_price: 0, quantity: 1 }, // no margin
    ];
    const t = lensTotals(lines);
    expect(t.clientTotalCents).toBe(50000); // allowance client still counts toward the client total
    expect(t.marginTotalCents).toBe(12000);
    expect(t.marginComplete).toBe(false);
  });
});
