'use client';

interface Metric {
  label: string;
  value: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
}

interface MetricsRowProps {
  metrics: Metric[];
}

const trendColors = {
  up: 'var(--color-sage)',
  down: 'var(--color-terracotta)',
  neutral: 'var(--text-muted)',
};

export function MetricsRow({ metrics }: MetricsRowProps) {
  return (
    <div className="mb-8 flex flex-wrap gap-0 border-b border-[var(--border-subtle)] pb-6">
      {metrics.map((metric, i) => (
        <div
          key={metric.label}
          className={`pr-8 ${i > 0 ? 'border-l border-[var(--border-subtle)] pl-8' : ''}`}
        >
          <div
            className="mb-1"
            style={{
              fontFamily: 'var(--font-meta)',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--text-muted)',
            }}
          >
            {metric.label}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.6rem',
              fontWeight: 700,
              lineHeight: 1,
              color: 'var(--text-primary)',
              marginBottom: '0.2rem',
            }}
          >
            {metric.value}
          </div>
          {metric.subtitle && (
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '0.72rem',
                color: trendColors[metric.trend || 'neutral'],
              }}
            >
              {metric.subtitle}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
