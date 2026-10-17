/** Pure pricing math for the designer Price lens. All money is integer cents. */

export type PricingLine = {
  kind: 'product' | 'freight' | 'delivery' | 'install' | 'labor';
  quantity: number;
  unitCostCents: number | null;
  unitClientCents: number | null;
  retailUnitCents: number | null;
};

export type JobPricingSummary = {
  totalCostCents: number;
  totalClientCents: number;
  blendedMarkupPct: number | null;
  blendedMarginPct: number | null;
  gapPct: number | null;
  gapCents: number;
  taxCents: number;
  totalWithTaxCents: number;
  unpricedCount: number;
};

export function clientFromMarkup(costCents: number, markupPct: number): number {
  return Math.round(costCents * (1 + markupPct / 100));
}

export function markupFromClient(costCents: number | null, clientCents: number): number | null {
  if (costCents === null || costCents === 0) return null;
  return ((clientCents - costCents) / costCents) * 100;
}

export function marginFromClient(costCents: number, clientCents: number): number | null {
  if (clientCents === 0) return null;
  return ((clientCents - costCents) / clientCents) * 100;
}

export function formatPct(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

export function lineTotal(unitCents: number, quantity: number): number {
  return unitCents * quantity;
}

export function summarizeJob(
  lines: readonly PricingLine[],
  options: { targetMarkupPct: number; salesTaxRate: number | null },
): JobPricingSummary {
  let totalCostCents = 0;
  let totalClientCents = 0;
  let unpricedCount = 0;

  for (const line of lines) {
    if (line.unitClientCents !== null) {
      totalClientCents += lineTotal(line.unitClientCents, line.quantity);
    }
    if (line.unitCostCents === null) {
      unpricedCount += 1;
      continue;
    }
    totalCostCents += lineTotal(line.unitCostCents, line.quantity);
  }

  const blendedMarkupPct = markupFromClient(totalCostCents, totalClientCents);
  const blendedMarginPct = marginFromClient(totalCostCents, totalClientCents);
  const gapPct = blendedMarkupPct === null ? null : blendedMarkupPct - options.targetMarkupPct;
  const targetClientCents = totalCostCents * (1 + options.targetMarkupPct / 100);
  const taxCents = options.salesTaxRate === null ? 0 : Math.round(totalClientCents * options.salesTaxRate);

  return {
    totalCostCents,
    totalClientCents,
    blendedMarkupPct,
    blendedMarginPct,
    gapPct,
    gapCents: totalClientCents - targetClientCents,
    taxCents,
    totalWithTaxCents: totalClientCents + taxCents,
    unpricedCount,
  };
}

/** Labor without a known cost is excluded from the blend and counted unpriced. */
export function retailWarning(line: PricingLine, tolerancePct = 0): boolean {
  if (line.unitClientCents === null || line.retailUnitCents === null) return false;
  return line.unitClientCents > line.retailUnitCents * (1 + tolerancePct / 100);
}
