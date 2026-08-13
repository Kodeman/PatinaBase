import { render, screen } from "@testing-library/react";

const mockUseProjectWorkflow = jest.fn();
const mockUseResolvedSchedule = jest.fn();

jest.mock("@patina/supabase", () => ({
  useProjectWorkflow: (projectId: string | null) =>
    mockUseProjectWorkflow(projectId),
  useResolvedSchedule: (projectId: string | undefined) =>
    mockUseResolvedSchedule(projectId),
}));

import { SectionStageLineMount } from "../section-stage-line-mount";

const EMPTY_QUERY = {
  data: [],
  isLoading: false,
  isError: false,
};

const NO_SCHEDULE = {
  phases: [],
  milestones: [],
  resolved: null,
  isLoading: false,
  isError: false,
};

describe("SectionStageLineMount", () => {
  beforeEach(() => {
    mockUseProjectWorkflow.mockReturnValue(EMPTY_QUERY);
    mockUseResolvedSchedule.mockReturnValue(NO_SCHEDULE);
  });

  it("uses explicit section guidance for a non-project Document", () => {
    render(
      <SectionStageLineMount projectId={null} activeSection="discovery" />,
    );

    expect(mockUseProjectWorkflow).toHaveBeenCalledWith(null);
    expect(
      screen.getByText("Discovery & Programming · Core · stage 02"),
    ).toBeVisible();
    // R113: no template source, no provenance line — and no machine apology
    // standing in for one.
    expect(
      screen.queryByText("Section guidance · no project phase topology"),
    ).toBeNull();
  });

  it("uses project workflow rows regardless of the active Document section", () => {
    mockUseResolvedSchedule.mockReturnValue({
      phases: [{ id: "phase-1", name: "Concept work", status: "in_progress" }],
      milestones: [],
      resolved: {
        phases: [
          {
            id: "phase-1",
            start: "2026-06-01",
            end: "2026-12-01",
            lane: "main",
            anchored: true,
            source: "anchor",
            slackDays: null,
            governingAnchorId: "phase-1",
            origin: "anchor",
          },
        ],
        milestones: [],
        conflicts: [],
        slackDays: null,
      },
      isLoading: false,
      isError: false,
    });
    mockUseProjectWorkflow.mockReturnValue({
      data: [
        {
          phase_id: "phase-1",
          phase_name: "Concept work",
          phase_status: "active",
          phase_key: "ambiguous_local_key",
          canonical_stage_key: "concept_schematic",
          workflow_track: "core",
          sort_order: 0,
          lane: "main",
          follows_phase_id: null,
          gate_note: null,
          deliverables: [],
          template_provenance: {},
          current_blockers: {
            count: 0,
            phase: [],
            tasks: [],
            ffe: [],
          },
          advance_blocker_count: 0,
          blocks_advance: false,
        },
      ],
      isLoading: false,
      isError: false,
    });
    jest.useFakeTimers().setSystemTime(new Date("2026-06-08T12:00:00Z"));
    render(
      <SectionStageLineMount projectId="project-1" activeSection="care" />,
    );
    jest.useRealTimers();

    expect(mockUseProjectWorkflow).toHaveBeenCalledWith("project-1");
    // R3 dissolved the contextual handoff band; handoffs live in the margin
    // rail now, so this mount renders the stage line alone.
    expect(
      screen.queryByRole("region", { name: "Project handoffs" }),
    ).toBeNull();
    expect(
      screen.getByText(
        "Concept / Schematic · Core · stage 05 of 04–09 · Week 2 · Committed",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Closeout & Post-Occupancy/)).toBeNull();
  });

  it("says it is reading the workflow while the read is in flight", () => {
    mockUseProjectWorkflow.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(
      <SectionStageLineMount projectId="project-1" activeSection="project" />,
    );

    expect(screen.getByText("Reading project workflow…")).toBeVisible();
  });

  it("says the stage position is unavailable without implying the schedule changed", () => {
    mockUseProjectWorkflow.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(
      <SectionStageLineMount projectId="project-1" activeSection="project" />,
    );

    expect(
      screen.getByText(
        "Stage position unavailable · the schedule itself is unchanged",
      ),
    ).toHaveAttribute("role", "status");
  });

  it("holds the loading line until the SCHEDULE resolves too, so no half-derived label flashes", () => {
    mockUseResolvedSchedule.mockReturnValue({ ...NO_SCHEDULE, isLoading: true });

    render(
      <SectionStageLineMount projectId="project-1" activeSection="project" />,
    );

    expect(screen.getByText("Reading project workflow…")).toBeVisible();
  });
});
