/**
 * R1 — one paper, one spine.
 *
 * The eleven-stage rail and its definition list are withdrawn from the glass.
 * `workflow-stage-derivation.ts`, `get_project_workflow`, and 00433 are
 * untouched; this module reduces the same derived state to what a section bar
 * can carry: one sub-label, one band per live track, and a line naming where
 * the classification came from.
 */

import {
  RESIDENTIAL_WORKFLOW_TRACKS,
  type ResidentialWorkflowTrackKey,
} from "@patina/types";
import { FIDELITY_WORD, type Fidelity, type ScheduleSelection } from "@patina/utils";

import type {
  WorkflowActiveGroup,
  WorkflowStageDocumentState,
} from "./workflow-stage-derivation";

/** Canonical stage ordinals that live inside the Project section (M1). */
const PROJECT_BAND_FIRST_ORDINAL = 4;
const PROJECT_BAND_LAST_ORDINAL = 9;
const PROJECT_BAND_LABEL = "04–09";

export interface SectionStageTrackBand {
  key: ResidentialWorkflowTrackKey;
  label: string;
  stageNumber: string;
}

export interface SectionStageLineModel {
  mode: "project" | "section";
  /**
   * "Design Development · FF&E · stage 06 of 04–09 · Week 3 · Committed", or
   * null when there is no stage to name.
   */
  subLabel: string | null;
  /** One band per track that currently carries active work, canonical order. */
  tracks: readonly SectionStageTrackBand[];
  /** Where the stage classification came from; null when no template recorded it. */
  provenance: string | null;
  /** Kept for telemetry and tests. R113: this never renders. */
  unclassifiedCount: number;
  /**
   * The register the selected phase's dates may be spoken in — null when the
   * caller has no resolver answer to state (a section-mode Document has no
   * schedule at all), in which case the sub-label makes no fidelity claim.
   */
  fidelity: Fidelity | null;
}

/** R111 — stage · position · fidelity. The position is never recomputed here. */
function subLabelFor(
  stageTitle: string,
  stageNumber: string,
  stageOrdinal: number,
  trackLabel: string,
  position: string | null,
  fidelity: Fidelity | null,
): string {
  const stagePosition =
    stageOrdinal >= PROJECT_BAND_FIRST_ORDINAL &&
    stageOrdinal <= PROJECT_BAND_LAST_ORDINAL
      ? `stage ${stageNumber} of ${PROJECT_BAND_LABEL}`
      : `stage ${stageNumber}`;
  return [
    stageTitle,
    trackLabel,
    stagePosition,
    position,
    fidelity ? FIDELITY_WORD[fidelity] : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * R113: when no template recorded a source there is nothing to disclose, so
 * this returns null and the line renders nothing. The former fallbacks stated
 * the absence of machine metadata as if it were a fact about the project.
 */
function provenanceFor(state: WorkflowStageDocumentState): string | null {
  const sources = Array.from(
    new Set(
      state.activeGroups.flatMap((group) =>
        group.provenance.map(
          (source) => `${source.slug} · version ${source.version}`,
        ),
      ),
    ),
  );

  if (sources.length > 0) return `Derived from ${sources.join(" · ")}`;
  return null;
}

/**
 * The furthest-advanced group on one track. Row order out of
 * `get_project_workflow` is not a ranking, so the position a track reports must
 * not depend on it.
 */
function furthestGroupOnTrack(
  state: WorkflowStageDocumentState,
  trackKey: ResidentialWorkflowTrackKey,
): WorkflowActiveGroup | null {
  let furthest: WorkflowActiveGroup | null = null;
  for (const candidate of state.activeGroups) {
    if (candidate.track.key !== trackKey) continue;
    if (!furthest || candidate.stage.ordinal > furthest.stage.ordinal) {
      furthest = candidate;
    }
  }
  return furthest;
}

/**
 * R111 — the resolver selected; the classifier only names. This finds the group
 * that contains the selected phase, so disagreement between the two derivations
 * is structurally impossible.
 */
function groupContainingPhase(
  state: WorkflowStageDocumentState,
  phaseId: string | null,
): WorkflowActiveGroup | null {
  if (!phaseId) return null;
  for (const group of state.activeGroups) {
    if (group.phases.some((phase) => phase.phase_id === phaseId)) return group;
  }
  return null;
}

/**
 * Canonical track order, surviving ONLY when the resolver selected nothing —
 * i.e. there is no schedule to select from. A headline reached this way may
 * never carry a position claim.
 */
function canonicalTrackGroupFor(state: WorkflowStageDocumentState) {
  for (const track of RESIDENTIAL_WORKFLOW_TRACKS) {
    const group = furthestGroupOnTrack(state, track.key);
    if (group) return group;
  }
  return null;
}

function trackBandsFor(
  state: WorkflowStageDocumentState,
): readonly SectionStageTrackBand[] {
  return RESIDENTIAL_WORKFLOW_TRACKS.flatMap((track) => {
    const group = furthestGroupOnTrack(state, track.key);
    return group
      ? [
          {
            key: track.key,
            label: track.label,
            stageNumber: group.stage.number,
          },
        ]
      : [];
  });
}

/**
 * Null only when nothing is active at all. Active-but-unclassified phases still
 * produce a model with no sub-label — R113 makes that a band, not an error.
 *
 * `selection` and `fidelity` come from the resolver (R111); `position` is
 * `positionText`'s output and is never recomputed here. When the resolver
 * selected nothing, the canonical-track fallback names a stage but the label
 * carries no position — there is no anchored run to count from.
 */
export function deriveSectionStageLine(
  state: WorkflowStageDocumentState,
  selection: ScheduleSelection,
  fidelity: Fidelity | null,
  position: string | null,
): SectionStageLineModel | null {
  const selected = groupContainingPhase(state, selection.activePhaseId);
  const headline =
    selected ?? (selection.activePhaseId === null ? canonicalTrackGroupFor(state) : null);
  const unclassifiedCount = state.unclassifiedActivePhases.length;
  if (!headline && unclassifiedCount === 0) return null;

  return {
    mode: state.mode,
    subLabel: headline
      ? subLabelFor(
          headline.stage.title,
          headline.stage.number,
          headline.stage.ordinal,
          headline.track.label,
          selected ? position : null,
          fidelity,
        )
      : null,
    tracks: trackBandsFor(state),
    provenance: provenanceFor(state),
    unclassifiedCount,
    fidelity,
  };
}
