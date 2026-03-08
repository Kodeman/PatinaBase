'use client';

import { useState } from 'react';
import {
  useIsAdmin,
  useInsightsOverview,
  useWaitlistTimeSeries,
  useWaitlistStats,
  useWaitlistEntries,
  useUtmAttribution,
  useEngagementScoreDistribution,
  useTopEngagedUsers,
  useActiveUsersByPlatform,
  useConversionFunnel,
  useDesignerFunnel,
  useConsumerFunnel,
} from '@patina/supabase';
import type { WaitlistEntry } from '@patina/supabase';
import {
  Users,
  TrendingUp,
  Activity,
  BarChart3,
  ArrowUpRight,
  ShieldAlert,
  Globe,
  Puzzle,
  Monitor,
  Smartphone,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart } from './components/BarChart';
import { FunnelChart } from './components/FunnelChart';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type Tab = 'overview' | 'leads' | 'engagement' | 'funnels';
type DateRange = 7 | 30 | 90;

// ═══════════════════════════════════════════════════════════════════════════
// INLINE COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function StatsCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl p-5 border border-patina-clay-beige/20',
        highlight && 'border-patina-mocha-brown'
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            highlight
              ? 'bg-patina-mocha-brown text-white'
              : 'bg-patina-off-white text-patina-mocha-brown'
          )}
        >
          {icon}
        </div>
      </div>
      <p className="text-2xl font-display font-semibold text-patina-charcoal">{value}</p>
      <p className="text-sm text-patina-clay-beige mt-1">{label}</p>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    high: 'bg-green-100 text-green-700',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-amber-100 text-amber-700',
    minimal: 'bg-patina-off-white text-patina-clay-beige',
  };

  return (
    <span
      className={cn(
        'px-2 py-0.5 rounded-full text-xs font-medium',
        styles[tier] || styles.minimal
      )}
    >
      {tier}
    </span>
  );
}

const platformConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  website: { label: 'Website', color: 'bg-blue-500', icon: <Globe className="w-4 h-4" /> },
  extension: { label: 'Extension', color: 'bg-amber-500', icon: <Puzzle className="w-4 h-4" /> },
  portal: { label: 'Portal', color: 'bg-green-500', icon: <Monitor className="w-4 h-4" /> },
  ios: { label: 'iOS', color: 'bg-purple-400', icon: <Smartphone className="w-4 h-4" /> },
};

function PlatformBars({ data, className }: { data: { platform: string; count: number }[]; className?: string }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className={cn('bg-white rounded-xl border border-patina-clay-beige/20 p-6', className)}>
      <h2 className="font-display text-lg font-semibold text-patina-charcoal mb-4">
        Active Users by Platform
      </h2>

      <div className="space-y-4">
        {data.map((item) => {
          const config = platformConfig[item.platform] || {
            label: item.platform,
            color: 'bg-patina-clay-beige',
            icon: <Activity className="w-4 h-4" />,
          };
          const percentage = (item.count / maxCount) * 100;

          return (
            <div key={item.platform}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-patina-clay-beige">{config.icon}</span>
                  <span className="text-sm text-patina-charcoal">{config.label}</span>
                </div>
                <span className="text-sm font-medium text-patina-charcoal">
                  {item.count.toLocaleString()}
                </span>
              </div>
              <div className="h-2 bg-patina-off-white rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all', config.color)}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}

        {data.length === 0 && (
          <p className="text-sm text-patina-clay-beige">No platform activity yet.</p>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-white rounded-xl border border-patina-clay-beige/20" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-64 bg-white rounded-xl border border-patina-clay-beige/20" />
        <div className="h-64 bg-white rounded-xl border border-patina-clay-beige/20" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB CONTENT
// ═══════════════════════════════════════════════════════════════════════════

function OverviewTab({ dateRange }: { dateRange: DateRange }) {
  const { data: overview, isLoading: loadingOverview } = useInsightsOverview();
  const { data: timeSeries = [], isLoading: loadingTS } = useWaitlistTimeSeries(dateRange);
  const { data: platformData = [] } = useActiveUsersByPlatform(dateRange);
  const { data: funnelSteps = [] } = useConversionFunnel();

  if (loadingOverview) return <LoadingSkeleton />;

  // Trim timeseries to last N data points for readability
  const chartData = timeSeries.slice(-Math.min(timeSeries.length, dateRange <= 30 ? 30 : 45));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          label="Total Waitlist"
          value={overview ? overview.totalWaitlist.toLocaleString() : '--'}
          icon={<Users className="w-5 h-5" />}
          highlight
        />
        <StatsCard
          label="Conversion Rate"
          value={overview ? `${overview.conversionRate.toFixed(1)}%` : '--'}
          icon={<ArrowUpRight className="w-5 h-5" />}
        />
        <StatsCard
          label="Active Users (7d)"
          value={overview ? overview.activeUsers7d.toLocaleString() : '--'}
          icon={<Activity className="w-5 h-5" />}
        />
        <StatsCard
          label="Avg Engagement Score"
          value={overview ? String(overview.avgEngagementScore) : '--'}
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BarChart
          title="Waitlist Signups"
          data={chartData.map((d) => ({
            label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            value: d.count,
          }))}
        />
        <PlatformBars data={platformData} />
      </div>

      {funnelSteps.length > 0 && (
        <FunnelChart title="Conversion Funnel" steps={funnelSteps} />
      )}
    </div>
  );
}

function LeadsTab({ dateRange }: { dateRange: DateRange }) {
  const { data: stats } = useWaitlistStats();
  const { data: timeSeries = [] } = useWaitlistTimeSeries(dateRange);
  const { data: utmData = [] } = useUtmAttribution();
  const { data: recentEntries = [] } = useWaitlistEntries({ limit: 20 });

  const chartData = timeSeries.slice(-Math.min(timeSeries.length, dateRange <= 30 ? 30 : 45));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatsCard
          label="Total Signups"
          value={stats ? stats.total.toLocaleString() : '--'}
          icon={<Users className="w-5 h-5" />}
          highlight
        />
        <StatsCard
          label="Designers"
          value={stats ? (stats.byRole['designer'] || 0).toLocaleString() : '--'}
          icon={<Users className="w-5 h-5" />}
        />
        <StatsCard
          label="Consumers"
          value={stats ? (stats.byRole['consumer'] || 0).toLocaleString() : '--'}
          icon={<Users className="w-5 h-5" />}
        />
        <StatsCard
          label="Converted"
          value={stats ? stats.converted.toLocaleString() : '--'}
          icon={<ArrowUpRight className="w-5 h-5" />}
        />
      </div>

      <BarChart
        title="Signups Over Time"
        data={chartData.map((d) => ({
          label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: d.count,
        }))}
      />

      {/* UTM Attribution Table */}
      <div className="bg-white rounded-xl border border-patina-clay-beige/20">
        <div className="p-4 border-b border-patina-clay-beige/10">
          <h2 className="font-display text-lg font-semibold text-patina-charcoal">
            UTM Attribution
          </h2>
        </div>
        {utmData.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-patina-clay-beige">No UTM data yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-patina-clay-beige/10">
                  <th className="text-left px-4 py-3 text-patina-clay-beige font-medium">Source</th>
                  <th className="text-left px-4 py-3 text-patina-clay-beige font-medium">Medium</th>
                  <th className="text-left px-4 py-3 text-patina-clay-beige font-medium">Campaign</th>
                  <th className="text-right px-4 py-3 text-patina-clay-beige font-medium">Signups</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-patina-clay-beige/10">
                {utmData.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 text-patina-charcoal">{row.utmSource || '(direct)'}</td>
                    <td className="px-4 py-3 text-patina-charcoal">{row.utmMedium || '(none)'}</td>
                    <td className="px-4 py-3 text-patina-charcoal">{row.utmCampaign || '(none)'}</td>
                    <td className="px-4 py-3 text-right font-medium text-patina-charcoal">
                      {row.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Waitlist Entries */}
      <div className="bg-white rounded-xl border border-patina-clay-beige/20">
        <div className="p-4 border-b border-patina-clay-beige/10">
          <h2 className="font-display text-lg font-semibold text-patina-charcoal">
            Recent Signups
          </h2>
        </div>
        {recentEntries.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-patina-clay-beige">No waitlist entries yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-patina-clay-beige/10">
            {recentEntries.slice(0, 20).map((entry: WaitlistEntry) => (
              <div key={entry.id} className="px-4 py-3 flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-patina-off-white flex items-center justify-center text-patina-mocha-brown text-xs font-medium">
                  {entry.email[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-patina-charcoal truncate">{entry.email}</p>
                  <p className="text-xs text-patina-clay-beige">
                    {entry.source} &bull; {entry.role}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-patina-clay-beige">
                    {new Date(entry.createdAt).toLocaleDateString()}
                  </p>
                  {entry.convertedAt && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Converted
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EngagementTab({ dateRange }: { dateRange: DateRange }) {
  const { data: distribution = [] } = useEngagementScoreDistribution();
  const { data: topUsers = [] } = useTopEngagedUsers(15);
  const { data: platformData = [] } = useActiveUsersByPlatform(dateRange);

  // Calculate cross-platform users (users on 2+ platforms) from top users
  const crossPlatformCount = topUsers.filter((u) => u.currentScore > 0).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {distribution.map((d) => (
          <StatsCard
            key={d.tier}
            label={`${d.tier.charAt(0).toUpperCase() + d.tier.slice(1)} Tier`}
            value={d.count.toLocaleString()}
            icon={<Activity className="w-5 h-5" />}
            highlight={d.tier === 'high'}
          />
        ))}
        {distribution.length === 0 &&
          ['High', 'Medium', 'Low', 'Minimal'].map((tier) => (
            <StatsCard
              key={tier}
              label={`${tier} Tier`}
              value="0"
              icon={<Activity className="w-5 h-5" />}
            />
          ))}
      </div>

      {/* Score Distribution Bars */}
      {distribution.length > 0 && (
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
          <h2 className="font-display text-lg font-semibold text-patina-charcoal mb-4">
            Score Distribution
          </h2>
          <div className="space-y-3">
            {distribution.map((d) => {
              const maxCount = Math.max(...distribution.map((x) => x.count), 1);
              const percentage = (d.count / maxCount) * 100;
              const tierColors: Record<string, string> = {
                high: 'bg-green-500',
                medium: 'bg-blue-500',
                low: 'bg-amber-500',
                minimal: 'bg-patina-clay-beige',
              };

              return (
                <div key={d.tier}>
                  <div className="flex items-center justify-between mb-1">
                    <TierBadge tier={d.tier} />
                    <span className="text-sm font-medium text-patina-charcoal">
                      {d.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 bg-patina-off-white rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', tierColors[d.tier] || 'bg-patina-clay-beige')}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Engaged Users Leaderboard */}
      <div className="bg-white rounded-xl border border-patina-clay-beige/20">
        <div className="p-4 border-b border-patina-clay-beige/10">
          <h2 className="font-display text-lg font-semibold text-patina-charcoal">
            Top Engaged Users
          </h2>
        </div>
        {topUsers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-patina-clay-beige">No engagement data yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-patina-clay-beige/10">
                  <th className="text-left px-4 py-3 text-patina-clay-beige font-medium">#</th>
                  <th className="text-left px-4 py-3 text-patina-clay-beige font-medium">User</th>
                  <th className="text-left px-4 py-3 text-patina-clay-beige font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-patina-clay-beige font-medium">Tier</th>
                  <th className="text-right px-4 py-3 text-patina-clay-beige font-medium">Score</th>
                  <th className="text-right px-4 py-3 text-patina-clay-beige font-medium">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-patina-clay-beige/10">
                {topUsers.map((user, i) => (
                  <tr key={user.id}>
                    <td className="px-4 py-3 text-patina-clay-beige">{i + 1}</td>
                    <td className="px-4 py-3 text-patina-charcoal">{user.email}</td>
                    <td className="px-4 py-3 text-patina-charcoal capitalize">{user.role}</td>
                    <td className="px-4 py-3">
                      <TierBadge tier={user.engagementTier} />
                    </td>
                    <td className="px-4 py-3 text-right font-display font-semibold text-patina-charcoal">
                      {user.currentScore}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-patina-clay-beige">
                      {user.lastActiveAt
                        ? new Date(user.lastActiveAt).toLocaleDateString()
                        : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PlatformBars data={platformData} />
    </div>
  );
}

function FunnelsTab() {
  const { data: conversionSteps = [], isLoading: loadingConversion } = useConversionFunnel();
  const { data: designerSteps = [], isLoading: loadingDesigner } = useDesignerFunnel();
  const { data: consumerSteps = [], isLoading: loadingConsumer } = useConsumerFunnel();

  if (loadingConversion && loadingDesigner && loadingConsumer) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="space-y-6">
      <FunnelChart title="Overall Conversion Funnel" steps={conversionSteps} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FunnelChart title="Designer Funnel" steps={designerSteps} />
        <FunnelChart title="Consumer Funnel" steps={consumerSteps} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function InsightsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [dateRange, setDateRange] = useState<DateRange>(30);
  const { isAdmin, isLoading: loadingAdmin } = useIsAdmin();

  if (loadingAdmin) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="animate-pulse text-patina-clay-beige">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-patina-off-white flex items-center justify-center">
        <div className="text-center">
          <ShieldAlert className="w-12 h-12 text-patina-clay-beige mx-auto mb-4" />
          <h1 className="font-display text-xl font-semibold text-patina-charcoal mb-2">
            Access Denied
          </h1>
          <p className="text-patina-clay-beige">
            You need admin permissions to view insights.
          </p>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'leads', label: 'Leads' },
    { key: 'engagement', label: 'Engagement' },
    { key: 'funnels', label: 'Funnels' },
  ];

  const dateRanges: { value: DateRange; label: string }[] = [
    { value: 7, label: '7d' },
    { value: 30, label: '30d' },
    { value: 90, label: '90d' },
  ];

  return (
    <div className="min-h-screen bg-patina-off-white">
      {/* Header */}
      <div className="bg-white border-b border-patina-clay-beige/20">
        <div className="px-6 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-2xl font-semibold text-patina-charcoal">
                Insights
              </h1>
              <p className="text-patina-clay-beige mt-1">
                Analytics and engagement metrics
              </p>
            </div>

            {/* Date Range Selector */}
            <div className="flex gap-1 bg-patina-off-white rounded-lg p-1">
              {dateRanges.map((dr) => (
                <button
                  key={dr.value}
                  onClick={() => setDateRange(dr.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    dateRange === dr.value
                      ? 'bg-white text-patina-charcoal shadow-sm'
                      : 'text-patina-clay-beige hover:text-patina-mocha-brown'
                  )}
                >
                  {dr.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  tab === t.key
                    ? 'bg-patina-charcoal text-white'
                    : 'bg-patina-off-white text-patina-mocha-brown hover:bg-patina-soft-cream'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {tab === 'overview' && <OverviewTab dateRange={dateRange} />}
        {tab === 'leads' && <LeadsTab dateRange={dateRange} />}
        {tab === 'engagement' && <EngagementTab dateRange={dateRange} />}
        {tab === 'funnels' && <FunnelsTab />}
      </div>
    </div>
  );
}
