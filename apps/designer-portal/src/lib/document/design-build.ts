/**
 * The turnkey class's arithmetic — P9.
 *
 * Almost every figure a design-build agreement shows is DERIVED from two
 * authored payloads: the pricing basis (its cost lines and its fee) and the
 * draw schedule (its percentages and its retainage).
 *
 * The one exception is R43's client-facing schedule of values under a closed
 * book, which the studio writes itself and which lives on the pricing basis
 * rather than in a part of its own — so there is still exactly one authored
 * total per contract and no second one to drift from it. It is held to the
 * contract sum to the cent, at this door and at the database's.
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
  type AgreementPart,
  type DesignBuildAllowance,
  type DesignBuildAllowancesPayload,
  type DesignBuildCostLine,
  type DesignBuildDraw,
  type DesignBuildDrawsPayload,
  type DesignBuildPricingBasisPayload,
  type DesignBuildScheduleOfValuesLine,
  type DesignBuildSubDisclosurePayload,
  type DesignBuildSupervisionPayload,
  type PricingBasisKind,
  type SubDisclosureMode,
} from "@patina/types";

/* ── Reading a jsonb payload defensively ─────────────────────────────────── */

const COST_LINE_CATEGORIES = [
  "sub",
  "general_conditions",
  "allowance",
] as const;
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
  const normalized =
    value === "generalConditions" ? "general_conditions" : value;
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

function sumCostLines(lines: readonly DesignBuildCostLine[]): number {
  return lines.reduce((sum, line) => sum + line.basisCents, 0);
}

/**
 * The pricing basis, read as written and never as assumed.
 *
 * NOTHING here defaults. The seeded turnkey template lays `basis` down as
 * NULL and the clause's `mode` as NULL, so a reader that answered
 * "cost_plus_gmp" and "closed_book" would draw two pressed buttons over a
 * payload that says nothing, let readiness go green, and then be refused at
 * the send door by `_validate_pricing_basis_payload` — and closed-book is a
 * term the homeowner reads (R13, R21), never one a reader may choose for her.
 */
export function readPricingBasis(
  payload: Record<string, unknown>,
): DesignBuildPricingBasisPayload {
  const basis =
    typeof payload.basis === "string" &&
    (PRICING_BASIS_KINDS as readonly string[]).includes(payload.basis)
      ? (payload.basis as PricingBasisKind)
      : null;
  const subDisclosure =
    typeof payload.subDisclosure === "string" &&
    (SUB_DISCLOSURE_MODES as readonly string[]).includes(payload.subDisclosure)
      ? (payload.subDisclosure as SubDisclosureMode)
      : null;
  const costLines = readCostLines(payload);
  return {
    basis,
    costLines,
    costBasisCents: sumCostLines(costLines),
    feeBps: readInt(payload.feeBps),
    gmpCents: readInt(payload.gmpCents),
    nteCents: readInt(payload.nteCents),
    fixedCents: readInt(payload.fixedCents),
    scheduleOfValues: readScheduleOfValuesLines(payload),
    subDisclosure,
    // Present only on the REDACTED payload the client is handed; absent on the
    // authored row, where the sum is derived from the fields above.
    contractSumCents: readInt(payload.contractSumCents),
  };
}

/**
 * The client-facing schedule of values the studio authored (R43). Read as
 * written, like everything else here: an unwritten one is an empty list, never
 * a list this reader made up out of the cost lines.
 */
export function readScheduleOfValuesLines(
  payload: Record<string, unknown>,
): DesignBuildScheduleOfValuesLine[] {
  const raw = payload.scheduleOfValues;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const line = entry as Record<string, unknown>;
    return [
      {
        id: typeof line.id === "string" && line.id ? line.id : `sov-${index}`,
        label: typeof line.label === "string" ? line.label : "",
        cents: readInt(line.cents) ?? 0,
      },
    ];
  });
}

/**
 * Every write to a pricing-basis payload, with the derived cost basis on it.
 *
 * `_validate_pricing_basis_payload` refuses a payload whose `costBasisCents`
 * is not exactly Σ `costLines[].basisCents` ("The cost basis must equal the
 * cost lines beneath it, to the cent"), and `_agreement_contract_sum_cents`
 * derives a cost-plus contract sum from that same key — so a payload that
 * omits it cannot be saved and, once saved, would have no server-side sum.
 * It is never typed: three editors write cost lines, and all three route
 * their write through here so the key cannot fall out of step with them.
 */
export function withCostBasisCents(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...payload,
    costBasisCents: sumCostLines(readCostLines(payload)),
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
    // Null until chosen — see readPricingBasis. The clause's own seeded
    // payload carries `mode: NULL`, and the send door asks for it by name.
    mode:
      payload.mode === "open_book" || payload.mode === "closed_book"
        ? payload.mode
        : null,
  };
}

/* ── Derivation ──────────────────────────────────────────────────────────── */

export function costBasisCents(basis: DesignBuildPricingBasisPayload): number {
  return sumCostLines(basis.costLines);
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
  // R51 — the redacted projection carries the sum EXPLICITLY, because it has
  // no cost lines left to derive one from (`_agreement_redact_client_payload`,
  // 00578). The client's own body reads it the same way.
  if (
    typeof basis.contractSumCents === "number" &&
    Number.isFinite(basis.contractSumCents) &&
    basis.contractSumCents > 0
  ) {
    return basis.contractSumCents;
  }
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
 * The schedule of values, in the mode the sub-disclosure clause elected
 * (R13, RC-4, R43).
 *
 *   · `closed_book` — THE STUDIO'S OWN LINES, authored on the pricing basis
 *     and nothing to do with the cost lines. A pro-rated table is a uniform
 *     multiple of the costs, and the allowance parts state their amounts at
 *     cost on the same client-visible page, so one (cost, line) pair hands
 *     the reader the multiplier and the multiplier hands them every trade's
 *     price. R43 answers RC-4 by not deriving it at all.
 *   · `open_book` — the lines stand at cost and the fee is its own line. The
 *     studio has chosen to show its margin.
 *
 * `_agreement_schedule_of_values` reads the same two sources in the same
 * order, so the composer, the homeowner's door and the keepsake print one
 * table.
 */
export function scheduleOfValues(
  basis: DesignBuildPricingBasisPayload,
  mode: SubDisclosureMode | null = basis.subDisclosure,
): ScheduleOfValuesLine[] {
  // The disclosure is a term the homeowner reads, so an unchosen mode has no
  // honest table to draw — it has a question outstanding.
  if (mode === null) return [];

  if (mode !== "open_book") {
    return basis.scheduleOfValues
      .filter((line) => line.label.trim().length > 0)
      .map((line) => ({ id: line.id, label: line.label, cents: line.cents }));
  }

  const lines = basis.costLines;
  if (lines.length === 0) return [];
  const cost = costBasisCents(basis);
  const sum = contractSumCents(basis);
  if (sum === null || cost <= 0) return [];

  const atCost = lines.map((line) => ({
    id: line.id,
    label: line.label,
    cents: line.basisCents,
  }));
  const margin = sum - cost;
  if (margin === 0) return atCost;
  return [...atCost, { id: "fee", label: feeLineLabel(basis), cents: margin }];
}

/**
 * The default division a studio starts from when it elects a closed book
 * (R43): one line, named for the work, carrying the whole contract sum. The
 * studio then splits it by room or by phase if it wants to; a single
 * "Construction" line is a complete answer.
 */
export const DEFAULT_SCHEDULE_OF_VALUES_LABEL = "Construction";

export function seedScheduleOfValues(
  basis: DesignBuildPricingBasisPayload,
): DesignBuildScheduleOfValuesLine[] {
  const sum = contractSumCents(basis);
  if (sum === null || sum <= 0) return [];
  return [
    { id: "construction", label: DEFAULT_SCHEDULE_OF_VALUES_LABEL, cents: sum },
  ];
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

/** What the sum is called before a basis has been chosen: the plain name,
 *  not one basis's name standing in for the unanswered question. */
export const UNCHOSEN_CONTRACT_SUM_LABEL = "Contract sum";

export function contractSumLabel(basis: PricingBasisKind | null): string {
  return basis === null
    ? UNCHOSEN_CONTRACT_SUM_LABEL
    : CONTRACT_SUM_LABELS[basis];
}

/** The fee percentage's ceiling, in basis points — 50%. Beyond it a "fee"
 *  is a second contract, not a fee. */
export const MAX_FEE_BPS = 5_000;
/** Retainage's ceiling, in basis points — 10% (research 02 §3: 5–10%,
 *  trending 5%). */
export const MAX_RETAINAGE_BPS = 1_000;

export function validatePricingBasis(
  basis: DesignBuildPricingBasisPayload,
): string | null {
  // The unanswered question, asked first — the send door asks it first too.
  if (
    basis.basis === null ||
    !(PRICING_BASIS_KINDS as readonly string[]).includes(basis.basis)
  ) {
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
  if (
    basis.subDisclosure === null ||
    !(SUB_DISCLOSURE_MODES as readonly string[]).includes(basis.subDisclosure)
  ) {
    return "Choose whether the trades are shown open-book or closed-book.";
  }
  // R43 — the client-facing schedule of values, held to the same rule the
  // draw schedule lives by. Judged whenever lines exist, in either mode; the
  // closed book is additionally required to have some.
  const authored = basis.scheduleOfValues;
  if (authored.length > 0) {
    if (authored.some((line) => !line.label.trim())) {
      return "Every schedule-of-values line needs a name.";
    }
    if (authored.some((line) => line.cents <= 0)) {
      return "Every schedule-of-values line needs an amount.";
    }
    const sum = contractSumCents(basis);
    const total = authored.reduce((running, line) => running + line.cents, 0);
    if (sum !== null && total !== sum) {
      return "The schedule of values must come to the contract sum, to the cent.";
    }
  } else if (basis.subDisclosure === "closed_book") {
    return "Write the schedule of values your client will read.";
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
 * The other direction: an allowance-category cost line with no allowance
 * behind it.
 *
 * The pricing basis' own category select offers "Allowance", so a designer
 * can author such a line there and never open the allowances editor. It is
 * not an error — `_validate_allowances_payload` asks allowance → line only,
 * and a send carrying it is accepted — so this is a NOTE, never a blocker: a
 * room stricter than the database would refuse a send the server would take.
 * What it must not be is silent, because the allowances editor deliberately
 * leaves such a line alone rather than sweeping it out of the contract sum.
 */
export function unbackedAllowanceLine(
  payload: DesignBuildAllowancesPayload,
  basis: DesignBuildPricingBasisPayload,
): string | null {
  const backed = new Set(payload.allowances.map((allowance) => allowance.id));
  const orphans = basis.costLines.filter(
    (line) => line.category === "allowance" && !backed.has(line.id),
  );
  if (orphans.length === 0) return null;
  if (orphans.length === 1) {
    const label = orphans[0].label.trim() || "One cost line";
    return `${label} is an allowance line on the pricing basis with no allowance behind it. Add it here, or give it another category.`;
  }
  const labels = orphans
    .map((line) => line.label.trim())
    .filter((label) => label.length > 0);
  const named = labels.length > 0 ? ` — ${labels.join(", ")}` : "";
  return `The pricing basis carries allowance lines with no allowance behind them${named}. Add them here, or give them another category.`;
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
  return billsSupervision && takesMarkup
    ? DESIGN_BUILD_COPY.noDoubleCount
    : null;
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

/**
 * THE PAPER THE STUDIO IS SENDING, not the row it authored (R51 · W3R2-03).
 *
 * The TypeScript twin of `_agreement_redact_client_payload` (00578), so the
 * studio's live preview and the homeowner's door render one document. Before
 * this the preview read the authored parts straight through: under a closed
 * book it printed "Cost basis $71,300 · Fee 18% $12,834" over a paper that
 * carried the guaranteed maximum price alone, and a studio that chose closed
 * book precisely to keep its costs off the page was shown them still on it.
 *
 * Two moves, in the SQL's own order:
 *   · the parts the studio hid never cross (R8) — the bundle RPC filters on
 *     `client_visible` and this is the same edge;
 *   · under anything but `open_book` the pricing basis loses `costLines`,
 *     `costBasisCents`, `feeBps` and `subMarkupBps`, and gains the two derived
 *     keys — `contractSumCents`, no longer derivable once the cost lines are
 *     gone, and `scheduleOfValues`, the studio's own client-facing division.
 *
 * Under `open_book` the payload crosses whole: that is what the clause elected.
 * The disclosure is resolved exactly as `_agreement_sub_disclosure` resolves
 * it — the sub-disclosure clause's `mode` first, the pricing basis' own
 * `subDisclosure` second.
 *
 * The studio's cost view is not lost; it lives in the pricing-basis EDITOR,
 * which reads the authored part.
 */
export function redactPartsForClient(
  parts: readonly AgreementPart[],
): AgreementPart[] {
  const visible = parts.filter((part) => part.clientVisible !== false);

  const clauseMode =
    visible
      .filter((part) => part.kind === "clause")
      .map((part) => readSubDisclosure(part.payload ?? {}).mode)
      .find((mode) => mode !== null) ?? null;

  return visible.map((part) => {
    if (part.kind !== "schedule" || part.variant !== "pricing_basis") {
      return part;
    }
    const payload = part.payload ?? {};
    const basis = readPricingBasis(payload);
    const mode = clauseMode ?? basis.subDisclosure;
    const projected = {
      ...payload,
      // The disclosure is ONE answer for the whole contract, and the clause is
      // where the composer writes it. Carrying the resolved mode onto the
      // projection is what lets a renderer that reads only the pricing basis —
      // `agreement-parts-body.tsx` — draw the schedule the clause elected.
      subDisclosure: mode,
      contractSumCents: contractSumCents(basis),
      scheduleOfValues: scheduleOfValues(basis, mode).map((line) => ({
        id: line.id,
        label: line.label,
        cents: line.cents,
      })),
    } as Record<string, unknown>;
    if (mode === "open_book") {
      return { ...part, payload: projected };
    }
    delete projected.costLines;
    delete projected.costBasisCents;
    delete projected.feeBps;
    delete projected.subMarkupBps;
    return { ...part, payload: projected };
  });
}
