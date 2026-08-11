import { render, screen } from "@testing-library/react";

const mockUseProjectWorkflow = jest.fn();

jest.mock("@patina/supabase", () => ({
  useProjectWorkflow: (projectId: string | null) =>
    mockUseProjectWorkflow(projectId),
}));

import { SectionStageLineMount } from "../section-stage-line-mount";

const EMPTY_QUERY = {
  data: [],
  isLoading: false,
  isError: false,
};

describe("SectionStageLineMount", () => {
  beforeEach(() => {
    mockUseProjectWorkflow.mockReturnValue(EMPTY_QUERY);
  });

  it("uses explicit section guidance for a non-project Document", () => {
    render(
      <SectionStageLineMount projectId={null} activeSection="discovery" />,
    );

    expect(mockUseProjectWorkflow).toHaveBeenCalledWith(null);
    expect(
      screen.getByText("Discovery & Programming · Core · stage 02"),
    ).toBeVisible();
    expect(
      screen.getByText("Section guidance · no project phase topology"),
    ).toBeVisible();
  });

  it("uses project workflow rows regardless of the active Document section", () => {
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
    render(
      <SectionStageLineMount projectId="project-1" activeSection="care" />,
    );

    expect(mockUseProjectWorkflow).toHaveBeenCalledWith("project-1");
    // R3 dissolved the contextual handoff band; handoffs live in the margin
    // rail now, so this mount renders the stage line alone.
    expect(
      screen.queryByRole("region", { name: "Project handoffs" }),
    ).toBeNull();
    expect(
      screen.getByText("Concept / Schematic · Core · stage 05 of 04–09"),
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
});
