'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  useAllDecisions,
  useDecisionMetrics,
  useSendDecisionReminder,
} from '@patina/supabase';
import type { DecisionStatus } from '@patina/supabase';
import { MetricBlock } from '@/components/portal/metric-block';
import { FilterRow } from '@/components/portal/filter-row';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { DecisionCard } from '@/components/portal/decision-card';
import { PortalButton } from '@/components/portal/button';

type FilterKey = 'open' | 'overdue' | 'due_this_week' | 'resolved';

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status !== 'pending') return false;
  return new Date(dueDate) < new Date();
}

function isDueThisWeek(dueDate: string | null, status: string): boolean {
  if (!dueDate || status !== 'pending') return false;
  const due = new Date(dueDate);
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
  return due >= now && due <= weekEnd;
}

function formatDueDate(dueDate: string | null): string | undefined {
  if (!dueDate) return undefined;
  return new Date(dueDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getClientName(decision: {
  designer_client?: {
    client_name: string | null;
    client_email: string | null;
    client?: { full_name: string | null } | null;
  };
}): string {
  return (
    decision.designer_client?.client?.full_name ||
    decision.designer_client?.client_name ||
    decision.designer_client?.client_email ||
    'Unknown'
  );
}

export default function DecisionsDashboardPage() {
  const [filter, setFilter] = useState<FilterKey>('open');

  const statusFilter: DecisionStatus[] | undefined =
    filter === 'resolved' ? ['responded'] : undefined;
  const { data: allDecisions, isLoading } = useAllDecisions(
    filter === 'resolved' ? { status: statusFilter } : undefined
  );
  const { data: metrics } = useDecisionMetrics();
  const sendReminder = useSendDecisionReminder();

  const decisions = useMemo(() => {
    if (!allDecisions) return [];

    switch (filter) {
      case 'open':
        return allDecisions.filter((d) => d.status === 'pending');
      case 'overdue':
        return allDecisions.filter((d) => isOverdue(d.due_date, d.status));
      case 'due_this_week':
        return allDecisions.filter((d) => isDueThisWeek(d.due_date, d.status));
      case 'resolved':
        return allDecisions.filter((d) => d.status === 'responded');
      default:
        return allDecisions;
    }
  }, [allDecisions, filter]);

  const filterOptions = [
    { key: 'open', label: 'All Open', count: metrics?.open ?? 0 },
    { key: 'overdue', label: 'Overdue', count: metrics?.overdue ?? 0 },
    {
      key: 'due_this_week',
      label: 'Due This Week',
      count: allDecisions?.filter((d) => isDueThisWeek(d.due_date, d.status)).length ?? 0,
    },
    {
      key: 'resolved',
      label: 'Resolved',
      count: allDecisions?.filter((d) => d.status === 'responded').length ?? 0,
    },
  ];

  if (isLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="type-page-title mb-1">Decisions</h1>
          <p className="type-label-secondary">Open choices awaiting client response</p>
        </div>
        <PortalButton variant="primary">+ New Decision</PortalButton>
      </div>

      {/* Filter Tabs */}
      <FilterRow
        options={filterOptions}
        active={filter}
        onChange={(key) => setFilter(key as FilterKey)}
      />

      {/* Metrics Row */}
      <div className="mb-8 grid grid-cols-2 gap-6 border-b border-[var(--border-default)] pb-8 md:grid-cols-4 md:gap-0">
        <div className="pr-0 md:pr-8">
          <MetricBlock
            label="Open Decisions"
            value={metrics?.open ?? 0}
            change={`across ${new Set(decisions.map((d) => d.project_id).filter(Boolean)).size} projects`}
            trend="neutral"
          />
        </div>
        <div className="border-0 pl-0 pr-0 md:border-l md:border-[var(--border-default)] md:pl-8 md:pr-8">
          <MetricBlock
            label="Overdue"
            value={metrics?.overdue ?? 0}
            change={metrics?.overdue ? 'blocking procurement' : undefined}
            trend={metrics?.overdue ? 'down' : 'neutral'}
          />
        </div>
        <div className="border-0 pl-0 pr-0 md:border-l md:border-[var(--border-default)] md:pl-8 md:pr-8">
          <MetricBlock
            label="Avg Response"
            value={`${metrics?.avgResponseDays ?? 0} days`}
            trend="neutral"
          />
        </div>
        <div className="border-0 pl-0 md:border-l md:border-[var(--border-default)] md:pl-8">
          <MetricBlock
            label="Resolution Rate"
            value={`${metrics?.onTimeRate ?? 0}%`}
            change="on time this quarter"
            trend="up"
          />
        </div>
      </div>

      {/* Decision List */}
      {decisions.length === 0 ? (
        <p className="py-16 text-center type-body text-[var(--text-muted)]">
          No decisions match this filter.
        </p>
      ) : (
        <div>
          {decisions.map((decision) => (
            <DecisionCard
              key={decision.id}
              id={decision.id}
              title={decision.title}
              dueDate={formatDueDate(decision.due_date)}
              isOverdue={isOverdue(decision.due_date, decision.status)}
              description={decision.context ?? undefined}
              optionCount={decision.options?.length}
              status={decision.status}
              decisionType={decision.decision_type}
              blockingStatus={decision.blocking_status}
              projectName={decision.project?.name ?? undefined}
              clientName={getClientName(decision)}
              optionThumbnails={
                decision.options
                  ?.filter((o) => o.image_url)
                  .map((o) => o.image_url!) ?? []
              }
              onSendReminder={
                decision.status === 'pending'
                  ? () => sendReminder.mutate({ decisionId: decision.id })
                  : undefined
              }
              onView={() => {}}
              href={`/portal/decisions/${decision.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
