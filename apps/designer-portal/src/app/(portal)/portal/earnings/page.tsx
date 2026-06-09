'use client';

import { useState } from 'react';
import {
  useEarnings,
  useEarningsStats,
} from '@patina/supabase';
import { StrataMark } from '@/components/portal/strata-mark';
import { MetricBlock } from '@/components/portal/metric-block';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { FilterPill } from '@/components/ui/controls';
import { useHydrated } from '@/hooks/use-hydrated';

type Period = 'month' | 'quarter' | 'year' | 'all';

function getPeriodDates(period: Period): {
  startDate?: string;
  endDate?: string;
} {
  if (period === 'all') return {};
  const now = new Date();
  const start = new Date();

  if (period === 'month') start.setMonth(now.getMonth() - 1);
  else if (period === 'quarter') start.setMonth(now.getMonth() - 3);
  else if (period === 'year') start.setFullYear(now.getFullYear() - 1);

  return {
    startDate: start.toISOString(),
    endDate: now.toISOString(),
  };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Human labels for designer_earnings.source_type (00178 adds design_fee). */
const SOURCE_TYPE_LABELS: Record<string, string> = {
  design_fee: 'Design fee',
  product_commission: 'Commission',
  referral: 'Referral',
  bonus: 'Bonus',
  adjustment: 'Adjustment',
};

export default function EarningsPage() {
  const hydrated = useHydrated();
  const [period, setPeriod] = useState<Period>('month');
  const { startDate, endDate } = getPeriodDates(period);

  const { data: stats, isLoading: statsLoading } = useEarningsStats();
  const { data: earnings, isLoading: earningsLoading } = useEarnings({
    startDate,
    endDate,
  });

  const periods: { key: Period; label: string }[] = [
    { key: 'month', label: 'This Month' },
    { key: 'quarter', label: 'Quarter' },
    { key: 'year', label: 'Year' },
    { key: 'all', label: 'All Time' },
  ];

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || statsLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      {/* Header */}
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="type-section-head">Earnings</h1>
        <div className="flex gap-4">
          {periods.map((p) => (
            <FilterPill
              key={p.key}
              active={period === p.key}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </FilterPill>
          ))}
        </div>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
        <MetricBlock
          label="Total Earnings"
          value={formatCents(stats?.totalEarnings ?? 0)}
        />
        <MetricBlock
          label="Design Fees"
          value={formatCents(stats?.bySource?.design_fee ?? 0)}
        />
        <MetricBlock
          label="Commissions"
          value={formatCents(stats?.bySource?.product_commission ?? 0)}
        />
        <MetricBlock
          label="Bonuses"
          value={formatCents(stats?.bySource?.bonus ?? 0)}
        />
        <MetricBlock
          label="Pending"
          value={formatCents(stats?.pendingEarnings ?? 0)}
          trend="neutral"
        />
      </div>

      <StrataMark variant="mini" />

      {/* Recent Transactions */}
      <h2 className="type-section-head mb-4">Recent Transactions</h2>

      {earningsLoading ? (
        <LoadingStrata />
      ) : earnings && earnings.length > 0 ? (
        <div>
          {earnings.map((earning) => (
            <div
              key={earning.id}
              className="flex items-baseline justify-between border-b border-[var(--border-subtle)] py-4"
            >
              <div>
                <span className="type-label">
                  {earning.description ||
                    SOURCE_TYPE_LABELS[earning.source_type] ||
                    earning.source_type}
                </span>
                <span
                  className="ml-3 inline-block rounded-full border border-[var(--border-default)] px-2 py-0.5 align-middle font-mono text-[0.55rem] uppercase tracking-[0.06em] text-[var(--text-muted)]"
                >
                  {SOURCE_TYPE_LABELS[earning.source_type] || earning.source_type}
                </span>
                <span className="type-meta ml-3">
                  {formatDate(earning.created_at)}
                </span>
              </div>
              <span className="font-heading text-lg font-semibold text-[var(--text-primary)]">
                {formatCents(earning.net_amount)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body py-12 text-center italic text-[var(--text-muted)]">
          No transactions for this period.
        </p>
      )}
    </div>
  );
}
