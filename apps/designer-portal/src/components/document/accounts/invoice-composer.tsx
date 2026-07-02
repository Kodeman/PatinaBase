'use client';

/**
 * The invoice composer (R74b) — drawing an invoice as an ANTI-WIZARD: one
 * paper sheet, self-composing pull-through sections in a single scroll —
 * Milestones (00204, unbilled ones tickable) · Unbilled time (00177 view,
 * resolved rates shown, R75) · FF&E (00187 coverage bridge, R76) · Ad-hoc
 * lines — plus tax/terms/memo, with running totals via computeInvoiceTotals.
 * No steps, no Next buttons: tick what the invoice should carry, then one
 * "Draft the invoice" act. The draft opens as the folio for issue + send.
 *
 * Prefill contracts (the one-act openers):
 *   initialFfeItemIds  — R76 "Bill →" (the ?ffeItemIds= descendant): arrive
 *                        ticked; covered/unpriced ones fall out with a notice.
 *   initialTimeEntryIds — R75 Export week / bill-it: arrive ticked, per
 *                        project (the intersection when the composer asks).
 *
 * Time claim: after the draft lands, the selected entries are stamped with
 * invoice_id (00177 guard locks them). A claim conflict compensates by
 * deleting the just-created draft — no orphaned time line survives (old
 * composer page 1:1). Failures render inline (R83); no toasts.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  useCreateDraftInvoice,
  useDeleteDraftInvoice,
  useFfeInvoiceCoverage,
  useProjectFFEItems,
  useProjectInvoices,
  useProjectPaymentMilestones,
  useProjects,
} from '@patina/supabase';
import { computeInvoiceTotals, formatCurrency } from '@patina/shared';
import { useClaimTimeEntries, useUnbilledTime } from '@/hooks/use-time-tracking';
import { formatHoursLabel } from '@/lib/time-billing';
import {
  EMPTY_ADHOC,
  buildComposerLines,
  partitionFfeBillable,
  unbilledMilestones,
  type ComposerAdhocRow,
  type ComposerFfeItem,
  type ComposerMilestone,
} from '@/lib/document/invoice-composer';
import { fmtDay } from '@/lib/document/format';
import type { InvoiceComposerContext } from './invoice-overlays';

const TERRACOTTA_INK = '#C4836F';

const LABEL = 'font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]';
const INPUT =
  'rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[11.5px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none';
const ACT =
  'whitespace-nowrap rounded-[4px] border border-[rgba(196,165,123,0.5)] px-3 py-1.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-clay)] transition-colors hover:bg-[var(--color-clay)] hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--color-clay)]';
const CHECK = 'relative top-[1px] accent-[var(--color-clay)]';
const ROW =
  'flex cursor-pointer items-baseline gap-2.5 border-b border-dashed border-[var(--color-pearl)] py-1.5';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

export function InvoiceComposer({
  context,
  onDrafted,
}: {
  context: InvoiceComposerContext;
  /** The handoff: the draft opens as the folio (issue + send live there). */
  onDrafted: (invoiceId: string, projectId: string) => void;
}) {
  const [projectId, setProjectId] = useState(context.projectId ?? '');

  const { data: projects } = useProjects();
  const { data: milestones } = useProjectPaymentMilestones(projectId);
  const { data: projectInvoices } = useProjectInvoices(projectId || null);
  const { data: unbilledTime, isLoading: timeLoading } = useUnbilledTime(projectId || null);
  const { data: ffeItems, isLoading: ffeLoading } = useProjectFFEItems(projectId);
  const { data: coverage, isLoading: coverageLoading } = useFfeInvoiceCoverage(projectId, {
    enabled: !!projectId,
  });

  const createDraft = useCreateDraftInvoice({ errorSurface: 'inline' });
  const deleteDraft = useDeleteDraftInvoice({ errorSurface: 'inline' });
  const claimTime = useClaimTimeEntries({ errorSurface: 'inline' });

  // ── Selections ────────────────────────────────────────────────────────────
  const [tickedMilestoneIds, setTickedMilestoneIds] = useState<Set<string>>(() => new Set());
  const [tickedTimeIds, setTickedTimeIds] = useState<Set<string>>(() => new Set());
  const [tickedFfeIds, setTickedFfeIds] = useState<Set<string>>(() => new Set());
  const [adhoc, setAdhoc] = useState<ComposerAdhocRow[]>([{ ...EMPTY_ADHOC }]);
  const [taxRatePercent, setTaxRatePercent] = useState('0');
  const [termsDays, setTermsDays] = useState('15');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const activeProjects = useMemo(
    () =>
      ((projects ?? []) as AnyRecord[]).filter(
        (p) => p.status === 'active' || p.status === 'planning',
      ),
    [projects],
  );
  const selectedProject = useMemo(
    () => ((projects ?? []) as AnyRecord[]).find((p) => p.id === projectId),
    [projects, projectId],
  );

  // ── Milestones: billable = pending/outstanding, not on a live invoice ─────
  const offerableMilestones = useMemo(
    () =>
      unbilledMilestones(
        ((milestones ?? []) as ComposerMilestone[]),
        (projectInvoices ?? []) as AnyRecord[],
      ),
    [milestones, projectInvoices],
  );

  // ── FF&E: every billable line of the project, coverage-partitioned ────────
  const ffeSettled = !!projectId && !ffeLoading && !coverageLoading;
  const ffePartition = useMemo(
    () =>
      partitionFfeBillable(
        ((ffeItems ?? []) as Array<ComposerFfeItem & AnyRecord>),
        ffeSettled ? coverage : undefined,
      ),
    [ffeItems, coverage, ffeSettled],
  );

  const unbilledEntries = useMemo(() => unbilledTime?.entries ?? [], [unbilledTime]);

  // ── Prefill seeding — once per project, after the section queries settle ──
  // (An intersection seed, not a blind copy: covered FF&E items and
  // already-claimed entries fall out here; the notice below narrates it.)
  const [seededFor, setSeededFor] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId || seededFor === projectId) return;
    const wantsFfe = (context.initialFfeItemIds ?? []).length > 0;
    const wantsTime = (context.initialTimeEntryIds ?? []).length > 0;
    if (wantsFfe && !ffeSettled) return;
    if (wantsTime && (timeLoading || !unbilledTime)) return;

    if (wantsFfe) {
      const billableIds = new Set(ffePartition.billable.map((i) => i.id));
      setTickedFfeIds(
        new Set((context.initialFfeItemIds ?? []).filter((id) => billableIds.has(id))),
      );
    }
    if (wantsTime) {
      const entryIds = new Set(unbilledEntries.map((e) => e.id));
      setTickedTimeIds(
        new Set((context.initialTimeEntryIds ?? []).filter((id) => entryIds.has(id))),
      );
    }
    setSeededFor(projectId);
  }, [
    projectId,
    seededFor,
    context.initialFfeItemIds,
    context.initialTimeEntryIds,
    ffeSettled,
    ffePartition,
    timeLoading,
    unbilledTime,
    unbilledEntries,
  ]);

  // Switching projects drops every selection — a line must bill an item that
  // belongs to the invoice's own project.
  const pickProject = (id: string) => {
    setProjectId(id);
    setTickedMilestoneIds(new Set());
    setTickedTimeIds(new Set());
    setTickedFfeIds(new Set());
    setSeededFor(null);
    setError(null);
  };

  // ── Assembly ──────────────────────────────────────────────────────────────
  const taxRate = useMemo(() => {
    const parsed = parseFloat(taxRatePercent);
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed / 100;
  }, [taxRatePercent]);

  const selection = useMemo(
    () => ({
      milestones: offerableMilestones.filter((m) => tickedMilestoneIds.has(m.id)),
      ffeItems: ffePartition.billable.filter((i) => tickedFfeIds.has(i.id)),
      timeEntries: unbilledEntries.filter((e) => tickedTimeIds.has(e.id)),
      adhoc,
    }),
    [offerableMilestones, tickedMilestoneIds, ffePartition, tickedFfeIds, unbilledEntries, tickedTimeIds, adhoc],
  );
  const lines = useMemo(() => buildComposerLines(selection), [selection]);
  const totals = useMemo(
    () =>
      computeInvoiceTotals(
        lines.map((l) => ({ quantity: l.quantity, unit_amount_cents: l.unitAmountCents })),
        taxRate,
      ),
    [lines, taxRate],
  );

  const creating = createDraft.isPending || claimTime.isPending || deleteDraft.isPending;
  // Block drafting while a prefilled section is still resolving — otherwise a
  // draft could land moments before its prefill arrives, silently dropping it.
  const prefillPending =
    seededFor !== projectId &&
    ((context.initialFfeItemIds ?? []).length > 0 || (context.initialTimeEntryIds ?? []).length > 0);
  const canDraft = !!projectId && lines.length > 0 && !creating && !prefillPending;

  const draft = async () => {
    setError(null);
    const timeLine = lines.find((l) => l.kind === 'time');
    let invoice: AnyRecord;
    try {
      invoice = await createDraft.mutateAsync({
        projectId,
        clientId: selectedProject?.client_id ?? null,
        taxRate,
        paymentTermsDays: parseInt(termsDays, 10) >= 0 ? parseInt(termsDays, 10) : 15,
        memo: memo.trim() || undefined,
        lines,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft the invoice');
      return;
    }

    if (timeLine) {
      const entryIds = (timeLine.metadata as { time_entry_ids?: string[] })?.time_entry_ids ?? [];
      try {
        await claimTime.mutateAsync({ invoiceId: invoice.id, projectId, entryIds });
      } catch (e) {
        try {
          await deleteDraft.mutateAsync({ invoiceId: invoice.id, projectId });
        } catch {
          /* the draft survives with an unclaimed time line — voidable */
        }
        setError(e instanceof Error ? e.message : 'Could not attach the time entries');
        return;
      }
    }

    onDrafted(invoice.id as string, projectId);
  };

  const skippedFfe = useMemo(() => {
    const wanted = new Set(context.initialFfeItemIds ?? []);
    if (wanted.size === 0) return { covered: 0, unpriced: 0 };
    return {
      covered: ffePartition.covered.filter((i) => wanted.has(i.id)).length,
      unpriced: ffePartition.unpriced.filter((i) => wanted.has(i.id)).length,
    };
  }, [context.initialFfeItemIds, ffePartition]);

  // ── The sheet ─────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-[20px] font-medium text-[var(--color-charcoal)]">
          Draw an invoice
        </h2>
        <span className="font-mono text-[7.5px] uppercase tracking-[0.1em] text-[var(--color-aged-oak,#8B7355)]">
          Studio eyes only
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
        Everything billable pulls through below — tick what this invoice should carry, in any
        order. The draft opens as the folio to issue &amp; send.
      </p>

      {/* ── The document it bills ──────────────────────────────────────── */}
      <div className="mt-3 border-t border-[var(--color-pearl)] pt-2.5">
        <p className={`${LABEL} mb-1`}>the document</p>
        {context.projectId && selectedProject ? (
          <p className="text-[12.5px] font-medium text-[var(--color-charcoal)]">
            {selectedProject.name}
          </p>
        ) : (
          <select
            value={projectId}
            onChange={(e) => pickProject(e.target.value)}
            aria-label="Project"
            className={`${INPUT} w-full max-w-[360px] [&_option]:bg-[var(--doc-paper,#FAF7F2)]`}
          >
            <option value="">Pick a document…</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {projectId && (
        <>
          {/* ── Milestones (00204) ─────────────────────────────────────── */}
          <div className="mt-4">
            <p className={`${LABEL} mb-0.5`}>payment milestones · unbilled</p>
            {offerableMilestones.length > 0 ? (
              offerableMilestones.map((m) => (
                <label key={m.id} className={ROW}>
                  <input
                    type="checkbox"
                    className={CHECK}
                    checked={tickedMilestoneIds.has(m.id)}
                    onChange={(e) =>
                      setTickedMilestoneIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(m.id);
                        else next.delete(m.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-charcoal)]">
                    {m.label}
                  </span>
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    {m.status === 'outstanding' ? 'due now' : 'upcoming'}
                  </span>
                  <span className="font-mono text-[10.5px] text-[var(--color-charcoal)]">
                    {formatCurrency(m.amount_cents)}
                  </span>
                </label>
              ))
            ) : (
              <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
                Nothing unbilled — every milestone is on an invoice or paid.
              </p>
            )}
          </div>

          {/* ── Unbilled time (00177 view — resolved rates, R75/BIL-08) ── */}
          <div className="mt-4">
            <p className={`${LABEL} mb-0.5`}>
              unbilled time
              {unbilledEntries.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setTickedTimeIds((prev) =>
                      prev.size === unbilledEntries.length
                        ? new Set()
                        : new Set(unbilledEntries.map((e) => e.id)),
                    )
                  }
                  className="ml-2 font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--color-clay)] hover:opacity-80"
                >
                  {tickedTimeIds.size === unbilledEntries.length ? 'clear all' : 'tick all'}
                </button>
              )}
            </p>
            {timeLoading ? (
              <p className="py-1 text-[11px] italic text-[var(--text-muted)]">Reading the hours…</p>
            ) : unbilledEntries.length > 0 ? (
              <>
                {unbilledEntries.map((entry) => (
                  <label key={entry.id} className={ROW}>
                    <input
                      type="checkbox"
                      className={CHECK}
                      checked={tickedTimeIds.has(entry.id)}
                      onChange={(e) =>
                        setTickedTimeIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(entry.id);
                          else next.delete(entry.id);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-charcoal)]">
                      {fmtDay(entry.started_at)}
                      {entry.notes && (
                        <span className="ml-1.5 text-[var(--text-muted)]">{entry.notes}</span>
                      )}
                    </span>
                    <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {formatHoursLabel(entry.duration_minutes)} ·{' '}
                      {formatCurrency(entry.resolved_rate_cents)}/h
                    </span>
                    <span className="font-mono text-[10.5px] text-[var(--color-charcoal)]">
                      {formatCurrency(entry.amount_cents)}
                    </span>
                  </label>
                ))}
                <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                  ticked entries bill as one line and lock to the draft · voiding releases them
                </p>
              </>
            ) : (
              <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
                No unbilled hours on this document.
              </p>
            )}
          </div>

          {/* ── FF&E (00187 coverage bridge, R76) ──────────────────────── */}
          <div className="mt-4">
            <p className={`${LABEL} mb-0.5`}>ff&amp;e · uninvoiced</p>
            {!ffeSettled ? (
              <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
                Reading the schedule…
              </p>
            ) : ffePartition.billable.length > 0 ? (
              ffePartition.billable.map((it) => (
                <label key={it.id} className={ROW}>
                  <input
                    type="checkbox"
                    className={CHECK}
                    checked={tickedFfeIds.has(it.id)}
                    onChange={(e) =>
                      setTickedFfeIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(it.id);
                        else next.delete(it.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--color-charcoal)]">
                    {it.name}
                    {it.room?.name && (
                      <span className="ml-1.5 text-[var(--text-muted)]">{it.room.name}</span>
                    )}
                  </span>
                  <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    ×{it.quantity ?? 1}
                  </span>
                  <span className="font-mono text-[10.5px] text-[var(--color-charcoal)]">
                    {formatCurrency((it.quantity ?? 1) * (it.unit_price_cents ?? 0))}
                  </span>
                </label>
              ))
            ) : (
              <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
                Nothing uninvoiced — every priced line is billed.
              </p>
            )}
            {(skippedFfe.covered > 0 || skippedFfe.unpriced > 0 || ffePartition.unpriced.length > 0) && (
              <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                {[
                  skippedFfe.covered > 0
                    ? `${skippedFfe.covered} asked-for item${skippedFfe.covered === 1 ? '' : 's'} already invoiced · skipped`
                    : null,
                  ffePartition.unpriced.length > 0
                    ? `${ffePartition.unpriced.length} unpriced line${ffePartition.unpriced.length === 1 ? '' : 's'} — set a client price to bill`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>

          {/* ── Ad-hoc lines ───────────────────────────────────────────── */}
          <div className="mt-4">
            <p className={`${LABEL} mb-1`}>ad-hoc lines</p>
            {adhoc.map((line, i) => (
              <div key={i} className="mb-1.5 grid grid-cols-[1fr_56px_96px_24px] items-center gap-2">
                <input
                  placeholder="Description — e.g. design consultation"
                  aria-label="Line description"
                  value={line.description}
                  onChange={(e) =>
                    setAdhoc((prev) =>
                      prev.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)),
                    )
                  }
                  className={INPUT}
                />
                <input
                  placeholder="Qty"
                  aria-label="Quantity"
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) =>
                    setAdhoc((prev) =>
                      prev.map((l, j) => (j === i ? { ...l, quantity: e.target.value } : l)),
                    )
                  }
                  className={`${INPUT} text-right`}
                />
                <input
                  placeholder="Unit $"
                  aria-label="Unit price (dollars)"
                  inputMode="decimal"
                  value={line.unitDollars}
                  onChange={(e) =>
                    setAdhoc((prev) =>
                      prev.map((l, j) => (j === i ? { ...l, unitDollars: e.target.value } : l)),
                    )
                  }
                  className={`${INPUT} text-right`}
                />
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() => setAdhoc((prev) => prev.filter((_, j) => j !== i))}
                  className="text-[13px] text-[var(--text-muted)] hover:text-[#C4836F]"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAdhoc((prev) => [...prev, { ...EMPTY_ADHOC }])}
              className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)] hover:opacity-80"
            >
              + line
            </button>
          </div>

          {/* ── Terms ──────────────────────────────────────────────────── */}
          <div className="mt-4 grid max-w-[420px] grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>tax rate (%)</span>
              <input
                inputMode="decimal"
                value={taxRatePercent}
                onChange={(e) => setTaxRatePercent(e.target.value)}
                className={INPUT}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>terms (net days)</span>
              <input
                inputMode="numeric"
                value={termsDays}
                onChange={(e) => setTermsDays(e.target.value)}
                className={INPUT}
              />
            </label>
          </div>
          <label className="mt-2.5 flex flex-col gap-0.5">
            <span className={LABEL}>memo · shown to the client</span>
            <textarea
              rows={2}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Thank you…"
              className={`${INPUT} w-full resize-none`}
            />
          </label>

          {/* ── Running totals + the act ───────────────────────────────── */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-pearl)] pt-3">
            <div className="flex items-baseline gap-4">
              <span className="flex items-baseline gap-1.5">
                <span className={LABEL}>subtotal</span>
                <span className="font-mono text-[10.5px] text-[var(--color-charcoal)]">
                  {formatCurrency(totals.subtotalCents)}
                </span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className={LABEL}>tax</span>
                <span className="font-mono text-[10.5px] text-[var(--color-charcoal)]">
                  {formatCurrency(totals.taxCents)}
                </span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className={LABEL}>total</span>
                <span className="font-mono text-[12px] font-semibold text-[var(--color-charcoal)]">
                  {formatCurrency(totals.totalCents)}
                </span>
              </span>
              <span className="font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                {lines.length} line{lines.length === 1 ? '' : 's'}
              </span>
            </div>
            <button type="button" disabled={!canDraft} onClick={() => void draft()} className={ACT}>
              {creating ? 'drafting…' : 'Draft the invoice →'}
            </button>
          </div>

          {/* R83 — the inline failure band, at the act site. */}
          {error && (
            <p
              className="mt-2 rounded-[3px] border border-[rgba(196,131,111,0.4)] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.05em]"
              style={{ color: TERRACOTTA_INK }}
            >
              {error} —{' '}
              <button type="button" onClick={() => void draft()} className="underline">
                try again
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
