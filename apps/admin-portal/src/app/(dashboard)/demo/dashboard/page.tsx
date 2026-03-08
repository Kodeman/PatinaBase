'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Package, ShoppingCart, AlertCircle, TrendingUp, CheckCircle } from 'lucide-react';

const stats = [
  {
    name: 'Total Users',
    value: '12,345',
    change: '+12.3%',
    icon: Users,
    trend: 'up',
  },
  {
    name: 'Active Products',
    value: '2,456',
    change: '+5.2%',
    icon: Package,
    trend: 'up',
  },
  {
    name: 'Orders (30d)',
    value: '1,234',
    change: '-3.1%',
    icon: ShoppingCart,
    trend: 'down',
  },
  {
    name: 'Verification Queue',
    value: '23',
    change: '+8',
    icon: AlertCircle,
    trend: 'neutral',
  },
];

const recentActivity = [
  {
    id: 1,
    action: 'Designer verified',
    user: 'jane@example.com',
    time: '5 minutes ago',
  },
  {
    id: 2,
    action: 'Product published',
    user: 'admin@patina.com',
    time: '12 minutes ago',
  },
  {
    id: 3,
    action: 'Order refunded',
    user: 'support@patina.com',
    time: '1 hour ago',
  },
  {
    id: 4,
    action: 'User suspended',
    user: 'admin@patina.com',
    time: '2 hours ago',
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of platform activity and key metrics
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.name}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.name}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  <span
                    className={
                      stat.trend === 'up'
                        ? 'text-success'
                        : stat.trend === 'down'
                        ? 'text-destructive'
                        : ''
                    }
                  >
                    {stat.change}
                  </span>{' '}
                  from last month
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest admin actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-4">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">{activity.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {activity.user}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {activity.time}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
            <CardDescription>Service status overview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {['API Gateway', 'Database', 'OpenSearch', 'Media Pipeline'].map(
                (service) => (
                  <div key={service} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{service}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success" />
                      <span className="text-xs text-muted-foreground">Healthy</span>
                    </div>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
