'use client';

import { useEffect } from 'react';
import { WebSocketProvider } from '@/lib/websocket';
import { useAuth } from '@/hooks/use-auth';
import { clientEvents } from '@/lib/analytics/events';
import { AuthoritativeEnhancedTimeline } from '@/components/timeline/enhanced-timeline';
import { ProjectOverview } from '@/components/project-overview';
import { ProjectScopeDetails } from '@/components/project-scope-details';
import { BudgetOverview } from '@/components/budget-overview';
import { ProjectInvoicesSummary } from '@/components/project-invoices-summary';
import { FFEStatus } from '@/components/ffe-status';
import { StrataMark } from '@/components/strata-mark';
import { ProjectActivityFeed } from '@/components/project/ProjectActivityFeed';
import { ProjectTeamPanel } from '@/components/project/ProjectTeamPanel';
import { ProjectDocumentsPanel } from '@/components/project/ProjectDocumentsPanel';
import { FFEPipelinePanel } from '@/components/project/FFEPipelinePanel';
import { ProjectCommercialSummary } from '@/components/project-commercial-summary';
import { AwaitingSignatureCards } from '@/components/commercial/awaiting-signature-cards';
import { ClientPlanGrid } from '@/components/commercial/client-plan-grid';
import { ClientSelections } from '@/components/commercial/client-selections';
import { useClientSelections } from '@/hooks/use-commercial-client';
import type { MilestoneDetail } from '@/types/project';
import { useProjectPhaseRealtime } from '@/hooks/use-project-phase-realtime';
import type { ProjectApprovalReview } from '@patina/supabase';

interface ProjectViewWrapperProps {
  projectId: string;
  project: any;
  milestones: MilestoneDetail[];
  userId?: string;
  authToken?: string;
  showOverview?: boolean;
  /**
   * Fire `client_project_view` from here. Default true — this component has
   * always been the emitter for today's project page.
   *
   * ProjectSurfaceSwitch passes false and emits once itself: it renders this
   * tree while the single-pane flag resolves, so leaving the emitter here
   * double-counted every flagged open (child effects run before the parent's,
   * so this fires before the flag can flip).
   */
  emitProjectView?: boolean;
  projectApprovals?: ProjectApprovalReview[];
  projectApprovalsLoading?: boolean;
  projectApprovalsError?: boolean;
}

export function ProjectViewWrapper({
  projectId,
  project,
  milestones,
  userId,
  authToken,
  showOverview = false,
  emitProjectView = true,
  projectApprovals = [],
  projectApprovalsLoading = false,
  projectApprovalsError = false,
}: ProjectViewWrapperProps) {
  // Pull live session for WS auth — props may not be threaded from parent.
  const { session, user } = useAuth();
  const realtimeEnabled = process.env.NEXT_PUBLIC_ENABLE_REAL_TIME_UPDATES !== 'false';
  const effectiveUserId = userId ?? user?.id;
  const effectiveAuthToken = authToken ?? session?.accessToken;

  // The commercial rail (design-services + furnishings authority) replaces
  // the legacy FF&E/budget mounts below with the plan grid and room-grouped
  // selections. origin has three effective states, not two: PENDING (the
  // query hasn't resolved yet) gets a quiet loading posture in place of the
  // origin-dependent region — never a fully-rendered tree, because that tree
  // would be a guess and a client watching the page assemble sees it as
  // "broken" rather than "loading". Once resolved, ERROR and a non-commercial
  // origin (legacy, or anything else) both fail closed to the legacy tree —
  // today's byte-identical mounts. Only a confirmed origin === 'commercial'
  // renders the commercial rail.
  const { data: selectionsData, isPending: originPending, isError: originErrored } =
    useClientSelections(projectId);
  const isCommercial = !originPending && !originErrored && selectionsData?.origin === 'commercial';
  const showLegacyOriginTree = !originPending && !isCommercial;

  useProjectPhaseRealtime(projectId, realtimeEnabled);

  useEffect(() => {
    if (!emitProjectView) return;
    clientEvents.projectView(projectId);
  }, [emitProjectView, projectId]);

  return (
    <WebSocketProvider
      projectId={realtimeEnabled ? projectId : undefined}
      userId={effectiveUserId}
      authToken={effectiveAuthToken}
      debug={process.env.NODE_ENV === 'development'}
    >
      {showOverview && <ProjectOverview project={project} milestones={milestones} />}

      {showOverview && <ProjectCommercialSummary projectId={projectId} />}

      {showOverview && <ProjectScopeDetails projectId={projectId} />}

      {showOverview && originPending && (
        <div className="mt-8 h-28 animate-pulse rounded bg-[var(--color-pearl)]" data-testid="origin-pending" />
      )}

      {showOverview && isCommercial && <AwaitingSignatureCards projectId={projectId} />}
      {showOverview && isCommercial && <ClientPlanGrid projectId={projectId} />}
      {showOverview && isCommercial && <ClientSelections projectId={projectId} />}
      {showOverview && showLegacyOriginTree && <BudgetOverview projectId={projectId} />}

      {showOverview && <ProjectInvoicesSummary projectId={projectId} />}

      {showOverview && showLegacyOriginTree && <FFEStatus projectId={projectId} />}

      {showOverview && showLegacyOriginTree && (
        <div className="mt-8">
          <FFEPipelinePanel projectId={projectId} />
        </div>
      )}

      {showOverview && (
        <div className="mt-8 grid gap-6 lg:grid-cols-3" data-testid="project-detail-zones-8-10">
          <div className="lg:col-span-2">
            <ProjectActivityFeed projectId={projectId} />
          </div>
          <div className="space-y-6">
            <ProjectTeamPanel projectId={projectId} />
            <ProjectDocumentsPanel projectId={projectId} />
          </div>
        </div>
      )}

      {showOverview && <StrataMark variant="full" />}

      <AuthoritativeEnhancedTimeline
        projectId={projectId}
        milestones={milestones}
        projectApprovals={projectApprovals}
        projectApprovalsLoading={projectApprovalsLoading}
        projectApprovalsError={projectApprovalsError}
        onMilestoneUpdate={(milestone) => {
          console.log('Milestone updated:', milestone.id, milestone.status);
        }}
      />
    </WebSocketProvider>
  );
}
