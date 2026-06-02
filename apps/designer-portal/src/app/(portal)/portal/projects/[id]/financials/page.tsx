'use client';

import { use, useMemo, useState } from 'react';
import { useProject, useProjectFinancials, useProjectMilestones, useProjectFFEItems } from '@/hooks/use-projects';
import { useAuth } from '@/hooks/use-auth';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { MetricBlock } from '@/components/portal/metric-block';
import { PaymentMilestoneCard } from '@/components/portal/payment-milestone-card';
import { DetailRow } from '@/components/portal/detail-row';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
// F1.7 — Financials is the most information-dense designer-portal surface.
// Every Patina-coined concept (committed vs actual, variance bands, commission
// rate, milestone triggers) earns a StrataInfoIcon. The variance-band
// computation deserves a LearnMore so designers can understand the color
// thresholds without leaving the page. Empty states for missing milestones
// and the drill-down route to dedicated CMS surfaces.
import {
  EmptyState,
  LearnMore,
  SectionIntro,
  StrataInfoIcon,
  SurfaceKeys,
  useHelpContent,
} from '@patina/help-system';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

function formatCurrency(cents: number): string {
  return `$${((cents || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatCurrencyCompact(cents: number): string {
  const dollars = (cents || 0) / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(dollars >= 10000 ? 0 : 1)}k`;
  return `$${dollars.toLocaleString()}`;
}

// Variance color per spec: <0% Sage, 0-5% Clay, 5-10% Gold, >10% Terracotta
function varianceColor(budgetCents: number, actualCents: number): string {
  if (budgetCents <= 0) return 'var(--text-muted)';
  const overUnder = (actualCents - budgetCents) / budgetCents;
  if (overUnder < 0) return 'var(--color-sage, #A8B5A0)';
  if (overUnder < 0.05) return 'var(--color-clay, #C4A57B)';
  if (overUnder < 0.1) return 'var(--color-golden-hour, #E8C547)';
  return 'var(--color-terracotta, #D4A090)';
}

interface VarianceRow {
  category: string;
  budget: number;
  committed: number;
  actual: number;
  variance: number;
  variancePct: number;
}

export default function ProjectFinancialsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const hydrated = useHydrated();
  const { user } = useAuth();
  const { data: project, isLoading } = useProject(id) as { data: AnyData; isLoading: boolean };
  const { data: financials } = useProjectFinancials(id);
  const { data: milestones = [] } = useProjectMilestones(id);
  const { data: ffeItems = [] } = useProjectFFEItems(id);

  const [drillCategory, setDrillCategory] = useState<string | null>(null);

  const fin = (financials ?? {}) as AnyData;
  const typedMilestones = (Array.isArray(milestones) ? milestones : []) as AnyData[];
  const typedItems = (Array.isArray(ffeItems) ? ffeItems : []) as AnyData[];

  const designFee = fin.designFeeCents ?? project?.design_fee_cents ?? project?.design_fee ?? 0;

  // Build category rows from useProjectFinancials byCategory + add fallback Design Fee row
  const variances = useMemo<VarianceRow[]>(() => {
    const cats: VarianceRow[] = [];
    if (designFee > 0) {
      // Design fee is a known category if present
      cats.push({
        category: 'Design Fee',
        budget: designFee,
        committed: designFee,
        actual: designFee,
        variance: 0,
        variancePct: 0,
      });
    }
    const byCategory = (fin.byCategory ?? []) as { category: string; budgetCents: number; committedCents: number; actualCents: number }[];
    for (const c of byCategory) {
      const variance = c.actualCents - c.budgetCents;
      const variancePct = c.budgetCents > 0 ? (variance / c.budgetCents) * 100 : 0;
      cats.push({
        category: c.category,
        budget: c.budgetCents,
        committed: c.committedCents,
        actual: c.actualCents,
        variance,
        variancePct,
      });
    }
    return cats;
  }, [fin, designFee]);

  const totalsRow = useMemo<VarianceRow>(() => {
    const sum = variances.reduce(
      (acc, r) => ({
        budget: acc.budget + r.budget,
        committed: acc.committed + r.committed,
        actual: acc.actual + r.actual,
      }),
      { budget: 0, committed: 0, actual: 0 }
    );
    const variance = sum.actual - sum.budget;
    return {
      category: 'Total',
      budget: sum.budget,
      committed: sum.committed,
      actual: sum.actual,
      variance,
      variancePct: sum.budget > 0 ? (variance / sum.budget) * 100 : 0,
    };
  }, [variances]);

  // Drill-down line items for a category
  const drillItems = useMemo(() => {
    if (!drillCategory) return [];
    if (drillCategory === 'Design Fee') return [];
    return typedItems.filter((it) => (it.ffe_category || 'Uncategorized') === drillCategory);
  }, [drillCategory, typedItems]);

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!project) {
    return <p className="type-body py-16 text-center text-[var(--text-muted)]">Project not found.</p>;
  }

  const totalInvoiced = typedMilestones
    .filter((m) => m.status === 'paid' || m.status === 'outstanding')
    .reduce((sum, m) => sum + (m.amount_cents ?? m.amount ?? 0), 0);
  const totalCollected = typedMilestones
    .filter((m) => m.status === 'paid')
    .reduce((sum, m) => sum + (m.amount_cents ?? m.amount ?? 0), 0);
  const outstanding = totalInvoiced - totalCollected;

  // Designer earnings (lead-designer-only)
  const productSpend = totalsRow.committed - designFee;
  const commissionRate = 0.12;
  const commissions = Math.round(productSpend * commissionRate);
  const leadDesignerId = project?.lead_designer_id ?? project?.designer_id ?? null;
  const isLeadDesigner = !!user?.id && !!leadDesignerId && leadDesignerId === user.id;

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Projects', href: '/portal/projects' },
          { label: project.name, href: `/portal/projects/${id}` },
          { label: 'Financials' },
        ]}
      />

      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="type-section-head" style={{ fontSize: '1.5rem' }}>
            Financials
          </h1>
          <SectionIntro
            surfaceKey={SurfaceKeys.DesignerPortal.Financials.Intro}
            fallback="Track budget against committed and actual spend. Variance updates in real time as POs are issued and invoices are paid."
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem] opacity-50"
            style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)' }}
          >
            Generate Invoice
          </button>
          <ExportMenu />
        </div>
      </div>

      {/* High-level metrics row — every label is a Patina-defined measurement
          (especially Committed vs Actual, which mean different things in
          Patina's procurement model than in general accounting).
          Cards read from the same totals as the variance table below
          (totalsRow) so Budget / Committed / Actual / Variance stay consistent
          across the screen (B-05). */}
      <div className="mb-8 flex flex-wrap gap-0 border-b pb-6" style={{ borderColor: 'var(--border-default)' }}>
        <div className="pr-8">
          <div className="flex items-baseline gap-1">
            <MetricBlock label="Budget" value={formatCurrencyCompact(totalsRow.budget)} />
            <StrataInfoIcon
              surfaceKey={SurfaceKeys.DesignerPortal.Financials.Metric.Budget}
              ariaLabel="What does Budget include?"
            />
          </div>
        </div>
        <div className="border-l px-8" style={{ borderColor: 'var(--border-default)' }}>
          <div className="flex items-baseline gap-1">
            <MetricBlock label="Committed" value={formatCurrencyCompact(totalsRow.committed)} change={`${formatCurrency(totalsRow.budget - totalsRow.committed)} remaining`} trend="neutral" />
            <StrataInfoIcon
              surfaceKey={SurfaceKeys.DesignerPortal.Financials.Metric.Committed}
              ariaLabel="What counts as committed spend?"
            />
          </div>
        </div>
        <div className="border-l px-8" style={{ borderColor: 'var(--border-default)' }}>
          <div className="flex items-baseline gap-1">
            <MetricBlock label="Actual" value={formatCurrencyCompact(totalsRow.actual)} change={`${Math.round(((totalsRow.actual / Math.max(totalsRow.budget, 1)) * 100))}% of budget`} trend="neutral" />
            <StrataInfoIcon
              surfaceKey={SurfaceKeys.DesignerPortal.Financials.Metric.Actual}
              ariaLabel="When does spend become actual?"
            />
          </div>
        </div>
        <div className="border-l pl-8" style={{ borderColor: 'var(--border-default)' }}>
          <div className="flex items-baseline gap-1">
            <MetricBlock
              label="Variance"
              value={formatCurrencyCompact(totalsRow.variance)}
              change={`${totalsRow.variancePct.toFixed(1)}%`}
              trend={totalsRow.variance >= 0 ? 'down' : 'up'}
            />
            <StrataInfoIcon
              surfaceKey={SurfaceKeys.DesignerPortal.Financials.Metric.Variance}
              ariaLabel="How is variance computed?"
            />
          </div>
        </div>
      </div>

      {/* 4-column variance table */}
      <div className="mb-8">
        <div className="mb-4 border-b pb-2 flex items-baseline justify-between gap-3" style={{ borderColor: 'var(--border-default)' }}>
          <h3 className="type-section-head inline-flex items-baseline gap-1.5" style={{ fontSize: '1.25rem' }}>
            Budget vs. Committed vs. Actual vs. Variance
            {/* Variance-band thresholds are Patina-defined (sage / clay /
                gold / terracotta map to specific overspend ranges). */}
            <StrataInfoIcon
              surfaceKey={SurfaceKeys.DesignerPortal.Financials.Concept.VarianceBands}
              ariaLabel="What do the variance colors mean?"
              fallback="Sage = under budget. Clay = on budget (0–5% over). Gold = caution (5–10% over). Terracotta = action needed (>10% over)."
            />
          </h3>
          <LearnMore
            surfaceKey={SurfaceKeys.DesignerPortal.Financials.LearnMore.VarianceCalc}
            label="How is variance computed?"
            fallback="Variance = actual − budget per category. Committed counts approved POs plus design-fee deposits. Actual counts paid invoices and reconciled charges."
          />
        </div>
        <VarianceTable rows={variances} totals={totalsRow} onDrill={setDrillCategory} />
      </div>

      {/* Two-column: Milestones + Earnings */}
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          <h3 className="type-section-head mb-2 inline-flex items-baseline gap-1.5" style={{ fontSize: '1.25rem' }}>
            Payment Milestones
            <StrataInfoIcon
              surfaceKey={SurfaceKeys.DesignerPortal.Financials.Concept.MilestoneTrigger}
              ariaLabel="How are milestone triggers configured?"
            />
          </h3>
          <SectionIntro
            surfaceKey={SurfaceKeys.DesignerPortal.Financials.Section.Milestones}
            fallback="Each milestone invoices automatically when its trigger condition is met (e.g. proposal signed, phase complete)."
            className="mb-3 border-b pb-2"
          />
          {typedMilestones.length === 0 ? (
            <MilestonesEmpty />
          ) : (
            typedMilestones.map((milestone) => (
              <PaymentMilestoneCard key={milestone.id} milestone={milestone} />
            ))
          )}
          {totalInvoiced > 0 && (
            <div className="mt-4 type-meta-small text-[var(--text-muted)]">
              {formatCurrency(totalCollected)} collected · {outstanding > 0 ? `${formatCurrency(outstanding)} outstanding` : 'all collected'}
            </div>
          )}
        </div>

        {isLeadDesigner && (
          <div>
            <StrataMark variant="mini" />
            <h3 className="type-section-head mb-2 inline-flex items-baseline gap-1.5" style={{ fontSize: '1.25rem' }}>
              Your Earnings
              {/* Commission rate is Patina-defined — the 12% is a platform
                  default that the studio agreement can adjust. */}
              <StrataInfoIcon
                surfaceKey={SurfaceKeys.DesignerPortal.Financials.Concept.CommissionRate}
                ariaLabel="How is the commission rate set?"
                fallback="Patina pays the lead designer 12% commission on product spend by default. Studio agreements can adjust this rate."
              />
            </h3>
            <SectionIntro
              surfaceKey={SurfaceKeys.DesignerPortal.Financials.Section.Earnings}
              fallback="Visible only to the project lead designer. Updates in real time as POs are issued."
              className="mb-3 border-b pb-2"
            />
            <DetailRow label="Design Fee" value={formatCurrency(designFee)} />
            <DetailRow
              label="Commissions"
              value={`${formatCurrency(commissions)} (${Math.round(commissionRate * 100)}% on ${formatCurrency(Math.max(productSpend, 0))})`}
            />
            <DetailRow label="Total Earned" value={formatCurrency(designFee + commissions)} />
          </div>
        )}
      </div>

      {/* Drill-down modal */}
      {drillCategory && (
        <DrillDownModal
          category={drillCategory}
          items={drillItems}
          onClose={() => setDrillCategory(null)}
        />
      )}
    </div>
  );
}

// ─── Empty-state wrappers (F1.7) ─────────────────────────────────────────────
// Probe the CMS first, fall back to inline copy so first-time designers never
// see a silent blank. Same pattern as F1.6 Clients.

function MilestonesEmpty() {
  const surfaceKey = SurfaceKeys.DesignerPortal.Financials.Empty.NoMilestones;
  const { data, isLoading } = useHelpContent(surfaceKey, 'emptyState');
  if (isLoading) return null;
  if (data) return <EmptyState surfaceKey={surfaceKey} />;
  return (
    <p className="type-body py-6 italic text-[var(--text-muted)]">
      No milestones configured. Add milestones during project activation so invoices fire on the right triggers.
    </p>
  );
}

function LineItemsEmpty() {
  const surfaceKey = SurfaceKeys.DesignerPortal.Financials.Empty.NoLineItems;
  const { data, isLoading } = useHelpContent(surfaceKey, 'emptyState');
  if (isLoading) return null;
  if (data) return <EmptyState surfaceKey={surfaceKey} />;
  return (
    <p className="type-body py-6 italic text-[var(--text-muted)]">
      No line items in this category yet.
    </p>
  );
}

function VarianceTable({
  rows,
  totals,
  onDrill,
}: {
  rows: VarianceRow[];
  totals: VarianceRow;
  onDrill: (category: string) => void;
}) {
  return (
    <div role="table">
      <div
        role="row"
        className="grid items-center gap-3 border-b py-2 type-meta-small uppercase tracking-wider text-[var(--text-muted)]"
        style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', borderColor: 'var(--border-default)' }}
      >
        <span>Category</span>
        <span className="text-right">Budget</span>
        <span className="text-right">Committed</span>
        <span className="text-right">Actual</span>
        <span className="text-right">Variance</span>
      </div>
      {rows.map((row) => (
        <button
          key={row.category}
          type="button"
          onClick={() => onDrill(row.category)}
          className="grid w-full cursor-pointer items-baseline gap-3 border-b py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
          style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', borderColor: 'rgba(229, 226, 221, 0.6)' }}
        >
          <span className="type-body text-[0.85rem] font-medium">{row.category}</span>
          <span className="text-right font-heading text-[0.88rem]">{formatCurrency(row.budget)}</span>
          <span className="text-right font-heading text-[0.88rem]">{formatCurrency(row.committed)}</span>
          <span className="text-right font-heading text-[0.88rem]">{formatCurrency(row.actual)}</span>
          <span className="text-right">
            <span
              className="font-heading text-[0.88rem]"
              style={{ color: varianceColor(row.budget, row.actual) }}
            >
              {row.variance >= 0 ? '+' : ''}
              {formatCurrency(row.variance)}
            </span>
            <span className="ml-1 type-meta-small text-[var(--text-muted)]">
              ({row.variancePct.toFixed(1)}%)
            </span>
          </span>
        </button>
      ))}
      <div
        role="row"
        className="grid items-baseline gap-3 border-t-2 py-3 font-semibold"
        style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1.2fr', borderColor: 'var(--text-primary)' }}
      >
        <span className="type-label">{totals.category}</span>
        <span className="text-right font-heading">{formatCurrency(totals.budget)}</span>
        <span className="text-right font-heading">{formatCurrency(totals.committed)}</span>
        <span className="text-right font-heading">{formatCurrency(totals.actual)}</span>
        <span className="text-right">
          <span
            className="font-heading"
            style={{ color: varianceColor(totals.budget, totals.actual) }}
          >
            {totals.variance >= 0 ? '+' : ''}
            {formatCurrency(totals.variance)}
          </span>
          <span className="ml-1 type-meta-small text-[var(--text-muted)]">
            ({totals.variancePct.toFixed(1)}%)
          </span>
        </span>
      </div>
    </div>
  );
}

function DrillDownModal({
  category,
  items,
  onClose,
}: {
  category: string;
  items: AnyData[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] rounded-md border bg-[var(--bg-surface)] p-6 shadow-xl"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <h3 className="type-section-head" style={{ fontSize: '1.15rem' }}>
            {category} — Line items
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[1rem] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {items.length === 0 ? (
          <LineItemsEmpty />
        ) : (
          <div role="table">
            <div
              role="row"
              className="grid gap-3 border-b py-2 type-meta-small uppercase tracking-wider text-[var(--text-muted)]"
              style={{ gridTemplateColumns: '2fr 1fr 1fr', borderColor: 'var(--border-default)' }}
            >
              <span>Item</span>
              <span>Status</span>
              <span className="text-right">Total</span>
            </div>
            {items.map((it) => (
              <div
                key={it.id}
                role="row"
                className="grid items-baseline gap-3 border-b py-2"
                style={{ gridTemplateColumns: '2fr 1fr 1fr', borderColor: 'rgba(229, 226, 221, 0.6)' }}
              >
                <span className="type-body text-[0.82rem]">{it.name}</span>
                <span className="type-meta-small uppercase tracking-wider">{it.status}</span>
                <span className="text-right font-heading text-[0.85rem]">
                  {formatCurrency(it.line_total_cents || 0)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ExportMenu() {
  // Export pipeline (XLSX / PDF / CSV) is not built yet — render the control
  // disabled with a tooltip rather than firing an alert (B-07).
  return (
    <button
      type="button"
      disabled
      title="Coming soon"
      className="cursor-not-allowed rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem] opacity-50"
      style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)' }}
    >
      Export
    </button>
  );
}
