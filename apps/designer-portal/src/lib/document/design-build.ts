/**
 * The turnkey class's arithmetic — P9.
 *
 * Every figure a design-build agreement shows is DERIVED from two authored
 * payloads: the pricing basis (its cost lines and its fee) and the draw
 * schedule (its percentages and its retainage). Nothing here is separately
 * typed by a designer, which is the whole reason the schedule of values is
 * not its own part: an authored total and a derived total drift, and a
 * homeowner reads whichever one the page happened to print.
 *
 * The rounding rule is the one the trade instrument already uses and the one
 * `send_commercial_document`'s arm checks: **the last row takes the
 * remainder**, so a schedule sums to the contract sum to the penny
 * (`project-commerce.ts:997-1009` — copied here rather than imported, per the
 * build sheet, because the trade scope's draws are a different object with a
 * different shape and coupling the two would make one wave's fix the other
 * wave's bug).
 *
 * Cents are integers everywhere. There is no float comparison in this file
 * and no `toFixed`: a percentage becomes cents once, at the point it is
 * multiplied, and never round-trips through a decimal.
 *
 * The validators return `string | null` — NULL means valid, a string is the
 * studio-facing sentence. That is the same contract the four SQL validators
 * hold (`_validate_pricing_basis_payload` and its siblings), so one message
 * serves the database's refusal, the composer's error state and the test.
 */

import {
  DESIGN_BUILD_COPY,
  PRICING_BASIS_KINDS,
  SUB_DISCLOSURE_MODES,
  type DesignBuildAllowance,
  type DesignBuildAllowancesPayload,
  type DesignBuildCostLine,
  type DesignBuildDraw,
  type DesignBuildDrawsPayload,
  type DesignBuildPricingBasisPayload,
  type DesignBuildSubDisclosurePayload,
  type DesignBuildSupervisionPayload,
  type PricingBasisKind,
  type SubDisclosureMode,
} from "@patina/types";

/* ── Reading a jsonb payload defensively ─────────────────────────────────── */

const COST_LINE_CATEGORIES = ["sub", "general_conditions", "allowance"] as const;
export type CostLineCategory = (typeof COST_LINE_CATEGORIES)[number];

function readInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/** A cost line's category, normalised. The fixture file writes
 *  `generalConditions`; the column vocabulary is `general_conditions`. Both
 *  read as the same category rather than silently becoming an unknown one. */
function readCategory(value: unknown): CostLineCategory | null {
  if (typeof value !== "string") return null;
  const normalized = value === "generalConditions" ? "general_conditions" : value;
  return (COST_LINE_CATEGORIES as readonly string[]).includes(normalized)
    ? (normalized as CostLineCategory)
    : null;
}

export function readCostLines(
  payload: Record<string, unknown>,
): DesignBuildCostLine[] {
  const raw = payload.costLines;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const line = entry as Record<string, unknown>;
    return [
      {
        id: typeof line.id === "string" && line.id ? line.id : `line-${index}`,
        label: typeof line.label === "string" ? line.label : "",
        category: readCategory(line.category) ?? "sub",
        basisCents: readInt(line.basisCents) ?? 0,
      },
    ];
  });
}

export function readPricingBasis(
  payload: Record<string, unknown>,
): DesignBuildPricingBasisPayload {
  const basis =
    typeof payload.basis === "string" &&
    (PRICING_BASIS_KINDS as readonly string[]).includes(payload.basis)
      ? (payload.basis as PricingBasisKind)
      : "cost_plus_gmp";
  const subDisclosure =
    typeof payload.subDisclosure === "string" &&
    (SUB_DISCLOSURE_MODES as readonly string[]).includes(payload.subDisclosure)
      ? (payload.subDisclosure as SubDisclosureMode)
      : "closed_book";
  return {
    basis,
    costLines: readCostLines(payload),
    feeBps: readInt(payload.feeBps),
    gmpCents: readInt(payload.gmpCents),
    nteCents: readInt(payload.nteCents),
    fixedCents: readInt(payload.fixedCents),
    subDisclosure,
  };
}

export function readDraws(
  payload: Record<string, unknown>,
): DesignBuildDrawsPayload {
  const raw = Array.isArray(payload.draws) ? payload.draws : [];
  const draws: DesignBuildDraw[] = raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const draw = entry as Record<string, unknown>;
    return [
      {
        key: typeof draw.key === "string" ? draw.key : "",
        label: typeof draw.label === "string" ? draw.label : "",
        sortOrder: readInt(draw.sortOrder) ?? index,
        pct: Number.isFinite(Number(draw.pct)) ? Number(draw.pct) : 0,
        retainageApplies: draw.retainageApplies === true,
      },
    ];
  });
  return {
    draws: draws.slice().sort((a, b) => a.sortOrder - b.sortOrder),
    retainageBps: readInt(payload.retainageBps) ?? 0,
  };
}

export function readAllowances(
  payload: Record<string, unknown>,
): DesignBuildAllowancesPayload {
  const raw = Array.isArray(payload.allowances) ? payload.allowances : [];
  const allowances: DesignBuildAllowance[] = raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const allowance = entry as Record<string, unknown>;
    return [
      {
        id:
          typeof allowance.id === "string" && allowance.id
            ? allowance.id
            : `allowance-${index}`,
        label: typeof allowance.label === "string" ? allowance.label : "",
        amountCents: readInt(allowance.amountCents) ?? 0,
        overageRule:
          allowance.overageRule === "client_credit"
            ? "client_credit"
            : "change_order",
        underageRule: allowance.underageRule === "retain" ? "retain" : "credit",
      },
    ];
  });
  return { allowances };
}

export function readSupervision(
  payload: Record<string, unknown>,
): DesignBuildSupervisionPayload {
  return {
    body: typeof payload.body === "string" ? payload.body : "",
    supervisionFeeCents: readInt(payload.supervisionFeeCents),
    supervisionFeeBps: readInt(payload.supervisionFeeBps),
  };
}

export function readSubDisclosure(
  payload: Record<string, unknown>,
): DesignBuildSubDisclosurePayload {
  return {
    body: typeof payload.body === "string" ? payload.body : "",
    mode:
      payload.mode === "open_book" || payload.mode === "closed_book"
        ? payload.mode
        : "closed_book",
  };
}

/* ── Derivation ──────────────────────────────────────────────────────────── */

export function costBasisCents(basis: DesignBuildPricingBasisPayload): number {
  return basis.costLines.reduce((sum, line) => sum + line.basisCents, 0);
}

/** The fee the basis earns on its own cost. A fixed-price agreement carries
 *  no fee percentage — its margin is inside the number the studio quoted. */
export function feeCents(basis: DesignBuildPricingBasisPayload): number {
  if (basis.basis === "fixed") return 0;
  const bps = basis.feeBps ?? 0;
  return Math.round((costBasisCents(basis) * bps) / 10_000);
}

/**
 * The one number the whole agreement sums to — the contract sum. Which field
 * carries it depends on the basis, and an unwritten one answers null rather
 * than a zero: R21's rule holds here too, and a $0 GMP is not a GMP.
 *
 * `cost_plus` with no ceiling has no stated sum at all; the derived
 * cost-plus-fee total is what the draws are drawn against, and the editor
 * labels it an estimate rather than a cap.
 */
export function contractSumCents(
  basis: DesignBuildPricingBasisPayload,
): number | null {
  switch (basis.basis) {
    case "fixed":
      return basis.fixedCents;
    case "cost_plus_gmp":
      return basis.gmpCents;
    case "tm_nte":
      return basis.nteCents;
    case "cost_plus": {
      const derived = costBasisCents(basis) + feeCents(basis);
      return derived > 0 ? derived : null;
    }
    default:
      return null;
  }
}

export interface ScheduleOfValuesLine {
  id: string;
  label: string;
  cents: number;
}

/**
 * The schedule of values, derived — never separately authored.
 *
 * Two modes, elected by the sub-disclosure clause (R13, RC-4):
 *
 *   · `closed_book` — every line is PRO-RATED, so the fee is spread across
 *     all of them and no single line divided by (1 + fee) hands the homeowner
 *     a sub's bid.
 *   · `open_book` — the lines stand at cost and the fee is its own line. The
 *     studio has chosen to show its margin.
 *
 * The last line takes the remainder in both modes, so the schedule sums to
 * the contract sum to the cent.
 */
export function scheduleOfValues(
  basis: DesignBuildPricingBasisPayload,
  mode: SubDisclosureMode = basis.subDisclosure,
): ScheduleOfValuesLine[] {
  const lines = basis.costLines;
  if (lines.length === 0) return [];
  const cost = costBasisCents(basis);
  const sum = contractSumCents(basis);
  if (sum === null || cost <= 0) return [];

  if (mode === "open_book") {
    const atCost = lines.map((line) => ({
      id: line.id,
      label: line.label,
      cents: line.basisCents,
    }));
    const margin = sum - cost;
    if (margin === 0) return atCost;
    return [
      ...atCost,
      { id: "fee", label: feeLineLabel(basis), cents: margin },
    ];
  }

  const prorated = lines.map((line) => ({
    id: line.id,
    label: line.label,
    cents: Math.round((line.basisCents * sum) / cost),
  }));
  const head = prorated
    .slice(0, -1)
    .reduce((total, line) => total + line.cents, 0);
  prorated[prorated.length - 1] = {
    ...prorated[prorated.length - 1],
    cents: sum - head,
  };
  return prorated;
}

/** What the open-book fee line is called. A percentage the studio wrote is
 *  named with its percentage; a fixed-price margin has none to name. */
export function feeLineLabel(basis: DesignBuildPricingBasisPayload): string {
  if (basis.basis === "fixed" || basis.feeBps === null) return "Fee";
  return `Fee · ${basis.feeBps / 100}%`;
}

/* ── The draw schedule ───────────────────────────────────────────────────── */

/**
 * Percentages are what the studio types; cents are what the homeowner owes.
 * The last draw takes the remainder so the schedule sums to the contract sum
 * to the penny — the identical rule `computeDrawAmounts` uses for a trade
 * scope, and the one `send_commercial_document` checks before the agreement
 * may go out.
 */
export function computeDrawGross(
  contractSum: number,
  draws: readonly DesignBuildDraw[],
): number[] {
  if (draws.length === 0) return [];
  const amounts = draws.map((draw) =>
    Math.round((contractSum * draw.pct) / 100),
  );
  const head = amounts.slice(0, -1).reduce((sum, value) => sum + value, 0);
  amounts[amounts.length - 1] = contractSum - head;
  return amounts;
}

/** Retainage is WITHHELD from a draw, never billed on top of it. */
export function computeRetainage(
  grossCents: number,
  retainageBps: number,
): number {
  if (retainageBps <= 0) return 0;
  return Math.round((grossCents * retainageBps) / 10_000);
}

export interface DrawTableRow {
  key: string;
  label: string;
  sortOrder: number;
  /** Null on the pinned release row — it is not a percentage of anything. */
  pct: number | null;
  retainageApplies: boolean;
  isRetainageRelease: boolean;
  grossCents: number;
  retainageCents: number;
  netCents: number;
  /** Retainage held after this row, cumulative. */
  retainageHeldToDateCents: number;
}

export const RETAINAGE_RELEASE_KEY = "retainage_release";
export const RETAINAGE_RELEASE_LABEL = "Final · retainage release";

/**
 * The whole ledger the studio and the homeowner both read: the authored
 * draws, then the pinned release row that gives the withheld retainage back.
 *
 * The release row is DERIVED, never authored — it exists exactly when
 * retainage was actually withheld, and its amount is the sum of what was
 * withheld, so the closing identity holds: every net paid, plus the release,
 * equals the contract sum.
 */
export function drawTable(
  contractSum: number,
  payload: DesignBuildDrawsPayload,
): DrawTableRow[] {
  const gross = computeDrawGross(contractSum, payload.draws);
  let held = 0;
  const rows: DrawTableRow[] = payload.draws.map((draw, index) => {
    const grossCents = gross[index];
    const retainageCents = draw.retainageApplies
      ? computeRetainage(grossCents, payload.retainageBps)
      : 0;
    held += retainageCents;
    return {
      key: draw.key,
      label: draw.label,
      sortOrder: draw.sortOrder,
      pct: draw.pct,
      retainageApplies: draw.retainageApplies,
      isRetainageRelease: false,
      grossCents,
      retainageCents,
      netCents: grossCents - retainageCents,
      retainageHeldToDateCents: held,
    };
  });
  if (held > 0) {
    rows.push({
      key: RETAINAGE_RELEASE_KEY,
      label: RETAINAGE_RELEASE_LABEL,
      sortOrder: rows.length,
      pct: null,
      retainageApplies: false,
      isRetainageRelease: true,
      grossCents: held,
      retainageCents: 0,
      netCents: held,
      retainageHeldToDateCents: 0,
    });
  }
  return rows;
}

/** What the homeowner actually pays across the whole schedule. Equal to the
 *  contract sum whenever the schedule is valid — the closing identity. */
export function totalPaidCents(rows: readonly DrawTableRow[]): number {
  return rows.reduce((sum, row) => sum + row.netCents, 0);
}

/* ── Validation ──────────────────────────────────────────────────────────── */

export const PRICING_BASIS_LABELS: Record<PricingBasisKind, string> = {
  fixed: "Fixed price",
  cost_plus: "Cost-plus",
  cost_plus_gmp: "Cost-plus with GMP",
  tm_nte: "Time and materials with a not-to-exceed",
};

/** What the sum is CALLED under each basis, in the studio's language. */
export const CONTRACT_SUM_LABELS: Record<PricingBasisKind, string> = {
  fixed: "Fixed sum",
  cost_plus: "Estimated total",
  cost_plus_gmp: "GMP",
  tm_nte: "Not to exceed",
};

/** The fee percentage's ceiling, in basis points — 50%. Beyond it a "fee"
 *  is a second contract, not a fee. */
export const MAX_FEE_BPS = 5_000;
/** Retainage's ceiling, in basis points — 10% (research 02 §3: 5–10%,
 *  trending 5%). */
export const MAX_RETAINAGE_BPS = 1_000;

export function validatePricingBasis(
  basis: DesignBuildPricingBasisPayload,
): string | null {
  if (!(PRICING_BASIS_KINDS as readonly string[]).includes(basis.basis)) {
    return "Choose how this agreement is priced.";
  }
  if (basis.costLines.length === 0) {
    return "Add at least one cost line.";
  }
  if (basis.costLines.some((line) => !line.label.trim())) {
    return "Every cost line needs a name.";
  }
  if (basis.costLines.some((line) => line.basisCents <= 0)) {
    return "Every cost line needs an amount.";
  }
  if (basis.basis === "fixed") {
    if (basis.feeBps !== null && basis.feeBps !== 0) {
      return "A fixed price carries no fee percentage — its margin is inside the price.";
    }
    if (basis.fixedCents === null || basis.fixedCents <= 0) {
      return "Set the fixed price.";
    }
  } else if (basis.basis === "cost_plus" || basis.basis === "cost_plus_gmp") {
    if (basis.feeBps === null) return "Set the fee percentage.";
    if (basis.feeBps < 0 || basis.feeBps > MAX_FEE_BPS) {
      return "The fee must be between 0 and 50 percent.";
    }
  }
  if (basis.basis === "cost_plus_gmp") {
    if (basis.gmpCents === null || basis.gmpCents <= 0) {
      return "Set the guaranteed maximum price.";
    }
    const derived = costBasisCents(basis) + feeCents(basis);
    if (derived !== basis.gmpCents) {
      return "The cost basis plus the fee must equal the guaranteed maximum price, to the cent.";
    }
  }
  if (basis.basis === "tm_nte") {
    if (basis.nteCents === null || basis.nteCents <= 0) {
      return "Set the not-to-exceed amount.";
    }
  }
  if (!(SUB_DISCLOSURE_MODES as readonly string[]).includes(basis.subDisclosure)) {
    return "Choose whether the trades are shown open-book or closed-book.";
  }
  return null;
}

export function validateDrawSet(
  contractSum: number | null,
  payload: DesignBuildDrawsPayload,
): string | null {
  const draws = payload.draws;
  if (draws.length < 2) {
    return "A schedule needs at least a deposit and a second draw.";
  }
  if (draws.some((draw) => !draw.label.trim())) {
    return "Every draw needs a name.";
  }
  const keys = draws.map((draw) => draw.key.trim());
  if (keys.some((key) => !key)) return "Every draw needs a key.";
  if (new Set(keys).size !== keys.length) {
    return "Two draws share a key. Rename one.";
  }
  // Integer basis points, never a float comparison: 10 + 30 + 40 + 20 is
  // exactly 100 in basis points and is not exactly 100 in floating point.
  const pctBps = draws.reduce(
    (sum, draw) => sum + Math.round(draw.pct * 100),
    0,
  );
  if (pctBps !== 10_000) {
    return `The draws come to ${pctBps / 100}% — they must come to 100%.`;
  }
  if (payload.retainageBps < 0 || payload.retainageBps > MAX_RETAINAGE_BPS) {
    return "Retainage must be between 0 and 10 percent.";
  }
  const first = draws[0];
  if (first.retainageApplies) {
    return "The deposit does not carry retainage — nothing has been built yet.";
  }
  if (first.key !== "deposit") {
    return "The first draw is the deposit, and its key is `deposit`.";
  }
  if (contractSum === null || contractSum <= 0) {
    return "Set the contract sum on the pricing basis before drawing against it.";
  }
  if (computeDrawGross(contractSum, draws).some((amount) => amount <= 0)) {
    return "Every draw must carry an amount.";
  }
  return null;
}

export function validateAllowances(
  payload: DesignBuildAllowancesPayload,
  basis: DesignBuildPricingBasisPayload,
): string | null {
  const allowances = payload.allowances;
  if (allowances.length === 0) return null;
  if (allowances.some((allowance) => !allowance.label.trim())) {
    return "Every allowance needs a name.";
  }
  if (allowances.some((allowance) => allowance.amountCents <= 0)) {
    return "Every allowance needs an amount.";
  }
  const byId = new Map(basis.costLines.map((line) => [line.id, line]));
  for (const allowance of allowances) {
    const line = byId.get(allowance.id);
    if (!line || line.category !== "allowance") {
      return `${allowance.label.trim() || "This allowance"} has no allowance line on the pricing basis.`;
    }
    if (line.basisCents !== allowance.amountCents) {
      return `${allowance.label.trim() || "This allowance"} and its cost line are the same number said twice — make them agree.`;
    }
  }
  return null;
}

/**
 * The no-double-count rule (research 02 §3, §9 item 6, build sheet §4.3).
 *
 * A studio that bills supervision as its own line AND takes a markup on the
 * trades is paid twice for one oversight. `_validate_no_double_count` refuses
 * that part set at save and at send; this is the same refusal, said in the
 * same sentence, in the room where the designer typed it. The copy lives in
 * `@patina/types` so the database's message and the room's message cannot
 * drift into two wordings of one rule.
 */
export function validateNoDoubleCount(input: {
  supervision: DesignBuildSupervisionPayload | null;
  subMarkupBps: number | null;
}): string | null {
  const supervision = input.supervision;
  const billsSupervision =
    (supervision?.supervisionFeeCents ?? 0) > 0 ||
    (supervision?.supervisionFeeBps ?? 0) > 0;
  const takesMarkup = (input.subMarkupBps ?? 0) > 0;
  return billsSupervision && takesMarkup ? DESIGN_BUILD_COPY.noDoubleCount : null;
}

/** The markup a pricing-basis payload carries on the trades, in basis
 *  points. Its own field, distinct from `feeBps`: a fee is on the whole cost
 *  basis, a markup is on the subs, and the no-double-count rule reads the
 *  markup alone. */
export function readSubMarkupBps(
  payload: Record<string, unknown>,
): number | null {
  return readInt(payload.subMarkupBps);
}
