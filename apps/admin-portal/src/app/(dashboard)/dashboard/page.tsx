'use client';

import Link from 'next/link';
import { PostHogStatsWidget } from '@/components/dashboards/PostHogStatsWidget';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  StrataMark,
  StatusDot,
  type StatusVariant,
} from '@/components/portal';
import { useDashboardMetrics } from '@/hooks/use-dashboard-metrics';
import { useSystemHealth } from '@/hooks/use-system-health';
import type { ServiceStatus } from '@/app/api/admin/health/route';

const STATUS_VARIANT: Record<ServiceStatus, StatusVariant> = {
  healthy: 'success',
  degraded: 'warning',
  down: 'error',
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const dash = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString();

export default function DashboardPage() {
  const { pipeline, comms, applications, orders } = useDashboardMetrics();
  const health = useSystemHealth();

  const pendingApps = applications.data?.totalAwaiting ?? null;
  const designerPending = applications.data?.designer.total ?? 0;
  const makerPending = applications.data?.maker.total ?? 0;

  const livePartners = pipeline.data?.live_partners ?? null;
  const greenTriage = pipeline.data?.by_triage.green ?? 0;
  const awaitingLeah = pipeline.data?.awaiting_leah ?? 0;

  const sent24h = comms.data?.stats.totalSent ?? null;
  const openRate = comms.data?.stats.openRate;

  const ordersTotal = orders.data ?? null;

  return (
    <div>
      <PageHeader
        title={getGreeting()}
        accent="administrator"
        description="Overview of platform activity and key metrics."
      />

      <MetricsRow>
        <MetricBlock
          label="Pending applications"
          value={dash(pendingApps)}
          change={
            pendingApps && pendingApps > 0
              ? `${designerPending} designer · ${makerPending} maker`
              : 'Queue clear'
          }
          trend={pendingApps && pendingApps > 0 ? 'neutral' : 'up'}
        />
        <MetricBlock
          label="Vendor pipeline (live)"
          value={dash(livePartners)}
          change={`${greenTriage} green · ${awaitingLeah} awaiting Leah`}
          trend="neutral"
        />
        <MetricBlock
          label="Comms sent (24h)"
          value={dash(sent24h)}
          change={
            openRate !== undefined && openRate !== null
              ? `${(openRate * 100).toFixed(1)}% open rate`
              : 'No deliveries yet'
          }
          trend={openRate && openRate > 0.2 ? 'up' : 'neutral'}
        />
        <MetricBlock
          label="Total orders"
          value={dash(ordersTotal)}
          change="All-time"
          trend="neutral"
        />
      </MetricsRow>

      <div className="mt-10">
        <PostHogStatsWidget />
      </div>

      <div className="mt-6">
        <StrataMark variant="mini" />
      </div>

      <div className="mt-6 grid gap-10 md:grid-cols-[58%_42%]">
        <Section
          title="Recent activity"
          action={
            <Link
              href={'/audit' as any}
              className="type-meta-small text-[var(--accent-primary)] hover:underline"
            >
              View audit log →
            </Link>
          }
        >
          <p className="type-body-small text-[var(--text-muted)]">
            Audit events stream live to <Link href={'/audit' as any} className="underline">/audit</Link>.
            Each privileged action — role change, application decision, user suspension — is recorded with
            actor and timestamp.
          </p>
        </Section>

        <Section
          title="System health"
          action={
            <Link
              href={'/health' as any}
              className="type-meta-small text-[var(--accent-primary)] hover:underline"
            >
              Open status →
            </Link>
          }
        >
          <div>
            {health.data?.services.map((service) => (
              <div
                key={service.name}
                className="flex items-center justify-between border-b border-[var(--border-subtle)] py-3 last:border-b-0"
              >
                <span className="type-label">{service.name}</span>
                <StatusDot
                  variant={STATUS_VARIANT[service.status]}
                  label={
                    service.status === 'healthy'
                      ? 'Healthy'
                      : service.status === 'degraded'
                        ? 'Degraded'
                        : 'Down'
                  }
                />
              </div>
            )) ?? (
              <p className="type-body-small text-[var(--text-muted)]">Loading service status…</p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
