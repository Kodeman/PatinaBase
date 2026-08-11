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

import type { WorkflowStageDocumentState } from "./workflow-stage-derivation";

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
  /** "Design Development · FF&E · stage 06 of 04–09" */
  subLabel: string;
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

function trackBandsFor(
  state: WorkflowStageDocumentState,
): readonly SectionStageTrackBand[] {
  return RESIDENTIAL_WORKFLOW_TRACKS.flatMap((track) => {
    const group = state.activeGroups.find(
      (candidate) => candidate.track.key === track.key,
    );
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
 * Null when no active group exists — there is no stage position to state, and
 * the surface says so rather than drawing an empty rail.
 */
export function deriveSectionStageLine(
  state: WorkflowStageDocumentState,
): SectionStageLineModel | null {
  const primary = state.activeGroups[0];
  if (!primary) return null;

  return {
    mode: state.mode,
    subLabel: subLabelFor(
      primary.stage.title,
      primary.stage.number,
      primary.stage.ordinal,
      primary.track.label,
    ),
    tracks: trackBandsFor(state),
    provenance: provenanceFor(state),
    unclassifiedCount: state.unclassifiedActivePhases.length,
  };
}
