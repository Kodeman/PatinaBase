'use client';

import { useEffect } from 'react';
import { useProjectApprovalRealtime, useProjectApprovals } from '@patina/supabase';

import { ProjectViewWrapper } from '@/components/project-view-wrapper';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { clientEvents } from '@/lib/analytics/events';
import type { ClientProjectOverview, MilestoneDetail } from '@/types/project';

import { TheMaking } from './the-making';

interface ProjectSurfaceSwitchProps {
  projectId: string;
  project: ClientProjectOverview;
  milestones: MilestoneDetail[];
}

/**
 * Chooses between today's project dashboard and The Making.
 *
 * The page above stays a server component and keeps its fetch and its
 * `notFound()`; only the rendered surface moves here, because the flag can
 * only be read in the browser.
 *
 * Fail-closed, and specifically: while the flag is loading we render *today's
 * tree*, not a spinner and not a skeleton. A client opening their own project
 * must never watch it assemble. If PostHog never answers — no key, blocked
 * network, a homeowner with an ad blocker — the stable state is the portal
 * they already know.
 *
 * THIS COMPONENT IS THE SOLE EMITTER OF `client_project_view`. Both branches
 * pass through here exactly once per project, and neither branch emits on its
 * own (`ProjectViewWrapper` takes `emitProjectView={false}`). That matters
 * because the flag can only resolve from an effect: every flagged open renders
 * today's tree for at least one commit first, and child effects run before the
 * parent's, so an emitter inside either branch would fire twice on the flag's
 * own primary flow — corrupting the exact metric the rollout is judged on.
 */
export function ProjectSurfaceSwitch({
  projectId,
  project,
  milestones,
}: ProjectSurfaceSwitchProps) {
  const { value: singlePane, isLoading } = useFeatureFlag('single-pane');
  const approvalsQuery = useProjectApprovals(projectId);
  useProjectApprovalRealtime(projectId);

  useEffect(() => {
    clientEvents.projectView(projectId);
  }, [projectId]);

  if (!isLoading && singlePane) {
    return (
      <TheMaking
        projectId={projectId}
        project={project}
        milestones={milestones}
        projectApprovals={approvalsQuery.data ?? []}
        projectApprovalsLoading={approvalsQuery.isLoading}
        projectApprovalsError={approvalsQuery.isError}
      />
    );
  }

  return (
    <ProjectViewWrapper
      projectId={projectId}
      project={project}
      milestones={milestones}
      showOverview={true}
      emitProjectView={false}
      projectApprovals={approvalsQuery.data ?? []}
      projectApprovalsLoading={approvalsQuery.isLoading}
      projectApprovalsError={approvalsQuery.isError}
    />
  );
}
