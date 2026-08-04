import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const sendWave = jest.fn();
const retryDelivery = jest.fn();
const replayNotification = jest.fn();
let mockWorkingBudget: Record<string, unknown> = {
  isLoading: true,
  data: null,
  error: null,
};
let mockBillingAuthority: Record<string, unknown> | null = null;

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
  useProjectBillingAuthority: () => ({ data: mockBillingAuthority }),
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
}));

jest.mock("@/hooks/use-proposals", () => ({
  useProposals: () => ({ data: [], isLoading: false }),
}));

import { ProjectCommerceSection } from "./project-commerce-section";

describe("ProjectCommerceSection furnishings delivery recovery", () => {
  beforeEach(() => {
    sendWave.mockReset();
    retryDelivery.mockReset();
    replayNotification.mockReset();
    mockWorkingBudget = { isLoading: true, data: null, error: null };
    mockBillingAuthority = null;
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
    mockBillingAuthority = { agreementId: "agreement-1" };
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
});
