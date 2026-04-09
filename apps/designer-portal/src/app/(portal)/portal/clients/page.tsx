'use client';

import { useState } from 'react';
import { useClients, useClientStats } from '@patina/supabase';
import type { DesignerClient, ClientLifecycleStage } from '@patina/supabase';
import { SearchInput } from '@/components/portal/search-input';
import { FilterRow } from '@/components/portal/filter-row';
import { MetricsRow } from '@/components/portal/metrics-row';
import { ClientListItem } from '@/components/portal/client-list-item';
import { AddClientDialog } from '@/components/portal/add-client-dialog';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { PortalButton } from '@/components/portal/button';

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

function formatCurrency(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}k`;
}

const stageFilters: { key: string; label: string }[] = [
  { key: 'all', label: 'All Clients' },
  { key: 'lead', label: 'Leads' },
  { key: 'proposal', label: 'Proposal' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'nurture', label: 'Nurture' },
];

export default function ClientDirectoryPage() {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const filters = stageFilter !== 'all' ? { status: stageFilter } : undefined;
  const { data: rawClients, isLoading } = useClients(filters);
  const { data: stats } = useClientStats();
  const clients = (Array.isArray(rawClients) ? rawClients : []) as DesignerClient[];

  // Client-side search filter
  const filtered = search
    ? clients.filter((c) => {
        const name = c.client?.full_name || c.client_name || '';
        const email = c.client?.email || c.client_email || '';
        const q = search.toLowerCase();
        return name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
      })
    : clients;

  // Build filter options with counts
  const filterOptions = stageFilters.map((f) => ({
    ...f,
    count:
      f.key === 'all'
        ? stats?.total
        : stats?.[f.key as keyof typeof stats] as number | undefined,
  }));

  // Build metrics
  const metrics = stats
    ? [
        {
          label: 'Active Clients',
          value: String(stats.active),
          subtitle: `$${Math.round(stats.activeProjectValue / 100).toLocaleString()} in active projects`,
          trend: 'neutral' as const,
        },
        {
          label: 'Lifetime Revenue',
          value: `$${Math.round(stats.totalRevenue / 100).toLocaleString()}`,
          subtitle: `across ${stats.totalProjects} completed projects`,
          trend: 'up' as const,
        },
        {
          label: 'Avg. Satisfaction',
          value: stats.avgSatisfaction > 0 ? stats.avgSatisfaction.toFixed(1) : '\u2014',
          subtitle: stats.reviewCount > 0 ? `from ${stats.reviewCount} reviews` : 'no reviews yet',
          trend: 'up' as const,
        },
        {
          label: 'Referral Rate',
          value: `${stats.referralRate}%`,
          trend: 'up' as const,
        },
      ]
    : [];

  return (
    <div className="pt-8">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="type-section-head">
          Clients
        </h1>
        <PortalButton variant="secondary" onClick={() => setAddDialogOpen(true)}>
          + Add Client
        </PortalButton>
      </div>

      {/* Search */}
      <div className="mb-4" style={{ maxWidth: '360px' }}>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search clients…"
        />
      </div>

      {/* Filter tabs */}
      <FilterRow
        options={filterOptions}
        active={stageFilter}
        onChange={setStageFilter}
      />

      {/* Metrics */}
      {metrics.length > 0 && <MetricsRow metrics={metrics} />}

      {/* Inline add form */}
      <AddClientDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} />

      {/* Client list */}
      {isLoading ? (
        <LoadingStrata />
      ) : filtered.length > 0 ? (
        <div>
          {filtered.map((client) => {
            const name =
              client.client?.full_name ||
              client.client_name ||
              client.client_email ||
              'Unknown Client';
            const stage = (client.status || 'active') as ClientLifecycleStage;

            return (
              <ClientListItem
                key={client.id}
                id={client.id}
                name={name}
                initials={getInitials(name)}
                projectDescription={client.notes?.split('\n')[0]?.slice(0, 50) || undefined}
                location={client.location || undefined}
                stage={stage}
                stageDetail={
                  stage === 'active'
                    ? `${client.total_projects || 0} active project${(client.total_projects || 0) !== 1 ? 's' : ''}`
                    : stage === 'nurture' && client.last_contacted_at
                      ? `Last contact: ${new Date(client.last_contacted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                      : undefined
                }
                financialValue={
                  client.total_revenue > 0
                    ? formatCurrency(client.total_revenue)
                    : undefined
                }
                financialLabel={
                  stage === 'active'
                    ? 'Project value'
                    : stage === 'completed' || stage === 'nurture'
                      ? 'Lifetime value'
                      : stage === 'proposal'
                        ? 'Proposal value'
                        : stage === 'lead'
                          ? 'Budget range'
                          : undefined
                }
              />
            );
          })}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          {search ? 'No clients match your search.' : 'No clients yet.'}
        </p>
      )}

    </div>
  );
}
