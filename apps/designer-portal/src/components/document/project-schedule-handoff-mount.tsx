'use client';

import { ScheduleConfirmStrip } from './schedule/schedule-confirm-strip';
import { ScheduleRule } from './schedule/schedule-rule';

/**
 * The project schedule INSTRUMENT — the drafting strip and the confirm strip
 * that commits an edit made on it. Non-project documents receive no project
 * schedule UI.
 *
 * `PhaseAdvanceControl` deliberately does NOT live here any more. This mount is
 * the body of a region that is folded by default (schedule-rule-region.tsx),
 * and advancing the phase is a lifecycle act with nothing to do with editing
 * dates — behind the fold it was simply invisible. It now renders at region
 * level, in both fold states.
 *
 * B3 retired the `schedule-spine` flip gate: the Rule is the schedule, so there
 * is no second renderer to choose between and no `showScheduleRule` prop.
 */
export function ProjectScheduleHandoffMount({
  engagementKind,
  projectId,
  projectTitle,
}: {
  engagementKind: string;
  projectId: string | null;
  projectTitle: string;
}) {
  if (engagementKind !== 'project' || !projectId) return null;

  return (
    <>
      <ScheduleRule projectId={projectId} projectTitle={projectTitle} />
      <ScheduleConfirmStrip projectId={projectId} />
    </>
  );
}
