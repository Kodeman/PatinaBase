import { describe, it, expect } from 'vitest';
import { computeMoneyStrip, type MoneyStripConfig, type MoneyStripLine, type MoneyStripOrder } from '../money';

const CONFIG: MoneyStripConfig = {
  marginFloorPct: 0.25, // fulfillment_config margin_floor_warning default
  pledgeRate: 0.25, // pledge_accrual default
  commissionRateDefault: 0.16, // commission_rate_default (not the projection basis)
};

function line(qty: number, unitCostCents: number | null, lineState = 'intake'): MoneyStripLine {
  return { qty, unitCostCents, lineState };
}

describe('computeMoneyStrip — the seeded 5-vendor order', () => {
  // Order 1 (Priya Anand): 5 lines, all 80%-trade (20% spread), + $150 freight,
  // + $900 tax. Real values read from the local DB (see format.test.ts golden).
  const order: MoneyStripOrder = {
    capturedTotalCents: 1_309_900,
    productSubtotalCents: 1_204_900,
    freightChargedCents: 15_000,
    taxCents: 90_000,
  };
  const lines = [
    line(1, 336_000),
    line(1, 288_000),
    line(1, 168_000),
    line(1, 100_000),
    line(1, 71_920),
  ];

  it('produces the real strip figures', () => {
    const m = computeMoneyStrip(lines, order, CONFIG);
    expect(m.capturedCents).toBe(1_309_900);
    expect(m.vendorCostCents).toBe(963_920);
    expect(m.freightEstCents).toBe(15_000);
    // revenue = 1,204,900 + 15,000 = 1,219,900; commission = revenue − cost − freight
    expect(m.projectedCommissionCents).toBe(1_219_900 - 963_920 - 15_000); // 240,980
    expect(m.pledgeAccrualCents).toBe(Math.round(0.25 * 240_980)); // 60,245
    expect(m.marginPct).toBeCloseTo(240_980 / 1_219_900, 6); // 0.19754…
  });

  it('is BELOW the 25% floor (the seed 20% spread → ~19.75% margin)', () => {
    // ⚠ C1: the uniform 20% seed trade spread sits under the 25% config floor.
    expect(computeMoneyStrip(lines, order, CONFIG).belowFloor).toBe(true);
  });
});

describe('computeMoneyStrip — margin floor boundary', () => {
  const order = (productSubtotalCents: number): MoneyStripOrder => ({
    capturedTotalCents: productSubtotalCents,
    productSubtotalCents,
    freightChargedCents: 0,
    taxCents: 0,
  });

  it('exactly AT the floor is not below (strict <)', () => {
    // revenue 1000, cost 750, freight 0 → commission 250 → margin 0.25 == floor
    const m = computeMoneyStrip([line(1, 750)], order(1000), CONFIG);
    expect(m.marginPct).toBe(0.25);
    expect(m.belowFloor).toBe(false);
  });

  it('one cent past the floor IS below', () => {
    // revenue 1000, cost 760 → commission 240 → margin 0.24 < 0.25
    const m = computeMoneyStrip([line(1, 760)], order(1000), CONFIG);
    expect(m.marginPct).toBe(0.24);
    expect(m.belowFloor).toBe(true);
  });

  it('comfortably above the floor is healthy', () => {
    // revenue 1000, cost 500 → margin 0.50
    expect(computeMoneyStrip([line(1, 500)], order(1000), CONFIG).belowFloor).toBe(false);
  });
});

describe('computeMoneyStrip — unmapped lines read optimistically', () => {
  const order: MoneyStripOrder = {
    capturedTotalCents: 200_000,
    productSubtotalCents: 200_000,
    freightChargedCents: 0,
    taxCents: 0,
  };

  it('an unmapped (null-cost) line contributes 0 to vendor cost', () => {
    const m = computeMoneyStrip([line(1, 80_000), line(1, null)], order, CONFIG);
    expect(m.vendorCostCents).toBe(80_000); // second line's cost unknown → 0
    // margin looks high (120k/200k = 60%) until the unmapped line is priced
    expect(m.belowFloor).toBe(false);
  });

  it('assigning the missing cost drops the margin (the C1 re-figure)', () => {
    const before = computeMoneyStrip([line(1, 80_000), line(1, null)], order, CONFIG);
    const after = computeMoneyStrip([line(1, 80_000), line(1, 78_000)], order, CONFIG);
    expect(after.vendorCostCents).toBeGreaterThan(before.vendorCostCents);
    expect(after.projectedCommissionCents).toBeLessThan(before.projectedCommissionCents);
    expect(after.belowFloor).toBe(true); // 42k/200k = 21% < 25%
  });
});

describe('computeMoneyStrip — edge cases', () => {
  it('multiplies cost by qty', () => {
    const order: MoneyStripOrder = {
      capturedTotalCents: 179_800,
      productSubtotalCents: 179_800,
      freightChargedCents: 0,
      taxCents: 0,
    };
    // qty 2 × 71,920 = 143,840 (the seeded qty-2 order 5)
    expect(computeMoneyStrip([line(2, 71_920)], order, CONFIG).vendorCostCents).toBe(143_840);
  });

  it('excludes cancelled lines from vendor cost', () => {
    const order: MoneyStripOrder = {
      capturedTotalCents: 100_000,
      productSubtotalCents: 100_000,
      freightChargedCents: 0,
      taxCents: 0,
    };
    const m = computeMoneyStrip([line(1, 40_000), line(1, 30_000, 'cancelled')], order, CONFIG);
    expect(m.vendorCostCents).toBe(40_000);
  });

  it('guards divide-by-zero revenue', () => {
    const order: MoneyStripOrder = {
      capturedTotalCents: 0,
      productSubtotalCents: 0,
      freightChargedCents: 0,
      taxCents: 0,
    };
    const m = computeMoneyStrip([], order, CONFIG);
    expect(m.marginPct).toBe(0);
    expect(m.belowFloor).toBe(true); // 0 < 0.25
  });
});
