'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useProposals, useProposalStats } from '@/hooks/use-proposals';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { FilterRow } from '@/components/portal/filter-row';
import { MetricsRow } from '@/components/portal/metrics-row';
import { ProposalListItem } from '@/components/portal/proposal-list-item';
import { PortalButton } from '@/components/portal/button';

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'sent', label: 'Sent' },
  { key: 'viewed', label: 'Viewed' },
  { key: 'accepted', label: 'Signed' },
  { key: 'expired', label: 'Expired' },
];

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ProposalsPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('all');
  const { data: proposals, isLoading } = useProposals(
    activeFilter !== 'all' ? { status: activeFilter } : undefined
  );
  const { data: stats } = useProposalStats();

  // Calculate filter counts from stats
  const filterOptions = useMemo(() => {
    if (!stats) return STATUS_FILTERS;
    return STATUS_FILTERS.map((f) => ({
      ...f,
      count:
        f.key === 'all'
          ? stats.total
          : (stats as Record<string, number>)[f.key] ?? 0,
    }));
  }, [stats]);

  // Build metrics
  const metrics = useMemo(() => {
    if (!stats) return [];

    const activeValue = ((stats.totalValue - stats.acceptedValue) / 100);
    const winRate = stats.total > 0
      ? Math.round((stats.accepted / stats.total) * 100)
      : 0;

    return [
      {
        label: 'Active Value',
        value: `$${activeValue >= 1000 ? `${(activeValue / 1000).toFixed(1)}k` : activeValue.toLocaleString()}`,
        subtitle: `${stats.sent + stats.viewed} awaiting response`,
        trend: 'neutral' as const,
      },
      {
        label: 'Win Rate',
        value: `${winRate}%`,
        subtitle: winRate > 50 ? '\u2191 above average' : 'building momentum',
        trend: winRate > 50 ? ('up' as const) : ('neutral' as const),
      },
      {
        label: 'Avg. Response',
        value: '\u2014',
        subtitle: 'not enough data',
        trend: 'neutral' as const,
      },
    ];
  }, [stats]);

  if (isLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      {/* Page header */}
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="type-section-head" style={{ fontSize: '1.5rem' }}>
          Proposals
        </h1>
        <PortalButton
          variant="primary"
          onClick={() => router.push('/portal/proposals/new')}
        >
          + New Proposal
        </PortalButton>
      </div>

      {/* Status filter tabs */}
      <FilterRow
        options={filterOptions}
        active={activeFilter}
        onChange={setActiveFilter}
      />

      {/* Metrics row */}
      {metrics.length > 0 && <MetricsRow metrics={metrics} />}

      {/* Column headers */}
      <div
        className="grid items-center gap-6 border-b border-[var(--border-subtle)] py-1.5"
        style={{ gridTemplateColumns: '1fr 120px 100px' }}
      >
        <span className="type-meta-small">Proposal</span>
        <span className="type-meta-small text-right">Value</span>
        <span className="type-meta-small text-right">Status</span>
      </div>

      {/* Proposal list */}
      {proposals && proposals.length > 0 ? (
        <div>
          {proposals.map((proposal) => {
            // Build subtitle
            const parts: string[] = [];
            if (proposal.sent_at) parts.push(`Sent ${formatRelativeDate(proposal.sent_at)}`);
            if (proposal.valid_until) {
              const expDate = new Date(proposal.valid_until);
              const now = new Date();
              if (expDate > now) {
                parts.push(`Expires ${formatRelativeDate(proposal.valid_until)}`);
              }
            }
            if (proposal.status === 'draft') {
              parts.push(`Last edited ${formatRelativeDate(proposal.updated_at)}`);
            }

            return (
              <ProposalListItem
                key={proposal.id}
                id={proposal.id}
                title={proposal.title}
                clientName={proposal.client?.full_name || null}
                subtitle={parts.join(' \u00B7 ')}
                value={proposal.total_amount || 0}
                status={proposal.status}
              />
            );
          })}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          No proposals yet. Create your first proposal to get started.
        </p>
      )}
    </div>
  );
}
