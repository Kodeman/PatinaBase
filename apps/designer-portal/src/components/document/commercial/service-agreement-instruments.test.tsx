import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockCountersign = jest.fn();
const mockReplay = jest.fn();
let mockDocumentState = "executed";

jest.mock("next/navigation", () => ({
  usePathname: () => "/doc/agreement-1",
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/hooks/use-commercial-documents", () => ({
  useCommercialDocument: () => ({
    isLoading: false,
    error: null,
    data: {
      document: {
        id: "agreement-1",
        projectId: "project-1",
        state: mockDocumentState,
      },
      terms: null,
      rates: [],
      signatures: [],
    },
  }),
  useCountersignDesignServicesAgreement: () => ({
    mutateAsync: mockCountersign,
    isPending: false,
  }),
  useReplayCommercialNotification: () => ({
    mutateAsync: mockReplay,
    isPending: false,
  }),
}));

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

import { ServiceAgreementInstruments } from "./service-agreement-instruments";

describe("ServiceAgreementInstruments notification recovery", () => {
  beforeEach(() => {
    mockCountersign.mockReset();
    mockReplay.mockReset();
    mockDocumentState = "executed";
  });

  it("keeps execution-notice recovery discoverable after refresh", async () => {
    mockReplay.mockResolvedValue("delivered");
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: {} }}
        clientName="Avery Client"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Resend execution notice" }),
    );

    await waitFor(() =>
      expect(mockReplay).toHaveBeenCalledWith({
        documentId: "agreement-1",
        transition: "executed",
      }),
    );
    expect(
      await screen.findByText("The execution notice is confirmed."),
    ).toBeVisible();
  });

  it("surfaces pending delivery without rolling back a countersign", async () => {
    mockDocumentState = "client_signed";
    mockCountersign.mockResolvedValue({
      projectId: "project-1",
      newlyExecuted: true,
      notificationDelivery: "pending_retry",
    });
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: {} }}
        clientName="Avery Client"
      />,
    );

    fireEvent.change(screen.getByLabelText("Studio signer name"), {
      target: { value: "Morgan Designer" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Countersign agreement" }),
    );

    expect(
      await screen.findByText(/agreement executed.*execution notice is pending/i),
    ).toBeVisible();
  });
});
