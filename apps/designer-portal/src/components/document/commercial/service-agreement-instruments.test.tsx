import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockCountersign = jest.fn();
const mockReplay = jest.fn();
const mockRecordPaperSignature = jest.fn();
let mockDocumentState = "executed";

jest.mock("next/navigation", () => ({
  usePathname: () => "/doc/agreement-1",
  useRouter: () => ({ push: jest.fn() }),
}));

// The countersign's IMPACT block (R110) reads the resolver's one door; these
// tests render without a QueryClientProvider.
jest.mock("@patina/supabase", () => ({
  ...jest.requireActual("@patina/supabase"),
  useResolvedSchedule: () => ({
    phases: [],
    milestones: [],
    resolved: null,
    isLoading: false,
    isError: false,
  }),
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
  // RecordOnPaperSheet mounts unconditionally (open/onClose toggles
  // visibility) and calls all four paper hooks up front regardless of
  // `kind` — stub every one so mounting it here doesn't throw.
  useRecordPaperClientSignature: () => ({
    mutateAsync: mockRecordPaperSignature,
    isPending: false,
  }),
  useExecuteFurnishingsAuthorizationOnPaper: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useExecuteTradeScopeOnPaper: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useRecordPaperTradeAcceptance: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  uploadPaperScanDocument: jest.fn(),
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
    mockRecordPaperSignature.mockReset();
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

  it("records a paper signature while the agreement is with the client, prefilled with the client's name", async () => {
    mockDocumentState = "sent";
    mockRecordPaperSignature.mockResolvedValue({
      notificationDelivery: "delivered",
    });
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: {} }}
        clientName="Avery Client"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Record the signature" }),
    );

    const nameField = await screen.findByLabelText("Signed by");
    expect(nameField).toHaveValue("Avery Client");

    fireEvent.click(screen.getByRole("button", { name: "Record signed" }));

    await waitFor(() =>
      expect(mockRecordPaperSignature).toHaveBeenCalledWith(
        expect.objectContaining({
          signedName: "Avery Client",
          scanDocumentId: null,
        }),
      ),
    );
    expect(
      await screen.findByText(/paper signature recorded/i),
    ).toBeVisible();
  });
});
