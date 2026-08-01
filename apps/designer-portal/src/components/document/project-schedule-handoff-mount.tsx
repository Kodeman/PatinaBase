'use client';

import type { Database } from '@patina/supabase';

import { PhaseAdvanceControl } from './phase-advance-control';
import { PhaseTimeline } from './phase-timeline';
import { ScheduleConfirmStrip } from './schedule/schedule-confirm-strip';
import { ScheduleRule } from './schedule/schedule-rule';

type ProjectPhaseRow = Database['public']['Tables']['project_phases']['Row'];

/**
 * Keep the project schedule and its lifecycle actions under one mount for both
 * schedule renderers. Closed projects remain readable without exposing phase
 * mutation controls; non-project documents receive no project schedule UI.
 */
export function ProjectScheduleHandoffMount({
  engagementKind,
  projectId,
  projectTitle,
  projectStatus,
  phases,
  showScheduleRule,
}: {
  engagementKind: string;
  projectId: string | null;
  projectTitle: string;
  projectStatus: string | null | undefined;
  phases: readonly ProjectPhaseRow[] | undefined;
  showScheduleRule: boolean;
}) {
  if (engagementKind !== 'project' || !projectId) return null;

  return (
    <>
      {showScheduleRule ? (
        <ScheduleRule projectId={projectId} projectTitle={projectTitle} />
      ) : (
        <PhaseTimeline projectId={projectId} />
      )}
      <ScheduleConfirmStrip projectId={projectId} />
      {projectStatus === 'active' ? (
        <PhaseAdvanceControl projectId={projectId} phases={phases} />
      ) : null}
    </>
  );
}
