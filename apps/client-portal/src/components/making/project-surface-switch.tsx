'use client';

import { useEffect } from 'react';
import { useProjectApprovals } from '@patina/supabase';

import { Threshold } from '@/components/threshold/threshold';
import type { OtherHouse } from '@/components/threshold/other-houses';
import { clientEvents } from '@/lib/analytics/events';
import type { ClientProjectOverview, MilestoneDetail } from '@/types/project';

interface ProjectSurfaceSwitchProps {
  projectId: string;
  project: ClientProjectOverview;
  milestones: MilestoneDetail[];
  /** Every other project this client can open. Empty for a solo client. */
  otherHouses?: OtherHouse[];
}

/**
 * Renders the client's project. There is one surface now — the Threshold —
 * and every client gets it: no flag is read here, so nothing renders one
 * tree and then replaces it a commit later.
 *
 * THIS COMPONENT IS THE SOLE EMITTER OF `client_project_view`. Both pages
 * that render a project (`/` and `/projects/[id]`) pass through here exactly
 * once per project, and the Threshold does not emit on its own.
 */
export function ProjectSurfaceSwitch({
  projectId,
  project,
  milestones,
  otherHouses = [],
}: ProjectSurfaceSwitchProps) {
  const approvalsQuery = useProjectApprovals(projectId);

  useEffect(() => {
    clientEvents.projectView(projectId);
  }, [projectId]);

  return (
    <Threshold
      projectId={projectId}
      project={project}
      milestones={milestones}
      otherHouses={otherHouses}
      projectApprovals={approvalsQuery.data ?? []}
      projectApprovalsLoading={approvalsQuery.isLoading}
      projectApprovalsError={approvalsQuery.isError}
    />
  );
}
