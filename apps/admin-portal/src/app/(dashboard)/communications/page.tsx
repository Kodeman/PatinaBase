'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCommsDashboard } from '@patina/supabase/hooks';
import { Plus, ShieldCheck, Calendar, Clock, Mail } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  FilterTabs,
  LoadingStrata,
  StatusDot,
  type StatusVariant,
} from '@/components/portal';
// F2 admin-portal help-system migration. Communications dashboard surfaces
// industry-standard email metrics (open rate, click rate, delivery health)
// that benefit from per-metric tooltips so an unfamiliar operator can
// understand the source. The "Command Center" name itself is a Patina-coined
// label so it earns a StrataInfoIcon on the page-level intro.
import {
  EmptyState,
  InfoIcon,
  SectionIntro,
  StrataInfoIcon,
  SurfaceKeys,
  useHelpContent,
} from '@patina/help-system';

type TimeRange = '24h' | '7d' | '30d' | '90d';

const RANGES: { value: TimeRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

function activityVariant(status: string): StatusVariant {
  if (status === 'sent' || status === 'delivered' || status === 'opened' || status === 'clicked') return 'success';
  if (status === 'bounced' || status === 'failed' || status === 'complained') return 'error';
  if (status === 'sending' || status === 'unconfirmed') return 'warning';
  return 'neutral';
}

export default function CommunicationsPage() {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const { data, isLoading } = useCommsDashboard(timeRange);

  const stats = data?.stats;
  const healthLabel =
    stats?.deliveryHealth === 'healthy'
      ? 'Healthy'
      : stats?.deliveryHealth === 'warning'
        ? 'Warning'
        : stats?.deliveryHealth === 'critical'
          ? 'Critical'
          : '—';

  return (
    <div>
      <PageHeader
        title="Command"
        accent="Center"
        description="Email communications overview."
        actions={
          <div className="flex items-center gap-3">
            <FilterTabs items={RANGES} value={timeRange} onChange={setTimeRange} className="border-b-0" />
            <Button onClick={() => router.push('/communications/campaigns/new' as any)}>
              <Plus className="mr-2 h-4 w-4" />
              New Campaign
            </Button>
          </div>
        }
      />

      {/* Section-level intro under the header. "Command Center" is a Patina
          coined label so the StrataInfoIcon (not InfoIcon) marks the
          concept per spec §4.2. Renders inline next to the intro copy. */}
      <SectionIntro
        surfaceKey={SurfaceKeys.AdminPortal.Communications.ListIntro}
        fallback="Live email send volume, delivery health, and scheduled campaigns."
        className="-mt-4 mb-2 max-w-prose"
      />
      <div className="mb-6 flex items-center gap-1.5 text-[var(--text-muted)]">
        <span className="type-meta-small">What is Command Center?</span>
        <StrataInfoIcon
          surfaceKey={SurfaceKeys.AdminPortal.Communications.Concept.CommandCenter}
          fallback="Patina's internal name for the multi-channel comms hub. All email, in-app, and webhook deliveries route through it."
        /></div>

      {stats?.deliveryHealth === 'critical' && (
        <div className="mt-6 flex items-center gap-3 rounded-sm border border-[var(--color-error)] bg-[rgba(199,123,110,0.08)] p-4">
          <ShieldCheck className="h-5 w-5 shrink-0 text-[var(--color-error)]" />
          <div>
            <p className="type-label">Delivery Health Critical</p>
            <p className="type-body-small text-[var(--color-error)]">
              Bounce rate is {stats.bounceRate}%. Review bounced emails and clean your lists.
            </p>
          </div>
        </div>
      )}

      <MetricsRow>
        {/* InfoIcon (not Strata) on each metric — open rate, click rate, and
            delivery-health are industry-standard email metrics, not Patina
            vocabulary. Hover gives the operator the source-of-truth
            definition (which deliveries count, freshness window, etc.). */}
        <MetricBlock
          label="Emails Sent"
          labelExtra={
            <InfoIcon
              surfaceKey={SurfaceKeys.AdminPortal.Communications.Metric.EmailsSent}
              fallback="Total emails dispatched in the selected window."
            />
          }
          value={isLoading ? 0 : (stats?.totalSent ?? 0)}
        />
        <MetricBlock
          label="Open Rate"
          labelExtra={
            <InfoIcon
              surfaceKey={SurfaceKeys.AdminPortal.Communications.Metric.OpenRate}
              fallback="Share of delivered emails that triggered an open pixel."
            />
          }
          value={isLoading ? '0%' : `${stats?.openRate ?? 0}%`}
          trend="up"
        />
        <MetricBlock
          label="Click Rate"
          labelExtra={
            <InfoIcon
              surfaceKey={SurfaceKeys.AdminPortal.Communications.Metric.ClickRate}
              fallback="Share of delivered emails with at least one tracked link click."
            />
          }
          value={isLoading ? '0%' : `${stats?.clickRate ?? 0}%`}
          trend="up"
        />
        <MetricBlock
          label="Delivery Health"
          labelExtra={
            <InfoIcon
              surfaceKey={SurfaceKeys.AdminPortal.Communications.Metric.DeliveryHealth}
              fallback="Bounce-rate signal: green under 2%, warning 2-5%, critical above 5%."
            />
          }
          value={isLoading ? '—' : healthLabel}
          trend={
            stats?.deliveryHealth === 'critical'
              ? 'down'
              : stats?.deliveryHealth === 'warning'
                ? 'neutral'
                : 'up'
          }
        />
      </MetricsRow>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <Section title="Send Volume">
          {isLoading ? (
            <LoadingStrata />
          ) : data?.sendVolume && data.sendVolume.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.sendVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E2DD" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#8B7355' }}
                  tickFormatter={(d: string) => {
                    const date = new Date(d);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis tick={{ fontSize: 11, fill: '#8B7355' }} />
                <Tooltip
                  contentStyle={{ borderRadius: 4, fontSize: 12, borderColor: '#E5E2DD' }}
                  labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
                />
                <Bar dataKey="count" fill="#C4A57B" radius={[2, 2, 0, 0]} name="Emails" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <CommsEmptyState
              surfaceKey={SurfaceKeys.AdminPortal.Communications.Empty.NoSendData}
              fallback="No send data for this period."
            />
          )}
        </Section>

        <Section title="Recent Activity">
          {isLoading ? (
            <LoadingStrata />
          ) : data?.recentActivity && data.recentActivity.length > 0 ? (
            <div>
              {data.recentActivity.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-3 border-b border-[var(--border-subtle)] py-3 last:border-b-0"
                >
                  <StatusDot variant={activityVariant(event.status)} />
                  <div className="min-w-0 flex-1">
                    <p className="type-label truncate">{event.type.replace(/_/g, ' ')}</p>
                    <p className="type-meta-small">{formatRelativeTime(event.created_at)}</p>
                  </div>
                  <span className="type-meta-small capitalize">{event.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <CommsEmptyState
              surfaceKey={SurfaceKeys.AdminPortal.Communications.Empty.NoRecentActivity}
              fallback="No recent activity."
            />
          )}
        </Section>
      </div>

      <Section title="Scheduled Sends" className="mt-10">
        {data?.scheduledSends && data.scheduledSends.length > 0 ? (
          <div>
            {data.scheduledSends.map((send) => (
              <div
                key={send.id}
                onClick={() => router.push(`/communications/campaigns/${send.id}` as any)}
                className="flex cursor-pointer items-center gap-4 border-b border-[var(--border-subtle)] py-4 transition-colors hover:bg-[var(--bg-hover)]"
              >
                <Calendar className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                <div className="min-w-0 flex-1">
                  <p className="type-label truncate">{send.name}</p>
                  <p className="type-label-secondary truncate">{send.subject}</p>
                </div>
                <div className="type-meta-small flex shrink-0 items-center gap-2">
                  <Clock className="h-3 w-3" />
                  {new Date(send.scheduled_for).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </div>
                <span className="type-meta-small shrink-0">
                  {send.total_recipients.toLocaleString()} recipients
                </span>
              </div>
            ))}
          </div>
        ) : (
          <CommsEmptyState
            surfaceKey={SurfaceKeys.AdminPortal.Communications.Empty.NoScheduledSends}
            fallback="No scheduled campaigns."
          />
        )}
      </Section>
    </div>
  );
}

// ─── Empty-state wrapper (F2 admin-portal communications) ────────────────────
//
// Three distinct CMS surfaces — different copy for "no send data", "no recent
// activity", and "no scheduled sends." Each falls back to inline copy until
// Sanity content lands. The shared wrapper avoids three near-duplicate
// blocks while still giving each surface key its own authoring track.

interface CommsEmptyStateProps {
  surfaceKey: string;
  fallback: string;
}

function CommsEmptyState({ surfaceKey, fallback }: CommsEmptyStateProps) {
  const { data, isLoading } = useHelpContent(surfaceKey, 'emptyState');

  if (isLoading) {
    return <p className="type-body py-8 text-center italic text-[var(--text-muted)]">…</p>;
  }

  if (data) {
    return (
      <EmptyState
        surfaceKey={surfaceKey}
        icon={<Mail className="h-8 w-8 text-[var(--text-muted)]" strokeWidth={1.5} />}
      />
    );
  }

  return (
    <p className="type-body py-8 text-center text-[var(--text-muted)]">{fallback}</p>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
