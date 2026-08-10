import {
  RESIDENTIAL_WORKFLOW_LANES,
  RESIDENTIAL_WORKFLOW_STAGES,
  RESIDENTIAL_WORKFLOW_TRACKS,
  type ResidentialWorkflowLane,
  type ResidentialWorkflowStage,
  type ResidentialWorkflowStageKey,
  type ResidentialWorkflowTrack,
} from '@patina/types';

export interface WorkflowPhaseLike {
  id: string;
  name: string;
  phase_key: string | null;
  status: string;
  sort_order: number;
  gate_condition?: string | null;
  deliverables?: unknown;
  follows_phase_id?: string | null;
  lane?: string | null;
}

export interface WorkflowCoordinationItemLike {
  id: string;
  title: string;
  phase_id: string | null;
  status: string;
  blocks_kind?: string | null;
  blocking_status?: string | null;
}

export type WorkflowStageStatus =
  | 'canonical'
  | 'scheduled'
  | 'complete'
  | 'active'
  | 'delayed';

export interface WorkflowNextAction {
  kind:
    | 'resolve_blockers'
    | 'map_phase'
    | 'start_phase'
    | 'advance'
    | 'closeout'
    | 'configure';
  label: string;
}

export interface WorkflowStageDocumentState {
  activePhase: WorkflowPhaseLike | null;
  activeStage: ResidentialWorkflowStage | null;
  activeTrack: ResidentialWorkflowTrack | null;
  responsibleLane: ResidentialWorkflowLane | null;
  isLegacyPhase: boolean;
  configuredGate: string | null;
  configuredDeliverables: readonly string[];
  blockers: readonly WorkflowCoordinationItemLike[];
  nextAction: WorkflowNextAction;
  stageStatus: Readonly<
    Record<ResidentialWorkflowStageKey, WorkflowStageStatus>
  >;
}

const ACTIVE_STATUSES = new Set(['active', 'in_progress', 'delayed']);
const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'canceled']);

function normalizedPhaseKey(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

export function stageForCanonicalPhaseKey(
  phaseKey: string | null | undefined,
): ResidentialWorkflowStage | null {
  const normalized = normalizedPhaseKey(phaseKey);
  if (!normalized) return null;

  return (
    RESIDENTIAL_WORKFLOW_STAGES.find((stage) =>
      (stage.canonicalPhaseKeys as readonly string[]).includes(normalized),
    ) ?? null
  );
}

function activePhaseFrom(
  phases: readonly WorkflowPhaseLike[],
): WorkflowPhaseLike | null {
  return (
    [...phases]
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      .find(
        (phase) => phase.lane !== 'thread' && ACTIVE_STATUSES.has(phase.status),
      ) ?? null
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

  return Array.from(
    new Set(
      value
        .map(extractDeliverableLabel)
        .filter((label): label is string => label !== null),
    ),
  );
}

function phaseBlockers(
  phaseId: string | null,
  items: readonly WorkflowCoordinationItemLike[],
): readonly WorkflowCoordinationItemLike[] {
  if (!phaseId) return [];
  return items.filter(
    (item) =>
      item.phase_id === phaseId &&
      item.status === 'pending' &&
      (item.blocks_kind === 'phase' || item.blocking_status === 'blocks_phase'),
  );
}

function trackFor(stage: ResidentialWorkflowStage | null) {
  if (!stage) return null;
  return (
    RESIDENTIAL_WORKFLOW_TRACKS.find((track) => track.key === stage.trackKey) ??
    null
  );
}

function laneFor(stage: ResidentialWorkflowStage | null) {
  if (!stage) return null;
  return (
    RESIDENTIAL_WORKFLOW_LANES.find(
      (lane) => lane.key === stage.responsibleLaneKey,
    ) ?? null
  );
}

function stageStatuses(
  phases: readonly WorkflowPhaseLike[],
  activePhase: WorkflowPhaseLike | null,
): Readonly<Record<ResidentialWorkflowStageKey, WorkflowStageStatus>> {
  const entries = RESIDENTIAL_WORKFLOW_STAGES.map((stage) => {
    const matching = [...phases]
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      .find(
        (phase) =>
          stageForCanonicalPhaseKey(phase.phase_key)?.key === stage.key,
      );

    let status: WorkflowStageStatus = 'canonical';
    if (matching) {
      if (matching.id === activePhase?.id) {
        status = matching.status === 'delayed' ? 'delayed' : 'active';
      } else if (CLOSED_STATUSES.has(matching.status)) {
        status = 'complete';
      } else {
        status = 'scheduled';
      }
    }

    return [stage.key, status] as const;
  });

  return Object.fromEntries(entries) as Record<
    ResidentialWorkflowStageKey,
    WorkflowStageStatus
  >;
}

function nextActionFor({
  phases,
  activePhase,
  activeStage,
  blockers,
}: {
  phases: readonly WorkflowPhaseLike[];
  activePhase: WorkflowPhaseLike | null;
  activeStage: ResidentialWorkflowStage | null;
  blockers: readonly WorkflowCoordinationItemLike[];
}): WorkflowNextAction {
  if (activePhase && blockers.length > 0) {
    return {
      kind: 'resolve_blockers',
      label: `Resolve ${blockers.length} phase blocker${blockers.length === 1 ? '' : 's'} before advancing.`,
    };
  }

  if (activePhase && !activeStage) {
    return {
      kind: 'map_phase',
      label: `Assign a canonical phase key to ${activePhase.name} before using workflow guidance.`,
    };
  }

  if (activePhase && activeStage) {
    const directFollowers = phases
      .filter(
        (phase) =>
          phase.follows_phase_id === activePhase.id &&
          phase.lane !== 'thread' &&
          !CLOSED_STATUSES.has(phase.status),
      )
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

    const nextLabel =
      directFollowers.length === 1
        ? `advance to ${directFollowers[0].name}`
        : directFollowers.length > 1
          ? `activate ${directFollowers.length} following phases`
          : null;

    if (nextLabel) {
      return {
        kind: 'advance',
        label: activePhase.gate_condition?.trim()
          ? `Review the configured gate, then ${nextLabel}.`
          : `Complete ${activePhase.name} to ${nextLabel}.`,
      };
    }

    const nextStage = RESIDENTIAL_WORKFLOW_STAGES[activeStage.ordinal];
    if (nextStage) {
      return {
        kind: 'advance',
        label: activePhase.gate_condition?.trim()
          ? `Review the configured gate, then prepare ${nextStage.number} · ${nextStage.title}.`
          : `Complete ${activePhase.name}, then prepare ${nextStage.number} · ${nextStage.title}.`,
      };
    }

    return {
      kind: 'closeout',
      label: 'Complete closeout and record the post-occupancy follow-up.',
    };
  }

  const nextScheduled = [...phases]
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .find((phase) => !CLOSED_STATUSES.has(phase.status));

  if (nextScheduled) {
    const nextStage = stageForCanonicalPhaseKey(nextScheduled.phase_key);
    return nextStage
      ? { kind: 'start_phase', label: `Start ${nextScheduled.name}.` }
      : {
          kind: 'map_phase',
          label: `Assign a canonical phase key to ${nextScheduled.name} before starting it.`,
        };
  }

  if (phases.length > 0) {
    return {
      kind: 'closeout',
      label:
        'All configured phases are closed; record the post-occupancy follow-up.',
    };
  }

  return {
    kind: 'configure',
    label:
      'Add a project phase with a canonical key to begin workflow guidance.',
  };
}

export function deriveWorkflowStageDocument(
  phases: readonly WorkflowPhaseLike[],
  coordinationItems: readonly WorkflowCoordinationItemLike[] = [],
): WorkflowStageDocumentState {
  const activePhase = activePhaseFrom(phases);
  const activeStage = stageForCanonicalPhaseKey(activePhase?.phase_key);
  const blockers = phaseBlockers(activePhase?.id ?? null, coordinationItems);

  return {
    activePhase,
    activeStage,
    activeTrack: trackFor(activeStage),
    responsibleLane: laneFor(activeStage),
    isLegacyPhase: activePhase !== null && activeStage === null,
    configuredGate: activePhase?.gate_condition?.trim() || null,
    configuredDeliverables: configuredDeliverablesFrom(
      activePhase?.deliverables,
    ),
    blockers,
    nextAction: nextActionFor({ phases, activePhase, activeStage, blockers }),
    stageStatus: stageStatuses(phases, activePhase),
  };
}
