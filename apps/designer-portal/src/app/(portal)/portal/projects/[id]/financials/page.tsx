'use client';

import { use } from 'react';
import { useProject, useProjectBudgetItems, useProjectMilestones } from '@/hooks/use-projects';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { MetricBlock } from '@/components/portal/metric-block';
import { BudgetTable } from '@/components/portal/budget-table';
import { PaymentMilestoneCard } from '@/components/portal/payment-milestone-card';
import { DetailRow } from '@/components/portal/detail-row';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProject = any;

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatCurrencyCompact(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(dollars >= 10000 ? 0 : 1)}k`;
  return `$${dollars.toLocaleString()}`;
}

export default function ProjectFinancialsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: project, isLoading } = useProject(id) as { data: AnyProject; isLoading: boolean };
  const { data: budgetItems = [] } = useProjectBudgetItems(id);
  const { data: milestones = [] } = useProjectMilestones(id);

  if (isLoading) return <LoadingStrata />;
  if (!project) {
    return <p className="type-body py-16 text-center text-[var(--text-muted)]">Project not found.</p>;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedBudgetItems = (Array.isArray(budgetItems) ? budgetItems : []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedMilestones = (Array.isArray(milestones) ? milestones : []) as any[];

  const totalBudget = project.budget || 0;
  const totalCommitted = typedBudgetItems.reduce((sum: number, item: { actual: number }) => sum + item.actual, 0);
  const totalInvoiced = typedMilestones
    .filter((m: { status: string }) => m.status === 'paid' || m.status === 'outstanding')
    .reduce((sum: number, m: { amount: number }) => sum + m.amount, 0);
  const totalCollected = typedMilestones
    .filter((m: { status: string }) => m.status === 'paid')
    .reduce((sum: number, m: { amount: number }) => sum + m.amount, 0);
  const outstanding = totalInvoiced - totalCollected;

  // Earnings
  const designFee = project.design_fee || 0;
  const commissionRate = 0.12;
  const productSpend = totalCommitted - designFee;
  const commissions = Math.round(productSpend * commissionRate);

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Projects', href: '/portal/projects' },
          { label: project.name, href: `/portal/projects/${id}` },
          { label: 'Financials' },
        ]}
      />

      {/* Header */}
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="type-section-head" style={{ fontSize: '1.5rem' }}>
          Financials
        </h1>
        <div className="flex gap-2">
          <button className="type-btn-text rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[0.72rem] text-[var(--text-primary)]">
            Create Invoice
          </button>
          <button className="type-btn-text rounded-[3px] border border-[var(--border-default)] bg-transparent px-3 py-1.5 text-[0.72rem] text-[var(--text-primary)]">
            Export
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="mb-8 flex gap-0 border-b border-[var(--border-default)] pb-6">
        <div className="pr-8">
          <MetricBlock label="Total Budget" value={formatCurrencyCompact(totalBudget)} />
        </div>
        <div className="border-l border-[var(--border-default)] px-8">
          <MetricBlock
            label="Committed"
            value={formatCurrencyCompact(totalCommitted)}
            change={`${formatCurrency(totalBudget - totalCommitted)} remaining`}
            trend="up"
          />
        </div>
        <div className="border-l border-[var(--border-default)] px-8">
          <MetricBlock
            label="Invoiced"
            value={formatCurrencyCompact(totalInvoiced)}
            change={`${Math.round((totalInvoiced / totalBudget) * 100)}% of total`}
            trend="neutral"
          />
        </div>
        <div className="border-l border-[var(--border-default)] pl-8">
          <MetricBlock
            label="Collected"
            value={formatCurrencyCompact(totalCollected)}
            change={outstanding > 0 ? `${formatCurrency(outstanding)} outstanding` : 'All collected'}
            trend={outstanding > 0 ? 'down' : 'up'}
          />
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-10 md:grid-cols-2">
        {/* Left: Budget vs Actual */}
        <div>
          <h3
            className="type-section-head mb-4 border-b border-[var(--border-default)] pb-2"
            style={{ fontSize: '1.25rem' }}
          >
            Budget vs. Actual
          </h3>
          <BudgetTable items={typedBudgetItems} showHeader />
        </div>

        {/* Right: Payment Milestones + Earnings */}
        <div>
          <h3
            className="type-section-head mb-4 border-b border-[var(--border-default)] pb-2"
            style={{ fontSize: '1.25rem' }}
          >
            Payment Milestones
          </h3>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {typedMilestones.map((milestone: any) => (
            <PaymentMilestoneCard key={milestone.id} milestone={milestone} />
          ))}

          <StrataMark variant="mini" />

          <h3
            className="type-section-head mb-3 border-b border-[var(--border-default)] pb-2"
            style={{ fontSize: '1.25rem' }}
          >
            Your Earnings
          </h3>
          <DetailRow label="Design Fee" value={formatCurrency(designFee)} />
          <DetailRow
            label="Commissions"
            value={`${formatCurrency(commissions)} (${Math.round(commissionRate * 100)}% on ${formatCurrency(productSpend)})`}
          />
          <DetailRow
            label="Total Earned"
            value={formatCurrency(designFee + commissions)}
          />
        </div>
      </div>
    </div>
  );
}
