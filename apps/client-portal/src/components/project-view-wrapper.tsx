'use client';

import { WebSocketProvider } from '@/lib/websocket';
import { useAuth } from '@/hooks/use-auth';
import { EnhancedTimeline } from '@/components/timeline/enhanced-timeline';
import { ProjectOverview } from '@/components/project-overview';
import { ProjectScopeDetails } from '@/components/project-scope-details';
import { BudgetOverview } from '@/components/budget-overview';
import { FFEStatus } from '@/components/ffe-status';
import { StrataMark } from '@/components/strata-mark';
import { ProjectActivityFeed } from '@/components/project/ProjectActivityFeed';
import { ProjectTeamPanel } from '@/components/project/ProjectTeamPanel';
import { ProjectDocumentsPanel } from '@/components/project/ProjectDocumentsPanel';
import type { MilestoneDetail } from '@/types/project';

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

  return (
    <WebSocketProvider
      projectId={realtimeEnabled ? projectId : undefined}
      userId={effectiveUserId}
      authToken={effectiveAuthToken}
      debug={process.env.NODE_ENV === 'development'}
    >
      {showOverview && <ProjectOverview project={project} milestones={milestones} />}

      {showOverview && <ProjectScopeDetails projectId={projectId} />}

      {showOverview && <BudgetOverview projectId={projectId} />}

      {showOverview && <FFEStatus projectId={projectId} />}

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

      <EnhancedTimeline
        projectId={projectId}
        milestones={milestones}
        onMilestoneUpdate={(milestone) => {
          console.log('Milestone updated:', milestone.id, milestone.status);
        }}
      />
    </WebSocketProvider>
  );
}
