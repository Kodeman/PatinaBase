import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const sendWave = jest.fn();
const retryDelivery = jest.fn();

jest.mock("@patina/supabase", () => ({
  useRetryProposalSend: () => ({
    mutateAsync: retryDelivery,
    isPending: false,
  }),
}));

jest.mock("@/hooks/use-commercial-documents", () => ({
  useWorkingBudget: () => ({ isLoading: true, data: null, error: null }),
  useProjectBillingAuthority: () => ({ data: null }),
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
        state: "draft",
        status: "draft",
        totalAmountCents: 2_000_000,
        depositPercent: 50,
        depositRequiredCents: 1_000_000,
        depositInvoiceId: null,
        executedAt: null,
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
  });

  it("surfaces pending delivery and retries only the existing dispatch", async () => {
    sendWave.mockResolvedValue({
      proposalSendDispatchId: "dispatch-1",
      sentAt: "2026-08-03T12:00:00Z",
      _emailDispatched: false,
      _emailDeliveryState: "pending",
      _emailRetryable: true,
    });
    retryDelivery.mockResolvedValue({
      _emailDispatched: true,
      _emailDeliveryState: "delivered",
      _emailRetryable: false,
    });
    render(<ProjectCommerceSection projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "Send for signature" }));

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
    expect(sendWave).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(
        screen.queryByText(/email delivery is still being confirmed/i),
      ).not.toBeInTheDocument();
    });
  });
});
