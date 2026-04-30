'use client';

import { useMemo } from 'react';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  StatusDot,
  type StatusVariant,
} from '@/components/portal';
import { useSystemHealth } from '@/hooks/use-system-health';
import type { ServiceHealth, ServiceStatus } from '@/app/api/admin/health/route';

const STATUS_VARIANT: Record<ServiceStatus, StatusVariant> = {
  healthy: 'success',
  degraded: 'warning',
  down: 'error',
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  down: 'Down',
};

function formatLatency(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  return `${Math.round(ms)}ms`;
}

function formatChecked(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString();
}

export default function HealthPage() {
  const { data, isLoading, isError, error, dataUpdatedAt } = useSystemHealth();
  const services: ServiceHealth[] = data?.services ?? [];
  const overall = data?.overall ?? 'healthy';

  const aggregate = useMemo(() => {
    const total = services.length;
    const healthy = services.filter((s) => s.status === 'healthy').length;
    const latencies = services.map((s) => s.latencyMs ?? 0).filter((n) => n > 0);
    const avgLatency = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;
    const downCount = services.filter((s) => s.status === 'down').length;
    return { total, healthy, avgLatency, downCount };
  }, [services]);

  return (
    <div>
      <PageHeader
        title="System"
        accent="Health"
        description="Live status across orders, media, projects, and Supabase. Polled every 15 seconds."
      />

      {isLoading && services.length === 0 ? (
        <MetricsRow>
          <MetricBlock label="Services" value="—" />
          <MetricBlock label="Avg Latency" value="—" />
          <MetricBlock label="Down" value="—" />
          <MetricBlock label="Last Check" value="—" />
        </MetricsRow>
      ) : (
        <MetricsRow>
          <MetricBlock
            label="Services"
            value={`${aggregate.healthy}/${aggregate.total}`}
            change={
              overall === 'healthy'
                ? 'All healthy'
                : overall === 'degraded'
                  ? 'Some degraded'
                  : 'Service down'
            }
            trend={overall === 'healthy' ? 'up' : overall === 'down' ? 'down' : 'neutral'}
          />
          <MetricBlock
            label="Avg Latency"
            value={`${aggregate.avgLatency}ms`}
            change={aggregate.avgLatency > 1500 ? 'Above 1.5s threshold' : 'Within budget'}
            trend={aggregate.avgLatency > 1500 ? 'down' : 'up'}
          />
          <MetricBlock
            label="Down"
            value={String(aggregate.downCount)}
            change={aggregate.downCount === 0 ? 'No outages' : 'Investigate now'}
            trend={aggregate.downCount === 0 ? 'up' : 'down'}
          />
          <MetricBlock
            label="Last Check"
            value={formatChecked(data?.checkedAt ?? new Date(dataUpdatedAt).toISOString())}
            change="Auto-refresh 15s"
            trend="neutral"
          />
        </MetricsRow>
      )}

      {isError ? (
        <Section title="Service Status" className="mt-10">
          <div className="border border-[var(--color-error)]/40 bg-[var(--color-error)]/5 px-4 py-3 text-[var(--color-error)] type-body-small">
            Failed to load health: {(error as Error)?.message ?? 'unknown error'}
          </div>
        </Section>
      ) : (
        <Section title="Service Status" className="mt-10">
          {services.length === 0 && isLoading ? (
            <div className="type-meta py-8 text-center">Pinging services…</div>
          ) : (
            <div>
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between border-b border-[var(--border-subtle)] py-4 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <StatusDot variant={STATUS_VARIANT[service.status]} />
                    <span className="type-item-name">{service.name}</span>
                    {service.message && (
                      <span className="type-meta-small text-[var(--text-muted)]">
                        {service.message}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <div className="type-meta-small">Latency</div>
                      <div className="type-body-small font-mono">
                        {formatLatency(service.latencyMs)}
                      </div>
                    </div>
                    {service.details?.database && (
                      <div className="text-right">
                        <div className="type-meta-small">Database</div>
                        <div className="type-body-small font-mono">
                          {service.details.database}
                        </div>
                      </div>
                    )}
                    {service.details?.uptime && (
                      <div className="text-right">
                        <div className="type-meta-small">Uptime</div>
                        <div className="type-body-small font-mono">{service.details.uptime}</div>
                      </div>
                    )}
                    <StatusDot
                      variant={STATUS_VARIANT[service.status]}
                      label={STATUS_LABEL[service.status]}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
