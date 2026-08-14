'use client';

import type { Database } from '@patina/supabase';

import { PhaseAdvanceControl } from './phase-advance-control';
import { ScheduleConfirmStrip } from './schedule/schedule-confirm-strip';
import { ScheduleRule } from './schedule/schedule-rule';

type ProjectPhaseRow = Database['public']['Tables']['project_phases']['Row'];

/**
 * Keep the project schedule and its lifecycle actions under one mount. Closed
 * projects remain readable without exposing phase mutation controls;
 * non-project documents receive no project schedule UI.
 *
 * B3 retired the `schedule-spine` flip gate: the Rule is the schedule, so there
 * is no second renderer to choose between and no `showScheduleRule` prop.
 */
export function ProjectScheduleHandoffMount({
  engagementKind,
  projectId,
  projectTitle,
  projectStatus,
  phases,
}: {
  engagementKind: string;
  projectId: string | null;
  projectTitle: string;
  projectStatus: string | null | undefined;
  phases: readonly ProjectPhaseRow[] | undefined;
}) {
  if (engagementKind !== 'project' || !projectId) return null;

  return (
    <>
      <ScheduleRule projectId={projectId} projectTitle={projectTitle} />
      <ScheduleConfirmStrip projectId={projectId} />
      {projectStatus === 'active' ? (
        <PhaseAdvanceControl projectId={projectId} phases={phases} />
      ) : null}
    </>
  );
}
