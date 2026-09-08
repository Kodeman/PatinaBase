/**
 * The Trade Agreements strip — P14, R16, R7.
 *
 * The three things worth pinning: the object is called a **Trade Agreement**
 * in every string a person reads, the eight essentials all reach
 * `create_trade_agreement`, and the browser never mints a token — sending
 * goes through the edge function, which is the only thing `service_role` will
 * mint for.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TradeAgreement } from "@patina/types";
import { TradeAgreementsStrip, NO_PROJECT_YET } from "./index";

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockSend = jest.fn();
const mockVoid = jest.fn();
const mockContacts = jest.fn();

jest.mock("@patina/supabase", () => ({
  useTradeAgreements: () => mockList(),
  useCreateTradeAgreement: () => ({
    mutateAsync: mockCreate,
    isPending: false,
  }),
  useSendTradeAgreement: () => ({ mutateAsync: mockSend, isPending: false }),
  useVoidTradeAgreement: () => ({ mutateAsync: mockVoid, isPending: false }),
  useStudioContacts: () => mockContacts(),
}));

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: { tradeAgreementSent: jest.fn() },
}));

function agreement(input: Partial<TradeAgreement> = {}): TradeAgreement {
  return {
    id: "ta-1",
    projectId: "project-1",
    sourceProposalId: "agreement-1",
    contactId: "contact-1",
    contactDisplayName: "Kestrel Cabinetry",
    contactCompanyName: "Kestrel Cabinetry LLC",
    contactEmail: "shop@kestrel.example",
    trade: "Cabinetry",
    title: "Cabinetry & millwork",
    scope: "Fabricate and install…",
    priceCents: 3_800_000,
    currency: "USD",
    schedule: { startOn: null, durationDays: 21, sequencing: null },
    retainageBps: 500,
    payWhenPaidDays: 7,
    insuranceCertificateRequired: true,
    lienWaiverPolicy: "conditional_then_unconditional",
    sovLineIds: [],
    state: "draft",
    sentAt: null,
    signedAt: null,
    voidedAt: null,
    hasLiveLink: false,
    subSignature: null,
    ...input,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockReturnValue({ data: [], isLoading: false });
  mockContacts.mockReturnValue({
    data: [
      {
        id: "contact-1",
        organization_id: "studio-1",
        entity_kind: "company",
        company_id: null,
        contact_kind: "sub",
        full_name: null,
        company_name: "Kestrel Cabinetry LLC",
        email: "shop@kestrel.example",
        phone: null,
        phone_e164: null,
        specialties: ["Cabinetry"],
        vendor_id: null,
        profile_id: null,
        created_by: null,
        notes: null,
        archived_at: null,
        created_at: "",
        updated_at: "",
      },
    ],
    isLoading: false,
  });
  mockCreate.mockResolvedValue("ta-2");
  mockSend.mockResolvedValue({
    recipient: "shop@kestrel.example",
    emailSent: true,
  });
});

function renderStrip(projectId: string | null = "project-1") {
  return render(
    <TradeAgreementsStrip
      projectId={projectId}
      studioId="studio-1"
      sourceProposalId="agreement-1"
    />,
  );
}

describe("the strip", () => {
  it("uses R7's word and never the other one", () => {
    const { container } = renderStrip();
    expect(screen.getByText("Trade Agreements")).toBeInTheDocument();
    expect(container.textContent?.toLowerCase()).not.toContain("subcontract");
  });

  it("says an origin agreement has no project yet, rather than showing nothing", () => {
    renderStrip(null);
    expect(screen.getByText(NO_PROJECT_YET)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "+ New Trade Agreement" }),
    ).not.toBeInTheDocument();
  });

  it("lists an agreement with the sub's own price", () => {
    mockList.mockReturnValue({ data: [agreement()], isLoading: false });
    renderStrip();
    expect(screen.getByText("Kestrel Cabinetry LLC")).toBeInTheDocument();
    expect(screen.getByText("$38,000.00")).toBeInTheDocument();
  });

  it("reads a signed agreement by its receipt, not by a badge", () => {
    mockList.mockReturnValue({
      data: [
        agreement({
          state: "signed",
          subSignature: { signedName: "Ada Kestrel", signedAt: "2026-09-08" },
        }),
      ],
      isLoading: false,
    });
    renderStrip();
    expect(screen.getByText(/Signed by Ada Kestrel/)).toBeInTheDocument();
  });

  it("offers no withdrawal on a signed agreement — it is superseded, never voided", () => {
    mockList.mockReturnValue({
      data: [agreement({ state: "signed" })],
      isLoading: false,
    });
    renderStrip();
    expect(
      screen.queryByRole("button", { name: "Withdraw" }),
    ).not.toBeInTheDocument();
  });

  it("asks twice before it withdraws", async () => {
    mockList.mockReturnValue({
      data: [agreement({ state: "sent", sentAt: "2026-09-07" })],
      isLoading: false,
    });
    renderStrip();
    fireEvent.click(screen.getByRole("button", { name: "Withdraw" }));
    expect(mockVoid).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Withdraw it — the link stops working",
      }),
    );
    await waitFor(() => expect(mockVoid).toHaveBeenCalled());
  });
});

describe("the composer", () => {
  it("sends all eight essentials, and no flow-down key (R16)", async () => {
    renderStrip();
    fireEvent.click(
      screen.getByRole("button", { name: "+ New Trade Agreement" }),
    );

    fireEvent.click(screen.getByRole("button", { name: /Kestrel Cabinetry/ }));
    const inputs = screen.getAllByRole("textbox");
    // 0 = rolodex search, 1 = title, 2 = scope, then sequencing.
    fireEvent.change(inputs[1], { target: { value: "Cabinetry & millwork" } });
    fireEvent.change(inputs[2], {
      target: { value: "Fabricate and install." },
    });
    fireEvent.change(screen.getByLabelText("Price dollars"), {
      target: { value: "38000" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save as a draft" }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.scope).toBe("Fabricate and install.");
    expect(payload.priceCents).toBe(3_800_000);
    expect(payload.schedule).toEqual({
      startOn: null,
      durationDays: null,
      sequencing: null,
    });
    expect(payload.retainageBps).toBe(500);
    expect(payload.payWhenPaidDays).toBe(7);
    expect(payload.insuranceCertificateRequired).toBe(true);
    expect(payload.lienWaiverPolicy).toBe("conditional_then_unconditional");
    expect(payload.sovLineIds).toEqual([]);
    // The flow-down clause is counsel-gated: no control offers it and the
    // composer never sends a key for it.
    expect(payload).not.toHaveProperty("flowDownClauseKey");
    // Saving a draft mints no token and sends no email.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("mints the link through the edge function, never in the browser", async () => {
    renderStrip();
    fireEvent.click(
      screen.getByRole("button", { name: "+ New Trade Agreement" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Kestrel Cabinetry/ }));
    const inputs = screen.getAllByRole("textbox");
    fireEvent.change(inputs[1], { target: { value: "Cabinetry & millwork" } });
    fireEvent.change(inputs[2], {
      target: { value: "Fabricate and install." },
    });
    fireEvent.change(screen.getByLabelText("Price dollars"), {
      target: { value: "38000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send to the trade" }));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith("ta-2"));
  });
});
