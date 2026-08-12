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
   * "Design Development · FF&E · stage 06 of 04–09", or null when active work
   * exists but no canonical stage classifies any of it.
   */
  subLabel: string | null;
  /** One band per track that currently carries active work, canonical order. */
  tracks: readonly SectionStageTrackBand[];
  /** Where the stage classification came from. */
  provenance: string;
  unclassifiedCount: number;
}

function subLabelFor(
  stageTitle: string,
  stageNumber: string,
  stageOrdinal: number,
  trackLabel: string,
): string {
  const position =
    stageOrdinal >= PROJECT_BAND_FIRST_ORDINAL &&
    stageOrdinal <= PROJECT_BAND_LAST_ORDINAL
      ? `stage ${stageNumber} of ${PROJECT_BAND_LABEL}`
      : `stage ${stageNumber}`;
  return `${stageTitle} · ${trackLabel} · ${position}`;
}

function provenanceFor(state: WorkflowStageDocumentState): string {
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
  return state.mode === "project"
    ? "Derived from the project schedule · no template provenance recorded"
    : "Section guidance · no project phase topology";
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

/** Canonical track order decides which track speaks for the section. */
function headlineGroupFor(state: WorkflowStageDocumentState) {
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
 * produce a model with no sub-label, because "no active phase is configured"
 * would be false in exactly that case.
 */
export function deriveSectionStageLine(
  state: WorkflowStageDocumentState,
): SectionStageLineModel | null {
  const headline = headlineGroupFor(state);
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
        )
      : null,
    tracks: trackBandsFor(state),
    provenance: provenanceFor(state),
    unclassifiedCount,
  };
}
