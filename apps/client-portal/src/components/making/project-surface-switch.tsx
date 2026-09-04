'use client';

import { useEffect, useMemo } from 'react';
import { useMyProjectApprovalReviews } from '@patina/supabase';

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
  /** How the client got here — `/` chose this house, or she named it. */
  viewSource?: 'front-door' | 'named';
}

/**
 * Renders the client's project. There is one surface now — the Threshold —
 * and every client gets it: no flag is read here, so nothing renders one
 * tree and then replaces it a commit later.
 *
 * THIS COMPONENT IS THE SOLE EMITTER OF `client_project_view`. Both pages
 * that render a project (`/` and `/projects/[id]`) pass through here exactly
 * once per project, and the Threshold does not emit on its own. `/` now
 * reaches it too, so the event carries `source` to keep "landed at the front
 * door" apart from "opened this house by name".
 */
export function ProjectSurfaceSwitch({
  projectId,
  project,
  milestones,
  otherHouses = [],
  viewSource = 'named',
}: ProjectSurfaceSwitchProps) {
  // The caller-global sanitized read (00440), NOT `get_project_decision_reviews`:
  // that one authorizes a studio co-member or the decision lead and raises
  // `insufficient_privilege` for a homeowner, so every client got a failed read
  // and no approval ask at all. `list_my_project_decision_reviews` is the read
  // the retired `/decisions` list and the chrome already use; filter it to this
  // house here.
  const approvalsQuery = useMyProjectApprovalReviews();
  const projectApprovals = useMemo(
    () =>
      (approvalsQuery.data ?? []).filter(
        (review) => review.projectId === projectId,
      ),
    [approvalsQuery.data, projectId],
  );

  useEffect(() => {
    clientEvents.projectView(projectId, viewSource);
    // `viewSource` is fixed per route render; the project is what changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <Threshold
      projectId={projectId}
      project={project}
      milestones={milestones}
      otherHouses={otherHouses}
      projectApprovals={projectApprovals}
      projectApprovalsLoading={approvalsQuery.isLoading}
      projectApprovalsError={approvalsQuery.isError}
    />
  );
}
