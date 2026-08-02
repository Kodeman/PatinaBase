import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  CustomCommissionWorkspace,
  type CommissionWorkspaceRevision,
  type CustomCommissionWorkspaceProps,
} from "./custom-commission-workspace";
import { EMPTY_COMMISSION_BRIEF } from "./custom-commission-model";

jest.mock("../../document-action", () => ({
  DocumentAction: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  DocumentActionGroup: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock("../room-sheet", () => ({
  RoomSheet: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div>{children}</div> : null),
}));

jest.mock("@/components/document/configuration-snapshot-card", () => ({
  ConfigurationSnapshotCard: () => <div>Configuration snapshot</div>,
}));

const completeBrief = {
  ...EMPTY_COMMISSION_BRIEF,
  projectId: "project-1",
  name: "Library wall cabinetry",
  scope: "Integrated desk and storage wall.",
  dimensions: {
    width: "156",
    depth: "24",
    height: "108",
    unit: "in" as const,
    siteNotes: "Field verify after flooring.",
  },
  material: "rift-sawn white oak",
  finish: "clear oil",
  fabricatorVendorId: "",
  fabricator: "Northstar Millwork",
  drawingReferences: ["A-602 rev 3"],
  allowance: "28500",
  priceOnRequest: false,
  quote: {
    reference: "NSM-Q-1042-R2",
    tradeAmount: "31840",
    retailAmount: "41200",
    validUntil: "2026-09-15",
    leadTimeWeeks: "14",
  },
};

function revision(
  status: CommissionWorkspaceRevision["status"],
  overrides: Partial<CommissionWorkspaceRevision> = {},
): CommissionWorkspaceRevision {
  return {
    id: "revision-2",
    configurationId: "configuration-1",
    revisionNumber: 2,
    status,
    brief: completeBrief,
    snapshot: { productName: "Library wall cabinetry" },
    snapshotHash: "sha256:revision-2",
    lockedAt: null,
    createdAt: "2026-08-02T12:00:00Z",
    ...overrides,
  };
}

function props(overrides: Partial<CustomCommissionWorkspaceProps> = {}) {
  return {
    open: true,
    onClose: jest.fn(),
    productName: "Library wall cabinetry",
    projects: [{ id: "project-1", name: "Hawthorn House" }],
    vendors: [],
    revisions: [revision("draft")],
    onSaveDraft: jest.fn().mockResolvedValue({
      configurationId: "configuration-1",
      revisionId: "revision-3",
    }),
    onTransition: jest.fn().mockResolvedValue(undefined),
    onPrepareQuoteRequest: jest.fn().mockResolvedValue({
      draftCreated: false,
      message:
        "Commission submitted. Match the named fabricator to a maker before creating the RFQ draft.",
    }),
    onPlaceApproved: jest.fn().mockResolvedValue(undefined),
    onPromote: jest.fn().mockResolvedValue(undefined),
    onStartNewCommission: jest.fn(),
    ...overrides,
  } satisfies CustomCommissionWorkspaceProps;
}

describe("CustomCommissionWorkspace revision safety", () => {
  it("records a quote and status in one atomic transition call", async () => {
    const value = props({ revisions: [revision("submitted")] });
    render(<CustomCommissionWorkspace {...value} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Record quote revision" }),
    );

    await waitFor(() =>
      expect(value.onTransition).toHaveBeenCalledWith("revision-2", "quoted", {
        note: "Quote recorded by designer",
        quote: completeBrief.quote,
      }),
    );
    expect(value.onTransition).toHaveBeenCalledTimes(1);
  });

  it("clears old approvals before forking an approved revision", async () => {
    const value = props({
      revisions: [
        revision("approved", {
          brief: {
            ...completeBrief,
            designerApproval: "approved",
            clientApproval: "approved",
          },
        }),
      ],
    });
    render(<CustomCommissionWorkspace {...value} />);

    fireEvent.click(screen.getByRole("button", { name: "Start new revision" }));

    await waitFor(() => expect(value.onSaveDraft).toHaveBeenCalledTimes(1));
    expect(value.onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        designerApproval: "pending",
        clientApproval: "pending",
      }),
      "revision-2",
    );
  });

  it("persists both approvals with the approved transition", async () => {
    const value = props({ revisions: [revision("client_review")] });
    render(<CustomCommissionWorkspace {...value} />);

    fireEvent.click(screen.getByLabelText("Designer approved"));
    fireEvent.click(screen.getByLabelText("Client approved"));
    fireEvent.click(
      screen.getByRole("button", { name: "Record both approvals" }),
    );

    await waitFor(() =>
      expect(value.onTransition).toHaveBeenCalledWith(
        "revision-2",
        "approved",
        {
          note: undefined,
          approval: { designerApproved: true, clientApproved: true },
        },
      ),
    );
  });

  it("records a review rejection before a replacement revision is started", async () => {
    const value = props({ revisions: [revision("client_review")] });
    render(<CustomCommissionWorkspace {...value} />);

    fireEvent.click(screen.getByRole("button", { name: "Request revision" }));

    await waitFor(() =>
      expect(value.onTransition).toHaveBeenCalledWith(
        "revision-2",
        "rejected",
        {
          note: undefined,
        },
      ),
    );
  });

  it("submits the commission but does not auto-send for a free-text maker", async () => {
    const value = props();
    render(<CustomCommissionWorkspace {...value} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Prepare quote request" }),
    );

    await waitFor(() =>
      expect(value.onTransition).toHaveBeenCalledWith(
        "revision-3",
        "submitted",
        {
          note: "Prepared for quote review",
        },
      ),
    );
    expect(value.onPrepareQuoteRequest).toHaveBeenCalledWith(
      "configuration-1",
      "revision-3",
      expect.objectContaining({
        fabricator: "Northstar Millwork",
        fabricatorVendorId: "",
      }),
    );
    expect(
      await screen.findByText(
        /Match the named fabricator to a maker before creating the RFQ draft/,
      ),
    ).toBeInTheDocument();
  });
});
