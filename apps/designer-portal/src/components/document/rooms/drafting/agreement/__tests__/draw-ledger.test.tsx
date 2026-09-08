/**
 * The draw ledger and the lien-waiver strip — P9 · P12 · P13, studio-side.
 *
 * Two rules matter more than the rest and both are pinned here:
 *
 *   · the DEPOSIT is never billed from the studio's side — it is offered to
 *     the homeowner on her own door the moment she signs (R15), and a "Bill
 *     this draw" button beside it would be a second, contradictory act;
 *   · issuing draw two or later notifies her (I-7); issuing the deposit
 *     never does, because she is already looking at it.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AgreementDraw } from "@patina/types";
import { DrawLedger, drawStanding } from "../turnkey/draw-ledger";
import { LienWaiverAttachments } from "../turnkey/lien-waiver-attachments";

const mockIssue = jest.fn();
const mockRecord = jest.fn();
const mockNotify = jest.fn();
const mockContacts = jest.fn();

jest.mock("@patina/supabase", () => ({
  useIssueAgreementDrawInvoice: () => ({
    mutateAsync: mockIssue,
    isPending: false,
  }),
  useRecordAgreementDrawLienWaiver: () => ({
    mutateAsync: mockRecord,
    isPending: false,
  }),
  useStudioContacts: () => mockContacts(),
}));

jest.mock("@/hooks/use-commercial-documents", () => ({
  useReplayCommercialNotification: () => ({
    mutateAsync: mockNotify,
    isPending: false,
  }),
}));

jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: {
    agreementDrawIssued: jest.fn(),
    agreementLienWaiverRecorded: jest.fn(),
  },
}));

function draw(
  input: Partial<AgreementDraw> & { drawKey: string },
): AgreementDraw {
  return {
    id: input.id ?? `draw-${input.drawKey}`,
    proposalId: "agreement-1",
    drawKey: input.drawKey,
    sortOrder: input.sortOrder ?? 0,
    label: input.label ?? input.drawKey,
    grossCents: input.grossCents ?? 2_524_020,
    retainageCents: input.retainageCents ?? 126_201,
    netCents: input.netCents ?? 2_397_819,
    isRetainageRelease: input.isRetainageRelease ?? false,
    invoiceId: input.invoiceId ?? null,
    invoiceStatus: input.invoiceStatus ?? null,
    issuedAt: input.issuedAt ?? null,
    lienWaivers: input.lienWaivers ?? [],
  };
}

const DEPOSIT = draw({
  drawKey: "deposit",
  label: "Deposit at signing",
  sortOrder: 0,
  grossCents: 841_340,
  retainageCents: 0,
  netCents: 841_340,
});
const ROUGH_IN = draw({ drawKey: "rough_in", label: "Rough-in", sortOrder: 1 });

beforeEach(() => {
  jest.clearAllMocks();
  mockIssue.mockResolvedValue({
    drawKey: "rough_in",
    label: "Rough-in",
    amountCents: 2_524_020,
    retainageCents: 126_201,
    netCents: 2_397_819,
    invoiceId: "invoice-2",
    invoiceStatus: "sent",
    payToken: "abc",
  });
  mockNotify.mockResolvedValue("delivered");
  mockContacts.mockReturnValue({
    data: [
      {
        id: "contact-1",
        company_name: "Kestrel Cabinetry LLC",
        full_name: null,
      },
    ],
    isLoading: false,
  });
});

describe("drawStanding", () => {
  it("says what has happened, in words", () => {
    expect(drawStanding(DEPOSIT)).toBe("Not yet billed");
    expect(drawStanding({ ...ROUGH_IN, invoiceId: "i" })).toBe("Sent");
    expect(
      drawStanding({ ...ROUGH_IN, invoiceId: "i", invoiceStatus: "paid" }),
    ).toBe("Paid");
  });
});

describe("the draw ledger", () => {
  it("says the ledger opens at send when there is nothing in it", () => {
    render(<DrawLedger proposalId="agreement-1" draws={[]} executed={false} />);
    expect(
      screen.getByText("The draw ledger opens when this agreement is sent."),
    ).toBeInTheDocument();
  });

  it("never offers to bill the deposit — that is the homeowner's door (R15)", () => {
    render(
      <DrawLedger
        proposalId="agreement-1"
        draws={[DEPOSIT, ROUGH_IN]}
        executed
      />,
    );
    const buttons = screen.getAllByRole("button", { name: "Bill this draw" });
    expect(buttons).toHaveLength(1);
  });

  it("holds every other draw until the studio has countersigned", () => {
    render(
      <DrawLedger
        proposalId="agreement-1"
        draws={[DEPOSIT, ROUGH_IN]}
        executed={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Bill this draw" }),
    ).not.toBeInTheDocument();
  });

  it("bills a draw net, and notifies the homeowner", async () => {
    render(
      <DrawLedger
        proposalId="agreement-1"
        draws={[DEPOSIT, ROUGH_IN]}
        executed
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bill this draw" }));
    await waitFor(() => expect(mockIssue).toHaveBeenCalledWith("rough_in"));
    expect(
      await screen.findByText("Rough-in is billed — $23,978.19."),
    ).toBeInTheDocument();
    expect(mockNotify).toHaveBeenCalledWith({
      documentId: "agreement-1",
      transition: "agreement_draw_ready",
      eventId: "draw-rough_in",
    });
  });

  it("shows the refusal rather than a half-billed draw", async () => {
    mockIssue.mockRejectedValue(new Error("draw 1 is not paid in full"));
    render(
      <DrawLedger
        proposalId="agreement-1"
        draws={[DEPOSIT, ROUGH_IN]}
        executed
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bill this draw" }));
    expect(
      await screen.findByText("draw 1 is not paid in full"),
    ).toBeInTheDocument();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("offers no act on a draw that already carries an invoice", () => {
    render(
      <DrawLedger
        proposalId="agreement-1"
        draws={[DEPOSIT, { ...ROUGH_IN, invoiceId: "invoice-2" }]}
        executed
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Bill this draw" }),
    ).not.toBeInTheDocument();
  });
});

describe("the lien-waiver strip", () => {
  it("records a waiver with the trade's name snapshot onto it", async () => {
    render(
      <LienWaiverAttachments
        proposalId="agreement-1"
        studioId="studio-1"
        draws={[ROUGH_IN]}
        recordedBy="designer-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Record a waiver" }));
    fireEvent.change(screen.getByLabelText("Trade for Rough-in"), {
      target: { value: "contact-1" },
    });
    fireEvent.change(screen.getByLabelText("Waiver kind for Rough-in"), {
      target: { value: "unconditional_progress" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() => expect(mockRecord).toHaveBeenCalled());
    const input = mockRecord.mock.calls[0][0];
    expect(input.drawId).toBe("draw-rough_in");
    expect(input.contactDisplayName).toBe("Kestrel Cabinetry LLC");
    expect(input.waiverType).toBe("unconditional_progress");
    expect(input.recordedBy).toBe("designer-1");
  });

  it("asks for the trade rather than recording an anonymous waiver", async () => {
    render(
      <LienWaiverAttachments
        proposalId="agreement-1"
        studioId="studio-1"
        draws={[ROUGH_IN]}
        recordedBy="designer-1"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Record a waiver" }));
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    expect(
      await screen.findByText("Pick the trade that gave this waiver."),
    ).toBeInTheDocument();
    expect(mockRecord).not.toHaveBeenCalled();
  });

  it("shows what a draw has already been given", () => {
    render(
      <LienWaiverAttachments
        proposalId="agreement-1"
        studioId="studio-1"
        draws={[
          {
            ...ROUGH_IN,
            lienWaivers: [
              {
                id: "waiver-1",
                drawId: "draw-rough_in",
                contactId: "contact-1",
                contactDisplayName: "Kestrel Cabinetry",
                waiverType: "conditional_progress",
                throughDate: null,
                amountCents: null,
                storagePath: null,
                receivedAt: "2026-09-08T00:00:00Z",
              },
            ],
          },
        ]}
        recordedBy="designer-1"
      />,
    );
    expect(
      screen.getByText("Kestrel Cabinetry · Conditional · progress"),
    ).toBeInTheDocument();
  });
});
