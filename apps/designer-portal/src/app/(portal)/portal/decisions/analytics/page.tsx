'use client';

import Link from 'next/link';
import {
  useDecisionMetrics,
  useDecisionAnalyticsByType,
  useDecisionAnalyticsByClient,
  useDecisionBottleneckPhases,
} from '@patina/supabase';
import type { DecisionType } from '@patina/supabase';
import { MetricBlock } from '@/components/portal/metric-block';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { ProgressBar } from '@/components/portal/progress-bar';

const typeLabels: Record<DecisionType, string> = {
  material: 'Material / Color',
  product: 'Product Selection',
  layout: 'Layout Approval',
  budget: 'Budget Change',
  approval: 'Phase Approval',
};

function hoursToDisplay(hours: number): string {
  const days = hours / 24;
  if (days < 1) return `${Math.round(hours)} hrs`;
  return `${Math.round(days * 10) / 10} days`;
}

export default function DecisionAnalyticsPage() {
  const { data: metrics, isLoading: metricsLoading } = useDecisionMetrics();
  const { data: byType, isLoading: typeLoading } = useDecisionAnalyticsByType();
  const { data: byClient, isLoading: clientLoading } = useDecisionAnalyticsByClient();
  const { data: bottlenecks, isLoading: bottleneckLoading } = useDecisionBottleneckPhases();

  const isLoading = metricsLoading || typeLoading || clientLoading || bottleneckLoading;

  if (isLoading) return <LoadingStrata />;

  const maxResponseHours = Math.max(...(byType ?? []).map((t) => t.avg_response_hours), 1);

  return (
    <div className="pt-8">
      {/* Breadcrumb */}
      <div className="type-meta mb-6">
        <Link
          href="/portal/decisions"
          className="text-[var(--accent-primary)] no-underline hover:text-[var(--accent-hover)]"
        >
          Decisions
        </Link>
        <span className="mx-2">&rarr;</span>
        <span>Insights</span>
      </div>

      <h1 className="type-page-title mb-6">Decision Insights</h1>

      {/* Metrics Row */}
      <div className="mb-8 grid grid-cols-2 gap-6 border-b border-[var(--border-default)] pb-8 md:grid-cols-4 md:gap-0">
        <div className="pr-0 md:pr-8">
          <MetricBlock label="Total Decisions" value={metrics?.total ?? 0} change="this quarter" trend="neutral" />
        </div>
        <div className="border-0 pl-0 pr-0 md:border-l md:border-[var(--border-default)] md:pl-8 md:pr-8">
          <MetricBlock label="On-Time Rate" value={`${metrics?.onTimeRate ?? 0}%`} trend="up" />
        </div>
        <div className="border-0 pl-0 pr-0 md:border-l md:border-[var(--border-default)] md:pl-8 md:pr-8">
          <MetricBlock label="Avg Response" value={`${metrics?.avgResponseDays ?? 0} days`} trend="neutral" />
        </div>
        <div className="border-0 pl-0 md:border-l md:border-[var(--border-default)] md:pl-8">
          <MetricBlock label="Open Decisions" value={metrics?.open ?? 0} trend={metrics?.overdue ? 'down' : 'neutral'} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
        {/* Left: Response Time by Type */}
        <div>
          <SectionHeader>Response Time by Type</SectionHeader>
          <div className="space-y-5">
            {(byType ?? []).map((item) => {
              const avgDays = item.avg_response_hours / 24;
              const pct = (item.avg_response_hours / maxResponseHours) * 100;
              const isSlow = avgDays > 4;
              const isFast = avgDays < 2;

              return (
                <div key={item.decision_type}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="type-label" style={{ fontSize: '0.82rem' }}>
                      {typeLabels[item.decision_type as DecisionType] ?? item.decision_type}
                    </span>
                    <span className="type-meta-small">
                      Avg {hoursToDisplay(item.avg_response_hours)}
                    </span>
                  </div>
                  <div
                    className="h-[5px] overflow-hidden rounded-sm"
                    style={{ background: 'var(--color-pearl)' }}
                  >
                    <div
                      className="h-full rounded-sm transition-all"
                      style={{
                        width: `${Math.max(pct, 6)}%`,
                        background: isSlow
                          ? 'var(--color-terracotta)'
                          : isFast
                            ? 'var(--color-sage)'
                            : 'var(--accent-primary)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pattern insight */}
          {(byType ?? []).length > 1 && (
            <div
              className="mt-6 rounded-md p-4"
              style={{
                background: 'rgba(196, 165, 123, 0.04)',
                border: '1px solid rgba(196, 165, 123, 0.12)',
              }}
            >
              <div
                className="mb-1"
                style={{
                  fontFamily: 'var(--font-meta)',
                  fontSize: '0.62rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--accent-primary)',
                }}
              >
                Pattern
              </div>
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.78rem',
                  color: 'var(--text-body)',
                }}
              >
                {getPatternInsight(byType ?? [])}
              </p>
            </div>
          )}
        </div>

        {/* Right: By Client + Bottleneck Phases */}
        <div>
          <SectionHeader>By Client</SectionHeader>
          <div className="space-y-0">
            {(byClient ?? []).map((client) => {
              const avgDays = client.avg_response_hours / 24;
              const label = avgDays < 2.5 ? 'Fast responder' : avgDays > 5 ? 'Needs gentle reminders' : 'Moderate';

              return (
                <div
                  key={client.designer_client_id}
                  className="py-3"
                  style={{ borderBottom: '1px solid rgba(229, 226, 221, 0.4)' }}
                >
                  <div className="flex items-baseline justify-between">
                    <span className="type-label" style={{ fontSize: '0.85rem' }}>
                      {client.client_name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        fontSize: '0.88rem',
                      }}
                    >
                      {hoursToDisplay(client.avg_response_hours)}
                    </span>
                  </div>
                  <div className="type-label-secondary" style={{ fontSize: '0.72rem' }}>
                    {client.total_count} decisions &middot; {Math.round(client.on_time_rate)}% on time &middot; {label}
                  </div>
                </div>
              );
            })}
          </div>

          <StrataMark />

          <SectionHeader>Bottleneck Phases</SectionHeader>
          <div className="space-y-2">
            {(bottlenecks ?? []).map((phase) => {
              const avgDays = phase.avg_response_hours / 24;
              return (
                <div key={phase.linked_phase} className="grid grid-cols-[110px_1fr] gap-3 py-1">
                  <span className="type-meta-small" style={{ paddingTop: '0.12rem' }}>
                    {phase.overdue_count > 0 ? 'Most Delays' : 'Phase'}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.85rem',
                      color: phase.overdue_count > 0 ? 'var(--color-terracotta)' : 'var(--text-body)',
                      fontWeight: phase.overdue_count > 0 ? 500 : 400,
                    }}
                  >
                    {phase.linked_phase} ({phase.total_count} decisions, avg {hoursToDisplay(phase.avg_response_hours)})
                    {phase.overdue_count > 0 && ` \u2014 ${phase.overdue_count} currently overdue`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mb-4 border-b border-[var(--border-subtle)] pb-2"
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 500,
        fontSize: '1.1rem',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </h3>
  );
}

function StrataMark() {
  return (
    <div className="flex flex-col gap-1 py-6">
      <div className="h-[1.5px] w-[60px] rounded-sm bg-[var(--color-mocha)]" />
      <div className="h-[1.5px] w-[48px] rounded-sm bg-[var(--accent-primary)] opacity-70" />
      <div className="h-[1.5px] w-[36px] rounded-sm bg-[var(--accent-primary)] opacity-35" />
    </div>
  );
}

function getPatternInsight(byType: { decision_type: string; avg_response_hours: number }[]): string {
  if (byType.length < 2) return 'Not enough data to identify patterns yet.';

  const sorted = [...byType].sort((a, b) => b.avg_response_hours - a.avg_response_hours);
  const slowest = sorted[0];
  const fastest = sorted[sorted.length - 1];

  const slowDays = Math.round(slowest.avg_response_hours / 24 * 10) / 10;
  const fastDays = Math.round(fastest.avg_response_hours / 24 * 10) / 10;
  const ratio = slowDays > 0 && fastDays > 0 ? Math.round(slowDays / fastDays * 10) / 10 : 0;

  const slowLabel = typeLabels[slowest.decision_type as DecisionType] ?? slowest.decision_type;
  const fastLabel = typeLabels[fastest.decision_type as DecisionType] ?? fastest.decision_type;

  if (ratio > 1.5) {
    return `${slowLabel} decisions take ${ratio}x longer than ${fastLabel} decisions. Consider sending these earlier in the process or combining related choices into a single batch.`;
  }

  return `Response times are fairly consistent across decision types. ${fastLabel} decisions resolve fastest at ${fastDays} days average.`;
}
