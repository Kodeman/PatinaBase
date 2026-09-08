import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockCountersign = jest.fn();
const mockReplay = jest.fn();
const mockRecordPaperSignature = jest.fn();
let mockDocumentState = "executed";
// 00477 — the draft-state paper entry is gated on the SERVER's readiness bar
// (terms + at least one role rate), so these two are what the gate reads.
let mockTerms: unknown = null;
let mockRates: unknown[] = [];
// "The Agreement, Composed" W1 — a document's parts reach this surface too.
let mockParts: unknown[] = [];
// Left undefined by default so the pre-existing countersign cases keep the
// exact document they had; the composed cases set it.
let mockDocumentKind: string | undefined;

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
        kind: mockDocumentKind,
      },
      terms: mockTerms,
      rates: mockRates,
      signatures: [],
      parts: mockParts,
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
    mockParts = [];
    mockDocumentKind = undefined;
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
    mockParts = [];
    mockDocumentKind = undefined;
  });

  it("offers the paper act on a ready draft as an offer, not as a claim about what the client already holds", () => {
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
    expect(
      screen.getByText(/if the client has signed a printed copy/i),
    ).toBeVisible();
    // The portal cannot know whether anyone ever printed this, so it must not
    // say so on every ready draft.
    expect(screen.queryByText(/already has a signed copy/i)).toBeNull();
    expect(screen.getByText(/nothing will be emailed/i)).toBeVisible();
  });

  // The send sheet is the wall the review met: two buttons, both assuming an
  // email. The third path has to be findable from there.
  it("names the offline path inside the send sheet itself, and opens the ceremony from it", async () => {
    mockDocumentState = "draft";
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: {} }}
        clientName="Avery Client"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review & send" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Record a signature received outside Patina",
      }),
    );

    expect(await screen.findByLabelText("Signed by")).toHaveValue(
      "Avery Client",
    );
  });

  it("withholds the offline path from the send sheet when the server would refuse the paper act", () => {
    mockDocumentState = "draft";
    mockRates = [];
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: {} }}
        clientName="Avery Client"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review & send" }));
    expect(
      screen.queryByRole("button", {
        name: "Record a signature received outside Patina",
      }),
    ).toBeNull();
  });

  // The server bar is terms AND at least one role rate; a draft missing either
  // is one send_commercial_document would refuse too. Both halves, because the
  // gate is a conjunction and either side alone must close it.
  it.each([
    ["no role rates", READY_TERMS as unknown, [] as unknown[]],
    ["no terms", null as unknown, READY_RATES as unknown[]],
  ])(
    "withholds the paper act from a draft with %s, which the server would refuse",
    (_label, terms, rates) => {
      mockDocumentState = "draft";
      mockTerms = terms;
      mockRates = rates;
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

/**
 * A composed agreement on the document page.
 *
 * This surface holds the bundle and, before D1/D2, passed neither the parts
 * nor a parts-shaped readiness to the two children that need them: the client
 * copy fell back to the seven fixed sections (printing "Not yet set" for a
 * ceiling a flat-fee agreement deliberately does not have) and the send sheet
 * asked the seven-facet question, refusing a send R4 allows.
 */
describe("ServiceAgreementInstruments · a composed agreement", () => {
  // A flat fee, no rate card, no ceiling — legal under R4, and exactly the
  // shape the seven-facet assessment refuses.
  const FLAT_FEE_PARTS = [
    {
      id: "part-1",
      proposalId: "agreement-1",
      position: 1,
      kind: "clause",
      variant: null,
      partKey: "patina.services",
      title: "Services",
      payload: { body: "Whole-home interior design services." },
      required: true,
      clientVisible: true,
      sourceTemplateKey: null,
      sourcePartId: null,
      updatedAt: null,
    },
    {
      id: "part-2",
      proposalId: "agreement-1",
      position: 2,
      kind: "schedule",
      variant: "flat",
      partKey: "custom.flat",
      title: "Design fee",
      payload: { cents: 1_100_000 },
      required: true,
      clientVisible: true,
      sourceTemplateKey: null,
      sourcePartId: null,
      updatedAt: null,
    },
    {
      id: "part-3",
      proposalId: "agreement-1",
      position: 3,
      kind: "clause",
      variant: null,
      partKey: "patina.terms",
      title: "Terms",
      payload: { body: "Ownership and cancellation." },
      required: true,
      clientVisible: true,
      sourceTemplateKey: null,
      sourcePartId: null,
      updatedAt: null,
    },
  ];

  // The projection of that composition: no ceiling (NULL = uncapped), no
  // role rates.
  const FLAT_FEE_TERMS = {
    ...READY_TERMS,
    billingCeilingCents: null,
    retainerAmountCents: 0,
    currency: "USD",
  };

  beforeEach(() => {
    mockCountersign.mockReset();
    mockReplay.mockReset();
    mockRecordPaperSignature.mockReset();
    mockTerms = FLAT_FEE_TERMS;
    mockRates = [];
    mockParts = FLAT_FEE_PARTS;
    mockDocumentKind = "design_services";
  });

  it("reads a SENT composed agreement as its parts, never as Not yet set", async () => {
    mockDocumentState = "sent";
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: { email: "avery@example.com" } }}
        clientName="Avery Client"
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Preview client copy" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Design fee" }),
    ).toBeVisible();
    expect(screen.getByText("$11,000")).toBeVisible();
    expect(screen.queryByText("Not yet set")).not.toBeInTheDocument();
    // The seven fixed sections are gone with them.
    expect(
      screen.queryByRole("heading", { name: "How design time is billed" }),
    ).not.toBeInTheDocument();
  });

  it("lets a flat-fee composition be sent from the document page (R4)", async () => {
    mockDocumentState = "draft";
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: { email: "avery@example.com" } }}
        clientName="Avery Client"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review & send" }));

    expect(
      await screen.findByText(/Ready to send · every contractual facet/),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Send agreement/ }),
    ).toBeEnabled();
    // The seven-facet questions a composed agreement never has to answer.
    expect(
      screen.queryByText("Set the design authorization ceiling."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Add at least one role with an hourly rate."),
    ).not.toBeInTheDocument();
  });

  it("still asks the composed question when a part is incomplete", async () => {
    mockDocumentState = "draft";
    mockParts = FLAT_FEE_PARTS.map((part) =>
      part.partKey === "custom.flat"
        ? { ...part, payload: { cents: null } }
        : part,
    );
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: { email: "avery@example.com" } }}
        clientName="Avery Client"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Review & send" }));

    expect(await screen.findByText("Complete Design fee.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Send agreement/ }),
    ).toBeDisabled();
  });

  it("keeps the seven-facet path for a document with no parts", async () => {
    mockDocumentState = "draft";
    mockParts = [];
    mockTerms = { ...READY_TERMS, currency: "USD" };
    mockRates = READY_RATES;
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", client: { email: "avery@example.com" } }}
        clientName="Avery Client"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Preview client copy" }));

    expect(
      await screen.findByRole("heading", { name: "How design time is billed" }),
    ).toBeVisible();
  });
});

/* ── W3R1-01 · THE DOOR TO THE LEDGER ────────────────────────────────────────
   The draw ledger, the lien-waiver exchange and the Trade Agreements strip are
   mounted in the Contract Room and nowhere else, and all three exist only once
   the agreement has been sent. Offering the room on `draft` alone left the
   studio with no door to any of them: the walk could not issue draw two, could
   not compose a Trade Agreement, and had to mint one in SQL. ─────────────── */

describe("ServiceAgreementInstruments · the turnkey ledger door", () => {
  beforeEach(() => {
    mockCountersign.mockReset();
    mockReplay.mockReset();
    mockTerms = null;
    mockRates = [];
    mockParts = [];
    mockDocumentKind = undefined;
  });

  for (const state of ["sent", "client_signed", "executed"]) {
    it(`opens the Contract Room on a ${state} design-build prime`, () => {
      mockDocumentKind = "design_build";
      mockDocumentState = state;
      render(
        <ServiceAgreementInstruments
          proposal={{ id: "agreement-1", status: "sent", client: null }}
          clientName="Halvorsen"
        />,
      );
      expect(
        screen.getByRole("button", { name: "Open the Contract Room" }),
      ).toBeInTheDocument();
    });
  }

  it("keeps it shut on a design-services agreement that has left the studio", () => {
    mockDocumentKind = "design_services";
    mockDocumentState = "executed";
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", status: "sent", client: null }}
        clientName="Avery Client"
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Open the Contract Room" }),
    ).not.toBeInTheDocument();
  });

  it("keeps it shut on a turnkey prime nobody may act on any more", () => {
    mockDocumentKind = "design_build";
    mockDocumentState = "superseded";
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", status: "sent", client: null }}
        clientName="Halvorsen"
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Open the Contract Room" }),
    ).not.toBeInTheDocument();
  });

  it("still opens it on a draft, as it always has", () => {
    mockDocumentKind = "design_services";
    mockDocumentState = "draft";
    render(
      <ServiceAgreementInstruments
        proposal={{ id: "agreement-1", status: "draft", client: null }}
        clientName="Avery Client"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Open the Contract Room" }),
    ).toBeInTheDocument();
  });
});
