'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@patina/shared';
import { useStudioTimeReport } from '@/hooks/use-time-tracking';
import { MetricBlock } from '@/components/portal/metric-block';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { StrataMark } from '@/components/portal/strata-mark';
import { FilterPill } from '@/components/ui/controls';
import { TimeEntriesTable } from '@/components/portal/time/time-entries-table';
import {
  STUDIO_PERIODS,
  formatHoursLabel,
  minutesToHours,
  type StudioPeriod,
} from '@/lib/time-billing';
import { useHydrated } from '@/hooks/use-hydrated';

/**
 * Studio-wide time report (Billing zone): rolling-period rollups across every
 * project, the all-time unbilled balance, per-project breakdown with a
 * bill-time jump-off, and the period's entries week-by-week. Companion to
 * /portal/earnings — hours feed invoices feed earnings.
 */
export default function StudioTimePage() {
  const hydrated = useHydrated();
  const [period, setPeriod] = useState<StudioPeriod>('week');
  const { data: report, isLoading } = useStudioTimeReport(period);

  if (!hydrated || isLoading) return <LoadingStrata />;

  const projects = report?.projects ?? [];
  const entries = report?.entries ?? [];

  return (
    <div className="pt-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-4">
          <h1 className="type-section-head">Time</h1>
          <Link
            href="/portal/earnings"
            className="type-meta-small text-[var(--accent-primary)] no-underline hover:text-[var(--text-primary)]"
          >
            Earnings &rarr;
          </Link>
        </div>
        <div className="flex gap-4">
          {STUDIO_PERIODS.map((p) => (
            <FilterPill key={p.key} active={period === p.key} onClick={() => setPeriod(p.key)}>
              {p.label}
            </FilterPill>
          ))}
        </div>
      </div>

      {/* Top metrics — period flows + the all-time unbilled balance */}
      <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
        <MetricBlock label="Hours Logged" value={`${minutesToHours(report?.totalMinutes ?? 0)}h`} />
        <MetricBlock label="Billable" value={`${minutesToHours(report?.billableMinutes ?? 0)}h`} />
        <MetricBlock label="Invoiced" value={`${minutesToHours(report?.invoicedMinutes ?? 0)}h`} />
        <MetricBlock
          label="Unbilled Hours"
          value={`${minutesToHours(report?.unbilledMinutes ?? 0)}h`}
          change="all time"
          trend="neutral"
        />
        <MetricBlock
          label="Unbilled Value"
          value={formatCurrency(report?.unbilledAmountCents ?? 0)}
          change="all time"
          trend="neutral"
        />
      </div>

      <StrataMark variant="mini" />

      {/* Per-project breakdown */}
      <h2 className="type-section-head mb-4">By Project</h2>
      {projects.length > 0 ? (
        <div className="mb-10">
          <div
            className="grid items-center gap-3 border-b border-[var(--border-default)] py-1.5"
            style={{ gridTemplateColumns: '1.6fr 90px 90px 110px 120px 110px' }}
          >
            <span className="type-meta-small">Project</span>
            <span className="type-meta-small text-right">Hours</span>
            <span className="type-meta-small text-right">Billable</span>
            <span className="type-meta-small text-right">Unbilled</span>
            <span className="type-meta-small text-right">Unbilled $</span>
            <span />
          </div>
          {projects.map((p) => (
            <div
              key={p.projectId}
              data-testid="studio-time-project-row"
              className="grid items-baseline gap-3 border-b border-[var(--border-subtle)] py-2.5"
              style={{ gridTemplateColumns: '1.6fr 90px 90px 110px 120px 110px' }}
            >
              <Link
                href={`/portal/projects/${p.projectId}/time`}
                className="type-body min-w-0 truncate text-[0.85rem] text-[var(--accent-primary)] no-underline hover:text-[var(--text-primary)]"
              >
                {p.projectName}
              </Link>
              <span className="text-right font-heading text-[0.85rem]">
                {formatHoursLabel(p.totalMinutes)}
              </span>
              <span className="text-right font-heading text-[0.85rem]">
                {formatHoursLabel(p.billableMinutes)}
              </span>
              <span className="text-right font-heading text-[0.85rem]">
                {p.unbilledMinutes > 0 ? formatHoursLabel(p.unbilledMinutes) : '—'}
              </span>
              <span className="text-right font-heading text-[0.85rem]">
                {p.unbilledAmountCents > 0 ? formatCurrency(p.unbilledAmountCents) : '—'}
              </span>
              <span className="text-right">
                {p.unbilledAmountCents > 0 && (
                  <Link
                    href={`/portal/billing/invoices/new?projectId=${p.projectId}`}
                    className="type-meta-small text-[var(--accent-primary)] no-underline hover:text-[var(--text-primary)]"
                  >
                    Bill time &rarr;
                  </Link>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body mb-10 py-8 text-center italic text-[var(--text-muted)]">
          No time logged in this period.
        </p>
      )}

      {/* Period entries */}
      <h2 className="type-section-head mb-4">Entries</h2>
      <div className="pb-12">
        <TimeEntriesTable
          entries={entries}
          showProject
          emptyLabel="No entries in this period."
        />
      </div>
    </div>
  );
}
