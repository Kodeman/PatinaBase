'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useScopeChangeRequest, useApplyScopeChange, useSendScopeChangeRequest } from '@patina/supabase';
import { PageActionBar, type BadgeTone } from '@/components/portal';
import { PageContainer } from '@/components/portal/page-container';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { PortalButton } from '@/components/portal/button';
import { DetailRow } from '@/components/portal/detail-row';

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString()}`;
}

// Map a scope-change request status to a kit StatusBadge tone, preserving the
// prior color intent (approved → success/green, declined → error/red,
// sent/viewed → info/blue, draft/cancelled → neutral).
const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  sent: 'info',
  viewed: 'info',
  approved: 'success',
  declined: 'error',
  cancelled: 'neutral',
};

export default function ScopeChangeDetailPage({
  params,
}: {
  params: Promise<{ id: string; changeId: string }>;
}) {
  const { id, changeId } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: request, isLoading } = useScopeChangeRequest(changeId) as { data: any; isLoading: boolean };
  const applyChange = useApplyScopeChange();
  const sendRequest = useSendScopeChangeRequest();

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) {
    return (
      <PageContainer>
        <div className="flex min-h-[60vh] items-center justify-center">
          <LoadingStrata />
        </div>
      </PageContainer>
    );
  }

  if (!request) {
    return (
      <PageContainer>
        <p className="type-body-small py-20 text-center text-[var(--text-muted)]">
          Scope change request not found.
        </p>
      </PageContainer>
    );
  }

  const canSend = request.status === 'draft';
  const canApply = request.status === 'approved' && !request.applied_at;

  return (
    <PageContainer>
      {/* The global breadcrumb (SubNav) carries the project name + "Scope
          Change" step; the bar surfaces the request title + status. */}
      <PageActionBar
        status={{
          tone: STATUS_TONE[request.status] ?? 'neutral',
          label: request.status,
          dot: true,
        }}
        meta={<span className="type-label-secondary">{request.title}</span>}
      />

      <div className="mx-auto max-w-[600px]">
        <p className="mb-6 font-body text-sm leading-relaxed text-[var(--text-body)]">
          {request.description}
        </p>

        <div className="mb-6 border-t border-[var(--border-default)] pt-4">
          <DetailRow label="Additional FF&E Budget" value={formatDollars(request.additional_ffe_budget_cents || 0)} />
          <DetailRow label="Additional Design Fee" value={formatDollars(request.additional_design_fee_cents || 0)} />
          <DetailRow label="Timeline Impact" value={`+${request.timeline_impact_weeks || 0} weeks`} />
          <DetailRow label="New Total" value={formatDollars(request.new_total_budget_cents || 0)} />
        </div>

        {/* New rooms */}
        {request.new_rooms?.length > 0 && (
          <div className="mb-6">
            <span className="type-meta mb-2 block">New Rooms</span>
            {request.new_rooms.map((room: { name: string; budgetCents?: number; budget_cents?: number }, i: number) => (
              <div key={i} className="mb-1 rounded border border-[var(--border-default)] px-3 py-2">
                <span className="font-body text-sm">{room.name}</span>
                <span className="ml-2 font-mono text-xs text-[var(--text-muted)]">
                  {formatDollars((room.budgetCents || room.budget_cents || 0))}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Approval details */}
        {request.approved_at && (
          <div className="mb-6 rounded-md border border-green-200 bg-green-50 p-4">
            <span className="type-meta mb-1 block text-green-700">Approved</span>
            <p className="font-body text-xs text-green-800">
              By {request.approved_by_name || 'Client'} on{' '}
              {new Date(request.approved_at).toLocaleDateString()}
            </p>
          </div>
        )}

        {request.declined_at && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 p-4">
            <span className="type-meta mb-1 block text-red-700">Declined</span>
            {request.decline_reason && (
              <p className="font-body text-xs text-red-800">{request.decline_reason}</p>
            )}
          </div>
        )}

        {request.applied_at && (
          <div className="mb-6 rounded-md border border-green-200 bg-green-50 p-4">
            <span className="type-meta mb-1 block text-green-700">Applied to Project</span>
            <p className="font-body text-xs text-green-800">
              Changes materialized on {new Date(request.applied_at).toLocaleDateString()}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 border-t border-[var(--border-default)] pt-5">
          {canSend && (
            <PortalButton
              variant="primary"
              onClick={async () => {
                await sendRequest.mutateAsync({ requestId: changeId, projectId: id });
              }}
              className="!bg-[var(--accent-primary)]"
            >
              Send to Client
            </PortalButton>
          )}
          {canApply && (
            <PortalButton
              variant="primary"
              onClick={async () => {
                await applyChange.mutateAsync({ requestId: changeId, projectId: id });
                router.push(`/portal/projects/${id}`);
              }}
              className="!bg-[var(--color-sage)]"
            >
              Apply Changes to Project
            </PortalButton>
          )}
          <PortalButton variant="ghost" onClick={() => router.push(`/portal/projects/${id}`)}>
            Back to Project
          </PortalButton>
        </div>
      </div>
    </PageContainer>
  );
}
