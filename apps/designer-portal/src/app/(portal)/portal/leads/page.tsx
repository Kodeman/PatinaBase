'use client';

import { useState } from 'react';
import { useLeads, useLeadStats, useAcceptLead, useDeclineLead } from '@patina/supabase';
import { LeadListItem } from '@/components/portal/lead-list-item';
import { LoadingStrata } from '@/components/portal/loading-strata';

type FilterStatus = 'all' | 'new' | 'saved' | 'archived';

export default function LeadInboxPage() {
  const [filter, setFilter] = useState<FilterStatus>('all');
  const { data: leadStats } = useLeadStats();

  const statusMap: Record<FilterStatus, string | string[] | undefined> = {
    all: undefined,
    new: 'new',
    saved: 'viewed',
    archived: ['declined', 'expired'],
  };

  const { data: leads, isLoading } = useLeads({
    status: statusMap[filter] as string | undefined,
  });

  const acceptLead = useAcceptLead();
  const declineLead = useDeclineLead();

  const filters: { key: FilterStatus; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: leadStats?.total },
    { key: 'new', label: 'New', count: leadStats?.new },
    { key: 'saved', label: 'Saved', count: leadStats?.viewed },
    { key: 'archived', label: 'Archived' },
  ];

  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-4">Leads</h1>

      {/* Filter Row */}
      <div className="mb-6 flex gap-4">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`type-meta cursor-pointer border-0 bg-transparent ${
              filter === f.key
                ? 'text-[var(--text-primary)] underline underline-offset-4'
                : 'text-[var(--text-muted)] no-underline hover:text-[var(--text-primary)]'
            }`}
          >
            {f.label}
            {f.count !== undefined && ` (${f.count})`}
          </button>
        ))}
      </div>

      {/* Lead List */}
      {isLoading ? (
        <LoadingStrata />
      ) : leads && leads.length > 0 ? (
        <div>
          {leads.map((lead) => (
            <LeadListItem
              key={lead.id}
              id={lead.id}
              clientName={lead.homeowner?.full_name || 'Anonymous Client'}
              projectType={lead.project_type || ''}
              location={
                [lead.location_city, lead.location_state]
                  .filter(Boolean)
                  .join(', ') || ''
              }
              budgetRange={lead.budget_range || ''}
              responseDeadline={
                lead.response_deadline
                  ? formatRelativeTime(lead.response_deadline)
                  : ''
              }
              matchScore={lead.match_score || 0}
              onAccept={(id) => acceptLead.mutate(id)}
              onPass={(id) => declineLead.mutate({ leadId: id })}
            />
          ))}
        </div>
      ) : (
        <p className="type-section-head py-16 text-center italic text-[var(--text-muted)]">
          No new leads right now. They&apos;ll appear here when clients match
          your style.
        </p>
      )}
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));

  if (diffHours < 0) return 'expired';
  if (diffHours < 1) return 'less than 1h';
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d`;
}
