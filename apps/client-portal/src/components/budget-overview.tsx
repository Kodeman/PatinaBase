'use client';

import { ProgressBar, StatusDot } from '@patina/design-system';
import { useProjectFinancials, useProjectPaymentMilestones } from '@patina/supabase';
import { DollarSign } from 'lucide-react';

interface BudgetOverviewProps {
  projectId: string;
}

function centsToDisplay(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function BudgetOverview({ projectId }: BudgetOverviewProps) {
  const { data: financials, isLoading: financialsLoading } = useProjectFinancials(projectId);
  const { data: milestones, isLoading: milestonesLoading } = useProjectPaymentMilestones(projectId);

  if (financialsLoading || milestonesLoading) {
    return (
      <div className="py-6">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--color-pearl)]" />
      </div>
    );
  }

  if (!financials || financials.budgetCents === 0) {
    return null;
  }

  const budgetUtilization = financials.budgetCents > 0
    ? Math.round((financials.committedCents / financials.budgetCents) * 100)
    : 0;

  const paidMilestones = milestones?.filter((m: any) => m.status === 'paid') ?? [];
  const upcomingMilestones = milestones?.filter((m: any) => m.status === 'outstanding' || m.status === 'pending') ?? [];

  return (
    <div>
      <h3 className="type-section-head">Budget Overview</h3>

      {/* Summary Cards */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Total Budget</p>
          <p className="type-data-large mt-1">{centsToDisplay(financials.budgetCents)}</p>
        </div>
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Committed</p>
          <p className="type-data-large mt-1">{centsToDisplay(financials.committedCents)}</p>
        </div>
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Paid to Date</p>
          <p className="type-data-large mt-1">{centsToDisplay(financials.actualCents)}</p>
        </div>
      </div>

      {/* Utilization bar */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="type-meta">Budget utilization</span>
          <span className="type-meta font-medium">{budgetUtilization}%</span>
        </div>
        <ProgressBar value={budgetUtilization} max={100} size="sm" />
      </div>

      {/* Payment Schedule */}
      {milestones && milestones.length > 0 && (
        <div className="mt-6">
          <h4 className="type-meta mb-3">Payment Schedule</h4>
          <div className="space-y-0">
            {milestones.map((milestone: any) => {
              const isPaid = milestone.status === 'paid';
              const status = isPaid ? 'completed' : 'pending';

              return (
                <div
                  key={milestone.id}
                  className="flex items-center justify-between border-b border-[var(--border-subtle)] py-3"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot status={status} />
                    <div>
                      <p className="text-sm text-[var(--text-primary)]">
                        {milestone.title || milestone.description || `Payment ${milestone.sort_order + 1}`}
                      </p>
                      {milestone.due_date && (
                        <p className="type-meta-small mt-0.5">
                          {isPaid ? 'Paid' : 'Due'}{' '}
                          {new Date(milestone.paid_at || milestone.due_date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={`type-label ${isPaid ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                    {milestone.amount_cents ? centsToDisplay(milestone.amount_cents) : `${milestone.percentage}%`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
