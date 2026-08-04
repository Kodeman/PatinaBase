import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const sendWave = jest.fn();
const retryDelivery = jest.fn();
const replayNotification = jest.fn();
const createFurnishingDraft = jest.fn();
const mockPush = jest.fn();
const mockRememberRoomOrigin = jest.fn();
let mockWorkingBudget: Record<string, unknown> = {
  isLoading: true,
  data: null,
  error: null,
};
// Legacy retirement (item 5): FurnishingsWaves now reads the same
// authority as BudgetEditor — default to an active authority so the two
// pre-existing tests (which never assert on the wave-creation form) keep
// exercising their original, unrelated paths.
let mockBillingAuthority: Record<string, unknown> | null = {
  state: "active",
  agreementId: "agreement-1",
};
let mockProposals: any[] = [];
const mockUseProjectBillingAuthority = jest.fn();

jest.mock("next/navigation", () => ({
  usePathname: () => "/doc/project-1",
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/lib/document/room-origin", () => ({
  rememberRoomOrigin: (path: string) => mockRememberRoomOrigin(path),
}));

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

jest.mock("@patina/supabase", () => ({
  useProposalSendDispatchStatus: () => ({
    isLoading: false,
    isError: false,
    data: {
      dispatchId: "dispatch-1",
      proposalId: "proposal-1",
      sentAt: "2026-08-03T12:00:00Z",
      state: "pending",
      attemptCount: 1,
      retryable: true,
    },
  }),
  useRetryProposalSend: () => ({
    mutateAsync: retryDelivery,
    isPending: false,
  }),
}));

jest.mock("@/hooks/use-commercial-documents", () => ({
  useWorkingBudget: () => mockWorkingBudget,
  useProjectBillingAuthority: () => mockUseProjectBillingAuthority(),
  useReplayCommercialNotification: () => ({
    mutateAsync: replayNotification,
    isPending: false,
  }),
  useSaveWorkingBudgetDraft: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  usePublishBudgetCheckpoint: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useOverrideBudgetCheckpoint: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useCreateFurnishingsAuthorization: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useFurnishingsAuthorizations: () => ({
    isLoading: false,
    error: null,
    data: [
      {
        documentId: "document-1",
        proposalId: "proposal-1",
        waveName: "Living Room Essentials",
        state: "sent",
        status: "sent",
        totalAmountCents: 2_000_000,
        depositPercent: 50,
        depositRequiredCents: 1_000_000,
        depositInvoiceId: null,
        executedAt: null,
        sentAt: "2026-08-03T12:00:00Z",
        proposalSendDispatchId: "dispatch-1",
        checkpointId: "checkpoint-1",
        itemCount: 0,
        items: [],
      },
    ],
  }),
  useSendFurnishingsAuthorization: () => ({
    mutateAsync: sendWave,
    isPending: false,
    variables: null,
  }),
  useCreateFurnishingDraft: () => ({
    mutateAsync: createFurnishingDraft,
    isPending: false,
  }),
}));

jest.mock("@/hooks/use-proposals", () => ({
  useProposals: () => ({ data: mockProposals, isLoading: false }),
}));

import { ProjectCommerceSection } from "./project-commerce-section";

describe("ProjectCommerceSection furnishings delivery recovery", () => {
  beforeEach(() => {
    sendWave.mockReset();
    retryDelivery.mockReset();
    replayNotification.mockReset();
    createFurnishingDraft.mockReset();
    mockPush.mockReset();
    mockRememberRoomOrigin.mockReset();
    mockWorkingBudget = { isLoading: true, data: null, error: null };
    mockBillingAuthority = { state: "active", agreementId: "agreement-1" };
    mockProposals = [];
    mockUseProjectBillingAuthority.mockReset();
    mockUseProjectBillingAuthority.mockImplementation(() => ({
      data: mockBillingAuthority,
    }));
  });

  it("rehydrates pending delivery after refresh and retries only the existing dispatch", async () => {
    retryDelivery.mockResolvedValue({
      _emailDispatched: true,
      _emailDeliveryState: "delivered",
      _emailRetryable: false,
    });
    render(<ProjectCommerceSection projectId="project-1" />);

    expect(
      await screen.findByText(/email delivery is still being confirmed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/will not create a duplicate/i),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry email delivery" }),
    );

    await waitFor(() =>
      expect(retryDelivery).toHaveBeenCalledWith({
        proposalId: "proposal-1",
        dispatchId: "dispatch-1",
        sentAt: "2026-08-03T12:00:00Z",
      }),
    );
    expect(sendWave).not.toHaveBeenCalled();
  });

  it("keeps published budget-notice recovery discoverable after refresh", async () => {
    mockWorkingBudget = {
      isLoading: false,
      error: null,
      data: {
        version: {
          id: "version-1",
          version: 1,
          state: "published",
          lines: [
            {
              id: "line-1",
              roomId: null,
              roomName: "Living room",
              category: "Seating",
              lowCents: 100_000,
              targetCents: 150_000,
              highCents: 200_000,
              sortOrder: 0,
            },
          ],
        },
        checkpoint: {
          id: "checkpoint-1",
          checkpointCode: "B-001",
          state: "published",
          publishedAt: "2026-08-03T12:00:00Z",
          acknowledgedAt: null,
          overrideAt: null,
          overrideReason: null,
        },
        note: "",
      },
    };
    mockBillingAuthority = { state: "active", agreementId: "agreement-1" };
    replayNotification.mockResolvedValue("delivered");
    render(<ProjectCommerceSection projectId="project-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Resend budget notice" }),
    );

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

  // Legacy retirement (item 5): the wave-creation form is gated on the
  // project's own billing authority, not merely on there being a draft
  // proposal to snapshot.
  it("shows the no-agreement copy when there is no authority and no legacy engagement", () => {
    mockBillingAuthority = null;
    mockProposals = [];
    render(<ProjectCommerceSection projectId="project-1" />);

    expect(
      screen.getByText(
        "An executed design agreement is required before furnishing authorizations.",
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Draft a furnishing proposal" }),
    ).not.toBeInTheDocument();
  });

  it("shows the grandfathered copy for a project running on a signed legacy proposal", () => {
    mockBillingAuthority = null;
    mockProposals = [
      { id: "legacy-1", status: "accepted", document_kind: "legacy" },
    ];
    render(<ProjectCommerceSection projectId="project-1" />);

    expect(screen.getByText(/earlier agreement format/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Draft a furnishing proposal" }),
    ).not.toBeInTheDocument();
  });

  it("shows a distinct retry message when the authority read errors, instead of the no-agreement copy", () => {
    mockProposals = [];
    const refetch = jest.fn();
    mockUseProjectBillingAuthority.mockImplementation(() => ({
      data: null,
      isError: true,
      isLoading: false,
      refetch,
    }));
    render(<ProjectCommerceSection projectId="project-1" />);

    expect(
      screen.getByText(/agreement status could not load/i),
    ).toBeVisible();
    expect(
      screen.queryByText(
        "An executed design agreement is required before furnishing authorizations.",
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders the wave-creation form and the furnishing-draft action once an authority is active", () => {
    mockBillingAuthority = { state: "active", agreementId: "agreement-1" };
    mockProposals = [];
    render(<ProjectCommerceSection projectId="project-1" />);

    expect(
      screen.getByRole("button", { name: "Create wave" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Draft a furnishing proposal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Draft a furnishing proposal to begin."),
    ).toBeVisible();
  });

  it("the furnishing-draft action creates the draft and opens the Drafting Room", async () => {
    mockBillingAuthority = { state: "active", agreementId: "agreement-1" };
    mockProposals = [];
    createFurnishingDraft.mockResolvedValue({
      proposalId: "furnishing-draft-1",
      projectId: "project-1",
    });
    render(<ProjectCommerceSection projectId="project-1" />);

    fireEvent.click(
      screen.getByRole("button", { name: "Draft a furnishing proposal" }),
    );

    await waitFor(() =>
      expect(createFurnishingDraft).toHaveBeenCalledWith(
        "Furnishing selection",
      ),
    );
    expect(mockRememberRoomOrigin).toHaveBeenCalledWith("/doc/project-1");
    expect(mockPush).toHaveBeenCalledWith("/drafting/furnishing-draft-1");
  });
});
