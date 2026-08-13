import fs from "node:fs";
import path from "node:path";

import type { Fidelity, ScheduleSelection } from "@patina/utils";

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


const NO_SELECTION: ScheduleSelection = { activePhaseId: null, reason: "none" };
const selected = (id: string): ScheduleSelection => ({
  activePhaseId: id,
  reason: "today-in-window",
});

describe("deriveSectionStageLine", () => {
  it("states the stage, the track, the position inside the Project band, the resolver position, and the register", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([
        phase({
          canonical_stage_key: "design_development",
          workflow_track: "ffe",
        }),
      ]),
      selected("phase-1"),
      "committed",
      "Week 3",
    );

    expect(model?.subLabel).toBe(
      "Design Development · FF&E · stage 06 of 04–09 · Week 3 · Committed",
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
      selected("phase-1"),
      "band",
      "Band",
    );

    expect(model?.subLabel).toBe(
      "Closeout & Post-Occupancy · Core · stage 11 · Band · Band",
    );
  });

  it("R111: the headline names the RESOLVER's phase, not the canonical-track winner", () => {
    // Canonical order would pick Core; the resolver selected the FF&E phase.
    const state = deriveWorkflowStageDocument([
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
    ]);

    expect(
      deriveSectionStageLine(state, selected("p-ffe"), "committed", "Week 2")
        ?.subLabel,
    ).toBe(
      "Delivery, Installation & Styling · FF&E · stage 10 · Week 2 · Committed",
    );
  });

  it("falls back to canonical track order ONLY when the resolver selected nothing — and then claims no position", () => {
    const state = deriveWorkflowStageDocument([
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
    ]);
    const model = deriveSectionStageLine(state, NO_SELECTION, "band", "Band");

    expect(model?.subLabel).toBe(
      "Design Development · Core · stage 06 of 04–09 · Band",
    );
    expect(model?.subLabel).not.toMatch(/Week/);
  });

  it("names no stage at all when the resolver selected a phase this classifier does not carry", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([phase()]),
      selected("a-phase-outside-the-classifier"),
      "committed",
      "Week 4",
    );

    // Nothing to name and nothing unclassified: the line renders nothing at all
    // rather than falling back to a track the resolver did not choose.
    expect(model).toBeNull();
  });

  it("picks the most-advanced stage within the fallback headline track", () => {
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
      NO_SELECTION,
      null,
      null,
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
      selected("p-core"),
      "frame",
      "Frame",
    );

    expect(model?.tracks).toEqual([
      { key: "core", label: "Core", stageNumber: "06" },
      { key: "ffe", label: "FF&E", stageNumber: "06" },
      { key: "construction", label: "Construction", stageNumber: "05" },
    ]);
    expect(model?.subLabel).toBe(
      "Design Development · Core · stage 06 of 04–09 · Frame · Frame",
    );
  });

  it("omits a track that carries no active work", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([phase()]),
      selected("phase-1"),
      "band",
      "Band",
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
      selected("phase-1"),
      "committed",
      "Week 1",
    );

    expect(model?.provenance).toBe(
      "Derived from residential-full-service · version 3",
    );
  });

  it("R113: no template source means no provenance line at all, never a machine apology", () => {
    expect(
      deriveSectionStageLine(
        deriveWorkflowStageDocument([phase()]),
        selected("phase-1"),
        "band",
        "Band",
      )?.provenance,
    ).toBeNull();
    expect(
      deriveSectionStageLine(
        deriveSectionWorkflowStageDocument("discovery"),
        NO_SELECTION,
        null,
        null,
      )?.provenance,
    ).toBeNull();
  });

  it("keeps counting unclassified active phases for telemetry, though nothing renders it", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([
        phase(),
        phase({ phase_id: "p-2", canonical_stage_key: null }),
      ]),
      selected("phase-1"),
      "committed",
      "Week 1",
    );

    expect(model?.unclassifiedCount).toBe(1);
  });

  it("never claims nothing is active when every active phase is unclassified", () => {
    const model = deriveSectionStageLine(
      deriveWorkflowStageDocument([
        phase({ phase_id: "p-1", canonical_stage_key: null }),
        phase({ phase_id: "p-2", workflow_track: null }),
      ]),
      NO_SELECTION,
      "band",
      "Band",
    );

    expect(model).not.toBeNull();
    expect(model?.subLabel).toBeNull();
    expect(model?.tracks).toEqual([]);
    expect(model?.unclassifiedCount).toBe(2);
  });

  it("returns null when no phase is active — R113 leaves that to band rendering", () => {
    expect(
      deriveSectionStageLine(
        deriveWorkflowStageDocument([phase({ phase_status: "completed" })]),
        NO_SELECTION,
        "band",
        "Band",
      ),
    ).toBeNull();
    expect(
      deriveSectionStageLine(
        deriveSectionWorkflowStageDocument("install"),
        NO_SELECTION,
        null,
        null,
      ),
    ).toBeNull();
  });

  it("carries section guidance for a non-project Document, with no register to claim", () => {
    const model = deriveSectionStageLine(
      deriveSectionWorkflowStageDocument("discovery"),
      NO_SELECTION,
      null,
      null,
    );

    expect(model?.mode).toBe("section");
    expect(model?.subLabel).toBe("Discovery & Programming · Core · stage 02");
    expect(model?.provenance).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R113 — the string-absence contract. These strings leaked machine state into
// the doc body; none may reappear for ANY input, and the fidelity vocabulary
// must not cross into the client portal (R2 risk, O10 open).
// ─────────────────────────────────────────────────────────────────────────────

const RETIRED_STRINGS = [
  "No active or delayed phase is configured",
  "not classified to a canonical stage",
  "no template provenance recorded",
  "no project phase topology",
];

// §7 commercial-policy guard (I125's ratified register): Wave 2's new copy
// names the ACT and the evidence state, never the commercial actor. "Ordered"
// is "Released to maker", "Shipped" is "In transit", "Delivered" is "Received";
// "PO issued" and "Authorized" never appear in designer-facing status copy.
const FORBIDDEN_COMMERCIAL_REGISTER = [
  "PO issued",
  "Ordered",
  "Shipped",
  "Delivered",
  "Authorized",
];

// Every surface Wave 2 (R109/R110, I130) added or gave new strings to.
const WAVE_2_COPY_SOURCES = [
  "../schedule-impact.ts",
  "../../../components/document/commercial/schedule-impact-block.tsx",
  "../../../components/document/schedule/schedule-proposals.tsx",
];

describe("R113 string-absence contract", () => {
  const SELECTIONS: ScheduleSelection[] = [
    NO_SELECTION,
    selected("phase-1"),
    selected("p-2"),
    selected("nowhere"),
  ];
  const FIDELITIES: Array<Fidelity | null> = [
    null,
    "band",
    "frame",
    "committed",
    "record",
  ];
  const POSITIONS: Array<string | null> = [null, "Week 3", "Frame", "Band"];
  const STATES = [
    deriveWorkflowStageDocument([]),
    deriveWorkflowStageDocument([phase()]),
    deriveWorkflowStageDocument([phase({ phase_status: "completed" })]),
    deriveWorkflowStageDocument([
      phase({ phase_id: "p-1", canonical_stage_key: null }),
      phase({ phase_id: "p-2", workflow_track: null }),
    ]),
    deriveWorkflowStageDocument([
      phase({ template_provenance: { slug: "s", version: 1 } }),
    ]),
    deriveSectionWorkflowStageDocument("discovery"),
    deriveSectionWorkflowStageDocument("install"),
  ];

  it("emits none of the retired strings for any state x selection x fidelity x position", () => {
    for (const state of STATES) {
      for (const selection of SELECTIONS) {
        for (const fidelity of FIDELITIES) {
          for (const position of POSITIONS) {
            const model = deriveSectionStageLine(
              state,
              selection,
              fidelity,
              position,
            );
            const rendered = JSON.stringify(model ?? {});
            for (const retired of RETIRED_STRINGS) {
              expect(rendered).not.toContain(retired);
            }
          }
        }
      }
    }
  });

  it("keeps the retired strings out of both modules' source", () => {
    const classifier = fs.readFileSync(
      path.resolve(__dirname, "../section-stage-line.ts"),
      "utf8",
    );
    const component = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../components/document/workflow/section-stage-line.tsx",
      ),
      "utf8",
    );
    for (const retired of RETIRED_STRINGS) {
      expect(classifier).not.toContain(retired);
      expect(component).not.toContain(retired);
    }
  });

  it("§7: Wave 2's ceremony and proposal copy carries no commercial-actor register", () => {
    for (const relative of WAVE_2_COPY_SOURCES) {
      const source = fs.readFileSync(path.resolve(__dirname, relative), "utf8");
      for (const forbidden of FORBIDDEN_COMMERCIAL_REGISTER) {
        expect(`${relative}:${source}`).not.toContain(forbidden);
      }
    }
  });

  it("R2: no client-portal file imports the fidelity vocabulary", () => {
    const clientSrc = path.resolve(
      __dirname,
      "../../../../../client-portal/src",
    );
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules") continue;
          walk(full);
        } else if (/\.tsx?$/.test(entry.name)) {
          const text = fs.readFileSync(full, "utf8");
          if (
            /schedule-fidelity/.test(text) ||
            /\b(phaseFidelity|selectActivePhase|positionText)\b/.test(text)
          ) {
            offenders.push(full);
          }
        }
      }
    };
    walk(clientSrc);
    expect(offenders).toEqual([]);
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
