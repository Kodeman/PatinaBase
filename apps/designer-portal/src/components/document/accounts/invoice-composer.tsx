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
 *
 * R136 — the STUDIO invoice, an invoice with no house (ruling S1). Behind the
 * `studio-invoice` flag the first section is "for" rather than "the document",
 * and its select carries "the studio · no house" ahead of the houses. Choosing
 * it puts the three pull-through sections away — milestones, time and FF&E are
 * all house-bound (S6) — and asks instead for the household (S4), the regarding
 * line (S12), and, only when the designer belongs to more than one active
 * design studio, which studio is billing (S8). Everything below the fold is the
 * composer's own: ad-hoc lines, tax, terms, memo, totals, one Draft act.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useCreateDraftInvoice,
  useCreateDraftStudioInvoice,
  useDeleteDraftInvoice,
  useFfeInvoiceCoverage,
  useOrganizations,
  useProjectFFEItems,
  useProjectInvoices,
  useProjectPaymentMilestones,
  useProjects,
} from '@patina/supabase';
import { computeInvoiceTotals, formatCurrency } from '@patina/shared';
import {
  useClaimTimeEntries,
  useUnbilledTime,
} from '@/hooks/use-time-tracking';
import { formatHoursLabel } from '@/lib/time-billing';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { ClientPicker } from '@/components/portal/client-picker';
import { documentEvents } from '@/lib/analytics/document-events';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import {
  EMPTY_ADHOC,
  STUDIO_TARGET,
  activeDesignStudios,
  buildComposerLines,
  canDraftStudioInvoice,
  partitionFfeBillable,
  unbilledMilestones,
  type ComposerAdhocRow,
  type ComposerFfeItem,
  type ComposerMilestone,
  type ComposerStudio,
} from '@/lib/document/invoice-composer';
import { fmtDay } from '@/lib/document/format';
import type { InvoiceComposerContext } from './invoice-overlays';

const TERRACOTTA_INK = 'var(--color-terracotta-ink)';

const LABEL =
  'font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-muted)]';
const INPUT =
  'rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[11.5px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none';
const CHECK = 'relative top-[1px] accent-[var(--color-clay)]';
const ROW =
  'flex cursor-pointer items-baseline gap-2.5 border-b border-dashed border-[var(--color-pearl)] py-1.5';

// Untyped hook rows (house style — database.types.ts not regenerated).
type AnyRecord = any;

// The houseless choice is made in the "for" select, so it cannot be a
// DocumentAction button — but it is an act, and it rides the same pair every
// other act in this region rides (no new analytics module).
const STUDIO_CHOICE_EVENT = {
  surface_key: 'accounts',
  region_key: 'invoice-composer',
  action_key: 'choose-studio-invoice',
  variant: 'secondary',
  presentation: 'inline',
} as const;

export function InvoiceComposer({
  context,
  onDrafted,
}: {
  context: InvoiceComposerContext;
  /** The handoff: the draft opens as the folio (issue + send live there).
   *  `projectId` is null for a studio invoice — there is no house to return. */
  onDrafted: (invoiceId: string, projectId: string | null) => void;
}) {
  // One select, two kinds of target: a project id, or the studio sentinel.
  const [target, setTarget] = useState(
    context.mode === 'studio' ? STUDIO_TARGET : (context.projectId ?? ''),
  );
  const projectId = target === STUDIO_TARGET ? '' : target;

  // Fail-closed: the houseless choice never renders while the flag is still
  // resolving. A project-scoped opener has already named its house, so it
  // never offers the choice at all.
  const { value: studioInvoiceOn, isLoading: flagLoading } =
    useFeatureFlag('studio-invoice');
  const studioChoiceAvailable =
    studioInvoiceOn && !flagLoading && !context.projectId;
  const studioMode = studioChoiceAvailable && target === STUDIO_TARGET;

  const { data: projects } = useProjects();
  const { data: organizations, isLoading: organizationsLoading } =
    useOrganizations();
  const { data: milestones } = useProjectPaymentMilestones(projectId);
  const { data: projectInvoices } = useProjectInvoices(projectId || null);
  const { data: unbilledTime, isLoading: timeLoading } = useUnbilledTime(
    projectId || null,
  );
  const { data: ffeItems, isLoading: ffeLoading } =
    useProjectFFEItems(projectId);
  const { data: coverage, isLoading: coverageLoading } = useFfeInvoiceCoverage(
    projectId,
    {
      enabled: !!projectId,
    },
  );

  const createDraft = useCreateDraftInvoice({ errorSurface: 'inline' });
  const createStudioDraft = useCreateDraftStudioInvoice({
    errorSurface: 'inline',
  });
  const deleteDraft = useDeleteDraftInvoice({ errorSurface: 'inline' });
  const claimTime = useClaimTimeEntries({ errorSurface: 'inline' });

  // ── Selections ────────────────────────────────────────────────────────────
  const [tickedMilestoneIds, setTickedMilestoneIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tickedTimeIds, setTickedTimeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [tickedFfeIds, setTickedFfeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [adhoc, setAdhoc] = useState<ComposerAdhocRow[]>([{ ...EMPTY_ADHOC }]);
  // Studio mode's own three fields (S4 · S12 · S8).
  const [studioClientId, setStudioClientId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [chosenStudioId, setChosenStudioId] = useState('');
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

  // S8 — the studio line appears only when there is a choice to make.
  const studios = useMemo(
    () => activeDesignStudios((organizations ?? []) as ComposerStudio[]),
    [organizations],
  );
  const multiStudio = studios.length > 1;
  const studioId = chosenStudioId || studios[0]?.id || '';
  // Nothing to bill from: the Draft act can never open, so say so (R83).
  const studioMissing =
    studioMode && !organizationsLoading && studios.length === 0;

  // ── Milestones: billable = pending/outstanding, not on a live invoice ─────
  const offerableMilestones = useMemo(
    () =>
      unbilledMilestones(
        (milestones ?? []) as ComposerMilestone[],
        (projectInvoices ?? []) as AnyRecord[],
      ),
    [milestones, projectInvoices],
  );

  // ── FF&E: every billable line of the project, coverage-partitioned ────────
  const ffeSettled = !!projectId && !ffeLoading && !coverageLoading;
  const ffePartition = useMemo(
    () =>
      partitionFfeBillable(
        (ffeItems ?? []) as Array<ComposerFfeItem & AnyRecord>,
        ffeSettled ? coverage : undefined,
      ),
    [ffeItems, coverage, ffeSettled],
  );

  const unbilledEntries = useMemo(
    () => unbilledTime?.entries ?? [],
    [unbilledTime],
  );

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
        new Set(
          (context.initialFfeItemIds ?? []).filter((id) => billableIds.has(id)),
        ),
      );
    }
    if (wantsTime) {
      const entryIds = new Set(unbilledEntries.map((e) => e.id));
      setTickedTimeIds(
        new Set(
          (context.initialTimeEntryIds ?? []).filter((id) => entryIds.has(id)),
        ),
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

  // Switching targets drops every selection — a line must bill an item that
  // belongs to the invoice's own project, and a studio invoice carries none.
  const pickTarget = (next: string) => {
    if (next === STUDIO_TARGET) {
      try {
        documentEvents.actionSelected(STUDIO_CHOICE_EVENT);
      } catch (e) {
        console.error('[analytics] actionSelected threw', e);
      }
    }
    setTarget(next);
    setTickedMilestoneIds(new Set());
    setTickedTimeIds(new Set());
    setTickedFfeIds(new Set());
    setSeededFor(null);
    setError(null);
  };

  // The shown half of the pair, fired once the choice is actually on offer.
  const choiceShown = useRef(false);
  useEffect(() => {
    if (!studioChoiceAvailable || choiceShown.current) return;
    choiceShown.current = true;
    try {
      documentEvents.actionShown(STUDIO_CHOICE_EVENT);
    } catch (e) {
      console.error('[analytics] actionShown threw', e);
    }
  }, [studioChoiceAvailable]);

  // ── Assembly ──────────────────────────────────────────────────────────────
  const taxRate = useMemo(() => {
    const parsed = parseFloat(taxRatePercent);
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed / 100;
  }, [taxRatePercent]);

  // S6 — a studio invoice carries ad-hoc lines and nothing else. Milestones,
  // time and FF&E all belong to a house; the RPC refuses their kinds outright.
  const selection = useMemo(
    () =>
      studioMode
        ? { milestones: [], ffeItems: [], timeEntries: [], adhoc }
        : {
            milestones: offerableMilestones.filter((m) =>
              tickedMilestoneIds.has(m.id),
            ),
            ffeItems: ffePartition.billable.filter((i) =>
              tickedFfeIds.has(i.id),
            ),
            timeEntries: unbilledEntries.filter((e) => tickedTimeIds.has(e.id)),
            adhoc,
          },
    [
      studioMode,
      offerableMilestones,
      tickedMilestoneIds,
      ffePartition,
      tickedFfeIds,
      unbilledEntries,
      tickedTimeIds,
      adhoc,
    ],
  );
  const lines = useMemo(() => buildComposerLines(selection), [selection]);
  const totals = useMemo(
    () =>
      computeInvoiceTotals(
        lines.map((l) => ({
          quantity: l.quantity,
          unit_amount_cents: l.unitAmountCents,
        })),
        taxRate,
      ),
    [lines, taxRate],
  );

  const creating =
    createDraft.isPending ||
    createStudioDraft.isPending ||
    claimTime.isPending ||
    deleteDraft.isPending;
  // Block drafting while a prefilled section is still resolving — otherwise a
  // draft could land moments before its prefill arrives, silently dropping it.
  const prefillPending =
    seededFor !== projectId &&
    ((context.initialFfeItemIds ?? []).length > 0 ||
      (context.initialTimeEntryIds ?? []).length > 0);
  const canDraft = studioMode
    ? canDraftStudioInvoice({
        clientId: studioClientId,
        title,
        studioId,
        lines,
      }) && !creating
    : !!projectId && lines.length > 0 && !creating && !prefillPending;

  const draft = async () => {
    setError(null);

    if (studioMode) {
      // No project, no milestones, no time to claim — one call, then the folio.
      try {
        const studioInvoiceId = await createStudioDraft.mutateAsync({
          clientId: studioClientId as string,
          studioId,
          title: title.trim(),
          taxRate,
          paymentTermsDays:
            parseInt(termsDays, 10) >= 0 ? parseInt(termsDays, 10) : 15,
          memo: memo.trim() || undefined,
          lines,
        });
        onDrafted(studioInvoiceId, null);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'Could not draft the invoice',
        );
      }
      return;
    }

    const timeLine = lines.find((l) => l.kind === 'time');
    let invoice: AnyRecord;
    try {
      invoice = await createDraft.mutateAsync({
        projectId,
        clientId: selectedProject?.client_id ?? null,
        taxRate,
        paymentTermsDays:
          parseInt(termsDays, 10) >= 0 ? parseInt(termsDays, 10) : 15,
        memo: memo.trim() || undefined,
        lines,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft the invoice');
      return;
    }

    if (timeLine) {
      const entryIds =
        (timeLine.metadata as { time_entry_ids?: string[] })?.time_entry_ids ??
        [];
      try {
        await claimTime.mutateAsync({
          invoiceId: invoice.id,
          projectId,
          entryIds,
        });
      } catch (e) {
        try {
          await deleteDraft.mutateAsync({ invoiceId: invoice.id, projectId });
        } catch {
          /* the draft survives with an unclaimed time line — voidable */
        }
        setError(
          e instanceof Error ? e.message : 'Could not attach the time entries',
        );
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
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak,#8B7355)]">
          Studio eyes only
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
        Everything billable pulls through below — tick what this invoice should
        carry, in any order. The draft opens as the folio to issue &amp; send.
      </p>

      {/* ── What it bills: a house, or the studio itself (R136) ─────────── */}
      <div className="mt-3 border-t border-[var(--color-pearl)] pt-2.5">
        <p className={`${LABEL} mb-1`}>
          {studioChoiceAvailable ? 'for' : 'the document'}
        </p>
        {context.projectId && selectedProject ? (
          <p className="text-[12.5px] font-medium text-[var(--color-charcoal)]">
            {selectedProject.name}
          </p>
        ) : (
          <select
            value={target}
            onChange={(e) => pickTarget(e.target.value)}
            aria-label={studioChoiceAvailable ? 'For' : 'Project'}
            className={`${INPUT} w-full max-w-[360px] [&_option]:bg-[var(--doc-paper,#FAF7F2)]`}
          >
            <option value="">Pick a document…</option>
            {studioChoiceAvailable && (
              <option value={STUDIO_TARGET}>the studio · no house</option>
            )}
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── The studio's own three fields (S8 · S4 · S12) ───────────────── */}
      {studioMode && (
        <>
          {multiStudio && (
            <div className="mt-4">
              <p className={`${LABEL} mb-1`}>studio</p>
              <select
                value={studioId}
                onChange={(e) => setChosenStudioId(e.target.value)}
                aria-label="Studio"
                className={`${INPUT} w-full max-w-[360px] [&_option]:bg-[var(--doc-paper,#FAF7F2)]`}
              >
                {studios.map((studio) => (
                  <option key={studio.id} value={studio.id}>
                    {studio.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mt-4 max-w-[360px]">
            <p className={`${LABEL} mb-1`}>household</p>
            {/* The picker portals to <body>; this sheet is z-[60], so the panel
                is lifted clear of it (client-picker.tsx popoverClassName). */}
            <ClientPicker
              value={studioClientId}
              onChange={setStudioClientId}
              ariaLabel="Household"
              placeholder="Search or add a household…"
              popoverClassName="z-[70]"
            />
          </div>

          <label className="mt-4 flex max-w-[420px] flex-col gap-0.5">
            <span className={LABEL}>regarding</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Design consultation · Sept 2026"
              // 00571 bounds the regarding line at 200 characters.
              maxLength={200}
              className={INPUT}
            />
          </label>
        </>
      )}

      {(studioMode || projectId) && (
        <>
          {!studioMode && (
            <>
              {/* ── Milestones (00204) ─────────────────────────────────────── */}
              <div className="mt-4">
                <p className={`${LABEL} mb-0.5`}>
                  payment milestones · unbilled
                </p>
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
                      <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                        {m.status === 'outstanding' ? 'due now' : 'upcoming'}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
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
                      className="ml-2 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-clay-ink)] hover:opacity-80"
                    >
                      {tickedTimeIds.size === unbilledEntries.length
                        ? 'clear all'
                        : 'tick all'}
                    </button>
                  )}
                </p>
                {timeLoading ? (
                  <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
                    Reading the hours…
                  </p>
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
                            <span className="ml-1.5 text-[var(--text-muted)]">
                              {entry.notes}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                          {formatHoursLabel(entry.duration_minutes)} ·{' '}
                          {formatCurrency(entry.resolved_rate_cents)}/h
                        </span>
                        <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                          {formatCurrency(entry.amount_cents)}
                        </span>
                      </label>
                    ))}
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      ticked entries bill as one line and lock to the draft ·
                      voiding releases them
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
                          <span className="ml-1.5 text-[var(--text-muted)]">
                            {it.room.name}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                        ×{it.quantity ?? 1}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                        {formatCurrency(
                          (it.quantity ?? 1) * (it.unit_price_cents ?? 0),
                        )}
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
                    Nothing uninvoiced — every priced line is billed.
                  </p>
                )}
                {(skippedFfe.covered > 0 ||
                  skippedFfe.unpriced > 0 ||
                  ffePartition.unpriced.length > 0) && (
                  <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
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
            </>
          )}

          {/* ── Ad-hoc lines ───────────────────────────────────────────── */}
          <div className="mt-4">
            <p className={`${LABEL} mb-1`}>ad-hoc lines</p>
            {adhoc.map((line, i) => (
              <div
                key={i}
                className="mb-1.5 grid grid-cols-[1fr_56px_96px_24px] items-center gap-2"
              >
                <input
                  placeholder="Description — e.g. design consultation"
                  aria-label="Line description"
                  value={line.description}
                  onChange={(e) =>
                    setAdhoc((prev) =>
                      prev.map((l, j) =>
                        j === i ? { ...l, description: e.target.value } : l,
                      ),
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
                      prev.map((l, j) =>
                        j === i ? { ...l, quantity: e.target.value } : l,
                      ),
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
                      prev.map((l, j) =>
                        j === i ? { ...l, unitDollars: e.target.value } : l,
                      ),
                    )
                  }
                  className={`${INPUT} text-right`}
                />
                <button
                  type="button"
                  aria-label="Remove line"
                  onClick={() =>
                    setAdhoc((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="text-[13px] text-[var(--text-muted)] hover:text-[var(--color-terracotta-ink)]"
                >
                  ×
                </button>
              </div>
            ))}
            <DocumentAction
              actionKey="add-invoice-line"
              surfaceKey="accounts"
              regionKey="invoice-lines"
              variant="secondary"
              onClick={() => setAdhoc((prev) => [...prev, { ...EMPTY_ADHOC }])}
              className="mt-1"
            >
              Add line
            </DocumentAction>
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
                <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                  {formatCurrency(totals.subtotalCents)}
                </span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className={LABEL}>tax</span>
                <span className="font-mono text-[11px] text-[var(--color-charcoal)]">
                  {formatCurrency(totals.taxCents)}
                </span>
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className={LABEL}>total</span>
                <span className="font-mono text-[12px] font-semibold text-[var(--color-charcoal)]">
                  {formatCurrency(totals.totalCents)}
                </span>
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                {lines.length} line{lines.length === 1 ? '' : 's'}
              </span>
            </div>
            <DocumentAction
              actionKey="draft-invoice"
              surfaceKey="accounts"
              regionKey="invoice-composer"
              variant="primary"
              disabled={!canDraft}
              loading={creating}
              loadingLabel="Drafting…"
              onClick={() => void draft()}
            >
              Draft the invoice
            </DocumentAction>
          </div>

          {studioMissing && (
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
              no studio to draw from · this account belongs to none yet
            </p>
          )}

          {/* R83 — the inline failure band, at the act site. */}
          {error && (
            <div
              className="mt-2 rounded-[3px] border border-[rgba(196,131,111,0.4)] px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em]"
              style={{ color: TERRACOTTA_INK }}
            >
              {error}
              <DocumentActionGroup
                surfaceKey="accounts"
                regionKey="invoice-draft-error"
                className="mt-2"
              >
                <DocumentAction
                  actionKey="retry-draft-invoice"
                  variant="primary"
                  onClick={() => void draft()}
                >
                  Try again
                </DocumentAction>
              </DocumentActionGroup>
            </div>
          )}
        </>
      )}
    </div>
  );
}
