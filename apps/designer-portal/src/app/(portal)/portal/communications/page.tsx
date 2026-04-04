'use client';

import Link from 'next/link';
import { useCommsDashboard, useRecentActivity, useUpcomingSends } from '@patina/supabase';
import { StrataMark } from '@/components/portal/strata-mark';
import { MetricBlock } from '@/components/portal/metric-block';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const sections = [
  { label: 'Campaigns', href: '/portal/communications/campaigns', description: 'Create and manage email campaigns' },
  { label: 'Templates', href: '/portal/communications/templates', description: 'Email template library' },
  { label: 'Audiences', href: '/portal/communications/audiences', description: 'Manage recipient segments' },
];

export default function CommunicationsPage() {
  const { data: dashboard, isLoading } = useCommsDashboard() as { data: Any; isLoading: boolean };
  const { data: rawActivity } = useRecentActivity() as { data: Any };
  const { data: rawSends } = useUpcomingSends() as { data: Any };

  const activity = Array.isArray(rawActivity) ? rawActivity : [];
  const sends = Array.isArray(rawSends) ? rawSends : [];
  const stats = dashboard?.stats || {};

  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-6">Communications</h1>

      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <MetricBlock label="Emails Sent" value={stats.totalSent ?? 0} />
        <MetricBlock label="Open Rate" value={stats.openRate ? `${Math.round(stats.openRate * 100)}%` : '—'} />
        <MetricBlock label="Click Rate" value={stats.clickRate ? `${Math.round(stats.clickRate * 100)}%` : '—'} />
        <MetricBlock label="Health" value={stats.deliveryHealth || 'Unknown'} trend={stats.deliveryHealth === 'healthy' ? 'up' : stats.deliveryHealth === 'critical' ? 'down' : 'neutral'} />
      </div>

      <StrataMark variant="full" />

      {sections.map((section) => (
        <Link key={section.label} href={section.href} className="block border-b border-[var(--border-subtle)] py-5 no-underline transition-colors hover:bg-[var(--bg-hover)]">
          <span className="type-label text-[var(--text-primary)]">{section.label}</span>
          <p className="type-body-small mt-1">{section.description}</p>
        </Link>
      ))}

      {sends.length > 0 && (
        <>
          <StrataMark variant="mini" />
          <h2 className="type-meta mb-4">Upcoming Sends</h2>
          {sends.map((send: Any) => (
            <div key={send.id} className="border-b border-[var(--border-subtle)] py-4">
              <span className="type-label">{send.name || send.subject}</span>
              <div className="type-label-secondary mt-1">
                {send.scheduled_for ? new Date(send.scheduled_for).toLocaleString() : ''} · {send.total_recipients || 0} recipients
              </div>
            </div>
          ))}
        </>
      )}

      {activity.length > 0 && (
        <>
          <StrataMark variant="mini" />
          <h2 className="type-meta mb-4">Recent Activity</h2>
          {activity.slice(0, 10).map((item: Any) => (
            <div key={item.id} className="border-b border-[var(--border-subtle)] py-3">
              <span className="type-body-small">{item.type}: {item.status}</span>
              <span className="type-meta ml-2">{item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
