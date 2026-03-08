'use client';

import { WebSocketProvider } from '@/lib/websocket';
import { EnhancedTimeline } from '@/components/timeline/enhanced-timeline';
import { ProjectOverview } from '@/components/project-overview';
import type { MilestoneDetail } from '@/types/project';

interface ProjectViewWrapperProps {
  projectId: string;
  project: any; // Project overview data
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
  return (
    <WebSocketProvider
      projectId={projectId}
      userId={userId}
      authToken={authToken}
      debug={process.env.NODE_ENV === 'development'}
    >
      {showOverview && <ProjectOverview project={project} />}

      <div className={showOverview ? 'mt-12' : ''}>
        <EnhancedTimeline
          projectId={projectId}
          milestones={milestones}
          onMilestoneUpdate={(milestone) => {
            console.log('Milestone updated:', milestone.id, milestone.status);
          }}
        />
      </div>
    </WebSocketProvider>
  );
}