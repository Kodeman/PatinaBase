import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockCountersign = jest.fn();
const mockReplay = jest.fn();
const mockRecordPaperSignature = jest.fn();
let mockDocumentState = "executed";
// 00477 — the draft-state paper entry is gated on the SERVER's readiness bar
// (terms + at least one role rate), so these two are what the gate reads.
let mockTerms: unknown = null;
let mockRates: unknown[] = [];

// A terms row complete enough for the send sheet's own readiness assessment,
// which runs whenever `terms` is present (the sheet mounts closed).
const READY_TERMS = {
  scope: "Whole-home interior design services.",
  deliverables: ["Concept"],
  exclusions: ["Structural engineering"],
  billingCeilingCents: 900000,
  retainerAmountCents: 250000,
  retainerActivationPolicy: "immediate",
  furnishingsDepositPercent: 30,
  billingCadence: "monthly",
  terms: "Actual hours to the signed ceiling.",
};
const READY_RATES = [
  { roleName: "Lead Designer", hourlyRateCents: 15000, version: 1 },
];

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
      terms: mockTerms,
      rates: mockRates,
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
  // The send sheet mounts (closed) whenever `terms` is present.
  useSendServiceAgreement: () => ({
    mutateAsync: jest.fn(),
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
    mockTerms = null;
    mockRates = [];
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

/**
 * 00477 — the studio can put a printed copy in the client's hands without ever
 * emailing one. The entry point for that is this same Signed-offline block,
 * reached one state earlier.
 */
describe("ServiceAgreementInstruments paper issuance from draft", () => {
  beforeEach(() => {
    mockCountersign.mockReset();
    mockReplay.mockReset();
    mockRecordPaperSignature.mockReset().mockResolvedValue({
      notificationDelivery: "not_requested",
    });
    mockTerms = READY_TERMS;
    mockRates = READY_RATES;
  });

  it("offers the paper act on a ready draft, and says nothing will be emailed", () => {
    mockDocumentState = "draft";
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: {} }}
        clientName="Avery Client"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Record the signature" }),
    ).toBeVisible();
    expect(screen.getByText(/nothing will be emailed/i)).toBeVisible();
  });

  it("withholds the paper act from a draft the server would refuse", () => {
    mockDocumentState = "draft";
    // The server bar is terms AND at least one role rate; a draft missing
    // either is one send_commercial_document would refuse too.
    mockTerms = READY_TERMS;
    mockRates = [];
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: {} }}
        clientName="Avery Client"
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Record the signature" }),
    ).toBeNull();
  });

  it.each(["client_signed", "executed", "declined", "expired", "superseded"])(
    "withholds the paper act once the agreement is %s",
    (state) => {
      mockDocumentState = state;
      render(
        <ServiceAgreementInstruments
          proposal={{ id: "agreement-1", client: {} }}
          clientName="Avery Client"
        />,
      );

      expect(
        screen.queryByRole("button", { name: "Record the signature" }),
      ).toBeNull();
    },
  );

  it("issues on paper as part of the record when the draft was never sent", async () => {
    mockDocumentState = "draft";
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: {} }}
        clientName="Avery Client"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Record the signature" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Record signed" }));

    await waitFor(() =>
      expect(mockRecordPaperSignature).toHaveBeenCalledWith(
        expect.objectContaining({
          signedName: "Avery Client",
          issueOnPaper: true,
        }),
      ),
    );
  });

  it("records without issuing once the agreement is already with the client", async () => {
    mockDocumentState = "sent";
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: {} }}
        clientName="Avery Client"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Record the signature" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Record signed" }));

    await waitFor(() =>
      expect(mockRecordPaperSignature).toHaveBeenCalledWith(
        expect.objectContaining({ issueOnPaper: false }),
      ),
    );
  });
});
