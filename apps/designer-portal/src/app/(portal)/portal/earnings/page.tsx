'use client';

import { useState } from 'react';
import {
  useEarnings,
  useEarningsStats,
  usePayouts,
} from '@patina/supabase';
import { StrataMark } from '@/components/portal/strata-mark';
import { MetricBlock } from '@/components/portal/metric-block';
import { LoadingStrata } from '@/components/portal/loading-strata';

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

export default function EarningsPage() {
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

  if (statsLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      {/* Header */}
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="type-section-head">Earnings</h1>
        <div className="flex gap-4">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`type-meta cursor-pointer border-0 bg-transparent ${
                period === p.key
                  ? 'text-[var(--text-primary)] underline underline-offset-4'
                  : 'text-[var(--text-muted)] no-underline hover:text-[var(--text-primary)]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <MetricBlock
          label="Total Earnings"
          value={formatCents(stats?.totalEarnings ?? 0)}
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
                  {earning.description || earning.source_type}
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
