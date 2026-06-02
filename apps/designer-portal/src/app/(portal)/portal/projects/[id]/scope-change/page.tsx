'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { useScopeChangeRequests } from '@patina/supabase';
import { useProject } from '@/hooks/use-projects';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { EmptyState } from '@/components/portal/empty-state';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCO = any;

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'var(--text-muted)' },
  sent: { label: 'Awaiting client', color: 'var(--color-dusty-blue, #8B9CAD)' },
  viewed: { label: 'Viewed', color: 'var(--color-dusty-blue, #8B9CAD)' },
  awaiting_signature: { label: 'Awaiting signature', color: 'var(--color-golden-hour, #E8C547)' },
  approved: { label: 'Approved', color: 'var(--color-sage, #A8B5A0)' },
  declined: { label: 'Declined', color: 'var(--color-terracotta, #D4A090)' },
  cancelled: { label: 'Cancelled', color: 'var(--text-muted)' },
};

function formatCurrency(cents: number): string {
  return `$${((cents || 0) / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ChangeOrdersListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = use(params);
  const hydrated = useHydrated();
  const { data: project } = useProject(projectId);
  const { data: rawRequests, isLoading } = useScopeChangeRequests(projectId);

  const requests = (Array.isArray(rawRequests) ? rawRequests : []) as AnyCO[];

  const grouped = useMemo(() => {
    const open: AnyCO[] = [];
    const closed: AnyCO[] = [];
    for (const r of requests) {
      if (['approved', 'declined', 'cancelled'].includes(r.status)) closed.push(r);
      else open.push(r);
    }
    return { open, closed };
  }, [requests]);

  const totals = useMemo(() => {
    const approved = requests.filter((r) => r.status === 'approved');
    return {
      count: requests.length,
      approvedCount: approved.length,
      totalImpactCents: approved.reduce((s, r) => s + (r.additional_ffe_budget_cents || 0) + (r.additional_design_fee_cents || 0), 0),
    };
  }, [requests]);

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading || !project) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <Breadcrumb
        items={[
          { label: 'Projects', href: '/portal/projects' },
          { label: project.name, href: `/portal/projects/${projectId}` },
          { label: 'Change Orders' },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="type-section-head" style={{ fontSize: '1.5rem' }}>
          Change Orders
        </h1>
        <Link
          href={`/portal/projects/${projectId}/scope-change/new`}
          className="rounded-[3px] bg-[var(--text-primary)] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)] no-underline"
        >
          + New change order
        </Link>
      </div>

      {/* Summary */}
      <div className="mb-6 flex flex-wrap gap-6 border-b pb-6" style={{ borderColor: 'var(--border-default)' }}>
        <div>
          <div className="type-meta-small uppercase tracking-wider">Total</div>
          <div className="font-heading text-[1.4rem] font-bold">{totals.count}</div>
        </div>
        <div>
          <div className="type-meta-small uppercase tracking-wider">Approved</div>
          <div className="font-heading text-[1.4rem] font-bold">{totals.approvedCount}</div>
        </div>
        <div>
          <div className="type-meta-small uppercase tracking-wider">Approved $ impact</div>
          <div className="font-heading text-[1.4rem] font-bold">
            {formatCurrency(totals.totalImpactCents)}
          </div>
        </div>
      </div>

      {requests.length === 0 ? (
        <EmptyState
          title="No change orders yet"
          description="Document scope changes here. Each one auto-generates a numbered SCA, captures impact on cost and schedule, and routes to the client for signature."
        />
      ) : (
        <>
          {grouped.open.length > 0 && (
            <Section title="Active">
              {grouped.open.map((r) => (
                <COCard key={r.id} request={r} projectId={projectId} />
              ))}
            </Section>
          )}
          {grouped.closed.length > 0 && (
            <Section title="Closed">
              {grouped.closed.map((r) => (
                <COCard key={r.id} request={r} projectId={projectId} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="mb-2 type-meta-small uppercase tracking-wider">{title}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function COCard({ request, projectId }: { request: AnyCO; projectId: string }) {
  const status = STATUS_LABEL[request.status] || STATUS_LABEL.draft;
  const totalImpact =
    (request.additional_ffe_budget_cents || 0) + (request.additional_design_fee_cents || 0);

  return (
    <Link
      href={`/portal/projects/${projectId}/scope-change/${request.id}`}
      className="grid items-center gap-3 rounded-md border bg-[var(--bg-surface)] p-3 no-underline transition-colors hover:bg-[var(--bg-hover)]"
      style={{ borderColor: 'var(--border-default)', gridTemplateColumns: '120px 2fr 1fr 1fr 110px' }}
    >
      <span className="font-mono text-[0.72rem] text-[var(--text-muted)]">
        {request.co_number || '—'}
      </span>
      <div>
        <div className="type-label">{request.title}</div>
        {request.description && (
          <div className="type-body line-clamp-1 text-[0.8rem] text-[var(--text-muted)]">
            {request.description}
          </div>
        )}
      </div>
      <span className="font-heading text-[0.92rem] font-semibold">
        {formatCurrency(totalImpact)}
      </span>
      <span className="type-meta-small text-[var(--text-muted)]">
        {request.timeline_impact_weeks
          ? `+${request.timeline_impact_weeks}w`
          : 'No schedule impact'}
      </span>
      <span
        className="text-right type-meta-small uppercase tracking-wider"
        style={{ color: status.color }}
      >
        {status.label}
        <div className="text-[var(--text-muted)] normal-case">
          {request.created_at ? formatDate(request.created_at) : ''}
        </div>
      </span>
    </Link>
  );
}
