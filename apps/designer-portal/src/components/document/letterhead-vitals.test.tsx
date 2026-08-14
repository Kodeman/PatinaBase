import { fireEvent, render, screen, waitFor } from "@testing-library/react";

let mockProject: Record<string, unknown> | undefined;
// A shared spy (reset in beforeEach) so the D5 date-vitals tests can assert
// on the writes `VitalDate` sends through `save()`, unlike the fresh-fn
// factory the pre-existing suite above never needed to inspect.
let mockMutateAsync: jest.Mock;

jest.mock("@patina/supabase", () => ({
  useProjectV2: () => ({ data: mockProject }),
  useProjectPhases: () => ({ data: [] }),
}));

jest.mock("@/hooks/use-time-tracking", () => ({
  useUpdatePhaseEstimates: () => ({ mutate: jest.fn() }),
}));

jest.mock("@/hooks/use-project-lifecycle", () => ({
  usePhaseActualMinutes: () => ({ data: {} }),
  useSaveProjectVitals: () => ({ mutateAsync: mockMutateAsync }),
}));

// The Folio is house-mocked — this suite asserts LetterheadVitals wires
// FolioCalendar's SET (onCommit) and the clear affordance into `save()`
// correctly, not the Folio's own grid/preset behavior (covered by the
// date/__tests__ suites).
jest.mock("@/components/document/date", () => ({
  FolioPopover: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="folio-popover">{children}</div>
  ),
  FolioCalendar: ({
    onCommit,
  }: {
    onCommit: (selection: { kind: "day"; date: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() => onCommit({ kind: "day", date: "2026-09-21" })}
    >
      commit-picked-date
    </button>
  ),
}));

import { LetterheadVitals } from "./letterhead-vitals";

beforeEach(() => {
  mockMutateAsync = jest.fn().mockResolvedValue(undefined);
});

const baseProject = {
  current_phase: "design_development",
  start_date: null,
  target_end_date: null,
  budget_min: null,
  budget_max: null,
  total_amount_cents: null,
};

describe("LetterheadVitals band-honest empty rendering", () => {
  it("offers a ghost affordance instead of an empty band when no bound is recorded", () => {
    mockProject = { ...baseProject };
    const { container } = render(<LetterheadVitals projectId="project-1" />);

    expect(
      screen.getByRole("button", { name: "Set a budget band" }),
    ).toBeVisible();
    expect(screen.queryByText("Band")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent("$");
    expect(
      screen.queryByLabelText("Budget band minimum (dollars)"),
    ).not.toBeInTheDocument();
  });

  it("states no total when the contract amount is zero rather than a bare $0", () => {
    mockProject = { ...baseProject, total_amount_cents: 0 };
    const { container } = render(<LetterheadVitals projectId="project-1" />);

    expect(container).not.toHaveTextContent("$0");
  });

  it("states a sub-dollar total to the cent rather than rounding it into $0", () => {
    mockProject = { ...baseProject, total_amount_cents: 49 };
    render(<LetterheadVitals projectId="project-1" />);

    expect(screen.getByText("$0.49")).toBeVisible();
  });

  it("keeps the sign on a credit rather than hiding the figure", () => {
    mockProject = { ...baseProject, total_amount_cents: -7_500_00 };
    render(<LetterheadVitals projectId="project-1" />);

    expect(screen.getByText("−$7,500")).toBeVisible();
  });

  it("keeps the blur-save inputs one click away from the ghost affordance", () => {
    mockProject = { ...baseProject };
    render(<LetterheadVitals projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Set a budget band" }));

    expect(
      screen.getByLabelText("Budget band minimum (dollars)"),
    ).toHaveFocus();
    expect(
      screen.getByLabelText("Budget band maximum (dollars)"),
    ).toBeVisible();
  });

  it("renders the band and the total normally once either is recorded", () => {
    mockProject = {
      ...baseProject,
      budget_min: 5_000_00,
      budget_max: 9_000_00,
      total_amount_cents: 7_500_00,
    };
    render(<LetterheadVitals projectId="project-1" />);

    expect(
      screen.queryByRole("button", { name: "Set a budget band" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Budget band minimum (dollars)")).toHaveValue(
      "5000",
    );
    expect(screen.getByText("$7,500")).toBeVisible();
  });
});

describe("LetterheadVitals date vitals — the Calendar Folio (D5)", () => {
  it("SET on the Folio saves the picked date — never a blur commit", async () => {
    mockProject = { ...baseProject, start_date: null };
    render(<LetterheadVitals projectId="project-1" />);

    fireEvent.click(screen.getByLabelText("Start"));
    fireEvent.click(screen.getByText("commit-picked-date"));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({
        start_date: "2026-09-21",
      }),
    );
  });

  it("the clear affordance saves null and only appears once a value exists", () => {
    mockProject = { ...baseProject };
    render(<LetterheadVitals projectId="project-1" />);
    expect(screen.queryByLabelText("Clear start")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Clear target")).not.toBeInTheDocument();
  });

  it("clicking the clear affordance saves null for the field it belongs to", async () => {
    mockProject = {
      ...baseProject,
      start_date: "2026-01-15",
      target_end_date: "2026-03-01",
    };
    render(<LetterheadVitals projectId="project-1" />);

    fireEvent.click(screen.getByLabelText("Clear target"));

    await waitFor(() =>
      expect(mockMutateAsync).toHaveBeenCalledWith({ target_end_date: null }),
    );
    expect(mockMutateAsync).not.toHaveBeenCalledWith({ start_date: null });
  });

  it("a server echo while the popover is open does not clobber the trigger", () => {
    mockProject = { ...baseProject, start_date: null };
    const { rerender } = render(<LetterheadVitals projectId="project-1" />);

    fireEvent.click(screen.getByLabelText("Start"));
    expect(screen.getByLabelText("Start")).toHaveTextContent("—");

    // A refetch lands a different value while the popover is still up.
    mockProject = { ...baseProject, start_date: "2026-02-01" };
    rerender(<LetterheadVitals projectId="project-1" />);

    expect(screen.getByLabelText("Start")).toHaveTextContent("—");
  });
});
