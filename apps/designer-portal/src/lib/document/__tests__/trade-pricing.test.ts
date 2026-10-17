import {
  clientFromMarkup,
  formatPct,
  lineTotal,
  marginFromClient,
  markupFromClient,
  retailWarning,
  summarizeJob,
  type PricingLine,
} from '../trade-pricing';

describe('trade pricing', () => {
  it('calculates markup, client price, and margin', () => {
    expect(clientFromMarkup(100_000, 35)).toBe(135_000);
    expect(marginFromClient(100_000, 135_000)).toBeCloseTo(25.9259, 4);
    expect(formatPct(marginFromClient(100_000, 135_000))).toBe('25.9%');
  });

  it('extends line totals by quantity', () => {
    expect(lineTotal(12_500, 4)).toBe(50_000);
  });

  it('calculates a 50% rug markup', () => {
    expect(clientFromMarkup(80_000, 50)).toBe(120_000);
    expect(markupFromClient(80_000, 120_000)).toBe(50);
  });

  it('keeps a typed drapery client price and back-calculates markup', () => {
    expect(clientFromMarkup(100_000, 35)).toBe(135_000);
    expect(markupFromClient(160_000, 240_000)).toBe(50);
  });

  it('includes extended freight in blended job pricing', () => {
    const result = summarizeJob([
      { kind: 'product', quantity: 1, unitCostCents: 10_000, unitClientCents: 14_000, retailUnitCents: null },
      { kind: 'freight', quantity: 2, unitCostCents: 1_000, unitClientCents: 1_500, retailUnitCents: null },
    ], { targetMarkupPct: 35, salesTaxRate: null });
    expect(result.totalCostCents).toBe(12_000);
    expect(result.totalClientCents).toBe(17_000);
    expect(result.blendedMarkupPct).toBeCloseTo(41.6667, 4);
  });

  it('computes the extended blend for mixed 40/20/15 percent lines', () => {
    const lines: PricingLine[] = [
      { kind: 'product', quantity: 1, unitCostCents: 10_000, unitClientCents: 14_000, retailUnitCents: null },
      { kind: 'delivery', quantity: 1, unitCostCents: 10_000, unitClientCents: 12_000, retailUnitCents: null },
      { kind: 'install', quantity: 1, unitCostCents: 10_000, unitClientCents: 11_500, retailUnitCents: null },
    ];
    const result = summarizeJob(lines, { targetMarkupPct: 25, salesTaxRate: null });
    expect(result.blendedMarkupPct).toBe(25);
    expect(result.blendedMarginPct).toBe(20);
  });

  it('returns the gap to target in percentage points and cents', () => {
    const result = summarizeJob([
      { kind: 'product', quantity: 2, unitCostCents: 10_000, unitClientCents: 13_000, retailUnitCents: null },
    ], { targetMarkupPct: 40, salesTaxRate: null });
    expect(result.gapPct).toBe(-10);
    expect(result.gapCents).toBe(-2_000);
  });

  it('applies tax to client total without including it in the blend', () => {
    const result = summarizeJob([
      { kind: 'product', quantity: 1, unitCostCents: 10_000, unitClientCents: 13_500, retailUnitCents: null },
    ], { targetMarkupPct: 35, salesTaxRate: 0.08 });
    expect(result.taxCents).toBe(1_080);
    expect(result.totalWithTaxCents).toBe(14_580);
    expect(result.blendedMarkupPct).toBe(35);
  });

  it('counts cost-unknown lines in client totals, not the blend', () => {
    const result = summarizeJob([
      { kind: 'labor', quantity: 3, unitCostCents: null, unitClientCents: 2_000, retailUnitCents: null },
    ], { targetMarkupPct: 35, salesTaxRate: null });
    expect(result.totalClientCents).toBe(6_000);
    expect(result.totalCostCents).toBe(0);
    expect(result.unpricedCount).toBe(1);
    expect(result.blendedMarkupPct).toBeNull();
  });

  it('keeps an uncosted line\'s client price out of the blend and the gap', () => {
    const result = summarizeJob([
      { kind: 'product', quantity: 1, unitCostCents: 10_000, unitClientCents: 13_500, retailUnitCents: null },
      { kind: 'labor', quantity: 1, unitCostCents: null, unitClientCents: 50_000, retailUnitCents: null },
      { kind: 'product', quantity: 1, unitCostCents: 5_000, unitClientCents: null, retailUnitCents: null },
    ], { targetMarkupPct: 35, salesTaxRate: null });
    expect(result.totalClientCents).toBe(63_500);
    expect(result.blendedMarkupPct).toBe(35);
    expect(result.gapPct).toBe(0);
    expect(result.gapCents).toBe(0);
  });

  it('warns when client price exceeds retail, with optional tolerance', () => {
    const line: PricingLine = {
      kind: 'product', quantity: 1, unitCostCents: 8_000, unitClientCents: 10_001, retailUnitCents: 10_000,
    };
    expect(retailWarning(line)).toBe(true);
    expect(retailWarning({ ...line, unitClientCents: 10_500 }, 5)).toBe(false);
    expect(retailWarning({ ...line, retailUnitCents: null })).toBe(false);
  });

  it('returns null for undefined denominator cases', () => {
    expect(markupFromClient(0, 100)).toBeNull();
    expect(markupFromClient(null, 100)).toBeNull();
    expect(marginFromClient(100, 0)).toBeNull();
    expect(formatPct(null)).toBe('—');
  });
});
