'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useProjectV2, useCreateScopeChangeRequest, useSendScopeChangeRequest } from '@patina/supabase';
import { PageActionBar } from '@/components/portal';
import { PageContainer } from '@/components/portal/page-container';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useHydrated } from '@/hooks/use-hydrated';
import { ScopeChangeForm, ScopeChangeFormData } from '@/components/portal/scope-change-form';

export default function NewScopeChangePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const hydrated = useHydrated();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project, isLoading } = useProjectV2(id) as { data: any; isLoading: boolean };
  const createRequest = useCreateScopeChangeRequest();
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

  if (!project) {
    return (
      <PageContainer>
        <p className="type-body-small py-20 text-center text-[var(--text-muted)]">
          Project not found.
        </p>
      </PageContainer>
    );
  }

  const handleSave = async (data: ScopeChangeFormData) => {
    const result = await createRequest.mutateAsync({
      projectId: id,
      proposalId: project.proposal_id || undefined,
      title: data.title,
      description: data.description,
      additionalFfeBudgetCents: data.additionalFfeBudgetCents,
      additionalDesignFeeCents: data.additionalDesignFeeCents,
      timelineImpactWeeks: data.timelineImpactWeeks,
      newTotalBudgetCents:
        (project.budget_cents || 0) + data.additionalFfeBudgetCents + data.additionalDesignFeeCents,
      newRooms: data.newRooms,
      newFfeItems: data.newFfeItems,
    });
    router.push(`/portal/projects/${id}/scope-change/${result.id}`);
  };

  const handleSend = async (data: ScopeChangeFormData) => {
    const result = await createRequest.mutateAsync({
      projectId: id,
      proposalId: project.proposal_id || undefined,
      title: data.title,
      description: data.description,
      additionalFfeBudgetCents: data.additionalFfeBudgetCents,
      additionalDesignFeeCents: data.additionalDesignFeeCents,
      timelineImpactWeeks: data.timelineImpactWeeks,
      newTotalBudgetCents:
        (project.budget_cents || 0) + data.additionalFfeBudgetCents + data.additionalDesignFeeCents,
      newRooms: data.newRooms,
      newFfeItems: data.newFfeItems,
    });
    await sendRequest.mutateAsync({ requestId: result.id, projectId: id });
    router.push(`/portal/projects/${id}/scope-change/${result.id}`);
  };

  return (
    <PageContainer>
      {/* The global breadcrumb (SubNav) carries the project name + "Scope
          Change" step; the bar surfaces the authorization context as meta. */}
      <PageActionBar
        meta={
          <div className="min-w-0">
            <span className="type-label-secondary">Scope Change Authorization</span>
            <p className="type-body-small text-[var(--text-muted)]">
              {project.name} &middot; Original scope signed{' '}
              {project.proposal?.signed_at
                ? new Date(project.proposal.signed_at).toLocaleDateString()
                : 'N/A'}
            </p>
          </div>
        }
      />

      <ScopeChangeForm
        projectName={project.name}
        currentBudgetCents={project.budget_cents || 0}
        onSave={handleSave}
        onSend={handleSend}
        onCancel={() => router.push(`/portal/projects/${id}`)}
        saving={createRequest.isPending || sendRequest.isPending}
      />
    </PageContainer>
  );
}
