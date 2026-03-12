'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Button } from '@patina/design-system';
import {
  Users,
  Shield,
  Package,
  AlertCircle,
  UserPlus,
  ShieldCheck,
  PackagePlus,
  Clock,
  ArrowRight,
  Settings,
  Search,
  Flag,
  FileText,
  Eye,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

interface ActivityEvent {
  id: string;
  action: string;
  actor: string;
  target: string;
  timestamp: string;
  type: 'user' | 'role' | 'product' | 'order' | 'system';
}

const recentActivity: ActivityEvent[] = [
  {
    id: '1',
    action: 'Designer approved',
    actor: 'admin@patina.com',
    target: 'Sarah Chen',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    type: 'user',
  },
  {
    id: '2',
    action: 'Role assigned',
    actor: 'admin@patina.com',
    target: 'catalog:editor to James Miller',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    type: 'role',
  },
  {
    id: '3',
    action: 'Product published',
    actor: 'catalog@patina.com',
    target: 'Modern Walnut Dining Table',
    timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    type: 'product',
  },
  {
    id: '4',
    action: 'Order refund issued',
    actor: 'support@patina.com',
    target: 'Order #ORD-4821 ($325.00)',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    type: 'order',
  },
  {
    id: '5',
    action: 'New user registered',
    actor: 'system',
    target: 'emma.designer@gmail.com',
    timestamp: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    type: 'user',
  },
  {
    id: '6',
    action: 'Feature flag toggled',
    actor: 'admin@patina.com',
    target: 'checkoutEnabled set to true',
    timestamp: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    type: 'system',
  },
];

const quickActions = [
  {
    label: 'Manage Users',
    description: 'View and manage platform users',
    href: '/admin/users',
    icon: Users,
  },
  {
    label: 'View Orders',
    description: 'Review and manage orders',
    href: '/admin/orders',
    icon: Package,
  },
  {
    label: 'Catalog Management',
    description: 'Manage products and categories',
    href: '/admin/catalog',
    icon: PackagePlus,
  },
  {
    label: 'Manage Roles',
    description: 'Configure roles and permissions',
    href: '/admin/roles',
    icon: ShieldCheck,
  },
  {
    label: 'Feature Flags',
    description: 'Toggle feature rollouts',
    href: '/admin/flags',
    icon: Flag,
  },
  {
    label: 'Audit Logs',
    description: 'Review admin actions',
    href: '/admin/audit',
    icon: FileText,
  },
  {
    label: 'Search Management',
    description: 'Configure search settings',
    href: '/admin/search',
    icon: Search,
  },
  {
    label: 'Settings',
    description: 'Platform preferences',
    href: '/admin/settings',
    icon: Settings,
  },
];

function getActivityIcon(type: ActivityEvent['type']) {
  switch (type) {
    case 'user':
      return <UserPlus className="h-4 w-4" />;
    case 'role':
      return <ShieldCheck className="h-4 w-4" />;
    case 'product':
      return <PackagePlus className="h-4 w-4" />;
    case 'order':
      return <Package className="h-4 w-4" />;
    case 'system':
      return <Settings className="h-4 w-4" />;
  }
}

function getActivityColor(type: ActivityEvent['type']) {
  switch (type) {
    case 'user':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    case 'role':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
    case 'product':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    case 'order':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    case 'system':
      return 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400';
  }
}

export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of platform administration and key metrics
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,234</div>
            <p className="text-xs text-muted-foreground">+12% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">8</div>
            <p className="text-xs text-muted-foreground">4 system, 4 custom</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">5,678</div>
            <p className="text-xs text-muted-foreground">+8% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Verifications</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">5 submitted, 7 in review</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest administrative actions across the platform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.map((event) => (
                <div key={event.id} className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${getActivityColor(event.type)}`}
                  >
                    {getActivityIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{event.action}</p>
                    <p className="text-xs text-muted-foreground truncate">{event.target}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {event.actor}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t">
              <Link href="/admin/audit">
                <Button variant="ghost" size="sm" className="w-full">
                  <Eye className="mr-2 h-4 w-4" />
                  View All Activity
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map((action) => (
                <Link key={action.href} href={action.href}>
                  <div className="flex items-start gap-3 rounded-lg border p-3 hover:bg-accent transition-colors cursor-pointer h-full">
                    <action.icon className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{action.label}</p>
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
