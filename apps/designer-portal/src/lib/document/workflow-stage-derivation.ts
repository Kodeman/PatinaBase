import {
  RESIDENTIAL_WORKFLOW_RESPONSIBILITY_LANES,
  RESIDENTIAL_WORKFLOW_STAGES,
  RESIDENTIAL_WORKFLOW_TRACKS,
  type ResidentialWorkflowResponsibilityLane,
  type ResidentialWorkflowStage,
  type ResidentialWorkflowStageKey,
  type ResidentialWorkflowTrack,
} from '@patina/types';

import type { SectionKey } from './desk-derivation';

/** A structural subset of get_project_workflow(uuid)'s row contract. */
export interface WorkflowPhaseLike {
  phase_id: string;
  phase_name: string;
  phase_status: string;
  phase_key: string | null;
  canonical_stage_key: string | null;
  workflow_track: string | null;
  sort_order: number;
  lane: string | null;
  follows_phase_id: string | null;
  gate_note: string | null;
  deliverables: unknown;
  template_provenance: unknown;
  current_blockers: unknown;
  advance_blocker_count: number;
  blocks_advance: boolean;
}

export type WorkflowStageStatus =
  | 'canonical'
  | 'scheduled'
  | 'complete'
  | 'active'
  | 'delayed';

export interface WorkflowBlocker {
  id: string;
  kind: string;
  title: string;
}

export interface WorkflowProvenance {
  slug: string;
  version: number;
}

export interface WorkflowNextAction {
  phaseId: string | null;
  kind: 'advance' | 'resume' | 'terminal' | 'section';
  label: string;
}

export interface WorkflowActiveGroup {
  key: string;
  source: 'project' | 'section';
  stage: ResidentialWorkflowStage;
  track: ResidentialWorkflowTrack;
  responsibleLane: ResidentialWorkflowResponsibilityLane;
  phases: readonly WorkflowPhaseLike[];
  activePhases: readonly WorkflowPhaseLike[];
  status: 'active' | 'delayed';
  configuredGates: readonly string[];
  configuredDeliverables: readonly string[];
  blockers: readonly WorkflowBlocker[];
  scheduleLanes: readonly string[];
  provenance: readonly WorkflowProvenance[];
  nextActions: readonly WorkflowNextAction[];
}

export interface WorkflowUnclassifiedActivePhase {
  phase: WorkflowPhaseLike;
  reason: string;
  blockers: readonly WorkflowBlocker[];
  nextAction: WorkflowNextAction;
}

export interface WorkflowStageDocumentState {
  mode: 'project' | 'section';
  activeGroups: readonly WorkflowActiveGroup[];
  unclassifiedActivePhases: readonly WorkflowUnclassifiedActivePhase[];
  stageStatus: Readonly<
    Record<ResidentialWorkflowStageKey, WorkflowStageStatus>
  >;
}

const ACTIVE_STATUSES = new Set(['active', 'in_progress', 'delayed']);
const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'canceled']);

const SECTION_STAGE: Partial<
  Record<SectionKey, { stageKey: ResidentialWorkflowStageKey; trackKey: 'core' }>
> = {
  brief: { stageKey: 'inquiry_qualification', trackKey: 'core' },
  discovery: { stageKey: 'discovery_programming', trackKey: 'core' },
  direction: { stageKey: 'concept_schematic', trackKey: 'core' },
  proposal: { stageKey: 'scope_engagement', trackKey: 'core' },
};

export function stageForCanonicalStageKey(
  canonicalStageKey: string | null | undefined,
): ResidentialWorkflowStage | null {
  return (
    RESIDENTIAL_WORKFLOW_STAGES.find(
      (stage) => stage.key === canonicalStageKey,
    ) ?? null
  );
}

export function trackForWorkflowTrack(
  workflowTrack: string | null | undefined,
): ResidentialWorkflowTrack | null {
  return (
    RESIDENTIAL_WORKFLOW_TRACKS.find(
      (track) => track.key === workflowTrack,
    ) ?? null
  );
}

function responsibilityLaneFor(
  stage: ResidentialWorkflowStage,
): ResidentialWorkflowResponsibilityLane {
  const lane = RESIDENTIAL_WORKFLOW_RESPONSIBILITY_LANES.find(
    (candidate) => candidate.key === stage.responsibleLaneKey,
  );

  if (!lane) {
    throw new Error(`Missing responsibility lane for ${stage.key}`);
  }

  return lane;
}

function uniqueStrings(values: readonly (string | null | undefined)[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function extractDeliverableLabel(value: unknown): string | null {
  if (typeof value === 'string') {
    const label = value.trim();
    return label || null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  for (const key of ['label', 'name', 'title']) {
    if (typeof row[key] === 'string' && row[key].trim()) {
      return row[key].trim();
    }
  }
  return null;
}

export function configuredDeliverablesFrom(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];

  return uniqueStrings(value.map(extractDeliverableLabel));
}

function blockersFrom(
  value: unknown,
  phaseId: string,
): readonly WorkflowBlocker[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];

  const payload = value as Record<string, unknown>;
  const result: WorkflowBlocker[] = [];

  for (const bucket of ['phase', 'tasks', 'ffe']) {
    const entries = payload[bucket];
    if (!Array.isArray(entries)) continue;

    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const row = entry as Record<string, unknown>;
      const title = extractDeliverableLabel(row);
      if (!title) return;
      result.push({
        id:
          typeof row.id === 'string' && row.id
            ? row.id
            : `${phaseId}-${bucket}-${index}`,
        kind:
          typeof row.kind === 'string' && row.kind ? row.kind : bucket,
        title,
      });
    });
  }

  return result;
}

function provenanceFrom(value: unknown): WorkflowProvenance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.slug !== 'string' || typeof row.version !== 'number') {
    return null;
  }
  return { slug: row.slug, version: row.version };
}

function uniqueBlockers(
  blockers: readonly WorkflowBlocker[],
): readonly WorkflowBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.kind}:${blocker.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueProvenance(
  provenance: readonly WorkflowProvenance[],
): readonly WorkflowProvenance[] {
  const seen = new Set<string>();
  return provenance.filter((item) => {
    const key = `${item.slug}:${item.version}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function nextActionFor(
  phase: WorkflowPhaseLike,
  phases: readonly WorkflowPhaseLike[],
): WorkflowNextAction {
  if (phase.phase_status === 'delayed') {
    return {
      phaseId: phase.phase_id,
      kind: 'resume',
      label: `Resume ${phase.phase_name} before following the configured schedule graph.`,
    };
  }

  const advanceBlockerCount = phase.blocks_advance
    ? Math.max(1, phase.advance_blocker_count)
    : 0;
  const advanceBlockerLabel = `${advanceBlockerCount} phase blocker${advanceBlockerCount === 1 ? '' : 's'}`;

  const followers = phases.filter(
    (candidate) => candidate.follows_phase_id === phase.phase_id,
  );

  if (followers.length === 0) {
    return {
      phaseId: phase.phase_id,
      kind: 'terminal',
      label:
        phase.blocks_advance
          ? `Resolve ${advanceBlockerLabel} before closing ${phase.phase_name}. ${phase.phase_name} is terminal in the configured schedule graph.`
          : `${phase.phase_name} is terminal in the configured schedule graph.`,
    };
  }

  const followerNames = followers.map((follower) => follower.phase_name);
  return {
    phaseId: phase.phase_id,
    kind: 'advance',
    label: phase.blocks_advance
      ? `Resolve ${advanceBlockerLabel} before advancing from ${phase.phase_name} to ${followerNames.join(', ')}.`
      : `Complete ${phase.phase_name} to advance to ${followerNames.join(', ')}.`,
  };
}

function initialStageStatus(): Record<
  ResidentialWorkflowStageKey,
  WorkflowStageStatus
> {
  return Object.fromEntries(
    RESIDENTIAL_WORKFLOW_STAGES.map((stage) => [stage.key, 'canonical']),
  ) as Record<ResidentialWorkflowStageKey, WorkflowStageStatus>;
}

function stageStatuses(
  phases: readonly WorkflowPhaseLike[],
): Readonly<Record<ResidentialWorkflowStageKey, WorkflowStageStatus>> {
  const status = initialStageStatus();

  for (const stage of RESIDENTIAL_WORKFLOW_STAGES) {
    const matching = phases.filter(
      (phase) =>
        phase.canonical_stage_key === stage.key &&
        trackForWorkflowTrack(phase.workflow_track) !== null,
    );
    if (matching.length === 0) continue;

    if (matching.some((phase) => phase.phase_status === 'delayed')) {
      status[stage.key] = 'delayed';
    } else if (
      matching.some((phase) => ACTIVE_STATUSES.has(phase.phase_status))
    ) {
      status[stage.key] = 'active';
    } else if (
      matching.every((phase) => CLOSED_STATUSES.has(phase.phase_status))
    ) {
      status[stage.key] = 'complete';
    } else {
      status[stage.key] = 'scheduled';
    }
  }

  return status;
}

function classificationReason(phase: WorkflowPhaseLike): string {
  const issues: string[] = [];
  if (!stageForCanonicalStageKey(phase.canonical_stage_key)) {
    issues.push('canonical stage key is missing or unrecognized');
  }
  if (!trackForWorkflowTrack(phase.workflow_track)) {
    issues.push('workflow track is missing or unrecognized');
  }
  return issues.join('; ');
}

export function deriveWorkflowStageDocument(
  phases: readonly WorkflowPhaseLike[],
): WorkflowStageDocumentState {
  const activePhases = phases.filter((phase) =>
    ACTIVE_STATUSES.has(phase.phase_status),
  );
  const activeGroups: WorkflowActiveGroup[] = [];
  const seenGroups = new Set<string>();

  for (const activePhase of activePhases) {
    const stage = stageForCanonicalStageKey(activePhase.canonical_stage_key);
    const track = trackForWorkflowTrack(activePhase.workflow_track);
    if (!stage || !track) continue;

    const groupKey = `${stage.key}:${track.key}`;
    if (seenGroups.has(groupKey)) continue;
    seenGroups.add(groupKey);

    const groupPhases = phases.filter(
      (phase) =>
        phase.canonical_stage_key === stage.key &&
        phase.workflow_track === track.key,
    );
    const groupActivePhases = groupPhases.filter((phase) =>
      ACTIVE_STATUSES.has(phase.phase_status),
    );
    const blockers = uniqueBlockers(
      groupActivePhases.flatMap((phase) =>
        blockersFrom(phase.current_blockers, phase.phase_id),
      ),
    );

    activeGroups.push({
      key: groupKey,
      source: 'project',
      stage,
      track,
      responsibleLane: responsibilityLaneFor(stage),
      phases: groupPhases,
      activePhases: groupActivePhases,
      status: groupActivePhases.some(
        (phase) => phase.phase_status === 'delayed',
      )
        ? 'delayed'
        : 'active',
      configuredGates: uniqueStrings(
        groupActivePhases.map((phase) => phase.gate_note),
      ),
      configuredDeliverables: uniqueStrings(
        groupActivePhases.flatMap((phase) =>
          configuredDeliverablesFrom(phase.deliverables),
        ),
      ),
      blockers,
      scheduleLanes: uniqueStrings(
        groupActivePhases.map((phase) => phase.lane),
      ),
      provenance: uniqueProvenance(
        groupActivePhases
          .map((phase) => provenanceFrom(phase.template_provenance))
          .filter((value): value is WorkflowProvenance => value !== null),
      ),
      nextActions: groupActivePhases.map((phase) =>
        nextActionFor(phase, phases),
      ),
    });
  }

  const unclassifiedActivePhases = activePhases
    .filter(
      (phase) =>
        !stageForCanonicalStageKey(phase.canonical_stage_key) ||
        !trackForWorkflowTrack(phase.workflow_track),
    )
    .map((phase) => {
      const blockers = blockersFrom(phase.current_blockers, phase.phase_id);
      return {
        phase,
        reason: classificationReason(phase),
        blockers,
        nextAction: nextActionFor(phase, phases),
      };
    });

  return {
    mode: 'project',
    activeGroups,
    unclassifiedActivePhases,
    stageStatus: stageStatuses(phases),
  };
}

export function deriveSectionWorkflowStageDocument(
  activeSection: SectionKey,
): WorkflowStageDocumentState {
  const mapping = SECTION_STAGE[activeSection];
  const stageStatus = initialStageStatus();
  if (!mapping) {
    return {
      mode: 'section',
      activeGroups: [],
      unclassifiedActivePhases: [],
      stageStatus,
    };
  }

  const stage = stageForCanonicalStageKey(mapping.stageKey);
  const track = trackForWorkflowTrack(mapping.trackKey);
  if (!stage || !track) {
    throw new Error(`Missing section workflow mapping for ${activeSection}`);
  }

  stageStatus[stage.key] = 'active';
  return {
    mode: 'section',
    activeGroups: [
      {
        key: `section:${activeSection}`,
        source: 'section',
        stage,
        track,
        responsibleLane: responsibilityLaneFor(stage),
        phases: [],
        activePhases: [],
        status: 'active',
        configuredGates: [],
        configuredDeliverables: [],
        blockers: [],
        scheduleLanes: [],
        provenance: [],
        nextActions: [
          {
            phaseId: null,
            kind: 'section',
            label:
              'Section guidance only; no project phase topology is available.',
          },
        ],
      },
    ],
    unclassifiedActivePhases: [],
    stageStatus,
  };
}
