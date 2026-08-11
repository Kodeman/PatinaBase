import { render, screen } from "@testing-library/react";

import { SectionStageLine } from "../section-stage-line";
import { deriveSectionStageLine } from "@/lib/document/section-stage-line";
import {
  deriveWorkflowStageDocument,
  type WorkflowPhaseLike,
} from "@/lib/document/workflow-stage-derivation";

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
  template_provenance: { slug: "residential-full-service", version: 3 },
  current_blockers: null,
  advance_blocker_count: 0,
  blocks_advance: false,
  ...overrides,
});

const modelFor = (phases: WorkflowPhaseLike[]) =>
  deriveSectionStageLine(deriveWorkflowStageDocument(phases));

describe("SectionStageLine", () => {
  it("renders the stage as one sub-label instead of an eleven-row rail", () => {
    const { container } = render(
      <SectionStageLine model={modelFor([phase()])} />,
    );

    expect(
      screen.getByText("Design Development · Core · stage 06 of 04–09"),
    ).toBeVisible();
    expect(screen.queryByText("Inquiry & Qualification")).toBeNull();
    expect(screen.queryByText("Expected deliverables")).toBeNull();
    expect(container.querySelectorAll("[data-workflow-track]")).toHaveLength(1);
  });

  it("draws equal-width, colour-differentiated bands for the live tracks", () => {
    const { container } = render(
      <SectionStageLine
        model={modelFor([
          phase({ phase_id: "p-core", workflow_track: "core" }),
          phase({ phase_id: "p-ffe", workflow_track: "ffe" }),
          phase({
            phase_id: "p-construction",
            workflow_track: "construction",
            canonical_stage_key: "concept_schematic",
          }),
        ])}
      />,
    );

    const bars = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-workflow-track] span[aria-hidden="true"]',
      ),
    );
    expect(
      bars.map((bar) => bar.style.getPropertyValue("--track-hue")),
    ).toEqual([
      "var(--color-mocha)",
      "var(--color-clay)",
      "var(--color-dusty-blue)",
    ]);
    // Equal width: the fill marks which track, not how much of it is done.
    expect(bars.every((bar) => bar.classList.contains("w-full"))).toBe(true);

    expect(screen.getByText("Core · 06")).toBeVisible();
    expect(screen.getByText("FF&E · 06")).toBeVisible();
    expect(screen.getByText("Construction · 05")).toBeVisible();
  });

  it("carries quiet provenance microcopy", () => {
    render(<SectionStageLine model={modelFor([phase()])} />);

    expect(
      screen.getByText("Derived from residential-full-service · version 3"),
    ).toBeVisible();
  });

  it("discloses active phases no canonical stage classifies", () => {
    render(
      <SectionStageLine
        model={modelFor([
          phase(),
          phase({ phase_id: "p-2", canonical_stage_key: null }),
        ])}
      />,
    );

    expect(
      screen.getByText("1 active phase not classified to a canonical stage"),
    ).toBeVisible();
  });

  it("never says nothing is active when every active phase is unclassified", () => {
    render(
      <SectionStageLine
        model={modelFor([
          phase({ phase_id: "p-1", canonical_stage_key: null }),
          phase({ phase_id: "p-2", workflow_track: null }),
        ])}
      />,
    );

    expect(
      screen.queryByText("No active or delayed phase is configured"),
    ).toBeNull();
    expect(
      screen.getByText("2 active phases not classified to a canonical stage"),
    ).toHaveAttribute("role", "status");
  });

  it("states that nothing is active rather than drawing an empty rail", () => {
    render(<SectionStageLine model={null} />);

    expect(
      screen.getByText("No active or delayed phase is configured"),
    ).toHaveAttribute("role", "status");
  });

  it("keeps every metadata string at or above the 12px floor", () => {
    const { container } = render(
      <SectionStageLine model={modelFor([phase()])} />,
    );

    const undersized = Array.from(container.querySelectorAll("*")).filter(
      (element) =>
        Array.from(element.classList).some((name) =>
          /^text-\[(\d+(?:\.\d+)?)px\]$/.test(name)
            ? Number(/^text-\[(\d+(?:\.\d+)?)px\]$/.exec(name)?.[1]) < 12
            : false,
        ),
    );
    expect(undersized).toHaveLength(0);
  });

  it("carries no shadow (D4)", () => {
    const { container } = render(
      <SectionStageLine model={modelFor([phase()])} />,
    );

    expect(container.innerHTML).not.toMatch(/shadow/);
  });
});
