'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Globe2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  DataTable,
  StatusDot,
  type Column,
  type StatusVariant,
} from '@/components/portal';
import {
  analyticsTrend,
  channelPerformance,
  conversionFunnel,
  geoBreakdown,
  topProducts,
} from '@/data/mock-admin';

const metricCards = [
  { label: 'Active Users', value: '19.3K', delta: '+7.4% MoM', trend: 'up' as const },
  { label: 'Catalog Views', value: '128K', delta: '+11.8% MoM', trend: 'up' as const },
  { label: 'Orders (30d)', value: '645', delta: '+6.1% MoM', trend: 'up' as const },
  { label: 'Gross Revenue', value: '$812K', delta: '+9.6% MoM', trend: 'up' as const },
];

type Product = (typeof topProducts)[number];

const productColumns: Column<Product>[] = [
  {
    key: 'product',
    header: 'Product',
    render: (p) => (
      <div>
        <div className="type-item-name">{p.name}</div>
        <div className="type-meta-small mt-0.5">SKU {p.sku}</div>
      </div>
    ),
  },
  { key: 'category', header: 'Category', render: (p) => p.category },
  {
    key: 'views',
    header: 'Views',
    className: 'font-mono tabular-nums',
    render: (p) => p.views.toLocaleString(),
  },
  {
    key: 'conversions',
    header: 'Conversions',
    className: 'font-mono tabular-nums',
    render: (p) => p.conversions.toLocaleString(),
  },
  {
    key: 'revenue',
    header: 'Revenue',
    className: 'font-mono tabular-nums',
    render: (p) => `$${p.revenue.toLocaleString()}`,
  },
  {
    key: 'status',
    header: 'Status',
    render: (p) => {
      const variant: StatusVariant =
        p.availability === 'published' ? 'success' : p.availability === 'scheduled' ? 'warning' : 'neutral';
      return <StatusDot variant={variant} label={p.availability} />;
    },
  },
];

export default function AnalyticsPage() {
  return (
    <div>
      <PageHeader
        title="Analytics"
        accent="overview"
        description="Monitor growth, revenue, and operational funnel health."
      />

      <MetricsRow>
        {metricCards.map((m) => (
          <MetricBlock
            key={m.label}
            label={m.label}
            value={m.value}
            change={m.delta}
            trend={m.trend}
          />
        ))}
      </MetricsRow>

      <div className="mt-10 grid gap-10 lg:grid-cols-3">
        <Section
          title="Growth & Revenue"
          className="lg:col-span-2"
          action={<Badge variant="outline">Cohort retention +3.8%</Badge>}
        >
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analyticsTrend} margin={{ left: 12, right: 12 }}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B9CAD" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#8B9CAD" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C4A57B" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#C4A57B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tickLine={false} tick={{ fontSize: 11, fill: '#8B7355' }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8B7355' }} />
                <Tooltip cursor={{ strokeDasharray: '4 2' }} contentStyle={{ borderRadius: 4, borderColor: '#E5E2DD' }} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="activeUsers"
                  stroke="#8B9CAD"
                  fill="url(#colorUsers)"
                  name="Active users"
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#C4A57B"
                  fill="url(#colorRevenue)"
                  name="Revenue"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Channel Contribution">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelPerformance}>
                <XAxis
                  dataKey="channel"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: '#8B7355' }}
                />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8B7355' }} />
                <Tooltip contentStyle={{ borderRadius: 4, borderColor: '#E5E2DD' }} />
                <Legend />
                <Bar dataKey="orders" fill="#A8B5A0" radius={2} name="Orders" />
                <Bar dataKey="revenue" fill="#C4A57B" radius={2} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-3">
        <Section
          title="Top Products"
          className="lg:col-span-2"
          action={<Badge variant="secondary">Auto-refreshing every 15 min</Badge>}
        >
          <DataTable columns={productColumns} rows={topProducts} getKey={(p) => p.id} />
        </Section>

        <div className="space-y-10">
          <Section title="Conversion Funnel">
            {conversionFunnel.map((step, index) => {
              const progress = (step.value / conversionFunnel[0].value) * 100;
              return (
                <div key={step.step} className="space-y-1.5 border-b border-[var(--border-subtle)] py-3 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <span className="type-label">
                      {index + 1}. {step.step}
                    </span>
                    <span className="type-meta-small font-mono">
                      {step.value.toLocaleString()}
                    </span>
                  </div>
                  <Progress value={progress} />
                  <p className="type-meta-small">{step.change} vs previous period</p>
                </div>
              );
            })}
          </Section>

          <Section
            title="Geo Distribution"
            action={<Globe2 className="h-4 w-4 text-[var(--text-muted)]" />}
          >
            {geoBreakdown.map((region) => (
              <div key={region.region} className="space-y-1 border-b border-[var(--border-subtle)] py-3 last:border-b-0">
                <div className="flex items-center justify-between">
                  <span className="type-label">{region.region}</span>
                  <span className="type-meta-small font-mono">{region.percent}%</span>
                </div>
                <Progress value={region.percent} />
                <p className="type-meta-small">{region.trend} vs last quarter</p>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}
