'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useProjects,
  useProjectPaymentMilestones,
  useProjectInvoices,
  useCreateDraftInvoice,
  type DraftLineInput,
} from '@patina/supabase';
import { computeInvoiceTotals, formatCurrency } from '@patina/shared';
import { ListPageHeader } from '@/components/portal/list-page-header';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { Button, Input, Select, Textarea } from '@/components/ui/controls';
import { useHydrated } from '@/hooks/use-hydrated';

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

  const [projectId, setProjectId] = useState(preselectProjectId);
  const [selectedMilestoneIds, setSelectedMilestoneIds] = useState<Set<string>>(
    () => new Set(preselectMilestoneId ? [preselectMilestoneId] : [])
  );
  const [adHocLines, setAdHocLines] = useState<AdHocLine[]>([{ ...EMPTY_ADHOC }]);
  const [taxRatePercent, setTaxRatePercent] = useState('0');
  const [termsDays, setTermsDays] = useState('15');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: milestones } = useProjectPaymentMilestones(projectId);
  const { data: projectInvoices } = useProjectInvoices(projectId || null);
  const createDraft = useCreateDraftInvoice();

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

  // Drop selections that no longer apply when the project changes.
  useEffect(() => {
    setSelectedMilestoneIds((prev) => {
      const valid = new Set(unbilledMilestones.map((m) => m.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [unbilledMilestones]);

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
    const adhoc: DraftLineInput[] = adHocLines
      .filter((l) => l.description.trim() && dollarsToCents(l.unitDollars) > 0)
      .map((l, i) => ({
        kind: 'adhoc' as const,
        description: l.description.trim(),
        quantity: parseFloat(l.quantity) > 0 ? parseFloat(l.quantity) : 1,
        unitAmountCents: dollarsToCents(l.unitDollars),
        sortOrder: milestoneLines.length + i,
      }));
    return [...milestoneLines, ...adhoc];
  }, [unbilledMilestones, selectedMilestoneIds, adHocLines]);

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

  const canCreate = !!projectId && lines.length > 0 && !createDraft.isPending;

  const handleCreate = async () => {
    setError(null);
    try {
      const invoice = await createDraft.mutateAsync({
        projectId,
        clientId: selectedProject?.client_id ?? null,
        taxRate,
        paymentTermsDays: parseInt(termsDays, 10) >= 0 ? parseInt(termsDays, 10) : 15,
        memo: memo.trim() || undefined,
        lines,
      });
      router.push(`/portal/billing/invoices/${invoice.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create invoice');
    }
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
            loading={createDraft.isPending}
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
