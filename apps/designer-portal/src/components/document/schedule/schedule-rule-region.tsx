'use client';

/**
 * The drafting strip, folded. The schedule instrument sat unconditionally at
 * the top of every project document and pushed the work down the page; it now
 * opens as a region like any other — a seam that states where the project
 * stands and draws the glance, with the editor behind it.
 *
 * The fold key is `schedule-rule`, NOT `schedule`: the ledger (ScheduleSpine,
 * inside the Project section) already owns `schedule`, both are mounted at
 * once, and one storage key between them would fold each with the other's
 * choice.
 *
 * Default folded — always, not derived. The strip is an editor, and an editor
 * that opens itself on every visit is a claim that dates need adjusting.
 *
 * ARMED EDIT. "Edit dates" in the ledger reaches the strip through
 * ScheduleNavContext, and the strip is UNMOUNTED while folded — so this region
 * stands in for it: it catches the arm, unfolds, and re-fires once the strip
 * has mounted and registered its own handler (child effects run before the
 * parent's, so the re-fire lands). Without the stand-in the ledger's action
 * would be a silent no-op on a folded schedule.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useResolvedSchedule } from '@patina/supabase';
import {
  buildTimeScale,
  monthColumns,
  ruleSegments,
  ruleWeightForStatus,
} from '@/lib/document/schedule-rule-derivation';
import { RegionHead, type RegionLedgerEntry } from '../region/region-head';
import { RegionRule } from '../region/region-rule';
import { FoldSeam, focusRegionHeading } from '../region/fold-seam';
import { useRegionFold } from '../region/use-region-fold';
import { useScheduleNav } from './schedule-nav-context';
import { ScheduleGlanceStrip } from './schedule-glance-strip';
import { ProjectScheduleHandoffMount } from '../project-schedule-handoff-mount';

const HEADING_ID = 'schedule-rule-title';
const BODY_ID = 'schedule-rule-body';

export interface ScheduleRuleRegionProps {
  engagementKind: string;
  projectId: string | null;
  projectTitle: string;
  projectStatus: string | null | undefined;
  phases: Parameters<typeof ProjectScheduleHandoffMount>[0]['phases'];
  /** R108 — the page's ONE schedule derivation, spoken here too. The seam must
   *  not compute a second position sentence that can drift from the letterhead's. */
  summary: string;
}

export function ScheduleRuleRegion(props: ScheduleRuleRegionProps) {
  if (props.engagementKind !== 'project' || !props.projectId) return null;
  return <ScheduleRuleRegionBody {...props} projectId={props.projectId} />;
}

function ScheduleRuleRegionBody({
  projectId,
  projectTitle,
  projectStatus,
  phases,
  engagementKind,
  summary,
}: ScheduleRuleRegionProps & { projectId: string }) {
  const schedule = useResolvedSchedule(projectId);
  const { armEdit, registerArmEditHandler } = useScheduleNav();
  const fold = useRegionFold({
    docId: projectId,
    region: 'schedule-rule',
    defaultFolded: true,
  });
  const { folded, setFolded } = fold;

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const resolvedPhases = useMemo(
    () => schedule.resolved?.phases ?? [],
    [schedule.resolved],
  );
  const scale = useMemo(
    () =>
      buildTimeScale(
        resolvedPhases.map((p) => ({ start: p.start, end: p.end })),
        today,
      ),
    [resolvedPhases, today],
  );
  const phaseRowById = useMemo(
    () => new Map(schedule.phases.map((p) => [p.id, p])),
    [schedule.phases],
  );
  const segments = useMemo(
    () =>
      scale
        ? ruleSegments(
            resolvedPhases,
            (id) => ruleWeightForStatus(phaseRowById.get(id)?.status),
            scale,
          )
        : [],
    [resolvedPhases, phaseRowById, scale],
  );
  const months = useMemo(() => (scale ? monthColumns(scale) : []), [scale]);
  const todayX = useMemo(() => scale?.toX(today) ?? null, [scale, today]);

  // Which phase "Adjust dates" arms — the SAME predicate the strip's own
  // header uses to pick the engaged lane.
  const activePhaseId =
    schedule.phases.find((p) => ruleWeightForStatus(p.status) === 'active')
      ?.id ??
    schedule.phases[0]?.id ??
    null;

  // Stand in for the unmounted strip while folded.
  const pendingArmPhaseId = useRef<string | null>(null);
  useEffect(() => {
    if (!folded) return;
    const standIn = (phaseId: string) => {
      pendingArmPhaseId.current = phaseId;
      setFolded(false);
    };
    registerArmEditHandler(standIn);
    return () => registerArmEditHandler(null);
  }, [folded, registerArmEditHandler, setFolded]);

  const justUnfolded = useRef(false);
  useEffect(() => {
    if (folded) return;
    if (pendingArmPhaseId.current) {
      const phaseId = pendingArmPhaseId.current;
      pendingArmPhaseId.current = null;
      armEdit(phaseId);
      return;
    }
    if (justUnfolded.current) {
      justUnfolded.current = false;
      focusRegionHeading(HEADING_ID);
    }
  }, [folded, armEdit]);

  const handleUnfold = useCallback(() => {
    justUnfolded.current = true;
    setFolded(false);
  }, [setFolded]);

  const ledger: RegionLedgerEntry[] = activePhaseId
    ? [
        {
          key: 'adjust-phase-dates',
          label: 'Adjust dates',
          onClick: () => armEdit(activePhaseId),
        },
      ]
    : [];

  const glance =
    scale && segments.length > 0 ? (
      <ScheduleGlanceStrip
        segments={segments}
        todayXPct={todayX}
        today={today}
        months={months}
        className="mt-1"
      />
    ) : null;

  if (folded) {
    return (
      <section aria-label="Schedule frame" className="mb-4">
        <RegionRule />
        <FoldSeam
          headingId={HEADING_ID}
          bodyId={BODY_ID}
          name="Schedule"
          summary={summary}
          onUnfold={handleUnfold}
          surfaceKey="open-document"
          regionKey="schedule-rule"
        />
        {glance}
      </section>
    );
  }

  return (
    <section aria-label="Schedule frame" className="mb-4">
      <RegionRule />
      <RegionHead
        headingId={HEADING_ID}
        name="Schedule"
        status={summary}
        surfaceKey="open-document"
        regionKey="schedule-rule"
        actions={ledger}
        bodyId={BODY_ID}
        onFold={() => setFolded(true)}
      />
      <div id={BODY_ID} className="mt-2">
        <ProjectScheduleHandoffMount
          engagementKind={engagementKind}
          projectId={projectId}
          projectTitle={projectTitle}
          projectStatus={projectStatus}
          phases={phases}
        />
      </div>
    </section>
  );
}
