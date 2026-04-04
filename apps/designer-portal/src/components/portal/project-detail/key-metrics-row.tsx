import type { ProjectKeyMetrics } from '@/types/project-ui';

interface KeyMetricsRowProps {
  metrics: ProjectKeyMetrics;
}

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toLocaleString()}`;
}

interface MetricItemProps {
  label: string;
  value: string;
  subtitle: string;
  subtitleColor?: string;
}

function MetricItem({ label, value, subtitle, subtitleColor = 'var(--text-muted)' }: MetricItemProps) {
  return (
    <div className="min-w-0 pr-6" style={{ borderRight: '1px solid var(--border-default)' }}>
      <div
        style={{
          fontFamily: 'var(--font-meta)',
          fontSize: '0.58rem',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text-muted)',
          marginBottom: '0.25rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: '1.4rem',
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1,
          marginBottom: '0.15rem',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.68rem',
          color: subtitleColor,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}

export function KeyMetricsRow({ metrics }: KeyMetricsRowProps) {
  return (
    <div
      className="flex flex-wrap gap-y-4 border-b pb-6"
      style={{ borderColor: 'var(--border-default)', marginBottom: '2rem' }}
    >
      <MetricItem
        label="Progress"
        value={`${metrics.progress}%`}
        subtitle={`Week ${metrics.weekNumber} of ~${metrics.totalWeeks}`}
      />
      <MetricItem
        label="Budget"
        value={formatDollars(metrics.budgetTotal)}
        subtitle={metrics.budgetStatus}
        subtitleColor={metrics.budgetStatus === 'On target' ? 'var(--color-sage)' : 'var(--color-terracotta)'}
      />
      <MetricItem
        label="Committed"
        value={formatDollars(metrics.committed)}
        subtitle={`${metrics.committedPct}% of budget`}
      />
      <MetricItem
        label="Invoiced"
        value={formatDollars(metrics.invoiced)}
        subtitle={metrics.outstanding > 0 ? `${formatDollars(metrics.outstanding)} outstanding` : 'Settled'}
        subtitleColor={metrics.outstanding > 0 ? 'var(--text-muted)' : 'var(--color-sage)'}
      />
      <MetricItem
        label="FF&E Items"
        value={`${metrics.ffeOrdered}/${metrics.ffeTotal}`}
        subtitle="ordered or received"
      />
      <MetricItem
        label="Decisions"
        value={`${metrics.decisionsOpen}`}
        subtitle={metrics.decisionsOverdue > 0 ? `${metrics.decisionsOverdue} overdue` : 'On track'}
        subtitleColor={metrics.decisionsOverdue > 0 ? 'var(--color-terracotta)' : 'var(--color-sage)'}
      />
      <div className="min-w-0 pl-6">
        <div
          style={{
            fontFamily: 'var(--font-meta)',
            fontSize: '0.58rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            marginBottom: '0.25rem',
          }}
        >
          Hours
        </div>
        <div
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.4rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1,
            marginBottom: '0.15rem',
          }}
        >
          {metrics.hoursSpent}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
          of {metrics.hoursEstimated} est.
        </div>
      </div>
    </div>
  );
}
