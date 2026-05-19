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
// F2 admin-portal help-system migration — Sprint 3 Stream F2.
// Voice is utility-first: tooltips on every headline metric (what does this
// number measure? where is it sourced from?), section-intro copy on the two
// side panels (so the operator understands what "Recent activity" surfaces
// and what "System health" gates). InfoIcon is used throughout because none
// of the dashboard's surfaces are Patina-coined vocabulary — they are
// industry-standard operator concepts. Spec §4.2, §9.2, §12.4.
import { InfoIcon, SectionIntro, SurfaceKeys } from '@patina/help-system';

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

      {/* Section-level intro under the page header — gives the operator a
          one-sentence orientation for what the dashboard surfaces and how
          stale the data is. CMS-authored; renders nothing on a clean miss. */}
      <SectionIntro
        surfaceKey={SurfaceKeys.AdminPortal.Overview.Intro}
        fallback="Live platform overview. Metrics refresh on page load."
        className="-mt-4 mb-8 max-w-prose"
      />

      <MetricsRow>
        {/* Each headline metric gets an InfoIcon so an operator unfamiliar
            with the metric definition can hover for the source-of-truth.
            InfoIcon (not Strata) because these are generic operator concepts,
            not Patina-coined vocabulary — spec §4.2. */}
        <MetricBlock
          label="Pending applications"
          labelExtra={
            <InfoIcon
              surfaceKey={SurfaceKeys.AdminPortal.Overview.Metric.PendingApplications}
              fallback="Designer and maker applications awaiting review."
            />
          }
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
          labelExtra={
            <InfoIcon
              surfaceKey={SurfaceKeys.AdminPortal.Overview.Metric.VendorPipeline}
              fallback="Vendors currently in active onboarding or live status."
            />
          }
          value={dash(livePartners)}
          change={`${greenTriage} green · ${awaitingLeah} awaiting Leah`}
          trend="neutral"
        />
        <MetricBlock
          label="Comms sent (24h)"
          labelExtra={
            <InfoIcon
              surfaceKey={SurfaceKeys.AdminPortal.Overview.Metric.CommsSent}
              fallback="Emails dispatched via the Communications service in the last 24 hours."
            />
          }
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
          labelExtra={
            <InfoIcon
              surfaceKey={SurfaceKeys.AdminPortal.Overview.Metric.TotalOrders}
              fallback="All-time order count across every status."
            />
          }
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
          {/* Section-level intro — utility voice, explains what events end up
              here. The existing inline copy below stays as fallback context
              for first-time operators until Sanity content lands. */}
          <SectionIntro
            surfaceKey={SurfaceKeys.AdminPortal.Overview.Section.RecentActivity}
            fallback="Privileged actions stream into the audit log in real time."
            className="mb-2"
          />
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
          {/* Service-status panel — section intro tells the operator how
              freshness and "healthy" are defined. */}
          <SectionIntro
            surfaceKey={SurfaceKeys.AdminPortal.Overview.Section.SystemHealth}
            fallback="Live readiness of each backend service."
            className="mb-3"
          />
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
