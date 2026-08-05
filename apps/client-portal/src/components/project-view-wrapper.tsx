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

interface ProjectViewWrapperProps {
  projectId: string;
  project: any;
  milestones: MilestoneDetail[];
  userId?: string;
  authToken?: string;
  showOverview?: boolean;
}

export function ProjectViewWrapper({
  projectId,
  project,
  milestones,
  userId,
  authToken,
  showOverview = false
}: ProjectViewWrapperProps) {
  // Pull live session for WS auth — props may not be threaded from parent.
  const { session, user } = useAuth();
  const realtimeEnabled = process.env.NEXT_PUBLIC_ENABLE_REAL_TIME_UPDATES !== 'false';
  const effectiveUserId = userId ?? user?.id;
  const effectiveAuthToken = authToken ?? session?.accessToken;

  // The commercial rail (design-services + furnishings authority) replaces
  // the legacy FF&E/budget mounts below with the plan grid and room-grouped
  // selections. Fail closed to the legacy tree — today's byte-identical
  // mounts — until origin === 'commercial' is confirmed; a mid-load flash
  // into the new UI, or a permanent stall on an errored fetch, is worse than
  // a beat of the familiar mounts.
  const { data: selectionsData } = useClientSelections(projectId);
  const isCommercial = selectionsData?.origin === 'commercial';

  useProjectPhaseRealtime(projectId, realtimeEnabled);

  useEffect(() => {
    clientEvents.projectView(projectId);
  }, [projectId]);

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

      {showOverview && isCommercial && <AwaitingSignatureCards projectId={projectId} />}
      {showOverview && isCommercial && <ClientPlanGrid projectId={projectId} />}
      {showOverview && isCommercial && <ClientSelections projectId={projectId} />}

      {showOverview && !isCommercial && <BudgetOverview projectId={projectId} />}

      {showOverview && <ProjectInvoicesSummary projectId={projectId} />}

      {showOverview && !isCommercial && <FFEStatus projectId={projectId} />}

      {showOverview && !isCommercial && (
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
        onMilestoneUpdate={(milestone) => {
          console.log('Milestone updated:', milestone.id, milestone.status);
        }}
      />
    </WebSocketProvider>
  );
}
