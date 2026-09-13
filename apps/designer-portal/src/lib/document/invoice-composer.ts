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

import type { DraftLineInput } from "@patina/supabase";
import {
  buildTimeLineDraft,
  type TimeLineDateRow,
  type TimeLineEntryInput,
} from "@/lib/time-billing";

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
  /** NULL client unit price — nothing to bill yet. */
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
      item.unit_price_cents === undefined
    )
      unpriced.push(item);
    else billable.push(item);
  }
  return { billable, covered, unpriced };
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
