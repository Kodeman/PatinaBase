'use client';

import { Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { PostHogStatsWidget } from '@/components/dashboards/PostHogStatsWidget';
import {
  PageHeader,
  MetricBlock,
  MetricsRow,
  Section,
  EmptyState,
  StrataMark,
  StatusDot,
} from '@/components/portal';

interface DashboardStats {
  totalUsers: number | null;
  activeProducts: number | null;
  totalOrders: number | null;
  verificationQueue: number | null;
}

async function fetchDashboardStats(): Promise<DashboardStats> {
  const [usersRes, productsRes, ordersRes, verificationRes] = await Promise.all([
    fetch('/api/users?page=1&pageSize=1')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch('/api/catalog/products?page=1&pageSize=1')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch('/api/orders?page=1&pageSize=1')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
    fetch('/api/admin/verification-queue?status=pending&pageSize=1')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null),
  ]);

  return {
    totalUsers: usersRes?.data?.meta?.total ?? null,
    activeProducts: productsRes?.data?.meta?.total ?? null,
    totalOrders: ordersRes?.data?.meta?.total ?? null,
    verificationQueue: verificationRes?.data?.meta?.total ?? null,
  };
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
    refetchInterval: 5 * 60 * 1000,
  });

  const val = (n: number | null | undefined) => (n != null ? n : '—');

  return (
    <div>
      <PageHeader
        title={getGreeting()}
        accent="administrator"
        description="Overview of platform activity and key metrics."
      />

      <MetricsRow>
        <MetricBlock
          label="Total Users"
          value={isLoading ? 0 : (stats?.totalUsers ?? 0)}
        />
        <MetricBlock
          label="Active Products"
          value={isLoading ? 0 : (stats?.activeProducts ?? 0)}
        />
        <MetricBlock label="Orders" value={isLoading ? 0 : (stats?.totalOrders ?? 0)} />
        <MetricBlock
          label="Verification Queue"
          value={isLoading ? 0 : (stats?.verificationQueue ?? 0)}
          trend={stats?.verificationQueue && stats.verificationQueue > 0 ? 'neutral' : 'up'}
        />
      </MetricsRow>

      <div className="mt-10">
        <PostHogStatsWidget />
      </div>

      <div className="mt-6">
        <StrataMark variant="mini" />
      </div>

      <div className="mt-6 grid gap-10 md:grid-cols-[58%_42%]">
        <Section title="Recent Activity">
          <EmptyState
            label="Coming soon"
            message="Audit log integration is not yet available."
          >
            <Info className="mt-3 h-5 w-5 text-[var(--text-muted)]" />
          </EmptyState>
        </Section>

        <Section title="System Health">
          <div>
            {['API Gateway', 'Database', 'OpenSearch', 'Media Pipeline'].map((service) => (
              <div
                key={service}
                className="flex items-center justify-between border-b border-[var(--border-subtle)] py-3 last:border-b-0"
              >
                <span className="type-label">{service}</span>
                <StatusDot variant="success" label="Healthy" />
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}
