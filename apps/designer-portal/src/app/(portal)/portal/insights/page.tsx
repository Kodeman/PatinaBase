'use client';

import { useAuth } from '@/hooks/use-auth';
import {
  useInsightsOverview,
  useWaitlistStats,
  useEngagementScoreDistribution,
  useTopEngagedUsers,
  useConversionFunnel,
} from '@patina/supabase';
import { StrataMark } from '@/components/portal/strata-mark';
import { MetricBlock } from '@/components/portal/metric-block';
import { DetailRow } from '@/components/portal/detail-row';
import { FieldGroup } from '@/components/portal/field-group';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function InsightsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const isAdmin = user?.roles?.includes('admin') ?? false;

  const { data: overview, isLoading: overviewLoading } = useInsightsOverview() as { data: Any; isLoading: boolean };
  const { data: waitlistStats } = useWaitlistStats() as { data: Any };
  const { data: engagement } = useEngagementScoreDistribution() as { data: Any };
  const { data: topUsers } = useTopEngagedUsers() as { data: Any };
  const { data: funnel } = useConversionFunnel() as { data: Any };

  if (authLoading) return <LoadingStrata />;

  if (!isAdmin) {
    return (
      <div className="pt-8">
        <h1 className="type-section-head mb-4">Insights</h1>
        <p className="type-body py-16 text-center text-[var(--text-muted)]">Access denied. Admin role required.</p>
      </div>
    );
  }

  if (overviewLoading) return <LoadingStrata />;

  const topUsersList = Array.isArray(topUsers) ? topUsers : [];
  const engagementDist = Array.isArray(engagement) ? engagement : [];
  const funnelData = Array.isArray(funnel) ? funnel : funnel?.steps || [];

  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-6">Insights</h1>

      {/* Overview */}
      <h2 className="type-meta mb-4">Overview</h2>
      <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
        <MetricBlock label="Total Signups" value={overview?.totalSignups ?? waitlistStats?.total ?? 0} />
        <MetricBlock label="Conversion Rate" value={overview?.conversionRate ? `${Math.round(overview.conversionRate * 100)}%` : '—'} />
        <MetricBlock label="Active Users" value={overview?.activeUsers ?? 0} />
        <MetricBlock label="Engagement Score" value={overview?.avgEngagementScore ? Math.round(overview.avgEngagementScore) : '—'} />
      </div>

      <StrataMark variant="mini" />

      {/* Engagement Distribution */}
      <h2 className="type-meta mb-4">Engagement Distribution</h2>
      {engagementDist.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {engagementDist.map((tier: Any) => (
            <div key={tier.tier || tier.label} className="py-3">
              <span className="type-label">{tier.tier || tier.label}</span>
              <span className="type-data-large ml-2">{tier.count || tier.value || 0}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body italic text-[var(--text-muted)]">No engagement data available.</p>
      )}

      <StrataMark variant="mini" />

      {/* Top Engaged Users */}
      <h2 className="type-meta mb-4">Top Engaged Users</h2>
      {topUsersList.length > 0 ? (
        <div>
          {topUsersList.slice(0, 10).map((u: Any, i: number) => (
            <div key={u.id || i} className="flex items-baseline justify-between border-b border-[var(--border-subtle)] py-3">
              <span className="type-label">{u.full_name || u.email || 'User'}</span>
              <span className="type-data-large text-[var(--accent-primary)]">{u.score || u.engagement_score || 0}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body italic text-[var(--text-muted)]">No user data available.</p>
      )}

      <StrataMark variant="mini" />

      {/* Conversion Funnel */}
      <h2 className="type-meta mb-4">Conversion Funnel</h2>
      {funnelData.length > 0 ? (
        <FieldGroup label="Funnel Steps">
          {funnelData.map((step: Any) => (
            <DetailRow key={step.name || step.step} label={step.name || step.step} value={`${step.count || step.value || 0} (${step.rate ? `${Math.round(step.rate * 100)}%` : '—'})`} />
          ))}
        </FieldGroup>
      ) : (
        <p className="type-body italic text-[var(--text-muted)]">No funnel data available.</p>
      )}
    </div>
  );
}
