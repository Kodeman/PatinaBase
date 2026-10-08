/**
 * Pure logic for the invoice composer (R74b) — the anti-wizard DocSheet's
 * self-composing pull-through sections. Everything money is integer cents;
 * line assembly mirrors the old /portal/billing/invoices/new page 1:1:
 *
 *  - milestones → one kind='milestone' line each (qty 1, unit = amount)
 *  - FF&E items → one kind='ffe' line each (00187 coverage bridge; qty × unit)
 *  - time entries → ONE kind='time' line for the whole selection (HT-21, W5;
 *    corrected in fix round 1, findings B1/B2 — NOT one per person: qty 1,
 *    unit = the Σ of every selected entry's view-resolved amount, merged
 *    across every author; hours + provenance in metadata — see
 *    lib/time-billing.ts). Naming who did the work is designer-side only —
 *    the composer's own entry picker already shows each entry's
 *    `member_name` before the entries are merged here; the merged line's
 *    `description` is always the generic phrasing, because it is read
 *    verbatim by `resolve_invoice_link` (00588) and rendered verbatim on the
 *    client's pay-link sheet and the printed/PDF copy (LEAH-15, REP-15: the
 *    homeowner gets no staffing detail).
 *  - ad-hoc rows → kind='adhoc' lines (blank/zero rows dropped)
 *
 * Ordering: milestone → ffe → time → adhoc, sort_order stamped sequentially.
 *
 * HT-21's dated sub-table rides `metadata.attribution` — the SAME field
 * `resolve_invoice_link` (00588) already reads for a furnishings line's maker
 * name (`li.metadata->>'attribution'`) and the client sheet already renders
 * under the line's description (`invoice-sheet.tsx`'s existing per-line
 * sub-slot). No migration: a time line's attribution is a JSON-encoded
 * `TimeAttributionPayload` (below) instead of a plain vendor-name string;
 * `invoice-sheet.tsx` tries to parse it and falls back to plain text for
 * every other line kind, so the shared field grows one more shape rather
 * than a second sub-slot. It carries date/minutes/rate rows ONLY — never a
 * name (LEAH-15, REP-15: the homeowner gets no staffing detail).
 */

import type { DraftLineInput, InvoiceBillingLineRequest } from "@patina/supabase";
import {
  buildTimeLineDraft,
  type TimeLineDateRow,
  type TimeLineEntryInput,
} from "@/lib/time-billing";
import { priceWord } from "./stamp-derivation";

/** Discriminates a time line's JSON `metadata.attribution` from the plain
 *  vendor-name strings furnishings lines already store there (00588). */
export const TIME_ATTRIBUTION_KIND = "patina_time_subtable" as const;

export interface TimeAttributionPayload {
  kind: typeof TIME_ATTRIBUTION_KIND;
  rows: TimeLineDateRow[];
}

function timeAttribution(dateRows: TimeLineDateRow[]): string | undefined {
  if (dateRows.length === 0) return undefined;
  const payload: TimeAttributionPayload = {
    kind: TIME_ATTRIBUTION_KIND,
    rows: dateRows,
  };
  return JSON.stringify(payload);
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface ComposerMilestone {
  id: string;
  label: string;
  amount_cents: number;
  status: string;
}

/** The slice of a project_ffe_items row the composer needs. */
export interface ComposerFfeItem {
  id: string;
  name: string;
  quantity: number | null;
  unit_price_cents: number | null;
  /** With `item_type`, what `priceWord` reads: a $0 line with no product
   *  that is not an allowance prints `Not priced` (US-21 fix-now #5). */
  product_id?: string | null;
  item_type?: string | null;
  room?: { name: string | null } | null;
}

export interface ComposerAdhocRow {
  description: string;
  quantity: string;
  unitDollars: string;
}

export const EMPTY_ADHOC: ComposerAdhocRow = {
  description: "",
  quantity: "1",
  unitDollars: "",
};

// ── Small money parsing ─────────────────────────────────────────────────────

/** "1,234.56" → 123456; garbage → 0. */
export function dollarsToCents(value: string): number {
  const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ""));
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

// ── Milestones: which are still billable ────────────────────────────────────

interface InvoiceWithLines {
  status: string;
  line_items?: Array<{ milestone_id: string | null }> | null;
}

/**
 * A milestone is billable when it isn't paid and isn't already carried by a
 * LIVE (non-void) invoice line — void released its slot (old composer 1:1).
 */
export function unbilledMilestones<M extends ComposerMilestone>(
  milestones: M[],
  projectInvoices: InvoiceWithLines[],
): M[] {
  const billed = new Set<string>();
  for (const invoice of projectInvoices) {
    if (invoice.status === "void") continue;
    for (const line of invoice.line_items ?? []) {
      if (line.milestone_id) billed.add(line.milestone_id);
    }
  }
  return milestones.filter(
    (m) =>
      (m.status === "pending" || m.status === "outstanding") &&
      !billed.has(m.id),
  );
}

// ── FF&E: coverage partition (00187) ────────────────────────────────────────

/** Minimal coverage shape (mirrors FfeItemCoverage without the import cycle). */
interface CoverageLike {
  coverage: "uninvoiced" | "invoiced" | "paid";
}

export interface FfePartition<T extends ComposerFfeItem> {
  /** Priced + uncovered — offerable in the FF&E section. */
  billable: T[];
  /** Already on a live invoice line (the 00187 partial-unique guard). */
  covered: T[];
  /** NULL client unit price, or a line that prints `Not priced` — nothing
   *  to bill yet. */
  unpriced: T[];
}

/**
 * Partition a project's FF&E items by billability. The DB allows ONE live
 * invoice line per item, so covered items are never offered; unpriced items
 * surface as a quiet notice ("set a client price first").
 */
export function partitionFfeBillable<T extends ComposerFfeItem>(
  items: T[],
  coverage: Record<string, CoverageLike> | undefined,
): FfePartition<T> {
  const billable: T[] = [];
  const covered: T[] = [];
  const unpriced: T[] = [];
  for (const item of items) {
    const cov = coverage?.[item.id];
    if (cov && cov.coverage !== "uninvoiced") covered.push(item);
    else if (
      item.unit_price_cents === null ||
      item.unit_price_cents === undefined ||
      priceWord({
        unit_price_cents: item.unit_price_cents,
        product_id: item.product_id ?? null,
        item_type: item.item_type,
      }) === "Not priced"
    )
      unpriced.push(item);
    else billable.push(item);
  }
  return { billable, covered, unpriced };
}

// ── Purchases: the unbilled set (C-25, 00703) ───────────────────────────────

/** The slice of a studio_purchases row the composer reads. */
export interface ComposerPurchase {
  id: string;
  status: string;
  billable_to_client: boolean;
  invoice_line_id: string | null;
  /** The schedule line it was bought for, if any (00703). */
  ffe_item_id?: string | null;
  payee_name: string;
  description?: string | null;
  purchased_on: string;
  amount_cents: number;
  tax_cents?: number | null;
  buyer_premium_cents?: number | null;
  shipping_cents?: number | null;
}

/**
 * Purchases still owed a client invoice line: recorded (not billed, returned
 * or void), billable to the client, and not yet stamped with an invoice line.
 * The same predicate as 00703's idx_studio_purchases_unbilled.
 */
export function unbilledPurchases<P extends ComposerPurchase>(
  purchases: readonly P[] | null | undefined,
): P[] {
  return (purchases ?? []).filter(
    (p) => p.status === "recorded" && p.billable_to_client && !p.invoice_line_id,
  );
}

/** R-PB7: a purchase bills at cost — every figure the studio paid. */
export function purchaseAtCostCents(
  p: Pick<
    ComposerPurchase,
    "amount_cents" | "tax_cents" | "buyer_premium_cents" | "shipping_cents"
  >,
): number {
  return (
    p.amount_cents +
    (p.tax_cents ?? 0) +
    (p.buyer_premium_cents ?? 0) +
    (p.shipping_cents ?? 0)
  );
}

/** What "Bill N unbilled purchases" opens the composer with. */
export function purchasesBillArgs(
  projectId: string,
  unbilled: readonly Pick<ComposerPurchase, "id">[],
): { projectId: string; initialPurchaseIds: string[] } {
  return { projectId, initialPurchaseIds: unbilled.map((p) => p.id) };
}

// ── Riders: the unbilled set (C-26, 00704) ──────────────────────────────────

/** The slice of a po_cost_lines row (with its PO) the composer reads. */
export interface ComposerRider {
  id: string;
  kind: string;
  note?: string | null;
  billable_to_client: boolean;
  invoice_line_id: string | null;
  estimate_cents: number | null;
  actual_cents: number | null;
  purchase_order?: { po_number: string | null } | null;
}

/** Riders still owed a client line: billable and never stamped (00709). */
export function unbilledRiders<R extends ComposerRider>(
  riders: readonly R[] | null | undefined,
): R[] {
  return (riders ?? []).filter((r) => r.billable_to_client && !r.invoice_line_id);
}

/** R-PB7: a rider bills at cost — the actual, else the estimate; null = none. */
export function riderAtCostCents(
  r: Pick<ComposerRider, "actual_cents" | "estimate_cents">,
): number | null {
  return r.actual_cents ?? r.estimate_cents ?? null;
}

/** The writer's default description: "Liftgate · second floor" (00709). */
export function riderLabel(r: Pick<ComposerRider, "kind" | "note">): string {
  const kind = r.kind
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  const note = r.note?.trim();
  return note ? `${kind} · ${note}` : kind;
}

/** What "Bill N unbilled riders" opens the composer with. */
export function ridersBillArgs(
  projectId: string,
  unbilled: readonly Pick<ComposerRider, "id">[],
): { projectId: string; initialCostLineIds: string[] } {
  return { projectId, initialCostLineIds: unbilled.map((r) => r.id) };
}

// ── At-cost overrides (R-PB7 "overridable") ─────────────────────────────────

/**
 * A typed dollar figure to whole cents: "1,234.5" → 123450, "0" → 0.
 * Blank, negative, more than two decimals or anything else → null, so a typo
 * never bills as $0 (unlike dollarsToCents, which reads garbage as 0).
 */
export function parseOverrideCents(value: string): number | null {
  const text = value.trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return cents <= 1_000_000_000 ? cents : null;
}

/** Cents → the plain dollar text an override input starts from ("1296.50"). */
export function centsToDollarText(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

// ── Deposit, then balance (C-31, 00709) ─────────────────────────────────────

/** One live billing slot of a line, as get_ffe_invoice_stage_coverage reads it. */
export interface ComposerStageSlot {
  ffe_item_id: string;
  billing_stage: string;
  billing_stage_pct: number | null;
  invoice_id: string;
  invoice_number: string | null;
  invoice_status: string;
  billed_cents: number;
}

/** What a line has had billed: its live slots, deposit first. */
export interface LineBilling {
  slots: ComposerStageSlot[];
  /** Σ of the live deposit slots — what a balance subtracts. */
  depositedCents: number;
  /** A full or balance slot is live: nothing is left to bill. */
  closed: boolean;
}

const STAGE_ORDER: Record<string, number> = { deposit: 0, balance: 1, full: 2 };

/** Group the stage-coverage rows by line. A line with no entry is unbilled. */
export function lineBillingByItem(
  rows: readonly ComposerStageSlot[] | null | undefined,
): Map<string, LineBilling> {
  const byItem = new Map<string, LineBilling>();
  for (const row of rows ?? []) {
    const entry = byItem.get(row.ffe_item_id) ?? {
      slots: [],
      depositedCents: 0,
      closed: false,
    };
    entry.slots.push(row);
    if (row.billing_stage === "deposit") entry.depositedCents += row.billed_cents;
    else entry.closed = true;
    byItem.set(row.ffe_item_id, entry);
  }
  for (const entry of byItem.values()) {
    entry.slots.sort(
      (a, b) => (STAGE_ORDER[a.billing_stage] ?? 3) - (STAGE_ORDER[b.billing_stage] ?? 3),
    );
  }
  return byItem;
}

/** A line's client price: quantity × client unit price; null when unpriced. */
export function lineClientPriceCents(
  item: Pick<ComposerFfeItem, "quantity" | "unit_price_cents">,
): number | null {
  if (item.unit_price_cents === null || item.unit_price_cents === undefined) return null;
  return (item.quantity ?? 1) * item.unit_price_cents;
}

/** A deposit percent the writer accepts: above 0, at most 100, two places. */
export function isValidDepositPct(pct: number): boolean {
  return (
    Number.isFinite(pct) &&
    pct > 0 &&
    pct <= 100 &&
    Math.abs(Math.round(pct * 100) - pct * 100) < 1e-6
  );
}

/**
 * The deposit on a price — round(price × pct / 100), half away from zero, as
 * add_invoice_billing_lines computes it. Integer arithmetic on hundredths of
 * a percent, so no float drift moves a cent.
 */
export function depositCents(priceCents: number, pct: number): number {
  const scaled = priceCents * Math.round(pct * 100);
  return Math.floor((scaled + 5_000) / 10_000);
}

/** The balance: the price less every live deposit. Deposit + balance = price. */
export function balanceCents(priceCents: number, depositedCents: number): number {
  return priceCents - depositedCents;
}

/**
 * Lines owed a balance: a live deposit, no full or balance slot, a client
 * price, and something left after the deposit.
 */
export function balanceOwedItems<T extends ComposerFfeItem>(
  items: readonly T[],
  billing: Map<string, LineBilling>,
): T[] {
  return items.filter((item) => {
    const b = billing.get(item.id);
    const price = lineClientPriceCents(item);
    return (
      !!b &&
      !b.closed &&
      b.depositedCents > 0 &&
      price !== null &&
      balanceCents(price, b.depositedCents) > 0
    );
  });
}

const STAGE_WORD: Record<string, string> = {
  deposit: "deposit",
  balance: "balance",
  full: "in full",
};

/** "deposit 50% · №0217 · paid" — one slot, as the composer row reads it. */
export function stageSlotWords(slot: ComposerStageSlot): string {
  const stage =
    slot.billing_stage === "deposit" && slot.billing_stage_pct !== null
      ? `deposit ${Number(slot.billing_stage_pct)}%`
      : (STAGE_WORD[slot.billing_stage] ?? slot.billing_stage);
  const number = slot.invoice_number ? `№${slot.invoice_number}` : null;
  const state =
    slot.invoice_status === "paid"
      ? "paid"
      : slot.invoice_status === "draft"
        ? "in draft"
        : slot.invoice_status === "partially_paid"
          ? "part paid"
          : "billed";
  return [stage, number, state].filter(Boolean).join(" · ");
}

// ── The billing writer's lines (00709 add_invoice_billing_lines) ────────────

/** A billing line with the figure the composer previews for it. */
export interface BillingLineDraft {
  request: InvoiceBillingLineRequest;
  description: string;
  /** The amount the writer will bill; null = no figure yet (blocks drafting). */
  amountCents: number | null;
}

/** An at-cost subject with the override text typed against it, if any. */
export interface AtCostPick<S> {
  subject: S;
  /** Undefined = untouched: bill at cost. */
  overrideText?: string;
}

export interface BillingSelection {
  depositItems: ComposerFfeItem[];
  depositPct: number;
  balanceItems: ComposerFfeItem[];
  billing: Map<string, LineBilling>;
  purchases: AtCostPick<ComposerPurchase>[];
  riders: AtCostPick<ComposerRider>[];
}

/** cost when untouched; the parsed override (or null) when typed. */
function atCostAmount(cost: number | null, overrideText: string | undefined) {
  if (overrideText === undefined) return { amountCents: cost, override: undefined };
  const parsed = parseOverrideCents(overrideText);
  return {
    amountCents: parsed,
    // Sent only when it differs: an untouched-but-retyped cost stays at cost.
    override: parsed !== null && parsed !== cost ? parsed : undefined,
  };
}

/**
 * The lines the composer hands add_invoice_billing_lines after the draft
 * lands: deposits (pct of the client price), balances (price less the live
 * deposits), then each purchase and each rider on its own line at cost, with
 * amountCents only when the studio overrode it. The writer computes and
 * re-checks every figure; the amounts here are the composer's preview.
 */
export function buildBillingLines(sel: BillingSelection): BillingLineDraft[] {
  const deposits: BillingLineDraft[] = sel.depositItems.map((it) => {
    const price = lineClientPriceCents(it);
    return {
      request: { ffeItemId: it.id, stage: "deposit", depositPct: sel.depositPct },
      description: `Deposit (${sel.depositPct}%) · ${it.name}`,
      amountCents:
        price === null || !isValidDepositPct(sel.depositPct)
          ? null
          : depositCents(price, sel.depositPct),
    };
  });
  const balances: BillingLineDraft[] = sel.balanceItems.map((it) => {
    const price = lineClientPriceCents(it);
    const deposited = sel.billing.get(it.id)?.depositedCents ?? 0;
    return {
      request: { ffeItemId: it.id, stage: "balance" },
      description: `Balance · ${it.name}`,
      amountCents: price === null ? null : balanceCents(price, deposited),
    };
  });
  const purchases: BillingLineDraft[] = sel.purchases.map(({ subject, overrideText }) => {
    const { amountCents, override } = atCostAmount(purchaseAtCostCents(subject), overrideText);
    return {
      request:
        override === undefined
          ? { purchaseId: subject.id }
          : { purchaseId: subject.id, amountCents: override },
      description: subject.description?.trim() || subject.payee_name,
      amountCents,
    };
  });
  const riders: BillingLineDraft[] = sel.riders.map(({ subject, overrideText }) => {
    const cost = riderAtCostCents(subject);
    const { amountCents, override } = atCostAmount(cost, overrideText);
    return {
      request:
        override === undefined
          ? { costLineId: subject.id }
          : { costLineId: subject.id, amountCents: override },
      description: riderLabel(subject),
      amountCents,
    };
  });
  return [...deposits, ...balances, ...purchases, ...riders];
}

// ── The unfold Money cell's quiet fact (C-31) ───────────────────────────────

/** The invoice fields the fact line dates itself from. */
export interface FactInvoice {
  id: string;
  status: string;
  issue_date?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
}

/**
 * "Client deposit billed 3 October · paid 6 October · balance unbilled" — the
 * staged client billing of one line, for the unfold's Money cell. Null when
 * the line has no deposit or balance slot (a full bill keeps the 00187
 * fronting fact). Dates only for what happened; never a promise (R7).
 */
export function clientStageFact(
  billing: LineBilling | undefined,
  invoices: ReadonlyMap<string, FactInvoice>,
  fmt: (iso: string) => string,
): string | null {
  if (!billing || !billing.slots.some((s) => s.billing_stage !== "full")) return null;
  const parts = billing.slots.map((slot, i) => {
    const word = slot.billing_stage === "balance" ? "balance" : "deposit";
    const lead = i === 0 ? `Client ${word}` : word;
    const inv = invoices.get(slot.invoice_id);
    const status = inv?.status ?? slot.invoice_status;
    if (status === "draft") return `${lead} in draft`;
    const billedOn = inv?.issue_date ?? inv?.sent_at ?? null;
    const billed = billedOn ? `${lead} billed ${fmt(billedOn)}` : `${lead} billed`;
    if (status === "paid") return inv?.paid_at ? `${billed} · paid ${fmt(inv.paid_at)}` : `${billed} · paid`;
    if (status === "partially_paid") return `${billed} · part paid`;
    return billed;
  });
  if (!billing.closed) parts.push("balance unbilled");
  return parts.join(" · ");
}

// ── Line assembly ───────────────────────────────────────────────────────────

export interface ComposerSelection {
  milestones: ComposerMilestone[];
  ffeItems: ComposerFfeItem[];
  timeEntries: TimeLineEntryInput[];
  adhoc: ComposerAdhocRow[];
}

/**
 * The composer's whole output: DraftLineInput[] ready for
 * useCreateDraftInvoice, kinds explicit, sort_order sequential in the
 * milestone → ffe → time → adhoc order the folio renders.
 */
export function buildComposerLines(
  selection: ComposerSelection,
): DraftLineInput[] {
  const milestoneLines: DraftLineInput[] = selection.milestones.map((m, i) => ({
    kind: "milestone" as const,
    milestoneId: m.id,
    description: m.label,
    quantity: 1,
    unitAmountCents: m.amount_cents,
    sortOrder: i,
  }));

  const ffeLines: DraftLineInput[] = selection.ffeItems.map((it, i) => ({
    kind: "ffe" as const,
    ffeItemId: it.id,
    description: it.room?.name ? `${it.name} — ${it.room.name}` : it.name,
    quantity: it.quantity ?? 1,
    unitAmountCents: it.unit_price_cents ?? 0,
    sortOrder: milestoneLines.length + i,
  }));

  // HT-21, corrected fix round 1 (findings B1/B2) — every selected entry
  // merges into ONE kind='time' line, regardless of how many distinct
  // authors it spans: the client's folio keeps one priced time line with a
  // dated sub-table, never staffing detail (plan-v2 §6, LEAH-15/REP-15).
  // Per-person naming stays where it already worked — the composer's own
  // entry picker, reading `member_name` off each entry before this function
  // ever runs.
  const timeDraft = buildTimeLineDraft(selection.timeEntries);
  const timeLines: DraftLineInput[] = timeDraft
    ? (() => {
        const attribution = timeAttribution(timeDraft.dateRows);
        return [
          {
            kind: "time" as const,
            description: timeDraft.description,
            quantity: 1,
            unitAmountCents: timeDraft.amountCents,
            sortOrder: milestoneLines.length + ffeLines.length,
            metadata: {
              time_entry_ids: timeDraft.entryIds,
              total_minutes: timeDraft.totalMinutes,
              ...(attribution !== undefined ? { attribution } : {}),
            },
          },
        ];
      })()
    : [];

  const adhocLines: DraftLineInput[] = selection.adhoc
    .filter((l) => l.description.trim() && dollarsToCents(l.unitDollars) > 0)
    .map((l, i) => ({
      kind: "adhoc" as const,
      description: l.description.trim(),
      quantity: parseFloat(l.quantity) > 0 ? parseFloat(l.quantity) : 1,
      unitAmountCents: dollarsToCents(l.unitDollars),
      sortOrder: milestoneLines.length + ffeLines.length + timeLines.length + i,
    }));

  return [...milestoneLines, ...ffeLines, ...timeLines, ...adhocLines];
}

// ── The studio invoice — an invoice with no house (R136, ruling S1) ──────────

/** The value the composer's "for" select carries for the houseless choice.
 *  Never a project id, so it can never collide with one. */
export const STUDIO_TARGET = "__studio__";

/** The org rows the composer needs to answer ruling S8. */
export interface ComposerStudio {
  id: string;
  name: string;
  type: string;
  status: string;
  membership?: { role?: string | null; status?: string | null } | null;
}

/**
 * The design studios the designer can draw a studio invoice for. The studio
 * line appears only when this returns more than one (S8); one studio is used
 * silently.
 *
 * The membership is filtered here as well as the organization: 00571 authorizes
 * the draw against an ACTIVE, NON-GUEST membership of the named studio, so a
 * guest membership offered in this list is an option whose only answer is
 * `insufficient_privilege` raised verbatim into the composer's error band.
 *
 * Sorted by name (id breaks a tie): the membership query carries no ORDER BY,
 * so the first row is Postgres physical order and would otherwise decide which
 * studio a two-studio designer silently bills from — wrong letterhead, wrong
 * number sequence, and a number burnt on issue.
 */
export function activeDesignStudios<T extends ComposerStudio>(orgs: T[]): T[] {
  return orgs
    .filter(
      (o) =>
        o.type === "design_studio" &&
        o.status === "active" &&
        o.membership?.role !== "guest" &&
        (o.membership?.status ?? "active") === "active",
    )
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export interface StudioInvoiceDraft {
  /** The household being billed — a profiles.id off the roster (S4). */
  clientId: string | null;
  /** The regarding line (S12). */
  title: string;
  /** The studio drawing it — resolved silently when there is only one (S8). */
  studioId: string | null;
  /** Assembled ad-hoc lines; blank/zero rows are already dropped (S6). */
  lines: DraftLineInput[];
}

/**
 * The pure twin of the composer's Draft act in studio mode: a household, a
 * regarding line, a studio to bill from, and at least one line that carries
 * money. (Busy/pending state stays in the component, as it does for houses.)
 */
export function canDraftStudioInvoice(draft: StudioInvoiceDraft): boolean {
  return (
    Boolean(draft.clientId) &&
    draft.title.trim().length > 0 &&
    Boolean(draft.studioId) &&
    draft.lines.length > 0
  );
}
