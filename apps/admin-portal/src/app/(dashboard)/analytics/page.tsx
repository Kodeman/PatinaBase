'use client';

import { useQuery } from '@tanstack/react-query';
import { useCommsDashboard } from '@patina/supabase/hooks';
import { usePipelineMetrics } from '@/hooks/use-pipeline';
import { useApplicationsMetrics } from '@/hooks/use-dashboard-metrics';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  StatusDot,
  type StatusVariant,
} from '@/components/portal';
import type { PlatformCounts } from '@/app/api/admin/platform-counts/route';

const POLL_MS = 5 * 60 * 1000;

async function fetchPlatformCounts(): Promise<PlatformCounts> {
  const res = await fetch('/api/admin/platform-counts', { cache: 'no-store' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to load platform counts (${res.status})`);
  }
  const json = (await res.json()) as { data: PlatformCounts };
  return json.data;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const dash = (n: number | null | undefined): string =>
  n === null || n === undefined ? '—' : n.toLocaleString();

const HEALTH_VARIANT: Record<'healthy' | 'warning' | 'critical', StatusVariant> = {
  healthy: 'success',
  warning: 'warning',
  critical: 'error',
};

export default function AnalyticsPage() {
  const platform = useQuery({
    queryKey: ['platform-counts'],
    queryFn: fetchPlatformCounts,
    refetchInterval: POLL_MS,
    staleTime: 60_000,
  });

  const comms = useCommsDashboard('30d');
  const pipeline = usePipelineMetrics();
  const applications = useApplicationsMetrics();

  const stats = platform.data;
  const commsStats = comms.data?.stats;

  const totalUsers = stats?.profiles ?? null;
  const publishedProducts = stats?.publishedProducts ?? null;
  const totalProducts = stats?.products ?? null;
  const proposals = stats?.proposals ?? null;
  const earningsCents = stats?.designerEarningsTotal ?? 0;
  const pendingPayouts = stats?.designerPayoutsPending ?? null;

  return (
    <div>
      <PageHeader
        title="Analytics"
        accent="overview"
        description="Cross-domain metrics over the last 30 days. Polls every 5 minutes."
      />

      <MetricsRow>
        <MetricBlock
          label="Total users"
          value={dash(totalUsers)}
          change="All-time profiles"
          trend="neutral"
        />
        <MetricBlock
          label="Published products"
          value={dash(publishedProducts)}
          change={totalProducts !== null ? `of ${totalProducts.toLocaleString()} total` : ''}
          trend="up"
        />
        <MetricBlock
          label="Proposals"
          value={dash(proposals)}
          change="All-time"
          trend="neutral"
        />
        <MetricBlock
          label="Awaiting earnings"
          value={earningsCents ? formatCents(earningsCents) : '—'}
          change={pendingPayouts !== null ? `${pendingPayouts.toLocaleString()} pending payouts` : ''}
          trend={pendingPayouts && pendingPayouts > 0 ? 'down' : 'neutral'}
        />
      </MetricsRow>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <Section title="Communications (30 days)">
          {comms.isLoading && !commsStats ? (
            <p className="type-body-small text-[var(--text-muted)]">Loading…</p>
          ) : commsStats ? (
            <div>
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="type-meta-small">Total sent</p>
                  <p className="type-data-large mt-1">{commsStats.totalSent.toLocaleString()}</p>
                </div>
                <div>
                  <p className="type-meta-small">Open rate</p>
                  <p className="type-data-large mt-1">{(commsStats.openRate * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="type-meta-small">Click rate</p>
                  <p className="type-data-large mt-1">{(commsStats.clickRate * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="type-meta-small">Bounce rate</p>
                  <p className="type-data-large mt-1">{(commsStats.bounceRate * 100).toFixed(1)}%</p>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--border-subtle)] pt-3">
                <span className="type-label">Delivery health</span>
                <StatusDot
                  variant={HEALTH_VARIANT[commsStats.deliveryHealth]}
                  label={commsStats.deliveryHealth}
                />
              </div>
            </div>
          ) : (
            <p className="type-body-small italic text-[var(--text-muted)]">
              No comms data available.
            </p>
          )}
        </Section>

        <Section title="Vendor pipeline">
          {pipeline.isLoading && !pipeline.data ? (
            <p className="type-body-small text-[var(--text-muted)]">Loading…</p>
          ) : pipeline.data ? (
            <div>
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <p className="type-meta-small">Live partners</p>
                  <p className="type-data-large mt-1">
                    {pipeline.data.live_partners.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="type-meta-small">Total vendors</p>
                  <p className="type-data-large mt-1">
                    {pipeline.data.total_vendors.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="type-meta-small">Awaiting Leah</p>
                  <p className="type-data-large mt-1">
                    {pipeline.data.awaiting_leah.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="type-meta-small">Active cowork tasks</p>
                  <p className="type-data-large mt-1">
                    {pipeline.data.active_cowork_tasks.toLocaleString()}
                  </p>
                </div>
              </div>
              <p className="type-meta-small mb-2">Triage breakdown</p>
              <div className="grid grid-cols-4 gap-2">
                {(['green', 'yellow', 'orange', 'red'] as const).map((triage) => {
                  const variant: StatusVariant =
                    triage === 'green'
                      ? 'success'
                      : triage === 'yellow'
                        ? 'warning'
                        : triage === 'orange'
                          ? 'warning'
                          : 'error';
                  return (
                    <div
                      key={triage}
                      className="flex items-center justify-between border border-[var(--border-subtle)] px-3 py-2"
                    >
                      <StatusDot variant={variant} />
                      <span className="font-mono text-[0.85rem]">
                        {pipeline.data!.by_triage[triage].toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="type-body-small italic text-[var(--text-muted)]">
              No pipeline data available.
            </p>
          )}
        </Section>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <Section title="Applications queue">
          {applications.isLoading && !applications.data ? (
            <p className="type-body-small text-[var(--text-muted)]">Loading…</p>
          ) : applications.data ? (
            <div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="type-meta-small">Designer applications</p>
                  <p className="type-data-large mt-1">
                    {applications.data.designer.total.toLocaleString()}
                  </p>
                  <p className="type-meta-small mt-1">
                    {applications.data.designer.pending} pending ·{' '}
                    {applications.data.designer.inReview} in review
                  </p>
                </div>
                <div>
                  <p className="type-meta-small">Maker applications</p>
                  <p className="type-data-large mt-1">
                    {applications.data.maker.total.toLocaleString()}
                  </p>
                  <p className="type-meta-small mt-1">
                    {applications.data.maker.pending} pending ·{' '}
                    {applications.data.maker.inReview} in review
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="type-body-small italic text-[var(--text-muted)]">
              No application data available.
            </p>
          )}
        </Section>

        <Section title="Catalog & marketplace">
          {platform.isLoading && !stats ? (
            <p className="type-body-small text-[var(--text-muted)]">Loading…</p>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="type-meta-small">Vendors</p>
                <p className="type-data-large mt-1">{stats.vendors.toLocaleString()}</p>
              </div>
              <div>
                <p className="type-meta-small">Rooms</p>
                <p className="type-data-large mt-1">{stats.rooms.toLocaleString()}</p>
              </div>
              <div>
                <p className="type-meta-small">Total products</p>
                <p className="type-data-large mt-1">{stats.products.toLocaleString()}</p>
              </div>
              <div>
                <p className="type-meta-small">Pending designer payouts</p>
                <p className="type-data-large mt-1">{stats.designerPayoutsPending.toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <p className="type-body-small italic text-[var(--text-muted)]">
              No catalog data available.
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}
