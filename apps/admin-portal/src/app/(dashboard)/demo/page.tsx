'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Server,
  Image,
  ClipboardList,
  Flag,
  Search,
  Settings,
  Shield,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface DemoPage {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'operations' | 'system' | 'compliance';
}

const demoPages: DemoPage[] = [
  {
    title: 'Dashboard',
    description: 'Platform metrics overview with key performance indicators',
    href: '/demo/dashboard',
    icon: LayoutDashboard,
    category: 'operations',
  },
  {
    title: 'User Lifecycle',
    description: 'User onboarding flow from invite to verification to activation',
    href: '/demo/user-lifecycle',
    icon: Users,
    category: 'operations',
  },
  {
    title: 'Analytics',
    description: 'Charts, conversion funnels, and geographic breakdown',
    href: '/demo/analytics',
    icon: BarChart3,
    category: 'operations',
  },
  {
    title: 'Media Management',
    description: 'Asset browser with QC queue and processing jobs',
    href: '/demo/media',
    icon: Image,
    category: 'operations',
  },
  {
    title: 'System Health',
    description: 'Service monitoring, uptime status, and infrastructure health',
    href: '/demo/health',
    icon: Server,
    category: 'system',
  },
  {
    title: 'Audit Logs',
    description: 'Activity tracking with user actions and system events',
    href: '/demo/audit',
    icon: ClipboardList,
    category: 'system',
  },
  {
    title: 'Feature Flags',
    description: 'Feature toggle management and rollout configuration',
    href: '/demo/flags',
    icon: Flag,
    category: 'system',
  },
  {
    title: 'Search Configuration',
    description: 'Search tuning with synonyms, boosts, and index management',
    href: '/demo/search',
    icon: Search,
    category: 'system',
  },
  {
    title: 'Admin Settings',
    description: 'Notification preferences and admin configuration',
    href: '/demo/settings',
    icon: Settings,
    category: 'compliance',
  },
  {
    title: 'Privacy Requests',
    description: 'GDPR/CCPA data request queue and compliance tools',
    href: '/demo/privacy',
    icon: Shield,
    category: 'compliance',
  },
];

const categories = [
  { id: 'operations', title: 'Operations Prototypes', description: 'Analytics and workflow management demos' },
  { id: 'system', title: 'System Administration', description: 'Infrastructure and configuration UI mockups' },
  { id: 'compliance', title: 'Compliance & Settings', description: 'Privacy and preferences prototypes' },
] as const;

export default function AdminDemoHubPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-primary/10 p-3">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Demo Workspace</h1>
          <p className="mt-1 text-lg text-muted-foreground">
            Explore prototype admin features and tools using sample data
          </p>
        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          <strong>Note:</strong> These pages use mock data for demonstration purposes.
          For production features, visit{' '}
          <Link href="/users" className="font-medium underline underline-offset-2">
            User Management
          </Link>
          ,{' '}
          <Link href="/verification" className="font-medium underline underline-offset-2">
            Verification Queue
          </Link>
          ,{' '}
          <Link href="/catalog" className="font-medium underline underline-offset-2">
            Catalog
          </Link>
          , or{' '}
          <Link href="/orders" className="font-medium underline underline-offset-2">
            Orders
          </Link>
          .
        </p>
      </div>

      {/* Categories */}
      {categories.map((category) => {
        const categoryPages = demoPages.filter((page) => page.category === category.id);
        if (categoryPages.length === 0) return null;

        return (
          <div key={category.id} className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">{category.title}</h2>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categoryPages.map((page) => {
                const Icon = page.icon;
                return (
                  <Link
                    key={page.href}
                    href={page.href as any}
                    className={cn(
                      'group flex flex-col rounded-lg border bg-card p-5 transition-all',
                      'hover:border-primary/50 hover:shadow-md'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-muted p-2 transition-colors group-hover:bg-primary/10">
                        <Icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                      </div>
                      <h3 className="font-semibold">{page.title}</h3>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {page.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
