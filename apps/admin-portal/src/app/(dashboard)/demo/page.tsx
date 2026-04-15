'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Server,
  Image as ImageIcon,
  ClipboardList,
  Flag,
  Search,
  Settings,
  Shield,
} from 'lucide-react';
import { PageHeader, Section } from '@/components/portal';

interface DemoPage {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  category: 'operations' | 'system' | 'compliance';
}

const demoPages: DemoPage[] = [
  { title: 'Dashboard', description: 'Platform metrics overview with key performance indicators', href: '/demo/dashboard', icon: LayoutDashboard, category: 'operations' },
  { title: 'User Lifecycle', description: 'User onboarding flow from invite to verification to activation', href: '/demo/user-lifecycle', icon: Users, category: 'operations' },
  { title: 'Analytics', description: 'Charts, conversion funnels, and geographic breakdown', href: '/demo/analytics', icon: BarChart3, category: 'operations' },
  { title: 'Media Management', description: 'Asset browser with QC queue and processing jobs', href: '/demo/media', icon: ImageIcon, category: 'operations' },
  { title: 'System Health', description: 'Service monitoring, uptime status, and infrastructure health', href: '/demo/health', icon: Server, category: 'system' },
  { title: 'Audit Logs', description: 'Activity tracking with user actions and system events', href: '/demo/audit', icon: ClipboardList, category: 'system' },
  { title: 'Feature Flags', description: 'Feature toggle management and rollout configuration', href: '/demo/flags', icon: Flag, category: 'system' },
  { title: 'Search Configuration', description: 'Search tuning with synonyms, boosts, and index management', href: '/demo/search', icon: Search, category: 'system' },
  { title: 'Admin Settings', description: 'Notification preferences and admin configuration', href: '/demo/settings', icon: Settings, category: 'compliance' },
  { title: 'Privacy Requests', description: 'GDPR/CCPA data request queue and compliance tools', href: '/demo/privacy', icon: Shield, category: 'compliance' },
];

const categories = [
  { id: 'operations', title: 'Operations Prototypes', description: 'Analytics and workflow management demos' },
  { id: 'system', title: 'System Administration', description: 'Infrastructure and configuration UI mockups' },
  { id: 'compliance', title: 'Compliance & Settings', description: 'Privacy and preferences prototypes' },
] as const;

export default function AdminDemoHubPage() {
  return (
    <div>
      <PageHeader
        title="Admin Demo"
        accent="Workspace"
        description="Explore prototype admin features and tools using sample data."
      />

      <div className="mt-6 rounded-sm border border-[var(--color-warning)] bg-[rgba(212,165,116,0.08)] p-4">
        <p className="type-body-small text-[var(--text-body)]">
          <strong>Note:</strong> These pages use mock data for demonstration purposes. For production features, visit{' '}
          <Link href="/users" className="underline decoration-[var(--accent-primary)] underline-offset-2">User Management</Link>,{' '}
          <Link href="/verification" className="underline decoration-[var(--accent-primary)] underline-offset-2">Verification Queue</Link>,{' '}
          <Link href="/catalog" className="underline decoration-[var(--accent-primary)] underline-offset-2">Catalog</Link>, or{' '}
          <Link href="/orders" className="underline decoration-[var(--accent-primary)] underline-offset-2">Orders</Link>.
        </p>
      </div>

      {categories.map((category) => {
        const categoryPages = demoPages.filter((page) => page.category === category.id);
        if (categoryPages.length === 0) return null;

        return (
          <Section key={category.id} title={category.title} className="mt-10">
            <p className="type-body-small mb-6 text-[var(--text-muted)]">
              {category.description}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categoryPages.map((page) => {
                const Icon = page.icon;
                return (
                  <Link
                    key={page.href}
                    href={page.href as any}
                    className="group flex flex-col border border-[var(--border-subtle)] p-5 transition-all hover:-translate-y-[1px] hover:border-[var(--accent-primary)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-[var(--text-muted)] transition-colors group-hover:text-[var(--accent-primary)]" />
                      <h3 className="type-item-name">{page.title}</h3>
                    </div>
                    <p className="type-body-small mt-3 text-[var(--text-muted)]">
                      {page.description}
                    </p>
                  </Link>
                );
              })}
            </div>
          </Section>
        );
      })}
    </div>
  );
}
