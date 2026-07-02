/**
 * Pure logic for the invoice composer (R74b) — the anti-wizard DocSheet's
 * self-composing pull-through sections. Everything money is integer cents;
 * line assembly mirrors the old /portal/billing/invoices/new page 1:1:
 *
 *  - milestones → one kind='milestone' line each (qty 1, unit = amount)
 *  - FF&E items → one kind='ffe' line each (00187 coverage bridge; qty × unit)
 *  - time entries → ONE kind='time' line (qty 1, unit = Σ view-resolved
 *    amounts; hours + provenance in metadata — see lib/time-billing.ts)
 *  - ad-hoc rows → kind='adhoc' lines (blank/zero rows dropped)
 *
 * Ordering: milestone → ffe → time → adhoc, sort_order stamped sequentially.
 */

import type { DraftLineInput } from '@patina/supabase';
import { buildTimeLineDraft, type TimeLineEntryInput } from '@/lib/time-billing';

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

export const EMPTY_ADHOC: ComposerAdhocRow = { description: '', quantity: '1', unitDollars: '' };

// ── Small money parsing ─────────────────────────────────────────────────────

/** "1,234.56" → 123456; garbage → 0. */
export function dollarsToCents(value: string): number {
  const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ''));
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
    if (invoice.status === 'void') continue;
    for (const line of invoice.line_items ?? []) {
      if (line.milestone_id) billed.add(line.milestone_id);
    }
  }
  return milestones.filter(
    (m) => (m.status === 'pending' || m.status === 'outstanding') && !billed.has(m.id),
  );
}

// ── FF&E: coverage partition (00187) ────────────────────────────────────────

/** Minimal coverage shape (mirrors FfeItemCoverage without the import cycle). */
interface CoverageLike {
  coverage: 'uninvoiced' | 'invoiced' | 'paid';
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
    if (cov && cov.coverage !== 'uninvoiced') covered.push(item);
    else if (item.unit_price_cents === null || item.unit_price_cents === undefined)
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
export function buildComposerLines(selection: ComposerSelection): DraftLineInput[] {
  const milestoneLines: DraftLineInput[] = selection.milestones.map((m, i) => ({
    kind: 'milestone' as const,
    milestoneId: m.id,
    description: m.label,
    quantity: 1,
    unitAmountCents: m.amount_cents,
    sortOrder: i,
  }));

  const ffeLines: DraftLineInput[] = selection.ffeItems.map((it, i) => ({
    kind: 'ffe' as const,
    ffeItemId: it.id,
    description: it.room?.name ? `${it.name} — ${it.room.name}` : it.name,
    quantity: it.quantity ?? 1,
    unitAmountCents: it.unit_price_cents ?? 0,
    sortOrder: milestoneLines.length + i,
  }));

  const timeDraft = buildTimeLineDraft(selection.timeEntries);
  const timeLines: DraftLineInput[] = timeDraft
    ? [
        {
          kind: 'time' as const,
          description: timeDraft.description,
          quantity: 1,
          unitAmountCents: timeDraft.amountCents,
          sortOrder: milestoneLines.length + ffeLines.length,
          metadata: {
            time_entry_ids: timeDraft.entryIds,
            total_minutes: timeDraft.totalMinutes,
          },
        },
      ]
    : [];

  const adhocLines: DraftLineInput[] = selection.adhoc
    .filter((l) => l.description.trim() && dollarsToCents(l.unitDollars) > 0)
    .map((l, i) => ({
      kind: 'adhoc' as const,
      description: l.description.trim(),
      quantity: parseFloat(l.quantity) > 0 ? parseFloat(l.quantity) : 1,
      unitAmountCents: dollarsToCents(l.unitDollars),
      sortOrder: milestoneLines.length + ffeLines.length + timeLines.length + i,
    }));

  return [...milestoneLines, ...ffeLines, ...timeLines, ...adhocLines];
}
