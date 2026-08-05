import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ProjectInstrumentView } from "@/lib/document/project-commerce";

const sendAuthorization = jest.fn();
const executeFurnishingsOnPaper = jest.fn();
let mockDrift: Record<string, unknown> = { data: new Map(), isLoading: false };
let mockCommercialDocument: Record<string, unknown> = { data: undefined, isLoading: false };

jest.mock("@patina/supabase", () => ({
  useProposalSendDispatchStatus: () => ({
    isLoading: false,
    isError: false,
    data: null,
  }),
  useRetryProposalSend: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

jest.mock("@/hooks/use-commercial-documents", () => ({
  useSendFurnishingsAuthorization: () => ({
    mutateAsync: sendAuthorization,
    isPending: false,
  }),
  useAuthorizationLineDrift: () => mockDrift,
  useCommercialDocument: () => mockCommercialDocument,
  // RecordOnPaperSheet mounts unconditionally and calls all four paper
  // hooks up front regardless of `kind` — stub every one.
  useRecordPaperClientSignature: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useExecuteFurnishingsAuthorizationOnPaper: () => ({
    mutateAsync: executeFurnishingsOnPaper,
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

jest.mock("./void-supersede-act", () => ({
  VoidAct: ({ instrument }: { instrument: { number: number } }) => (
    <div data-testid="void-act">Void act for № {instrument.number}</div>
  ),
}));

import { AuthorizationDetail } from "./authorization-detail";

const baseInstrument: ProjectInstrumentView = {
  documentId: "doc-1",
  proposalId: "proposal-1",
  number: 2,
  name: "Bedroom Lighting",
  kind: "furnishings_authorization",
  state: "executed",
  totalAmountCents: 300_000,
  depositPercent: 50,
  depositRequiredCents: 150_000,
  depositInvoiceId: "invoice-1",
  depositPaid: true,
  checkpointId: "checkpoint-1",
  coveredRoomIds: ["room-1"],
  executedAt: "2026-08-01T00:00:00Z",
  sentAt: "2026-07-30T00:00:00Z",
  proposalSendDispatchId: "dispatch-1",
  supersededByNumber: null,
  itemCount: 2,
  items: [
    {
      id: "item-1",
      sourceFfeItemId: "ffe-1",
      projectRoomId: "room-1",
      roomName: "Bedroom",
      name: "Pendant light",
      quantity: 2,
      clientUnitPriceCents: 100_000,
      clientLineTotalCents: 200_000,
      itemType: "lighting",
      sortOrder: 0,
    },
    {
      id: "item-2",
      sourceFfeItemId: "ffe-2",
      projectRoomId: "room-1",
      roomName: "Bedroom",
      name: "Table lamp",
      quantity: 1,
      clientUnitPriceCents: 100_000,
      clientLineTotalCents: 100_000,
      itemType: "lighting",
      sortOrder: 1,
    },
  ],
};

describe("AuthorizationDetail", () => {
  beforeEach(() => {
    sendAuthorization.mockReset();
    executeFurnishingsOnPaper.mockReset();
    mockDrift = { data: new Map(), isLoading: false };
    mockCommercialDocument = { data: undefined, isLoading: false };
  });

  it("renders nothing when there is no instrument to show", () => {
    const { container } = render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={null}
        open={false}
        onClose={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the figure band: authorized / deposit due / deposit paid / lines PO-ready", () => {
    render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={baseInstrument}
        open
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText("authorized")).toBeVisible();
    expect(screen.getByText("$3,000")).toBeVisible();
    expect(screen.getByText("deposit due")).toBeVisible();
    expect(screen.getByText("$1,500")).toBeVisible();
    expect(screen.getByText("deposit paid")).toBeVisible();
    expect(screen.getByText("Yes")).toBeVisible();
    expect(screen.getByText("lines PO-ready")).toBeVisible();
    // executed → both items are PO-ready
    expect(screen.getByText("lines PO-ready").nextSibling).toHaveTextContent("2");
  });

  it("counts zero lines PO-ready before the authorization is executed", () => {
    render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={{ ...baseInstrument, state: "sent" }}
        open
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText("lines PO-ready").nextSibling).toHaveTextContent("0");
  });

  it("shows the paper tell once executed, with the day written on the paper — not the day it was typed up", () => {
    mockCommercialDocument = {
      data: {
        signatures: [
          {
            party: "client", signerName: "Jamie Client", executedOnPaper: true,
            // The client signed in January; the studio recorded it in August.
            signedAt: "2026-08-05T14:20:00Z", paperSignedOn: "2026-01-15",
            paperScanDocumentId: null,
          },
        ],
      },
      isLoading: false,
    };
    render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={baseInstrument}
        open
        onClose={jest.fn()}
      />,
    );
    expect(
      screen.getByText("Signed Jan 15, 2026 on paper · recorded by the studio."),
    ).toBeVisible();
    expect(screen.queryByText(/Aug 5, 2026/)).not.toBeInTheDocument();
  });

  it("falls back to the undated phrase when a paper row carries no date", () => {
    mockCommercialDocument = {
      data: {
        signatures: [
          {
            party: "client", signerName: "Jamie Client", executedOnPaper: true,
            paperSignedOn: null, paperScanDocumentId: null,
          },
        ],
      },
      isLoading: false,
    };
    render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={baseInstrument}
        open
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText("Signed on paper · recorded by the studio.")).toBeVisible();
  });

  it("shows no paper tell for an ordinary online signature", () => {
    mockCommercialDocument = {
      data: {
        signatures: [
          { party: "client", signerName: "Jamie Client", executedOnPaper: false, paperScanDocumentId: null },
        ],
      },
      isLoading: false,
    };
    render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={baseInstrument}
        open
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByText("Signed on paper · recorded by the studio.")).not.toBeInTheDocument();
  });

  it("groups the what-was-signed table by room and shows the deposit invoice line, never a raw id", () => {
    render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={baseInstrument}
        open
        onClose={jest.fn()}
      />,
    );

    expect(screen.getByText("Bedroom")).toBeVisible();
    expect(screen.getByText("Pendant light")).toBeVisible();
    expect(screen.getByText("Table lamp")).toBeVisible();
    expect(screen.getByText(/deposit invoice on file/i)).toBeVisible();
    expect(screen.getByText(/linked to a budget checkpoint/i)).toBeVisible();
    expect(screen.queryByText(/invoice-1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/checkpoint-1/)).not.toBeInTheDocument();
  });

  it("shows an up delta glyph when the schedule's current total exceeds what was signed", () => {
    mockDrift = {
      data: new Map([
        ["ffe-1", { ffeItemId: "ffe-1", currentLineTotalCents: 250_000, currentStatus: "specified" }],
      ]),
      isLoading: false,
    };
    render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={baseInstrument}
        open
        onClose={jest.fn()}
      />,
    );

    expect(
      screen.getByLabelText(/schedule now reads \$500 higher/i),
    ).toBeVisible();
  });

  it("shows a down delta glyph when the schedule's current total is lower than what was signed", () => {
    mockDrift = {
      data: new Map([
        ["ffe-2", { ffeItemId: "ffe-2", currentLineTotalCents: 80_000, currentStatus: "specified" }],
      ]),
      isLoading: false,
    };
    render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={baseInstrument}
        open
        onClose={jest.fn()}
      />,
    );

    expect(
      screen.getByLabelText(/schedule now reads \$200 lower/i),
    ).toBeVisible();
  });

  it("renders no glyph for an item with no drift-comparable schedule row", () => {
    render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={baseInstrument}
        open
        onClose={jest.fn()}
      />,
    );
    expect(screen.queryByLabelText(/schedule now reads/i)).not.toBeInTheDocument();
  });

  it("offers Send for signature only while the authorization is a draft", () => {
    const { rerender } = render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={{ ...baseInstrument, state: "draft" }}
        open
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Send for signature" })).toBeVisible();

    rerender(
      <AuthorizationDetail
        projectId="project-1"
        instrument={baseInstrument}
        open
        onClose={jest.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Send for signature" }),
    ).not.toBeInTheDocument();
  });

  it("offers to record executed on paper only while sent, and records it", async () => {
    executeFurnishingsOnPaper.mockResolvedValue({
      notificationDelivery: "delivered",
    });
    const { rerender } = render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={{ ...baseInstrument, state: "draft" }}
        open
        onClose={jest.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Record the signature" }),
    ).not.toBeInTheDocument();

    rerender(
      <AuthorizationDetail
        projectId="project-1"
        instrument={{ ...baseInstrument, state: "sent" }}
        clientName="Harper Vale"
        open
        onClose={jest.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Record the signature" }),
    );

    // Parity with the design-services act: the sheet arrives already naming
    // the client, rather than asking the studio to retype a name the document
    // already knows.
    expect(await screen.findByLabelText("Signed by")).toHaveValue("Harper Vale");
    fireEvent.click(screen.getByRole("button", { name: "Record & execute" }));

    await waitFor(() =>
      expect(executeFurnishingsOnPaper).toHaveBeenCalledWith(
        expect.objectContaining({
          proposalId: "proposal-1",
          signedName: "Harper Vale",
        }),
      ),
    );
  });

  it("renders the Void act only while draft or sent — voiding an executed, declined, or superseded instrument is refused server-side", () => {
    const { rerender } = render(
      <AuthorizationDetail
        projectId="project-1"
        instrument={{ ...baseInstrument, state: "sent" }}
        open
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId("void-act")).toHaveTextContent("№ 2");

    for (const state of ["executed", "declined", "superseded"] as const) {
      rerender(
        <AuthorizationDetail
          projectId="project-1"
          instrument={{ ...baseInstrument, state }}
          open
          onClose={jest.fn()}
        />,
      );
      expect(screen.queryByTestId("void-act")).not.toBeInTheDocument();
    }
  });
});
