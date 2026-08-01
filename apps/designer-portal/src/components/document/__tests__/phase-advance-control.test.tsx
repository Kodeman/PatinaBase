import { fireEvent, render, screen } from "@testing-library/react";
import type { Database } from "@patina/supabase";
import {
  derivePhaseHandoff,
  PhaseAdvanceControl,
} from "../phase-advance-control";

const mockMutate = jest.fn();
const mockInvalidateQueries = jest.fn(() => Promise.resolve());
let mockPending = false;

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));

jest.mock("@patina/supabase", () => ({
  useUpdateProjectPhaseStatus: () => ({
    mutate: mockMutate,
    isPending: mockPending,
  }),
}));

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

type PhaseRow = Database["public"]["Tables"]["project_phases"]["Row"];

function phase(
  id: string,
  name: string,
  status: string,
  sortOrder: number,
): PhaseRow {
  return {
    id,
    name,
    status,
    sort_order: sortOrder,
    project_id: "project-1",
    lane: "main",
  } as PhaseRow;
}

const activeSequence = [
  phase("phase-1", "Schematic Design", "completed", 0),
  phase("phase-2", "Design Development", "in_progress", 1),
  phase("phase-3", "Installation & Styling", "pending", 2),
];

type MutationOptions = {
  onSuccess: () => void;
  onError: (error: unknown) => void;
};

describe("PhaseAdvanceControl", () => {
  beforeEach(() => {
    mockPending = false;
    mockMutate.mockReset();
    mockInvalidateQueries.mockClear();
  });

  it("names the current and next phases and exposes one descriptive advance action", () => {
    render(
      <PhaseAdvanceControl projectId="project-1" phases={activeSequence} />,
    );

    expect(
      screen.getByRole("heading", { name: "Phase handoff" }),
    ).toBeVisible();
    expect(screen.getByText("Design Development")).toBeVisible();
    expect(screen.getByText(/Next · Installation & Styling/)).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Complete Design Development and begin Installation & Styling",
      }),
    ).toBeEnabled();
  });

  it("allows only the sequential complete or delayed-resume transitions", () => {
    expect(derivePhaseHandoff(activeSequence)).toMatchObject({
      kind: "complete_phase",
      phase: { id: "phase-2" },
      next: { id: "phase-3" },
    });

    expect(
      derivePhaseHandoff([
        phase("phase-1", "Schematic Design", "completed", 0),
        phase("phase-2", "Design Development", "delayed", 1),
        phase("phase-3", "Installation & Styling", "pending", 2),
      ]),
    ).toMatchObject({
      kind: "resume_phase",
      phase: { id: "phase-2" },
    });

    expect(
      derivePhaseHandoff([
        phase("phase-1", "Schematic Design", "pending", 0),
        phase("phase-2", "Design Development", "in_progress", 1),
      ]),
    ).toMatchObject({ kind: "blocked" });

    expect(
      derivePhaseHandoff([
        phase("phase-1", "Schematic Design", "in_progress", 0),
        phase("phase-2", "Design Development", "in_progress", 1),
      ]),
    ).toMatchObject({ kind: "blocked" });

    expect(
      derivePhaseHandoff([
        phase("phase-1", "Schematic Design", "completed", 0),
        phase("phase-2", "Design Development", "completed", 1),
      ]),
    ).toEqual({ kind: "all_complete" });
  });

  it("calls the existing phase mutation with a completed status and full progress", () => {
    render(
      <PhaseAdvanceControl projectId="project-1" phases={activeSequence} />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Complete Design Development and begin Installation & Styling",
      }),
    );

    expect(mockMutate).toHaveBeenCalledWith(
      {
        phaseId: "phase-2",
        projectId: "project-1",
        status: "completed",
        progress: 100,
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it("keeps the action disabled and announces the handoff while pending", () => {
    mockPending = true;

    render(
      <PhaseAdvanceControl projectId="project-1" phases={activeSequence} />,
    );

    const action = screen.getByRole("button", {
      name: "Complete Design Development and begin Installation & Styling",
    });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Advancing…")).toBeVisible();
    expect(
      screen.getByRole("status", {
        name: "",
      }),
    ).toHaveTextContent(
      "Completing Design Development and beginning Installation & Styling…",
    );
  });

  it("reports a failed handoff inline and clears the error on a successful retry", () => {
    mockMutate
      .mockImplementationOnce((_variables: unknown, options: MutationOptions) =>
        options.onError(new Error("write failed")),
      )
      .mockImplementationOnce((_variables: unknown, options: MutationOptions) =>
        options.onSuccess(),
      );

    render(
      <PhaseAdvanceControl projectId="project-1" phases={activeSequence} />,
    );

    const action = screen.getByRole("button", {
      name: "Complete Design Development and begin Installation & Styling",
    });
    fireEvent.click(action);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The phase handoff did not finish. Review the schedule and try again.",
    );

    fireEvent.click(action);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Design Development is complete. Installation & Styling is now in progress.",
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["document-state"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["desk-engagements"],
    });
  });

  it("resumes a delayed current phase without changing progress", () => {
    const delayed = [
      phase("phase-1", "Schematic Design", "completed", 0),
      phase("phase-2", "Design Development", "delayed", 1),
      phase("phase-3", "Installation & Styling", "pending", 2),
    ];
    render(<PhaseAdvanceControl projectId="project-1" phases={delayed} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Resume Design Development" }),
    );

    expect(mockMutate).toHaveBeenCalledWith(
      {
        phaseId: "phase-2",
        projectId: "project-1",
        status: "in_progress",
      },
      expect.any(Object),
    );
  });

  it("fails closed when phase statuses would skip unfinished work", () => {
    render(
      <PhaseAdvanceControl
        projectId="project-1"
        phases={[
          phase("phase-1", "Schematic Design", "pending", 0),
          phase("phase-2", "Design Development", "in_progress", 1),
        ]}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Design Development cannot advance while an earlier phase is unfinished.",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
