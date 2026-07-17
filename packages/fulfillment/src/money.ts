// @patina/fulfillment — the Workbench money strip (S2, spec §5.2/§8/§10).
//
// computeMoneyStrip is the SINGLE source of the five figures under the split
// (captured · vendor cost · freight est · projected commission · Pledge
// accrual) plus the margin and its floor test. The Workbench components NEVER
// re-derive any of these — they call this over the React Query cache state so
// a drag/assign re-figures the strip instantly (spec §5.2 "recomputes live").
//
// ─── FORMULAS (each derived from spec §5.2/§8/§10; flagged for the C1 look) ──
//
// capturedCents            = order.capturedTotalCents
//     What the client actually paid through Stripe — product + freight + tax
//     (the T1 capture's debit to 1000 Cash-Stripe Clearing, §8). Tax is a
//     pass-through liability (Cr 2100), so it is shown in "Captured" but is
//     excluded from the margin basis below.
//
// vendorCostCents          = Σ line.qty × COALESCE(line.unitCostCents, 0)
//     The COGS Patina will owe vendors (Cr 2000 at settle, §8 T3). An UNMAPPED
//     line has no cost yet (unitCostCents = null) and contributes 0 — so while
//     an order carries unmapped lines the vendor cost is UNDERSTATED and the
//     margin below reads OPTIMISTICALLY HIGH. Assigning a cost (drag/popover →
//     fulfillment_assign_line_vendor) raises vendor cost and drops the margin
//     — this is the "mis-mapped cost caught before the PO goes out" moment the
//     screen exists for (spec §5.2, presentation §07). ⚠ C1: intended, flagged.
//
// freightEstCents          = order.freightChargedCents
//     v1 has NO independent freight estimate — the best proxy is what the
//     client was charged for freight. Freight revenue (freightChargedCents, in
//     the margin basis) and freight expense (this) therefore net to zero in
//     v1, so freight does not yet move the margin. ⚠ C1: flagged — a real
//     per-shipment freight estimate (S5) will make this an independent input.
//
// revenueCents (internal)  = order.productSubtotalCents + order.freightChargedCents
//     The margin denominator: all client-paid revenue EXCLUDING tax (4000
//     Product Revenue + 4100 Freight Revenue, §8; tax is the 2100 liability).
//
// projectedCommissionCents = revenueCents − vendorCostCents − freightEstCents
//     Patina's realized gross margin on the order — revenue kept after paying
//     vendors (COGS) and freight. Mirrors the presentation's "Proj. commission"
//     = product − vendor cost − freight (§07 money strip). ⚠ C1 note: this is
//     the REALIZED spread (actual retail − trade), NOT commissionRateDefault ×
//     anything. The config's per-vendor commission rate (16%) is a SETTLEMENT
//     input (T3, S6) and a fallback for vendors lacking an override; it is
//     deliberately not the Workbench projection basis, which uses real costs.
//     commissionRateDefault is threaded through the config for completeness and
//     for design authority to rule on at C1.
//
// pledgeAccrualCents       = round(config.pledgeRate × projectedCommissionCents)
//     The teaching-royalties Pledge accrual — 25% of realized commission (§8
//     T3, config `pledge_accrual`). Tagged, not legally characterized (O2).
//
// marginPct                = projectedCommissionCents / revenueCents   (0 if revenue 0)
// belowFloor               = marginPct < config.marginFloorPct         (config `margin_floor_warning`, 25%)
//     When belowFloor, the strip container + the commission block render
//     terracotta (spec §5.2 "warns terracotta below the margin floor").

/** The minimal line shape computeMoneyStrip reads — a subset of
 *  FulfillmentOrderLineDTO, so the full DTO satisfies it directly. */
export interface MoneyStripLine {
  qty: number;
  unitCostCents: number | null;
  lineState: string;
}

/** The minimal order shape computeMoneyStrip reads. */
export interface MoneyStripOrder {
  capturedTotalCents: number;
  productSubtotalCents: number;
  freightChargedCents: number;
  taxCents: number;
}

/** The three config numbers the strip needs (spec §10). Rates are fractions
 *  (0.25 = 25%), matching the fulfillment_config jsonb payloads. */
export interface MoneyStripConfig {
  /** `margin_floor_warning` → `{pct}` — warn below this projected margin. */
  marginFloorPct: number;
  /** `pledge_accrual` → `{rate}` — Pledge accrual as a fraction of commission. */
  pledgeRate: number;
  /** `commission_rate_default` → `{rate}` — per-vendor settlement default (S6);
   *  NOT the projection basis here (see file header). Carried for completeness. */
  commissionRateDefault: number;
}

export interface MoneyStrip {
  capturedCents: number;
  vendorCostCents: number;
  freightEstCents: number;
  projectedCommissionCents: number;
  pledgeAccrualCents: number;
  /** Projected margin as a fraction (0.1975 = 19.75%). */
  marginPct: number;
  /** True when marginPct < config.marginFloorPct — drives the terracotta strip. */
  belowFloor: boolean;
}

/**
 * Compute the Workbench money strip from the current line + order + config
 * state. Pure and synchronous — call it on the React Query cache so every drag
 * / vendor-assign re-figures the strip in the same render (spec §5.2). See the
 * file header for each formula's derivation and its C1 flag.
 *
 * Cancelled lines are excluded from the cost sum (they carry no fulfillment
 * obligation); everything else — including still-unmapped lines — contributes.
 */
export function computeMoneyStrip(
  lines: MoneyStripLine[],
  order: MoneyStripOrder,
  config: MoneyStripConfig,
): MoneyStrip {
  const capturedCents = order.capturedTotalCents;

  const vendorCostCents = lines
    .filter((l) => l.lineState !== 'cancelled')
    .reduce((sum, l) => sum + l.qty * (l.unitCostCents ?? 0), 0);

  const freightEstCents = order.freightChargedCents;

  const revenueCents = order.productSubtotalCents + order.freightChargedCents;

  const projectedCommissionCents = revenueCents - vendorCostCents - freightEstCents;

  const pledgeAccrualCents = Math.round(config.pledgeRate * projectedCommissionCents);

  const marginPct = revenueCents === 0 ? 0 : projectedCommissionCents / revenueCents;

  const belowFloor = marginPct < config.marginFloorPct;

  return {
    capturedCents,
    vendorCostCents,
    freightEstCents,
    projectedCommissionCents,
    pledgeAccrualCents,
    marginPct,
    belowFloor,
  };
}
