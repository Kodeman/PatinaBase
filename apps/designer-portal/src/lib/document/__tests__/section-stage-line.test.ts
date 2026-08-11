import fs from "node:fs";
import path from "node:path";

import { deriveSectionStageLine } from "../section-stage-line";
import {
  deriveSectionWorkflowStageDocument,
  deriveWorkflowStageDocument,
  type WorkflowPhaseLike,
} from "../workflow-stage-derivation";

const phase = (
  overrides: Partial<WorkflowPhaseLike> = {},
): WorkflowPhaseLike => ({
  phase_id: "phase-1",
  phase_name: "Design development",
  phase_status: "active",
  phase_key: null,
  canonical_stage_key: "design_development",
  workflow_track: "core",
  sort_order: 0,
  lane: "main",
  follows_phase_id: null,
  gate_note: null,
  deliverables: [],
  template_provenance: null,
  current_blockers: null,
  advance_blocker_count: 0,
  blocks_advance: false,
  ...overrides,
});

describe("deriveSectionStageLine", () => {
  it("states the stage, the track, and the position inside the Project band", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([
        phase({
          canonical_stage_key: "design_development",
          workflow_track: "ffe",
        }),
      ]),
    );

    expect(model?.subLabel).toBe(
      "Design Development · FF&E · stage 06 of 04–09",
    );
  });

  it("omits the Project band from a stage that lives outside 04–09", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([
        phase({
          canonical_stage_key: "closeout_post_occupancy",
          workflow_track: "core",
        }),
      ]),
    );

    expect(model?.subLabel).toBe("Closeout & Post-Occupancy · Core · stage 11");
  });

  it("picks the headline by canonical track order, not input row order", () => {
    // Construction first, FF&E second, Core last: row order must not decide.
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([
        phase({
          phase_id: "p-construction",
          canonical_stage_key: "contract_administration",
          workflow_track: "construction",
        }),
        phase({
          phase_id: "p-ffe",
          canonical_stage_key: "delivery_installation",
          workflow_track: "ffe",
        }),
        phase({
          phase_id: "p-core",
          canonical_stage_key: "design_development",
          workflow_track: "core",
        }),
      ]),
    );

    expect(model?.subLabel).toBe(
      "Design Development · Core · stage 06 of 04–09",
    );
  });

  it("picks the most-advanced stage within the headline track", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([
        phase({
          phase_id: "p-early",
          canonical_stage_key: "kickoff_existing_conditions",
          workflow_track: "core",
        }),
        phase({
          phase_id: "p-late",
          canonical_stage_key: "documentation_authorization",
          workflow_track: "core",
        }),
      ]),
    );

    expect(model?.subLabel).toBe(
      "Documentation / Authorization · Core · stage 07 of 04–09",
    );
  });

  it("draws one band per live track in canonical order", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([
        phase({
          phase_id: "p-ffe",
          canonical_stage_key: "design_development",
          workflow_track: "ffe",
        }),
        phase({
          phase_id: "p-construction",
          canonical_stage_key: "concept_schematic",
          workflow_track: "construction",
        }),
        phase({
          phase_id: "p-core",
          canonical_stage_key: "design_development",
          workflow_track: "core",
        }),
      ]),
    );

    expect(model?.tracks).toEqual([
      { key: "core", label: "Core", stageNumber: "06" },
      { key: "ffe", label: "FF&E", stageNumber: "06" },
      { key: "construction", label: "Construction", stageNumber: "05" },
    ]);
    expect(model?.subLabel).toBe(
      "Design Development · Core · stage 06 of 04–09",
    );
  });

  it("omits a track that carries no active work", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([phase()]),
    );

    expect(model?.tracks.map((track) => track.key)).toEqual(["core"]);
  });

  it("names the template provenance when the schedule records one", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([
        phase({
          template_provenance: { slug: "residential-full-service", version: 3 },
        }),
      ]),
    );

    expect(model?.provenance).toBe(
      "Derived from residential-full-service · version 3",
    );
  });

  it("says so rather than inventing provenance the schedule does not carry", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([phase()]),
    );

    expect(model?.provenance).toBe(
      "Derived from the project schedule · no template provenance recorded",
    );
  });

  it("counts active phases that no canonical stage classifies", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([
        phase(),
        phase({ phase_id: "p-2", canonical_stage_key: null }),
      ]),
    );

    expect(model?.unclassifiedCount).toBe(1);
  });

  it("never claims nothing is active when every active phase is unclassified", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([
        phase({ phase_id: "p-1", canonical_stage_key: null }),
        phase({ phase_id: "p-2", workflow_track: null }),
      ]),
    );

    expect(model).not.toBeNull();
    expect(model?.subLabel).toBeNull();
    expect(model?.tracks).toEqual([]);
    expect(model?.unclassifiedCount).toBe(2);
  });

  it("returns null when no phase is active, so the surface can say nothing is", () => {
    expect(
      deriveSectionStageLine(
        deriveWorkflowStageDocument([phase({ phase_status: "completed" })]),
      ),
    ).toBeNull();
    expect(
      deriveSectionStageLine(deriveSectionWorkflowStageDocument("install")),
    ).toBeNull();
  });

  it("carries section guidance for a non-project Document", () => {
    const model = deriveSectionStageLine(
      deriveSectionWorkflowStageDocument("discovery"),
    );

    expect(model?.mode).toBe("section");
    expect(model?.subLabel).toBe("Discovery & Programming · Core · stage 02");
    expect(model?.provenance).toBe(
      "Section guidance · no project phase topology",
    );
  });
});

describe("R1 source contract — the eleven-row render path is gone", () => {
  const COMPONENTS = path.resolve(__dirname, "../../../components/document");

  it("deletes the workflow stage document and its mount", () => {
    expect(
      fs.existsSync(
        path.join(COMPONENTS, "workflow/workflow-stage-document.tsx"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(path.join(COMPONENTS, "workflow-stage-document-mount.tsx")),
    ).toBe(false);
  });

  it("keeps the derivation layer the deleted render path read from", () => {
    expect(
      fs.existsSync(path.resolve(__dirname, "../workflow-stage-derivation.ts")),
    ).toBe(true);
  });

  it("mounts the section stage line in the document instead", () => {
    const page = fs.readFileSync(
      path.resolve(__dirname, "../../../app/(document)/doc/[id]/page.tsx"),
      "utf8",
    );
    expect(page).toContain("<SectionStageLineMount");
    expect(page).not.toContain("WorkflowStageDocumentMount");
  });
});
