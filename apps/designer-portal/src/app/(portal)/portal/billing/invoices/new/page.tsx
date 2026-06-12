'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useProjects,
  useProjectPaymentMilestones,
  useProjectInvoices,
  useCreateDraftInvoice,
  useDeleteDraftInvoice,
  useFfeInvoiceCoverage,
  type DraftLineInput,
} from '@patina/supabase';
import { computeInvoiceTotals, formatCurrency } from '@patina/shared';
import { ListPageHeader } from '@/components/portal/list-page-header';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { Button, Input, Select, Textarea } from '@/components/ui/controls';
import { useHydrated } from '@/hooks/use-hydrated';
import { useProjectFFEItems } from '@/hooks/use-projects';
import { useUnbilledTime, useClaimTimeEntries } from '@/hooks/use-time-tracking';
import { buildTimeLineDraft, formatHoursLabel } from '@/lib/time-billing';

interface AdHocLine {
  description: string;
  quantity: string;
  unitDollars: string;
}

interface MilestoneRow {
  id: string;
  label: string;
  amount_cents: number;
  status: string;
}

const EMPTY_ADHOC: AdHocLine = { description: '', quantity: '1', unitDollars: '' };

function dollarsToCents(value: string): number {
  const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

const sectionLabelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-meta)',
  fontSize: '0.62rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
};

export default function NewInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useHydrated();

  const preselectProjectId = searchParams.get('projectId') ?? '';
  const preselectMilestoneId = searchParams.get('milestoneId');
  // W3-T4 — FF&E deep link from the board's "Invoice Items" bulk action and
  // the Order Assistant coverage step: ?ffeItemIds=a,b,c prefills one 'ffe'
  // line per item (00187).
  const preselectFfeItemIds = useMemo(() => {
    const raw = searchParams.get('ffeItemIds');
    return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  }, [searchParams]);

  const [projectId, setProjectId] = useState(preselectProjectId);
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<Set<string>>(
    () => new Set(preselectMilestoneId ? [preselectMilestoneId] : [])
  );
  const [selectedTimeIds, setSelectedTimeIds] = useState<Set<string>>(() => new Set());
  // FF&E prefill rows start CHECKED; we track unchecks (not checks) so the
  // default selection needs no seeding effect against late-arriving queries.
  const [deselectedFfeIds, setDeselectedFfeIds] = useState<Set<string>>(() => new Set());
  const [adHocLines, setAdHocLines] = useState<AdHocLine[]>([{ ...EMPTY_ADHOC }]);
  const [taxRatePercent, setTaxRatePercent] = useState('0');
  const [termsDays, setTermsDays] = useState('15');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The FF&E prefill is only honored while the composer still points at the
  // project the deep link came from — switching projects drops it (an FF&E
  // line must bill an item belonging to the invoice's own project).
  const ffeActive = preselectFfeItemIds.length > 0 && !!projectId && projectId === preselectProjectId;

  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: milestones } = useProjectPaymentMilestones(projectId);
  const { data: projectInvoices } = useProjectInvoices(projectId || null);
  const { data: unbilledTime } = useUnbilledTime(projectId || null);
  const { data: ffeItems, isLoading: ffeItemsLoading } = useProjectFFEItems(
    ffeActive ? projectId : null
  );
  // Coverage (00187 get_ffe_invoice_coverage): the DB allows ONE live invoice
  // line per FF&E item, so items already invoiced/paid must not be offered.
  const { data: ffeCoverage, isLoading: ffeCoverageLoading } = useFfeInvoiceCoverage(
    preselectProjectId,
    { enabled: ffeActive }
  );
  const createDraft = useCreateDraftInvoice();
  const deleteDraft = useDeleteDraftInvoice();
  const claimTime = useClaimTimeEntries();

  const activeProjects = useMemo(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((projects ?? []) as any[]).filter(
        (p) => p.status === 'active' || p.status === 'planning'
      ),
    [projects]
  );

  const selectedProject = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => ((projects ?? []) as any[]).find((p) => p.id === projectId),
    [projects, projectId]
  );

  // A milestone is billable when it isn't paid and isn't already on a live
  // (non-void) invoice — void released its slot.
  const billedMilestoneIds = useMemo(() => {
    const ids = new Set<string>();
    for (const invoice of projectInvoices ?? []) {
      if (invoice.status === 'void') continue;
      for (const line of invoice.line_items ?? []) {
        if (line.milestone_id) ids.add(line.milestone_id);
      }
    }
    return ids;
  }, [projectInvoices]);

  const unbilledMilestones = useMemo(
    () =>
      ((milestones ?? []) as MilestoneRow[]).filter(
        (m) =>
          (m.status === 'pending' || m.status === 'outstanding') &&
          !billedMilestoneIds.has(m.id)
      ),
    [milestones, billedMilestoneIds]
  );

  const unbilledEntries = useMemo(() => unbilledTime?.entries ?? [], [unbilledTime]);

  // Drop selections that no longer apply when the project changes — but only
  // once the query has actually returned, otherwise the ?milestoneId=
  // preselect is pruned against an empty list before the data arrives.
  useEffect(() => {
    if (!milestones) return;
    setSelectedMilestoneIds((prev) => {
      const valid = new Set(unbilledMilestones.map((m) => m.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [milestones, unbilledMilestones]);

  useEffect(() => {
    if (!unbilledTime) return;
    setSelectedTimeIds((prev) => {
      const valid = new Set(unbilledEntries.map((e) => e.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [unbilledTime, unbilledEntries]);

  // FF&E prefill partition (W3-T4). Requested ids resolve against the
  // project's items, then split: already covered by a LIVE invoice line
  // (coverage 'invoiced'/'paid' — the 00187 partial-unique guard would reject
  // them) and unpriced (NULL client unit price — nothing to bill) are
  // skipped with a notice; the rest prefill as billable rows. Held empty
  // until both queries settle so a covered item never flashes in as billable.
  const ffeSectionLoading = ffeActive && (ffeItemsLoading || ffeCoverageLoading);
  const ffePrefill = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const billable: any[] = [];
    let skippedCovered = 0;
    let skippedUnpriced = 0;
    if (!ffeActive || ffeSectionLoading) return { billable, skippedCovered, skippedUnpriced };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const byId = new Map(((ffeItems ?? []) as any[]).map((it) => [it.id, it]));
    for (const id of preselectFfeItemIds) {
      const item = byId.get(id);
      if (!item) continue; // not in this project / RLS-hidden — quietly drop
      const cov = ffeCoverage?.[id];
      if (cov && cov.coverage !== 'uninvoiced') {
        skippedCovered += 1;
        continue;
      }
      if (item.unit_price_cents === null || item.unit_price_cents === undefined) {
        skippedUnpriced += 1;
        continue;
      }
      billable.push(item);
    }
    return { billable, skippedCovered, skippedUnpriced };
  }, [ffeActive, ffeSectionLoading, ffeItems, ffeCoverage, preselectFfeItemIds]);

  // ONE kind='time' line per invoice: qty 1, unit = amount = the sum of the
  // selected entries' view-resolved amounts; hours + entry ids ride in the
  // description/metadata (see lib/time-billing.ts for the rationale).
  const timeLine = useMemo(
    () => buildTimeLineDraft(unbilledEntries.filter((e) => selectedTimeIds.has(e.id))),
    [unbilledEntries, selectedTimeIds]
  );

  const lines: DraftLineInput[] = useMemo(() => {
    const milestoneLines: DraftLineInput[] = unbilledMilestones
      .filter((m) => selectedMilestoneIds.has(m.id))
      .map((m, i) => ({
        kind: 'milestone' as const,
        milestoneId: m.id,
        description: m.label,
        quantity: 1,
        unitAmountCents: m.amount_cents,
        sortOrder: i,
      }));
    // FF&E lines (W3-T4): one per billable prefilled item still checked.
    // `ffeItemId` makes buildLineRow write kind 'ffe' + ffe_item_id (00187).
    const ffeLines: DraftLineInput[] = ffePrefill.billable
      .filter((it) => !deselectedFfeIds.has(it.id))
      .map((it, i) => ({
        ffeItemId: it.id as string,
        description: it.room?.name ? `${it.name} — ${it.room.name}` : it.name,
        quantity: it.quantity ?? 1,
        unitAmountCents: it.unit_price_cents,
        sortOrder: milestoneLines.length + i,
      }));
    const timeLines: DraftLineInput[] = timeLine
      ? [
          {
            kind: 'time' as const,
            description: timeLine.description,
            quantity: 1,
            unitAmountCents: timeLine.amountCents,
            sortOrder: milestoneLines.length + ffeLines.length,
            metadata: {
              time_entry_ids: timeLine.entryIds,
              total_minutes: timeLine.totalMinutes,
            },
          },
        ]
      : [];
    const adhoc: DraftLineInput[] = adHocLines
      .filter((l) => l.description.trim() && dollarsToCents(l.unitDollars) > 0)
      .map((l, i) => ({
        kind: 'adhoc' as const,
        description: l.description.trim(),
        quantity: parseFloat(l.quantity) > 0 ? parseFloat(l.quantity) : 1,
        unitAmountCents: dollarsToCents(l.unitDollars),
        sortOrder: milestoneLines.length + ffeLines.length + timeLines.length + i,
      }));
    return [...milestoneLines, ...ffeLines, ...timeLines, ...adhoc];
  }, [
    unbilledMilestones,
    selectedMilestoneIds,
    ffePrefill,
    deselectedFfeIds,
    timeLine,
    adHocLines,
  ]);

  const taxRate = useMemo(() => {
    const parsed = parseFloat(taxRatePercent);
    return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed / 100;
  }, [taxRatePercent]);

  const totals = useMemo(
    () =>
      computeInvoiceTotals(
        lines.map((l) => ({ quantity: l.quantity, unit_amount_cents: l.unitAmountCents })),
        taxRate
      ),
    [lines, taxRate]
  );

  const creating = createDraft.isPending || claimTime.isPending || deleteDraft.isPending;
  // Block create while the FF&E prefill is still resolving — otherwise a
  // milestone/adhoc-only draft can be created moments before the ffe lines
  // arrive, silently dropping them from the invoice.
  const canCreate = !!projectId && lines.length > 0 && !creating && !(ffeActive && ffeSectionLoading);

  const handleCreate = async () => {
    setError(null);
    let invoice;
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
      setError(e instanceof Error ? e.message : 'Failed to create invoice');
      return;
    }

    // Claim the time entries onto the draft (stamps invoice_id → the 00177
    // trigger locks them). If a concurrent invoice grabbed any of them, the
    // claim rolls itself back — compensate by deleting the just-created draft
    // so no orphaned time line survives, and let the section refresh.
    if (timeLine) {
      try {
        await claimTime.mutateAsync({
          invoiceId: invoice.id,
          projectId,
          entryIds: timeLine.entryIds,
        });
      } catch (e) {
        try {
          await deleteDraft.mutateAsync({ invoiceId: invoice.id, projectId });
        } catch {
          /* the draft survives with an unclaimed time line — designer can void it */
        }
        setError(e instanceof Error ? e.message : 'Failed to attach time entries');
        return;
      }
    }

    router.push(`/portal/billing/invoices/${invoice.id}`);
  };

  if (!hydrated || projectsLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <ListPageHeader
        title="New Invoice"
        subtitle="Pick a project, choose what to bill, and save a draft."
      />

      <div className="max-w-3xl">
        {/* Project */}
        <div className="mb-8">
          <div className="mb-2" style={sectionLabelStyle}>
            Project
          </div>
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            wrapperClassName="max-w-md"
          >
            <option value="">Select a project…</option>
            {activeProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        {/* Milestones */}
        {projectId && (
          <div className="mb-8">
            <div className="mb-2" style={sectionLabelStyle}>
              Unbilled Payment Milestones
            </div>
            {unbilledMilestones.length > 0 ? (
              <div className="rounded-md border border-[var(--border-default)]">
                {unbilledMilestones.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-baseline gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5 last:border-b-0 hover:bg-[var(--bg-hover)]"
                  >
                    <input
                      type="checkbox"
                      className="relative top-[1px] accent-[var(--accent-primary)]"
                      checked={selectedMilestoneIds.has(m.id)}
                      onChange={(e) => {
                        setSelectedMilestoneIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(m.id);
                          else next.delete(m.id);
                          return next;
                        });
                      }}
                    />
                    <span className="type-body flex-1 text-[0.85rem]">{m.label}</span>
                    <span className="type-meta-small text-[var(--text-muted)]">
                      {m.status === 'outstanding' ? 'Due now' : 'Upcoming'}
                    </span>
                    <span className="font-heading text-[0.85rem]">
                      {formatCurrency(m.amount_cents)}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="type-body py-2 text-[0.82rem] italic text-[var(--text-muted)]">
                No unbilled milestones on this project — add ad-hoc lines below.
              </p>
            )}
          </div>
        )}

        {/* FF&E items (W3-T4 deep link — board "Invoice Items" / Order
            Assistant coverage step). Covered + unpriced requests are skipped
            with a notice; the rest prefill as checked rows. */}
        {ffeActive && (
          <div className="mb-8">
            <div className="mb-2" style={sectionLabelStyle}>
              FF&amp;E Items
            </div>
            {ffeSectionLoading ? (
              <p className="type-body py-2 text-[0.82rem] italic text-[var(--text-muted)]">
                Loading FF&amp;E items…
              </p>
            ) : (
              <>
                {ffePrefill.billable.length > 0 ? (
                  <div className="rounded-md border border-[var(--border-default)]">
                    {ffePrefill.billable.map((it) => (
                      <label
                        key={it.id}
                        className="flex cursor-pointer items-baseline gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5 last:border-b-0 hover:bg-[var(--bg-hover)]"
                      >
                        <input
                          type="checkbox"
                          className="relative top-[1px] accent-[var(--accent-primary)]"
                          checked={!deselectedFfeIds.has(it.id)}
                          onChange={(e) => {
                            setDeselectedFfeIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.delete(it.id);
                              else next.add(it.id);
                              return next;
                            });
                          }}
                        />
                        <span className="type-body min-w-0 flex-1 truncate text-[0.85rem]">
                          {it.name}
                          {it.room?.name && (
                            <span className="ml-2 text-[var(--text-muted)]">{it.room.name}</span>
                          )}
                        </span>
                        <span className="type-meta-small text-[var(--text-muted)]">
                          ×{it.quantity ?? 1}
                        </span>
                        <span className="font-heading text-[0.85rem]">
                          {formatCurrency((it.quantity ?? 1) * (it.unit_price_cents ?? 0))}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="type-body py-2 text-[0.82rem] italic text-[var(--text-muted)]">
                    None of the requested FF&amp;E items can be invoiced.
                  </p>
                )}
                {(ffePrefill.skippedCovered > 0 || ffePrefill.skippedUnpriced > 0) && (
                  <p className="type-meta-small mt-2 text-[var(--text-muted)]">
                    {[
                      ffePrefill.skippedCovered > 0
                        ? `${ffePrefill.skippedCovered} already-invoiced item${
                            ffePrefill.skippedCovered === 1 ? '' : 's'
                          } skipped`
                        : null,
                      ffePrefill.skippedUnpriced > 0
                        ? `${ffePrefill.skippedUnpriced} unpriced item${
                            ffePrefill.skippedUnpriced === 1 ? '' : 's'
                          } skipped — set a client price first`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    .
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Unbilled time (00177 pull-through) */}
        {projectId && unbilledEntries.length > 0 && (
          <div className="mb-8">
            <div className="mb-2 flex items-baseline justify-between">
              <div style={sectionLabelStyle}>Unbilled Time</div>
              <button
                type="button"
                className="type-meta-small cursor-pointer text-[var(--accent-primary)] hover:text-[var(--text-primary)]"
                onClick={() =>
                  setSelectedTimeIds((prev) =>
                    prev.size === unbilledEntries.length
                      ? new Set()
                      : new Set(unbilledEntries.map((e) => e.id))
                  )
                }
              >
                {selectedTimeIds.size === unbilledEntries.length ? 'Clear all' : 'Select all'}
              </button>
            </div>
            <div className="rounded-md border border-[var(--border-default)]">
              {unbilledEntries.map((entry) => (
                <label
                  key={entry.id}
                  className="flex cursor-pointer items-baseline gap-3 border-b border-[var(--border-subtle)] px-4 py-2.5 last:border-b-0 hover:bg-[var(--bg-hover)]"
                >
                  <input
                    type="checkbox"
                    className="relative top-[1px] accent-[var(--accent-primary)]"
                    checked={selectedTimeIds.has(entry.id)}
                    onChange={(e) => {
                      setSelectedTimeIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(entry.id);
                        else next.delete(entry.id);
                        return next;
                      });
                    }}
                  />
                  <span className="type-body min-w-0 flex-1 truncate text-[0.85rem]">
                    {new Date(entry.started_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {entry.notes && (
                      <span className="ml-2 text-[var(--text-muted)]">{entry.notes}</span>
                    )}
                  </span>
                  <span className="type-meta-small text-[var(--text-muted)]">
                    {formatHoursLabel(entry.duration_minutes)}
                  </span>
                  <span className="font-heading text-[0.85rem]">
                    {formatCurrency(entry.amount_cents)}
                  </span>
                </label>
              ))}
            </div>
            <p className="type-meta-small mt-2 text-[var(--text-muted)]">
              {timeLine
                ? `Billing ${formatHoursLabel(timeLine.totalMinutes)} as one line — ${formatCurrency(timeLine.amountCents)}. Selected entries lock once the draft is created; voiding releases them.`
                : 'Selected entries are billed as a single line and locked to this invoice.'}
            </p>
          </div>
        )}

        {/* Ad-hoc lines */}
        <div className="mb-8">
          <div className="mb-2" style={sectionLabelStyle}>
            Ad-hoc Line Items
          </div>
          {adHocLines.map((line, i) => (
            <div
              key={i}
              className="mb-2 grid items-center gap-2"
              style={{ gridTemplateColumns: '1fr 80px 130px 32px' }}
            >
              <Input
                placeholder="Description (e.g. Design consultation)"
                value={line.description}
                onChange={(e) =>
                  setAdHocLines((prev) =>
                    prev.map((l, j) => (j === i ? { ...l, description: e.target.value } : l))
                  )
                }
              />
              <Input
                placeholder="Qty"
                inputMode="decimal"
                value={line.quantity}
                onChange={(e) =>
                  setAdHocLines((prev) =>
                    prev.map((l, j) => (j === i ? { ...l, quantity: e.target.value } : l))
                  )
                }
              />
              <Input
                placeholder="Unit price ($)"
                inputMode="decimal"
                value={line.unitDollars}
                onChange={(e) =>
                  setAdHocLines((prev) =>
                    prev.map((l, j) => (j === i ? { ...l, unitDollars: e.target.value } : l))
                  )
                }
              />
              <button
                type="button"
                aria-label="Remove line"
                className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--color-error)]"
                onClick={() => setAdHocLines((prev) => prev.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setAdHocLines((prev) => [...prev, { ...EMPTY_ADHOC }])}
          >
            + Add line
          </Button>
        </div>

        {/* Terms */}
        <div className="mb-8 grid max-w-md grid-cols-2 gap-4">
          <div>
            <div className="mb-2" style={sectionLabelStyle}>
              Tax Rate (%)
            </div>
            <Input
              inputMode="decimal"
              value={taxRatePercent}
              onChange={(e) => setTaxRatePercent(e.target.value)}
            />
          </div>
          <div>
            <div className="mb-2" style={sectionLabelStyle}>
              Payment Terms (days)
            </div>
            <Input
              inputMode="numeric"
              value={termsDays}
              onChange={(e) => setTermsDays(e.target.value)}
            />
          </div>
        </div>

        {/* Memo */}
        <div className="mb-8 max-w-xl">
          <div className="mb-2" style={sectionLabelStyle}>
            Memo (shown to client)
          </div>
          <Textarea
            rows={3}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Thank you for your business…"
          />
        </div>

        {/* Totals + actions */}
        <div className="mb-4 max-w-md border-t border-[var(--border-default)] pt-4">
          <div className="flex justify-between py-1">
            <span className="type-meta-small">Subtotal</span>
            <span className="font-heading text-[0.9rem]">
              {formatCurrency(totals.subtotalCents)}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="type-meta-small">Tax</span>
            <span className="font-heading text-[0.9rem]">{formatCurrency(totals.taxCents)}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--border-subtle)] py-2">
            <span className="type-label">Total</span>
            <span className="font-heading text-[1.1rem] font-semibold">
              {formatCurrency(totals.totalCents)}
            </span>
          </div>
        </div>

        {error && (
          <p className="type-body mb-4 text-[0.82rem] text-[var(--color-error)]">{error}</p>
        )}

        <div className="flex gap-2 pb-12">
          <Button
            type="button"
            variant="primary"
            disabled={!canCreate}
            loading={creating}
            onClick={handleCreate}
          >
            Create draft
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
