import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const deriveBudget = jest.fn();
const publish = jest.fn();
const override = jest.fn();
const setTarget = jest.fn();
const replayNotification = jest.fn();

let mockWorkingBudget: Record<string, unknown> = {
  isLoading: true,
  data: null,
  error: null,
};
let mockBillingAuthority: Record<string, unknown> | null = {
  agreementId: "agreement-1",
};

jest.mock("@/hooks/use-commercial-documents", () => ({
  useWorkingBudget: () => mockWorkingBudget,
  useProjectBillingAuthority: () => ({ data: mockBillingAuthority }),
  useDeriveWorkingBudget: () => ({ mutateAsync: deriveBudget, isPending: false }),
  usePublishBudgetCheckpoint: () => ({ mutateAsync: publish, isPending: false }),
  useOverrideBudgetCheckpoint: () => ({ mutateAsync: override, isPending: false }),
  useSetBudgetTargets: () => ({ mutateAsync: setTarget, isPending: false }),
  useReplayCommercialNotification: () => ({
    mutateAsync: replayNotification,
    isPending: false,
  }),
}));

import { DerivedBudgetGrid } from "./derived-budget-grid";

const draftBudget = {
  version: {
    id: "version-1",
    version: 1,
    state: "draft",
    lines: [
      {
        id: "line-1",
        roomId: "room-1",
        roomName: "Living room",
        category: "Seating",
        lowCents: 0,
        targetCents: 150_000,
        highCents: 0,
        scheduledCents: 180_000,
        authorizedCents: 0,
        sortOrder: 0,
      },
    ],
  },
  checkpoint: null,
  note: null,
};

describe("DerivedBudgetGrid", () => {
  beforeEach(() => {
    deriveBudget.mockReset();
    publish.mockReset();
    override.mockReset();
    setTarget.mockReset();
    replayNotification.mockReset();
    mockWorkingBudget = { isLoading: true, data: null, error: null };
    mockBillingAuthority = { agreementId: "agreement-1" };
  });

  it("shows a loading state, then an error state distinctly", () => {
    const { rerender } = render(<DerivedBudgetGrid projectId="project-1" />);
    expect(screen.getByText(/loading working budget/i)).toBeInTheDocument();

    mockWorkingBudget = { isLoading: false, data: null, error: new Error("boom") };
    rerender(<DerivedBudgetGrid projectId="project-1" />);
    expect(
      screen.getByText(/project working budget is unavailable/i),
    ).toBeInTheDocument();
  });

  it("renders Room · Category · Scheduled · Target · Authorized with Scheduled/Authorized muted and Target editable on a draft version", () => {
    mockWorkingBudget = { isLoading: false, error: null, data: draftBudget };
    render(<DerivedBudgetGrid projectId="project-1" />);

    expect(screen.getByText("Living room")).toBeInTheDocument();
    expect(screen.getByText("Seating")).toBeInTheDocument();
    expect(screen.getByText("$1,800")).toBeInTheDocument(); // scheduled
    expect(
      screen.getByLabelText("Target for Living room · Seating"),
    ).toHaveValue(1500);
  });

  it("writes an edited target on blur via useSetBudgetTargets, scoped to the line and version", async () => {
    mockWorkingBudget = { isLoading: false, error: null, data: draftBudget };
    setTarget.mockResolvedValue(draftBudget);
    render(<DerivedBudgetGrid projectId="project-1" />);

    const input = screen.getByLabelText("Target for Living room · Seating");
    fireEvent.change(input, { target: { value: "2000" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(setTarget).toHaveBeenCalledWith({
        versionId: "version-1",
        lineId: "line-1",
        targetCents: 200_000,
      }),
    );
  });

  it("does not write anything when the target is unchanged on blur", async () => {
    mockWorkingBudget = { isLoading: false, error: null, data: draftBudget };
    render(<DerivedBudgetGrid projectId="project-1" />);

    const input = screen.getByLabelText("Target for Living room · Seating");
    fireEvent.blur(input);

    expect(setTarget).not.toHaveBeenCalled();
  });

  it("renders Target as plain text, not an input, once the version is published", () => {
    mockWorkingBudget = {
      isLoading: false,
      error: null,
      data: {
        ...draftBudget,
        version: { ...draftBudget.version, state: "published" },
      },
    };
    render(<DerivedBudgetGrid projectId="project-1" />);

    expect(
      screen.queryByLabelText("Target for Living room · Seating"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("$1,500")).toBeInTheDocument();
  });

  it("syncs from the schedule via useDeriveWorkingBudget", async () => {
    mockWorkingBudget = { isLoading: false, error: null, data: draftBudget };
    deriveBudget.mockResolvedValue({ versionId: "version-2" });
    render(<DerivedBudgetGrid projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Sync from the schedule" }));

    await waitFor(() => expect(deriveBudget).toHaveBeenCalledWith());
  });

  it("publishes a checkpoint with the current version and agreement id", async () => {
    mockWorkingBudget = { isLoading: false, error: null, data: draftBudget };
    publish.mockResolvedValue({ checkpointId: "checkpoint-1", notificationDelivery: "delivered" });
    render(<DerivedBudgetGrid projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Publish checkpoint" }));

    await waitFor(() =>
      expect(publish).toHaveBeenCalledWith({
        versionId: "version-1",
        agreementId: "agreement-1",
      }),
    );
  });

  it("disables Publish checkpoint without an executed design agreement", () => {
    mockBillingAuthority = null;
    mockWorkingBudget = { isLoading: false, error: null, data: draftBudget };
    render(<DerivedBudgetGrid projectId="project-1" />);

    expect(
      screen.getByRole("button", { name: "Publish checkpoint" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/executed design agreement is required/i),
    ).toBeVisible();
  });

  it("keeps published budget-notice recovery discoverable", async () => {
    mockWorkingBudget = {
      isLoading: false,
      error: null,
      data: {
        ...draftBudget,
        version: { ...draftBudget.version, state: "published" },
        checkpoint: {
          id: "checkpoint-1",
          checkpointCode: "B-001",
          state: "open",
          publishedAt: "2026-08-03T12:00:00Z",
          acknowledgedAt: null,
          overrideAt: null,
          overrideReason: null,
        },
      },
    };
    replayNotification.mockResolvedValue("delivered");
    render(<DerivedBudgetGrid projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Resend budget notice" }));

    await waitFor(() =>
      expect(replayNotification).toHaveBeenCalledWith({
        documentId: "agreement-1",
        transition: "budget_published",
        eventId: "checkpoint-1",
      }),
    );
    expect(
      await screen.findByText("The working-budget notice is confirmed."),
    ).toBeVisible();
  });
});
