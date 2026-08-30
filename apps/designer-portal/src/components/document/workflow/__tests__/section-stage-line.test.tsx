import { render, screen } from "@testing-library/react";

import type { Fidelity, ScheduleSelection } from "@patina/utils";

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

const SELECTED: ScheduleSelection = {
  activePhaseId: "phase-1",
  reason: "today-in-window",
};

const modelFor = (
  phases: WorkflowPhaseLike[],
  selection: ScheduleSelection = SELECTED,
  fidelity: Fidelity | null = "committed",
  position: string | null = "Week 3",
) =>
  deriveSectionStageLine(
    deriveWorkflowStageDocument(phases),
    selection,
    fidelity,
    position,
  );

describe("SectionStageLine", () => {
  it("renders the stage as one sub-label instead of an eleven-row rail", () => {
    const { container } = render(
      <SectionStageLine model={modelFor([phase()])} />,
    );

    expect(
      screen.getByText(
        "Design Development · Core · stage 06 of 04–09 · Week 3 · Committed",
      ),
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
        ], { activePhaseId: "p-core", reason: "today-in-window" })}
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

  it("R113: never discloses the unclassified count, however many there are", () => {
    const { container } = render(
      <SectionStageLine
        model={modelFor([
          phase(),
          phase({ phase_id: "p-2", canonical_stage_key: null }),
        ])}
      />,
    );

    expect(container.innerHTML).not.toMatch(/not classified/);
    expect(container.querySelector("[data-unclassified-disclosure]")).toBeNull();
  });

  it("R113: an all-unclassified project renders its register, not an error", () => {
    const { container } = render(
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
    expect(container.innerHTML).not.toMatch(/not classified/);
  });

  it("R113: with no model at all, an unanchored engagement reads as a Band", () => {
    render(<SectionStageLine model={null} fidelity="band" />);

    expect(screen.getByText("Band")).toBeVisible();
    expect(
      screen.queryByText("No active or delayed phase is configured"),
    ).toBeNull();
  });

  it("renders nothing at all when it knows nothing at all", () => {
    const { container } = render(<SectionStageLine model={null} />);

    expect(container.textContent).toBe("Workflow stage");
    expect(
      screen.queryByText("No active or delayed phase is configured"),
    ).toBeNull();
  });

  it("omits the provenance line entirely when no template recorded one", () => {
    const { container } = render(
      <SectionStageLine
        model={modelFor([phase({ template_provenance: null })])}
      />,
    );

    expect(container.innerHTML).not.toMatch(/provenance/i);
    expect(container.innerHTML).not.toMatch(/phase topology/);
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

// W5 follow-up — hosted inside `scope`, whose own head already prints the
// stop's name and status. The strip printed its label under it: `Core · stage
// 03` three times down one column.
describe("SectionStageLine hosted inside a stop", () => {
  it("drops its label line and its `Workflow stage` eyebrow — the bars are the body", () => {
    const model = modelFor([phase()]);
    const { container } = render(<SectionStageLine model={model} hosted />);

    expect(model.subLabel).not.toBeNull();
    expect(screen.queryByText(model.subLabel!)).toBeNull();
    expect(screen.queryByText("Workflow stage")).toBeNull();
    expect(container.querySelector("section")).toBeNull();

    // What it still prints: the bar and its track register.
    expect(
      container.querySelector("[data-workflow-track='core']"),
    ).not.toBeNull();
    expect(screen.getByText(/Core · 06/)).toBeInTheDocument();
  });

  it("free-standing, it keeps both", () => {
    const model = modelFor([phase()]);
    render(<SectionStageLine model={model} />);

    expect(screen.getByText(model.subLabel!)).toBeInTheDocument();
    expect(screen.getByText("Workflow stage")).toBeInTheDocument();
  });
});
