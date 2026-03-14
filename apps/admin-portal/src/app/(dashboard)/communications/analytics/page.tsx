'use client';

import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  useAnalyticsOverview,
  useCampaignComparison,
  useRevenueAttribution,
  useEngagementCohorts,
  useDeliveryHealth,
} from '@patina/supabase/hooks';
import type {
  CampaignComparisonItem,
  EngagementCohortTier,
} from '@patina/supabase/hooks';
import {
  BarChart3,
  Send,
  Eye,
  MousePointer,
  AlertTriangle,
  TrendingDown,
  ShieldCheck,
  Users,
  ArrowRight,
  Loader2,
  CheckSquare,
  Square,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

type AnalyticsTab = 'overview' | 'comparison' | 'attribution' | 'cohorts' | 'delivery';
type Period = '7d' | '30d' | '90d';

export default function AnalyticsPage() {
  const [tab, setTab] = useState<AnalyticsTab>('overview');
  const [period, setPeriod] = useState<Period>('7d');

  const tabs: { key: AnalyticsTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'comparison', label: 'Campaign Comparison' },
    { key: 'attribution', label: 'Revenue Attribution' },
    { key: 'cohorts', label: 'Engagement Cohorts' },
    { key: 'delivery', label: 'Delivery Health' },
  ];

  const periods: { key: Period; label: string }[] = [
    { key: '7d', label: '7d' },
    { key: '30d', label: '30d' },
    { key: '90d', label: '90d' },
  ];

  return (
    <div className="min-h-screen bg-patina-off-white">
      {/* Header */}
      <div className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-patina-mocha-brown" />
            <div>
              <h1 className="text-2xl font-display font-semibold text-patina-charcoal">Analytics</h1>
              <p className="text-sm text-patina-clay-beige mt-0.5">
                Email performance metrics and insights
              </p>
            </div>
          </div>
          <div className="flex gap-1 bg-patina-off-white rounded-lg p-1">
            {periods.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-colors',
                  period === p.key
                    ? 'bg-white text-patina-charcoal shadow-sm'
                    : 'text-patina-clay-beige hover:text-patina-charcoal'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Tab bar */}
        <div className="flex gap-1 bg-white rounded-lg p-1 border border-patina-clay-beige/20 w-fit">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
                tab === t.key
                  ? 'bg-patina-mocha-brown text-white'
                  : 'text-patina-clay-beige hover:text-patina-charcoal'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {tab === 'overview' && <OverviewTab period={period} />}
        {tab === 'comparison' && <ComparisonTab />}
        {tab === 'attribution' && <AttributionTab period={period} />}
        {tab === 'cohorts' && <CohortsTab />}
        {tab === 'delivery' && <DeliveryTab period={period} />}
      </div>
    </div>
  );
}

// ─── Loading Spinner ─────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 text-patina-clay-beige animate-spin" />
    </div>
  );
}

// ─── Stat Card Component ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  subtitle,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-patina-off-white text-patina-mocha-brown">
          {icon}
        </div>
      </div>
      <p className="text-2xl font-display font-semibold text-patina-charcoal">{value}</p>
      <p className="text-sm text-patina-clay-beige mt-1">{label}</p>
      {subtitle && (
        <p className="text-xs text-patina-clay-beige/70 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
}

// ─── Chart date formatting ───────────────────────────────────────────────

function formatChartDate(d: string) {
  const date = new Date(d);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ─── Overview Tab ────────────────────────────────────────────────────────

function OverviewTab({ period }: { period: string }) {
  const { data, isLoading } = useAnalyticsOverview(period);

  if (isLoading) return <Spinner />;
  if (!data) return <EmptyState message="No analytics data available" />;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Sent"
          value={data.totalSent.toLocaleString()}
          icon={<Send className="w-5 h-5" />}
        />
        <StatCard
          label="Avg Open Rate"
          value={`${data.avgOpenRate}%`}
          icon={<Eye className="w-5 h-5" />}
          subtitle={`${data.totalOpened.toLocaleString()} opens`}
        />
        <StatCard
          label="Avg Click Rate"
          value={`${data.avgClickRate}%`}
          icon={<MousePointer className="w-5 h-5" />}
          subtitle={`${data.totalClicked.toLocaleString()} clicks`}
        />
        <StatCard
          label="Bounce Rate"
          value={`${data.bounceRate}%`}
          icon={<AlertTriangle className="w-5 h-5" />}
          subtitle={`${data.totalBounced.toLocaleString()} bounces`}
        />
      </div>

      {/* Time-series chart */}
      <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
        <h3 className="text-sm font-semibold text-patina-charcoal mb-4">
          Open &amp; Click Rates Over Time
        </h3>
        {data.timeSeries.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data.timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e0da" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#a39585' }}
                tickFormatter={formatChartDate}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: '#a39585' }}
                tickFormatter={(v: number) => `${v}%`}
                domain={[0, 'auto']}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: '#a39585' }}
                tickFormatter={(v: number) => `${v}%`}
                domain={[0, 'auto']}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e0da' }}
                labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
                formatter={(value, name) => [
                  `${value ?? 0}%`,
                  name === 'openRate' ? 'Open Rate' : 'Click Rate',
                ]}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="openRate"
                stroke="#8b7355"
                strokeWidth={2}
                dot={{ r: 3, fill: '#8b7355' }}
                name="openRate"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="clickRate"
                stroke="#3f3a34"
                strokeWidth={2}
                dot={{ r: 3, fill: '#3f3a34' }}
                name="clickRate"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No time-series data for this period" />
        )}
        <div className="flex items-center justify-center gap-6 mt-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-[#8b7355] rounded" />
            <span className="text-xs text-patina-clay-beige">Open Rate</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-0.5 bg-[#3f3a34] rounded" />
            <span className="text-xs text-patina-clay-beige">Click Rate</span>
          </div>
        </div>
      </div>

      {/* Top campaigns tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top by Opens */}
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
          <h3 className="text-sm font-semibold text-patina-charcoal mb-4">Top 5 by Opens</h3>
          {data.topByOpens.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-patina-clay-beige border-b border-patina-clay-beige/10">
                  <th className="pb-2 font-medium">Campaign</th>
                  <th className="pb-2 font-medium text-right">Opens</th>
                  <th className="pb-2 font-medium text-right">Sent</th>
                  <th className="pb-2 font-medium text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.topByOpens.map((c, i) => (
                  <tr key={i} className="border-b border-patina-clay-beige/5 last:border-0">
                    <td className="py-2.5 text-sm text-patina-charcoal truncate max-w-[200px]">
                      {c.name}
                    </td>
                    <td className="py-2.5 text-sm text-patina-charcoal text-right">
                      {(c.opens ?? 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 text-sm text-patina-clay-beige text-right">
                      {c.sent.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-sm text-patina-charcoal text-right font-medium">
                      {c.sent > 0 ? Math.round(((c.opens ?? 0) / c.sent) * 1000) / 10 : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-patina-clay-beige py-4">No campaign data</p>
          )}
        </div>

        {/* Top by Clicks */}
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
          <h3 className="text-sm font-semibold text-patina-charcoal mb-4">Top 5 by Clicks</h3>
          {data.topByClicks.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-patina-clay-beige border-b border-patina-clay-beige/10">
                  <th className="pb-2 font-medium">Campaign</th>
                  <th className="pb-2 font-medium text-right">Clicks</th>
                  <th className="pb-2 font-medium text-right">Sent</th>
                  <th className="pb-2 font-medium text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.topByClicks.map((c, i) => (
                  <tr key={i} className="border-b border-patina-clay-beige/5 last:border-0">
                    <td className="py-2.5 text-sm text-patina-charcoal truncate max-w-[200px]">
                      {c.name}
                    </td>
                    <td className="py-2.5 text-sm text-patina-charcoal text-right">
                      {(c.clicks ?? 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 text-sm text-patina-clay-beige text-right">
                      {c.sent.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-sm text-patina-charcoal text-right font-medium">
                      {c.sent > 0 ? Math.round(((c.clicks ?? 0) / c.sent) * 1000) / 10 : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-patina-clay-beige py-4">No campaign data</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Campaign Comparison Tab ─────────────────────────────────────────────

function ComparisonTab() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Fetch all recent campaigns for the picker
  const { data: allData, isLoading: loadingAll } = useCampaignComparison([]);
  // Fetch only selected campaigns for the comparison
  const { data: compareData, isLoading: loadingCompare } = useCampaignComparison(selectedIds);

  const allCampaigns = allData?.campaigns || [];
  const comparedCampaigns = selectedIds.length > 0
    ? (compareData?.campaigns || [])
    : allCampaigns;

  const toggleCampaign = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const chartData = useMemo(() => {
    return comparedCampaigns.map((c: CampaignComparisonItem) => ({
      name: c.name.length > 20 ? c.name.slice(0, 20) + '...' : c.name,
      openRate: c.openRate,
      clickRate: c.clickRate,
    }));
  }, [comparedCampaigns]);

  if (loadingAll) return <Spinner />;

  return (
    <div className="space-y-6">
      {/* Campaign picker */}
      <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
        <h3 className="text-sm font-semibold text-patina-charcoal mb-3">
          Select Campaigns to Compare
        </h3>
        <p className="text-xs text-patina-clay-beige mb-4">
          {selectedIds.length === 0
            ? 'Showing all recent campaigns. Check boxes to compare specific ones.'
            : `${selectedIds.length} campaign${selectedIds.length !== 1 ? 's' : ''} selected`}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
          {allCampaigns.map((c: CampaignComparisonItem) => (
            <button
              key={c.id}
              onClick={() => toggleCampaign(c.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                selectedIds.includes(c.id)
                  ? 'bg-patina-mocha-brown/10 text-patina-charcoal'
                  : 'bg-patina-off-white text-patina-clay-beige hover:text-patina-charcoal'
              )}
            >
              {selectedIds.includes(c.id) ? (
                <CheckSquare className="w-4 h-4 text-patina-mocha-brown shrink-0" />
              ) : (
                <Square className="w-4 h-4 shrink-0" />
              )}
              <span className="truncate">{c.name}</span>
            </button>
          ))}
          {allCampaigns.length === 0 && (
            <p className="text-sm text-patina-clay-beige col-span-full py-2">No campaigns found</p>
          )}
        </div>
      </div>

      {/* Comparison bar chart */}
      {comparedCampaigns.length > 0 && (
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
          <h3 className="text-sm font-semibold text-patina-charcoal mb-4">
            Open &amp; Click Rate Comparison
          </h3>
          {loadingCompare ? (
            <Spinner />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={chartData} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0da" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#a39585' }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#a39585' }}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e0da' }}
                  formatter={(value, name) => [
                    `${value ?? 0}%`,
                    name === 'openRate' ? 'Open Rate' : 'Click Rate',
                  ]}
                />
                <Bar dataKey="openRate" fill="#8b7355" radius={[4, 4, 0, 0]} name="openRate" />
                <Bar dataKey="clickRate" fill="#3f3a34" radius={[4, 4, 0, 0]} name="clickRate" />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div className="flex items-center justify-center gap-6 mt-3">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#8b7355] rounded-sm" />
              <span className="text-xs text-patina-clay-beige">Open Rate</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-[#3f3a34] rounded-sm" />
              <span className="text-xs text-patina-clay-beige">Click Rate</span>
            </div>
          </div>
        </div>
      )}

      {/* Comparison table */}
      {comparedCampaigns.length > 0 && (
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6 overflow-x-auto">
          <h3 className="text-sm font-semibold text-patina-charcoal mb-4">Detailed Comparison</h3>
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="text-left text-xs text-patina-clay-beige border-b border-patina-clay-beige/10">
                <th className="pb-2 font-medium">Campaign</th>
                <th className="pb-2 font-medium">Subject</th>
                <th className="pb-2 font-medium text-right">Sent</th>
                <th className="pb-2 font-medium text-right">Opens</th>
                <th className="pb-2 font-medium text-right">Clicks</th>
                <th className="pb-2 font-medium text-right">Bounces</th>
                <th className="pb-2 font-medium text-right">Open %</th>
                <th className="pb-2 font-medium text-right">Click %</th>
              </tr>
            </thead>
            <tbody>
              {comparedCampaigns.map((c: CampaignComparisonItem) => (
                <tr key={c.id} className="border-b border-patina-clay-beige/5 last:border-0">
                  <td className="py-2.5 text-sm text-patina-charcoal font-medium truncate max-w-[160px]">
                    {c.name}
                  </td>
                  <td className="py-2.5 text-sm text-patina-clay-beige truncate max-w-[180px]">
                    {c.subject}
                  </td>
                  <td className="py-2.5 text-sm text-patina-charcoal text-right">
                    {c.sent_count.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-sm text-patina-charcoal text-right">
                    {c.open_count.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-sm text-patina-charcoal text-right">
                    {c.click_count.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-sm text-patina-charcoal text-right">
                    {c.bounce_count.toLocaleString()}
                  </td>
                  <td className="py-2.5 text-sm text-patina-charcoal text-right font-medium">
                    {c.openRate}%
                  </td>
                  <td className="py-2.5 text-sm text-patina-charcoal text-right font-medium">
                    {c.clickRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Revenue Attribution Tab ─────────────────────────────────────────────

const FUNNEL_COLORS = ['#8b7355', '#a39585', '#bfb5a7', '#d6cfC5', '#e5e0da'];

function AttributionTab({ period }: { period: string }) {
  const { data, isLoading } = useRevenueAttribution(period);

  if (isLoading) return <Spinner />;
  if (!data) return <EmptyState message="No attribution data available" />;

  return (
    <div className="space-y-6">
      {/* Revenue card (placeholder) */}
      <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-patina-off-white text-patina-mocha-brown">
            <TrendingDown className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-display font-semibold text-patina-charcoal">
              ${data.revenueTotal.toLocaleString()}
            </p>
            <p className="text-sm text-patina-clay-beige">
              Email-attributed revenue{' '}
              <span className="text-xs text-patina-clay-beige/60">(coming soon)</span>
            </p>
          </div>
        </div>
      </div>

      {/* Funnel visualization */}
      <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
        <h3 className="text-sm font-semibold text-patina-charcoal mb-6">Conversion Funnel</h3>
        <div className="space-y-3">
          {data.funnel.map((step, idx) => {
            const maxCount = data.funnel[0]?.count || 1;
            const widthPct = maxCount > 0 ? Math.max((step.count / maxCount) * 100, 4) : 4;
            const isPlaceholder = step.count === 0 && idx > 2;

            return (
              <div key={step.stage} className="flex items-center gap-4">
                <div className="w-24 shrink-0 text-right">
                  <p className="text-sm font-medium text-patina-charcoal">{step.stage}</p>
                </div>
                <div className="flex-1 relative">
                  <div
                    className={cn(
                      'h-10 rounded-lg flex items-center px-3 transition-all',
                      isPlaceholder ? 'border-2 border-dashed border-patina-clay-beige/30' : ''
                    )}
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: isPlaceholder ? 'transparent' : FUNNEL_COLORS[idx] || FUNNEL_COLORS[4],
                      minWidth: '80px',
                    }}
                  >
                    <span
                      className={cn(
                        'text-sm font-medium',
                        isPlaceholder ? 'text-patina-clay-beige/50' : 'text-white'
                      )}
                    >
                      {isPlaceholder ? 'TBD' : step.count.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="w-16 shrink-0 text-right">
                  <span className="text-sm text-patina-clay-beige font-medium">{step.rate}%</span>
                </div>
                {idx < data.funnel.length - 1 && (
                  <ArrowRight className="w-4 h-4 text-patina-clay-beige/40 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Conversion rates between stages */}
      <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
        <h3 className="text-sm font-semibold text-patina-charcoal mb-4">Stage Conversion Rates</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {data.funnel.slice(1).map((step, idx) => {
            const prev = data.funnel[idx];
            const convRate =
              prev && prev.count > 0
                ? Math.round((step.count / prev.count) * 1000) / 10
                : 0;
            const isPlaceholder = step.count === 0;

            return (
              <div
                key={step.stage}
                className="bg-patina-off-white rounded-lg p-4 text-center"
              >
                <p className="text-xs text-patina-clay-beige mb-1">
                  {prev?.stage} &rarr; {step.stage}
                </p>
                <p className={cn(
                  'text-xl font-display font-semibold',
                  isPlaceholder ? 'text-patina-clay-beige/40' : 'text-patina-charcoal'
                )}>
                  {isPlaceholder ? '--' : `${convRate}%`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Engagement Cohorts Tab ──────────────────────────────────────────────

const COHORT_COLORS: Record<string, string> = {
  high: '#8b7355',
  medium: '#a39585',
  low: '#bfb5a7',
  minimal: '#e5e0da',
};

const COHORT_LABELS: Record<string, string> = {
  high: 'Highly Engaged',
  medium: 'Engaged',
  low: 'Passive',
  minimal: 'Dormant',
};

function CohortsTab() {
  const { data, isLoading } = useEngagementCohorts();

  if (isLoading) return <Spinner />;
  if (!data) return <EmptyState message="No cohort data available" />;

  const totalUsers = data.tiers.reduce((acc: number, t: EngagementCohortTier) => acc + t.count, 0);

  const pieData = data.tiers.map((t: EngagementCohortTier) => ({
    name: t.tier,
    value: t.count,
    fill: COHORT_COLORS[t.key] || '#e5e0da',
  }));

  return (
    <div className="space-y-6">
      {/* Total users card */}
      <StatCard
        label="Total Users Tracked"
        value={totalUsers.toLocaleString()}
        icon={<Users className="w-5 h-5" />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
          <h3 className="text-sm font-semibold text-patina-charcoal mb-4">
            Engagement Distribution
          </h3>
          {totalUsers > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={60}
                  paddingAngle={2}
                  label={({ name, percent }) =>
                    `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                  labelLine={{ stroke: '#a39585', strokeWidth: 1 }}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e0da' }}
                  formatter={(value) => [Number(value ?? 0).toLocaleString(), 'Users']}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No engagement data" />
          )}
          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-4 mt-2">
            {data.tiers.map((t: EngagementCohortTier) => (
              <div key={t.key} className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: COHORT_COLORS[t.key] || '#e5e0da' }}
                />
                <span className="text-xs text-patina-clay-beige">{t.tier}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Cohort detail table */}
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
          <h3 className="text-sm font-semibold text-patina-charcoal mb-4">Cohort Breakdown</h3>
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-patina-clay-beige border-b border-patina-clay-beige/10">
                <th className="pb-2 font-medium">Tier</th>
                <th className="pb-2 font-medium text-right">Users</th>
                <th className="pb-2 font-medium text-right">%</th>
                <th className="pb-2 font-medium text-right">Score Range</th>
              </tr>
            </thead>
            <tbody>
              {data.tiers.map((t: EngagementCohortTier) => (
                <tr key={t.key} className="border-b border-patina-clay-beige/5 last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: COHORT_COLORS[t.key] || '#e5e0da' }}
                      />
                      <span className="text-sm text-patina-charcoal font-medium">{t.tier}</span>
                    </div>
                  </td>
                  <td className="py-3 text-sm text-patina-charcoal text-right">
                    {t.count.toLocaleString()}
                  </td>
                  <td className="py-3 text-sm text-patina-charcoal text-right font-medium">
                    {t.pct}%
                  </td>
                  <td className="py-3 text-xs text-patina-clay-beige text-right">
                    {t.key === 'high' && '100+'}
                    {t.key === 'medium' && '50-99'}
                    {t.key === 'low' && '20-49'}
                    {t.key === 'minimal' && '<20'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Visual bar representation */}
          <div className="mt-6 space-y-2">
            {data.tiers.map((t: EngagementCohortTier) => (
              <div key={t.key} className="flex items-center gap-3">
                <span className="text-xs text-patina-clay-beige w-28 text-right shrink-0">
                  {COHORT_LABELS[t.key] || t.tier}
                </span>
                <div className="flex-1 bg-patina-off-white rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(t.pct, 1)}%`,
                      backgroundColor: COHORT_COLORS[t.key] || '#e5e0da',
                    }}
                  />
                </div>
                <span className="text-xs text-patina-clay-beige w-10 text-right shrink-0">
                  {t.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Delivery Health Tab ─────────────────────────────────────────────────

function DeliveryTab({ period }: { period: string }) {
  const { data, isLoading } = useDeliveryHealth(period);

  if (isLoading) return <Spinner />;
  if (!data) return <EmptyState message="No delivery data available" />;

  const bounceChartData = [
    { name: 'Hard Bounces', count: data.hardBounces, fill: '#c94b4b' },
    { name: 'Soft Bounces', count: data.softBounces, fill: '#e8a87c' },
  ];

  const deliveryHealthStatus =
    data.bounceRate > 5 ? 'critical' : data.bounceRate > 2 ? 'warning' : 'healthy';

  return (
    <div className="space-y-6">
      {/* Health alert banner */}
      {deliveryHealthStatus === 'critical' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Delivery Health Critical</p>
            <p className="text-xs text-red-600 mt-0.5">
              Bounce rate is {data.bounceRate}%. Review bounced emails and clean your lists.
            </p>
          </div>
        </div>
      )}

      {deliveryHealthStatus === 'warning' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">Delivery Health Warning</p>
            <p className="text-xs text-yellow-600 mt-0.5">
              Bounce rate is {data.bounceRate}%. Monitor closely and consider list hygiene.
            </p>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Delivery Rate"
          value={`${data.deliveryRate}%`}
          icon={<ShieldCheck className="w-5 h-5" />}
          subtitle={deliveryHealthStatus === 'healthy' ? 'Healthy' : deliveryHealthStatus === 'warning' ? 'Needs attention' : 'Critical'}
        />
        <StatCard
          label="Bounce Rate"
          value={`${data.bounceRate}%`}
          icon={<AlertTriangle className="w-5 h-5" />}
          subtitle={`${data.hardBounces + data.softBounces} total bounces`}
        />
        <StatCard
          label="Complaint Rate"
          value={`${data.complaintRate}%`}
          icon={<TrendingDown className="w-5 h-5" />}
          subtitle="Spam complaints"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bounce breakdown chart */}
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
          <h3 className="text-sm font-semibold text-patina-charcoal mb-4">Bounce Breakdown</h3>
          {(data.hardBounces > 0 || data.softBounces > 0) ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={bounceChartData} layout="vertical" barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e0da" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#a39585' }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 12, fill: '#a39585' }}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e5e0da' }}
                    formatter={(value) => [Number(value ?? 0).toLocaleString(), 'Count']}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {bounceChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-6 mt-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#c94b4b] rounded-sm" />
                  <span className="text-xs text-patina-clay-beige">Hard Bounces</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 bg-[#e8a87c] rounded-sm" />
                  <span className="text-xs text-patina-clay-beige">Soft Bounces</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <ShieldCheck className="w-10 h-10 text-green-400 mb-3" />
              <p className="text-sm text-patina-clay-beige">No bounces in this period</p>
            </div>
          )}
        </div>

        {/* Suppression info */}
        <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-6">
          <h3 className="text-sm font-semibold text-patina-charcoal mb-4">Suppression List</h3>
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-16 h-16 rounded-full bg-patina-off-white flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-patina-mocha-brown" />
            </div>
            <p className="text-3xl font-display font-semibold text-patina-charcoal">
              {data.totalSuppressed.toLocaleString()}
            </p>
            <p className="text-sm text-patina-clay-beige mt-1">Suppressed addresses</p>
            <p className="text-xs text-patina-clay-beige/60 mt-3 text-center max-w-xs">
              Addresses automatically suppressed due to hard bounces or spam complaints.
              These addresses will not receive future campaigns.
            </p>
          </div>

          <div className="border-t border-patina-clay-beige/10 pt-4 mt-4 grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-lg font-display font-semibold text-patina-charcoal">
                {data.hardBounces}
              </p>
              <p className="text-xs text-patina-clay-beige">Hard bounces</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-display font-semibold text-patina-charcoal">
                {data.softBounces}
              </p>
              <p className="text-xs text-patina-clay-beige">Soft bounces</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-xl border border-patina-clay-beige/20 p-12 text-center">
      <BarChart3 className="w-12 h-12 text-patina-clay-beige/50 mx-auto mb-4" />
      <p className="text-patina-clay-beige">{message}</p>
    </div>
  );
}
