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
import { Users, Package, ShoppingCart, TrendingUp, Globe2, Activity } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@patina/design-system';
// REPLACED: card';
import { Badge } from '@patina/design-system';
// REPLACED: badge';
import { ProgressBar as Progress } from '@patina/design-system';
// REPLACED: progress';
import { ScrollArea } from '@patina/design-system';
// REPLACED: scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@patina/design-system';
// REPLACED: table';
import {
  analyticsTrend,
  channelPerformance,
  conversionFunnel,
  geoBreakdown,
  topProducts,
} from '@/data/mock-admin';

const metricCards = [
  {
    label: 'Active Users',
    value: '19.3K',
    delta: '+7.4% MoM',
    icon: Users,
    footnote: '928 new designers onboarded',
  },
  {
    label: 'Catalog Views',
    value: '128K',
    delta: '+11.8% MoM',
    icon: Package,
    footnote: 'Top: Modern Walnut Dining Table',
  },
  {
    label: 'Orders (30d)',
    value: '645',
    delta: '+6.1% MoM',
    icon: ShoppingCart,
    footnote: '32% from Designer Shops',
  },
  {
    label: 'Gross Revenue',
    value: '$812K',
    delta: '+9.6% MoM',
    icon: TrendingUp,
    footnote: 'Avg order value $1.26K',
  },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
          <Activity className="h-3.5 w-3.5" />
          Executive Overview
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Monitor growth, revenue, and operational funnel health
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metricCards.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{metric.label}</CardTitle>
              <metric.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              <p className="text-xs font-medium text-success/90">{metric.delta}</p>
              <p className="text-xs text-muted-foreground mt-1">{metric.footnote}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Growth & Revenue</CardTitle>
              <CardDescription>Rolling 8-month platform performance</CardDescription>
            </div>
            <Badge variant="outline" className="mt-2 lg:mt-0">
              Cohort retention +3.8%
            </Badge>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={analyticsTrend} margin={{ left: 12, right: 12 }}>
                <defs>
                  <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tickLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip cursor={{ strokeDasharray: '4 2' }} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="activeUsers"
                  stroke="#2563eb"
                  fill="url(#colorUsers)"
                  name="Active users"
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#f97316"
                  fill="url(#colorRevenue)"
                  name="Revenue"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Channel Contribution</CardTitle>
            <CardDescription>Orders & revenue mix by channel</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelPerformance}>
                <XAxis dataKey="channel" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="orders" fill="#10b981" radius={4} name="Orders" />
                <Bar dataKey="revenue" fill="#6366f1" radius={4} name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Top Products</CardTitle>
              <CardDescription>Conversion & revenue leaders this month</CardDescription>
            </div>
            <Badge variant="subtle" color="neutral">Auto-refreshing every 15 min</Badge>
          </CardHeader>
          <CardContent className="px-0">
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Views</TableHead>
                    <TableHead>Conversions</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">
                          SKU {product.sku}
                        </div>
                      </TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell className="font-mono text-sm">{product.views.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-sm">{product.conversions.toLocaleString()}</TableCell>
                      <TableCell className="font-semibold">
                        ${product.revenue.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={product.availability === 'published' ? 'success' : product.availability === 'scheduled' ? 'secondary' : 'outline'}>
                          {product.availability}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Conversion Funnel</CardTitle>
              <CardDescription>Drop-off across the journey</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {conversionFunnel.map((step, index) => {
                const progress = (step.value / conversionFunnel[0].value) * 100;
                return (
                  <div key={step.step} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{index + 1}. {step.step}</span>
                      <span className="text-muted-foreground">{step.value.toLocaleString()}</span>
                    </div>
                    <Progress value={progress} />
                    <p className="text-xs text-muted-foreground">{step.change} vs previous period</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Geo Distribution</CardTitle>
                <CardDescription>Top performing regions</CardDescription>
              </div>
              <Globe2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-4">
              {geoBreakdown.map((region) => (
                <div key={region.region} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{region.region}</span>
                    <span>{region.percent}%</span>
                  </div>
                  <Progress value={region.percent} />
                  <p className="text-xs text-muted-foreground">{region.trend} vs last quarter</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
