/**
 * R136 — the composer's houseless branch. Three things have to hold: the
 * choice is fail-closed behind the `studio-invoice` flag (never offered while
 * the flag is still resolving), choosing it puts the house-bound pull-through
 * sections away (S6), and the Draft act calls the studio RPC with the
 * household, the regarding line and the resolved studio (S4 · S12 · S8).
 */

import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { fireEvent, render as renderBare, screen, waitFor, within } from "@testing-library/react";
import { InvoiceComposer } from "../invoice-composer";
import { DocSheet } from "../../overlays/doc-sheet";
import { PaperFolioSheet } from "../../overlays/paper-folio-sheet";
import { OPEN_HOUSEHOLD_SHEET_EVENT } from "@/lib/document/registry";
import { selectViewerStudioId } from "@/hooks/use-viewer-studio";

// The composer is always drawn inside DocSheet's panel, a spotlight frame (US-36 K2).
function Frame({ children }: { children: ReactNode }) {
  return <div data-spotlight-frame="">{children}</div>;
}
const render = (ui: ReactElement) => renderBare(ui, { wrapper: Frame });
/** The spotlight's windows, by hold id, in order. */
const spotWindows = () =>
  Array.from(document.querySelectorAll("[data-hold-spotlight-window]")).map((el) =>
    el.getAttribute("data-hold-spotlight-window"),
  );
/** The reason line beside the held Draft act (K3), never the spotlight's own announcer. */
const reasonLine = () =>
  document.getElementById(
    screen.getByRole("button", { name: "Draft the invoice" }).getAttribute("aria-describedby") ?? "",
  );

const mockCreateStudioDraft = jest.fn();
const mockCreateDraft = jest.fn();
let mockFlag = { value: false, isLoading: false };
let mockOrganizations: Array<Record<string, unknown>> = [
  {
    id: "studio-1",
    name: "Middle West Studio",
    type: "design_studio",
    status: "active",
  },
];
let mockOrganizationsLoading = false;
let mockProjectClientId: string | null = "client-9";
let mockProjectStudioId: string | null = "studio-1";
let mockProjectDesignerId: string | null = "designer-1";
let mockProjectsUpdatedAt = 1;
let mockViewerId: string | null = "designer-1";
let mockStudioMembers: Array<Record<string, unknown>> = [];
let mockPathname = "/";
let mockExtraProjects: Array<Record<string, unknown>> = [];
let mockLinkHold: "not_permitted" | "lead_not_in_studio" | null | undefined = "not_permitted";
const mockStampStudio = jest.fn();

jest.mock("@patina/supabase", () => ({
  // Faithful to use-invoices: the composer reads `gap` off the refusal.
  InvoiceBillingGapError: class InvoiceBillingGapError extends Error {
    gap: string;
    constructor(gap: string, message = `billing gap: ${gap}`) {
      super(message);
      this.name = "InvoiceBillingGapError";
      this.gap = gap;
    }
  },
  useStampProjectPricingStudio: () => ({ mutate: mockStampStudio, isPending: false }),
  // K5 (00796) — document_client_link_hold, asked only off the lead.
  useDocumentClientLinkHold: (projectId: string | null) => ({
    data: projectId ? mockLinkHold : undefined,
  }),
  useSessionUserId: () => mockViewerId,
  useOrganizationMembers: (orgId: string) => ({
    data: orgId ? mockStudioMembers : undefined,
  }),
  // Faithful to use-organizations: the studios whose seat for this member
  // employs them (active, neither guest nor owner). A seat that names no
  // studio sits in studio-1.
  useStudiosEmployingMember: (studioIds: string[], userId: string | null) => ({
    data:
      studioIds.length > 0 && userId
        ? studioIds.filter((id) =>
            mockStudioMembers.some(
              (seat) =>
                (seat.organization_id ?? "studio-1") === id &&
                seat.user_id === userId &&
                seat.status === "active" &&
                seat.role !== "guest" &&
                seat.role !== "owner",
            ),
          )
        : undefined,
  }),
  useCreateDraftInvoice: () => ({
    mutateAsync: mockCreateDraft,
    isPending: false,
  }),
  useCreateDraftStudioInvoice: () => ({
    mutateAsync: mockCreateStudioDraft,
    isPending: false,
  }),
  useDeleteDraftInvoice: () => ({ mutateAsync: mockDeleteDraft, isPending: false }),
  useFfeInvoiceCoverage: () => ({ data: mockCoverage, isLoading: false }),
  // C-31 — the stage slots, the billing writer and the project's riders.
  useFfeInvoiceStageCoverage: () => ({ data: mockStages, isLoading: false }),
  useAddInvoiceBillingLines: () => ({ mutateAsync: mockAddBilling, isPending: false }),
  useProjectPoCostLines: (projectId: unknown) => ({
    data: projectId ? mockRiders : undefined,
    isLoading: false,
  }),
  useOrganizations: () => ({
    data: mockOrganizations,
    isLoading: mockOrganizationsLoading,
  }),
  useProjectFFEItems: () => ({ data: mockFfeItems, isLoading: false }),
  useProjectInvoices: () => ({ data: [] }),
  useProjectPaymentMilestones: () => ({ data: [] }),
  useProjects: () => ({
    data: [
      {
        id: "project-1",
        name: "Hollis House",
        status: "active",
        client_id: mockProjectClientId,
        studio_id: mockProjectStudioId,
        designer_id: mockProjectDesignerId,
        designer: { id: mockProjectDesignerId, display_name: "Leah Ames", full_name: "Leah Ames" },
      },
      ...mockExtraProjects,
    ],
    dataUpdatedAt: mockProjectsUpdatedAt,
  }),
  useClaimTimeEntries: () => ({ mutateAsync: mockClaimTime, isPending: false }),
  useSetLaborLinePrice: () => ({ mutate: jest.fn(), isPending: false }),
  useUnbilledTime: () => ({ data: { entries: mockUnbilledEntries, ratePendingEntries: mockRatePendingEntries }, isLoading: false }),
  // HT-21 (W5) — names the composer's time rows; unused by this suite's
  // studio-mode/empty-selection scenarios but called unconditionally.
  useProjectRoster: () => ({ data: mockRoster }),
  // C-25 — the purchases the "Bill N unbilled purchases" door asked for.
  useStudioPurchases: (filter: unknown) => ({
    data: filter ? mockPurchases : undefined,
    isLoading: false,
  }),
}));
let mockPurchases: Array<Record<string, unknown>> = [];
let mockRiders: Array<Record<string, unknown>> = [];
let mockFfeItems: Array<Record<string, unknown>> = [];
let mockCoverage: Record<string, unknown> | undefined = undefined;
let mockStages: Array<Record<string, unknown>> | undefined = undefined;
const mockAddBilling = jest.fn();
const mockDeleteDraft = jest.fn();
const mockClaimTime = jest.fn();
let mockUnbilledEntries: Array<Record<string, unknown>> = [];
let mockRatePendingEntries: Array<Record<string, unknown>> = [];
let mockRoster: Array<Record<string, unknown>> = [];

beforeEach(() => {
  mockCreateDraft.mockReset().mockResolvedValue({ id: "inv-1" });
  mockClaimTime.mockReset().mockResolvedValue([]);
  mockUnbilledEntries = [];
  mockRatePendingEntries = [];
  mockRoster = [];
  mockAddBilling.mockReset().mockResolvedValue([]);
  mockDeleteDraft.mockReset().mockResolvedValue(undefined);
  mockPurchases = [];
  mockRiders = [];
  mockProjectClientId = "client-9";
  mockProjectStudioId = "studio-1";
  mockProjectDesignerId = "designer-1";
  mockProjectsUpdatedAt = 1;
  mockViewerId = "designer-1";
  mockStudioMembers = [];
  mockPathname = "/";
  mockExtraProjects = [];
  mockStampStudio.mockReset();
  mockLinkHold = "not_permitted";
});

// The Link a client act opens the sheet in place only on its own project's
// document; everywhere else it is a link to the sheet's address.
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => mockPathname,
}));

jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => mockFlag,
}));

// The real picker reaches for useClients and a Radix portal; the composer's
// contract with it is one value in, one profiles.id out.
jest.mock("@/components/portal/client-picker", () => ({
  ClientPicker: ({ onChange }: { onChange: (id: string | null) => void }) => (
    <button type="button" onClick={() => onChange("client-1")}>
      pick household
    </button>
  ),
}));

const pickStudio = () =>
  fireEvent.change(screen.getByLabelText("For"), {
    target: { value: "__studio__" },
  });

describe("InvoiceComposer · the houseless choice is fail-closed", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag = { value: false, isLoading: false };
    mockOrganizations = [
      {
        id: "studio-1",
        name: "Middle West Studio",
        type: "design_studio",
        status: "active",
      },
    ];
    mockOrganizationsLoading = false;
  });

  it("offers no studio option while the flag is still resolving", () => {
    mockFlag = { value: true, isLoading: true };
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    expect(screen.queryByText("the studio · no house")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Project")).toBeInTheDocument();
  });

  it('offers no studio option with the flag off, and keeps the section named "the document"', () => {
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    expect(screen.queryByText("the studio · no house")).not.toBeInTheDocument();
    expect(screen.getByText("the document")).toBeInTheDocument();
  });

  it("never offers it to a project-scoped opener, flag on or not", () => {
    mockFlag = { value: true, isLoading: false };
    render(
      <InvoiceComposer
        context={{ projectId: "project-1" }}
        onDrafted={jest.fn()}
      />,
    );
    expect(screen.queryByText("the studio · no house")).not.toBeInTheDocument();
  });
});

describe("InvoiceComposer · purchases at cost, through the billing writer (C-25, C-31)", () => {
  const purchase = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    status: "recorded",
    billable_to_client: true,
    invoice_line_id: null,
    payee_name: "CB2",
    description: "Pair of table lamps",
    purchased_on: "2026-10-03",
    amount_cents: 120050,
    tax_cents: 9600,
    buyer_premium_cents: 0,
    shipping_cents: 0,
    ...extra,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag = { value: false, isLoading: false };
    mockPurchases = [
      purchase("p1"),
      purchase("p2", { description: null, payee_name: "Estate sale" }),
      purchase("billed", { invoice_line_id: "il-1" }),
    ];
  });

  it("ticks the asked-for purchases and bills each on its own line at cost", async () => {
    const onDrafted = jest.fn();
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialPurchaseIds: ["p1", "billed"] }}
        onDrafted={onDrafted}
      />,
    );
    const block = screen.getByTestId("composer-purchases");
    expect(block).toHaveTextContent("Pair of table lamps");
    expect(block).toHaveTextContent("cost $1,296.50");
    // Every unbilled purchase is offered; only the asked-for one arrives ticked.
    expect(block).toHaveTextContent("Estate sale");
    expect(screen.getByLabelText("Bill Pair of table lamps")).toBeChecked();
    expect(screen.getByLabelText("Bill Estate sale")).not.toBeChecked();
    // A stamped purchase is never offered.
    expect(block.querySelectorAll("[data-at-cost-row]")).toHaveLength(2);
    expect(screen.getByLabelText("Billed amount · Pair of table lamps")).toHaveValue("1296.50");

    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
    await waitFor(() => expect(onDrafted).toHaveBeenCalledWith("inv-1", "project-1"));
    expect(mockCreateDraft.mock.calls[0][0].lines).toEqual([]);
    expect(mockAddBilling).toHaveBeenCalledWith({
      invoiceId: "inv-1",
      projectId: "project-1",
      lines: [{ purchaseId: "p1" }],
    });
  });

  it("SQ-448: warns when a ticked purchase's line is already billed on another invoice", () => {
    mockPurchases = [
      purchase("p1", { ffe_item_id: "line-sofa" }),
      purchase("p2", { description: "Brass hooks" }),
    ];
    mockStages = [
      {
        ffe_item_id: "line-sofa",
        billing_stage: "full",
        billing_stage_pct: null,
        invoice_id: "inv-a",
        invoice_number: "INV-0042",
        invoice_status: "sent",
        billed_cents: 450000,
      },
    ];
    try {
      render(
        <InvoiceComposer
          context={{ projectId: "project-1", initialPurchaseIds: ["p1"] }}
          onDrafted={jest.fn()}
        />,
      );
      const block = screen.getByTestId("composer-purchases");
      expect(block).toHaveTextContent(
        "a ticked purchase was bought for a line this or another invoice bills · billing both bills the piece twice",
      );
      // Warn-only (00709 R8/R9): the draft act stays open.
      expect(screen.getByRole("button", { name: "Draft the invoice" })).toBeEnabled();
      // Unticked, the warning folds away.
      fireEvent.click(screen.getByLabelText("Bill Pair of table lamps"));
      expect(block).not.toHaveTextContent("bills the piece twice");
    } finally {
      mockStages = undefined;
    }
  });

  it("SQ-448: stays quiet when the purchase's line has no live billing slot", () => {
    mockPurchases = [purchase("p1", { ffe_item_id: "line-sofa" })];
    mockStages = [];
    try {
      render(
        <InvoiceComposer
          context={{ projectId: "project-1", initialPurchaseIds: ["p1"] }}
          onDrafted={jest.fn()}
        />,
      );
      expect(screen.getByLabelText("Bill Pair of table lamps")).toBeChecked();
      expect(screen.getByTestId("composer-purchases")).not.toHaveTextContent("bills the piece twice");
    } finally {
      mockStages = undefined;
    }
  });

  it("sends an overridden figure as amountCents (R-PB7)", async () => {
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialPurchaseIds: ["p1"] }}
        onDrafted={jest.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Billed amount · Pair of table lamps"), {
      target: { value: "1,500" },
    });
    // The running total follows the billed figure, not the cost.
    expect(screen.getAllByText("$1,500.00").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
    await waitFor(() => expect(mockAddBilling).toHaveBeenCalledTimes(1));
    expect(mockAddBilling.mock.calls[0][0].lines).toEqual([
      { purchaseId: "p1", amountCents: 150_000 },
    ]);
  });

  it("deletes the draft when the writer refuses a line, unticks just that line, and says why beside it", async () => {
    // The PostgrestError's own words: the RPC's name and the purchase's id.
    mockAddBilling.mockRejectedValueOnce({
      message: "add_invoice_billing_lines: purchase p1 is already billed",
    });
    const onDrafted = jest.fn();
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialPurchaseIds: ["p1", "p2"] }}
        onDrafted={onDrafted}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
    // F5 — the refusal in the composer's words, naming the purchase by the
    // label it was printed under: no RPC name, no id — and beside its row.
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Pair of table lamps is already on another invoice. Nothing was billed.",
    );
    expect(alert).not.toHaveTextContent(/add_invoice_billing_lines|\bp1\b/);
    const refusedRow = screen.getByLabelText("Bill Pair of table lamps").closest("[data-at-cost-row]");
    expect(refusedRow?.nextElementSibling).toBe(alert);
    // The draft is gone and never handed on as if it had gone through.
    expect(mockDeleteDraft).toHaveBeenCalledWith({ invoiceId: "inv-1", projectId: "project-1" });
    expect(onDrafted).not.toHaveBeenCalled();
    // Only the refused line is unticked; the rest stays for the next draft.
    expect(screen.getByLabelText("Bill Pair of table lamps")).not.toBeChecked();
    expect(screen.getByLabelText("Bill Estate sale")).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
    await waitFor(() => expect(onDrafted).toHaveBeenCalledWith("inv-1", "project-1"));
    expect(mockAddBilling.mock.calls[1][0].lines).toEqual([{ purchaseId: "p2" }]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("unticks nothing when the draft it refused could not be deleted, and says so at the act", async () => {
    mockAddBilling.mockRejectedValue({
      message: "add_invoice_billing_lines: purchase p1 is already billed",
    });
    mockDeleteDraft.mockRejectedValue(new Error("network error"));
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialPurchaseIds: ["p1", "p2"] }}
        onDrafted={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pair of table lamps is already on another invoice. Nothing was billed; the draft was kept. Delete or void it.",
    );
    expect(screen.getByLabelText("Bill Pair of table lamps")).toBeChecked();
    expect(screen.getByLabelText("Bill Estate sale")).toBeChecked();
  });

  // SQ-1289 F3 — the kept draft is known and incomplete: Draft holds for the
  // composer's life, as an unconfirmed one does, and routes to the invoices.
  it.each([
    [
      "claim",
      "Some of these hours were just billed on another invoice. Nothing was billed; the draft still holds those hours. Void it to release them.",
    ],
    ["lines", "Pair of table lamps is already on another invoice. Nothing was billed; the draft was kept. Delete or void it."],
  ] as const)(
    "a stranded %s rollback holds the primary Draft: pressing it creates nothing and lights Check the invoices",
    async (step, stranded) => {
      if (step === "claim") {
        mockUnbilledEntries = [
          { id: "te-1", user_id: "designer-1", duration_minutes: 120, amount_cents: 30000, started_at: "2026-10-01T15:00:00Z" },
        ];
        mockClaimTime.mockRejectedValue(
          new Error(
            "Time entry 5b1f0c7e-0000-4000-8000-000000000001 is attached to invoice 9a2e4d10-0000-4000-8000-000000000003; only notes (and detaching the invoice) may change.",
          ),
        );
      } else {
        mockAddBilling.mockRejectedValue({
          message: "add_invoice_billing_lines: purchase p1 is already billed",
        });
      }
      mockDeleteDraft.mockRejectedValue(new Error("network error"));
      const onDrafted = jest.fn();
      render(
        <InvoiceComposer
          context={
            step === "claim"
              ? { projectId: "project-1", initialTimeEntryIds: ["te-1"] }
              : { projectId: "project-1", initialPurchaseIds: ["p1", "p2"] }
          }
          onDrafted={onDrafted}
        />,
      );
      const act = () => screen.getByRole("button", { name: "Draft the invoice" });
      await waitFor(() => expect(act()).not.toHaveAttribute("aria-disabled"));
      fireEvent.click(act());
      expect(await screen.findByRole("alert")).toHaveTextContent(stranded);
      expect(mockCreateDraft).toHaveBeenCalledTimes(1);

      // Held before the press, its fix in view; hiding Try again is not the gate.
      expect(act()).toHaveAttribute("aria-disabled", "true");
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Check the invoices" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();

      fireEvent.click(act());
      await waitFor(() => expect(spotWindows()).toContain("draft-unconfirmed"));
      expect(reasonLine()).toHaveTextContent(stranded);
      expect(mockCreateDraft).toHaveBeenCalledTimes(1);
      expect(onDrafted).not.toHaveBeenCalled();
    },
  );
});

describe("InvoiceComposer · riders at cost (C-31)", () => {
  const rider = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    kind: "white_glove",
    note: null,
    billable_to_client: true,
    invoice_line_id: null,
    estimate_cents: 45_000,
    actual_cents: null,
    purchase_order: { id: "po-1", po_number: "1042", project_id: "project-1" },
    ...extra,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag = { value: false, isLoading: false };
    mockRiders = [
      rider("r1", { actual_cents: 52_000 }),
      rider("r2", { kind: "liftgate", estimate_cents: null }),
      rider("billed", { invoice_line_id: "il-9" }),
      rider("overhead", { billable_to_client: false }),
    ];
  });

  it("bills each asked-for rider on its own line, at actual cost", async () => {
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialCostLineIds: ["r1"] }}
        onDrafted={jest.fn()}
      />,
    );
    const block = screen.getByTestId("composer-riders");
    expect(block.querySelectorAll("[data-at-cost-row]")).toHaveLength(2);
    expect(block).toHaveTextContent("White Glove");
    expect(block).toHaveTextContent("PO 1042");
    expect(block).toHaveTextContent("cost $520.00");
    expect(screen.getByLabelText("Bill White Glove")).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
    await waitFor(() => expect(mockAddBilling).toHaveBeenCalledTimes(1));
    expect(mockAddBilling.mock.calls[0][0].lines).toEqual([{ costLineId: "r1" }]);
  });

  it("holds the draft until a rider with no figure is given one", async () => {
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialCostLineIds: ["r2"] }}
        onDrafted={jest.fn()}
      />,
    );
    const act = screen.getByRole("button", { name: "Draft the invoice" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act).not.toBeDisabled();
    fireEvent.change(screen.getByLabelText("Billed amount · Liftgate"), {
      target: { value: "175" },
    });
    expect(act).toBeEnabled();
    fireEvent.click(act);
    await waitFor(() => expect(mockAddBilling).toHaveBeenCalledTimes(1));
    expect(mockAddBilling.mock.calls[0][0].lines).toEqual([
      { costLineId: "r2", amountCents: 17_500 },
    ]);
  });
});

describe("InvoiceComposer · deposit, then balance (C-31)", () => {
  const SOFA = {
    id: "f1",
    name: "Bespoke sofa",
    quantity: 2,
    unit_price_cents: 100_000,
    room: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag = { value: false, isLoading: false };
    mockFfeItems = [SOFA];
  });

  it("bills a ticked line as a deposit of the entered percent", async () => {
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialFfeItemIds: ["f1"] }}
        onDrafted={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("as a deposit of"));
    fireEvent.change(screen.getByLabelText("Deposit percent"), {
      target: { value: "40" },
    });
    expect(screen.getByText(/deposit \$800\.00\s+of/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
    await waitFor(() => expect(mockAddBilling).toHaveBeenCalledTimes(1));
    expect(mockCreateDraft.mock.calls[0][0].lines).toEqual([]);
    expect(mockAddBilling.mock.calls[0][0].lines).toEqual([
      { ffeItemId: "f1", stage: "deposit", depositPct: 40 },
    ]);
  });

  it("refuses a deposit percent the writer would refuse", () => {
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialFfeItemIds: ["f1"] }}
        onDrafted={jest.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("as a deposit of"));
    fireEvent.change(screen.getByLabelText("Deposit percent"), {
      target: { value: "120" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("a percent above 0, at most 100");
    expect(screen.getByRole("button", { name: "Draft the invoice" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Draft the invoice" })).not.toBeDisabled();
  });

  it("offers the balance of a deposited line, showing what it has had billed", async () => {
    mockCoverage = {
      f1: {
        coverage: "invoiced",
        invoiceId: "inv-0",
        invoiceNumber: "0217",
        invoiceStatus: "paid",
        billedCents: 100_000,
      },
    };
    mockStages = [
      {
        ffe_item_id: "f1",
        billing_stage: "deposit",
        billing_stage_pct: 50,
        invoice_line_id: "il-0",
        invoice_id: "inv-0",
        invoice_number: "0217",
        invoice_status: "paid",
        billed_cents: 100_000,
        coverage: "paid",
      },
    ];
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialFfeItemIds: ["f1"] }}
        onDrafted={jest.fn()}
      />,
    );
    const block = screen.getByTestId("composer-balances");
    expect(block).toHaveTextContent("deposit 50% · №0217 · paid");
    expect(block).toHaveTextContent("$1,000.00");
    expect(within(block).getByRole("checkbox")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
    await waitFor(() => expect(mockAddBilling).toHaveBeenCalledTimes(1));
    expect(mockAddBilling.mock.calls[0][0].lines).toEqual([
      { ffeItemId: "f1", stage: "balance" },
    ]);
  });

  afterEach(() => {
    mockFfeItems = [];
    mockCoverage = undefined;
    mockStages = undefined;
  });
});

describe("InvoiceComposer · an allowance with no price yet (F21)", () => {
  const TABLE = {
    id: "f1",
    name: "Dining table, walnut",
    quantity: 1,
    unit_price_cents: 680_000,
    product_id: "p-table",
    item_type: "fixed",
    room: { name: "Dining" },
  };
  const RUG = {
    id: "rug",
    name: "Area rug, 9 × 12",
    quantity: 1,
    unit_price_cents: 0,
    product_id: null,
    item_type: "allowance",
    budget_max_cents: 450_000,
    room: { name: "Living Room" },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag = { value: false, isLoading: false };
    mockFfeItems = [TABLE, RUG];
  });

  afterEach(() => {
    mockFfeItems = [];
  });

  it("lists it by its ceiling, unselectable, and never drafts it", async () => {
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialFfeItemIds: ["f1", "rug"] }}
        onDrafted={jest.fn()}
      />,
    );
    const row = screen.getByTestId("composer-unfilled-allowance");
    expect(row).toHaveTextContent("Area rug, 9 × 12");
    expect(row).toHaveTextContent("Up to $4,500 · bills once it's filled");
    expect(row).not.toHaveTextContent("$0.00");
    const box = within(row).getByRole("checkbox");
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();
    expect(screen.queryByTestId("composer-billed")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
    await waitFor(() => expect(mockCreateDraft).toHaveBeenCalledTimes(1));
    const ffeIds = mockCreateDraft.mock.calls[0][0].lines
      .map((l: { ffeItemId?: string }) => l.ffeItemId)
      .filter(Boolean);
    expect(ffeIds).toEqual(["f1"]);
  });

  it("bills it at its real price once it's filled", () => {
    mockFfeItems = [{ ...RUG, unit_price_cents: 410_000, product_id: "p-rug" }];
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialFfeItemIds: ["rug"] }}
        onDrafted={jest.fn()}
      />,
    );
    expect(screen.queryByTestId("composer-unfilled-allowance")).not.toBeInTheDocument();
    const row = screen.getByText("Area rug, 9 × 12").closest("label") as HTMLElement;
    expect(row).toHaveTextContent("$4,100.00");
    expect(within(row).getByRole("checkbox")).toBeChecked();
  });
});

describe("InvoiceComposer · studio mode", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag = { value: true, isLoading: false };
    mockOrganizations = [
      {
        id: "studio-1",
        name: "Middle West Studio",
        type: "design_studio",
        status: "active",
      },
    ];
    mockOrganizationsLoading = false;
  });

  it("puts the house-bound sections away and asks for the household and the regarding line", () => {
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    expect(screen.getByText("for")).toBeInTheDocument();

    pickStudio();

    expect(
      screen.queryByText("payment milestones · unbilled"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("unbilled time")).not.toBeInTheDocument();
    expect(screen.queryByText(/ff&e · uninvoiced/i)).not.toBeInTheDocument();
    expect(screen.getByText("household")).toBeInTheDocument();
    expect(screen.getByText("regarding")).toBeInTheDocument();
    expect(screen.getByText("ad-hoc lines")).toBeInTheDocument();
  });

  it("stays silent about the studio when the designer belongs to only one", () => {
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();
    expect(screen.queryByLabelText("Studio")).not.toBeInTheDocument();
  });

  it("asks which studio when the designer belongs to two (S8)", () => {
    mockOrganizations = [
      {
        id: "studio-1",
        name: "Middle West Studio",
        type: "design_studio",
        status: "active",
      },
      {
        id: "studio-2",
        name: "Verona Interiors",
        type: "design_studio",
        status: "active",
      },
    ];
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();
    expect(screen.getByLabelText("Studio")).toBeInTheDocument();
  });

  // 00571 draws only against an ACTIVE, NON-GUEST membership. A guest studio
  // offered here is an option whose only answer is `insufficient_privilege`.
  it("never offers a studio the designer is only a guest of", () => {
    mockOrganizations = [
      {
        id: "studio-1",
        name: "Middle West Studio",
        type: "design_studio",
        status: "active",
        membership: { role: "owner", status: "active" },
      },
      {
        id: "studio-guest",
        name: "Arden & Co.",
        type: "design_studio",
        status: "active",
        membership: { role: "guest", status: "active" },
      },
    ];
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();

    // One studio left, so the line is not drawn at all (S8).
    expect(screen.queryByLabelText("Studio")).not.toBeInTheDocument();
    expect(screen.queryByText("Arden & Co.")).not.toBeInTheDocument();
  });

  it("keeps the name sort once a guest studio is dropped from the list", () => {
    mockOrganizations = [
      {
        id: "studio-2",
        name: "Verona Interiors",
        type: "design_studio",
        status: "active",
        membership: { role: "member", status: "active" },
      },
      {
        id: "studio-guest",
        name: "Arden & Co.",
        type: "design_studio",
        status: "active",
        membership: { role: "guest", status: "active" },
      },
      {
        id: "studio-1",
        name: "Middle West Studio",
        type: "design_studio",
        status: "active",
        membership: { role: "owner", status: "active" },
      },
    ];
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();

    const select = screen.getByLabelText("Studio") as HTMLSelectElement;
    expect(
      Array.from(select.options).map((option) => option.textContent),
    ).toEqual(["Middle West Studio", "Verona Interiors"]);
    expect(select.value).toBe("studio-1");
  });

  // 00571 bounds the regarding line at 200 characters; the field says so
  // rather than letting the draw be refused on a title already typed.
  it("bounds the regarding line at the 200 characters 00571 allows", () => {
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();

    expect(
      screen.getByPlaceholderText("Design consultation · Sept 2026"),
    ).toHaveAttribute("maxLength", "200");
  });

  it("holds the Draft act until household, regarding and a priced line are all there", () => {
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();

    const act = () => screen.getByRole("button", { name: "Draft the invoice" });
    expect(act()).toHaveAttribute("aria-disabled", "true");
    expect(act()).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "pick household" }));
    expect(act()).toHaveAttribute("aria-disabled", "true");
    expect(act()).not.toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText("Design consultation · Sept 2026"),
      {
        target: { value: "Design consultation · 12 Sept 2026" },
      },
    );
    expect(act()).toHaveAttribute("aria-disabled", "true");
    expect(act()).not.toBeDisabled();

    fireEvent.change(screen.getByLabelText("Line description"), {
      target: { value: "Design consultation, on site (2 h)" },
    });
    fireEvent.change(screen.getByLabelText("Unit price (dollars)"), {
      target: { value: "450" },
    });
    expect(act()).toBeEnabled();
  });

  it("draws through the studio RPC and hands the folio a draft with no house", async () => {
    mockCreateStudioDraft.mockResolvedValue("invoice-77");
    const onDrafted = jest.fn();
    render(<InvoiceComposer context={{}} onDrafted={onDrafted} />);
    pickStudio();

    fireEvent.click(screen.getByRole("button", { name: "pick household" }));
    fireEvent.change(
      screen.getByPlaceholderText("Design consultation · Sept 2026"),
      {
        target: { value: "  Design consultation · 12 Sept 2026  " },
      },
    );
    fireEvent.change(screen.getByLabelText("Line description"), {
      target: { value: "Design consultation, on site (2 h)" },
    });
    fireEvent.change(screen.getByLabelText("Unit price (dollars)"), {
      target: { value: "450" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));

    await waitFor(() => expect(mockCreateStudioDraft).toHaveBeenCalledTimes(1));
    expect(mockCreateStudioDraft).toHaveBeenCalledWith({
      clientId: "client-1",
      studioId: "studio-1",
      title: "Design consultation · 12 Sept 2026",
      taxRate: 0,
      paymentTermsDays: 15,
      memo: undefined,
      lines: [
        {
          kind: "adhoc",
          description: "Design consultation, on site (2 h)",
          quantity: 1,
          unitAmountCents: 45_000,
          sortOrder: 0,
        },
      ],
      // SQ-1262 F2 — the act's lifetime rides with the write.
      signal: expect.any(AbortSignal),
    });
    expect(mockCreateDraft).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(onDrafted).toHaveBeenCalledWith("invoice-77", null),
    );
  });

  it("speaks the absence, rather than dead-ending, when there is no studio at all", () => {
    mockOrganizations = [];
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();

    fireEvent.click(screen.getByRole("button", { name: "pick household" }));
    fireEvent.change(
      screen.getByPlaceholderText("Design consultation · Sept 2026"),
      {
        target: { value: "Design consultation · 12 Sept 2026" },
      },
    );
    fireEvent.change(screen.getByLabelText("Line description"), {
      target: { value: "Design consultation, on site (2 h)" },
    });
    fireEvent.change(screen.getByLabelText("Unit price (dollars)"), {
      target: { value: "450" },
    });

    expect(
      screen.getByText(
        "no studio to draw from · this account belongs to none yet",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Draft the invoice" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Draft the invoice" })).not.toBeDisabled();
    expect(screen.queryByLabelText("Studio")).not.toBeInTheDocument();
  });

  it("stays silent about a missing studio while the roster is still loading", () => {
    mockOrganizations = [];
    mockOrganizationsLoading = true;
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();

    expect(
      screen.queryByText(
        "no studio to draw from · this account belongs to none yet",
      ),
    ).not.toBeInTheDocument();
  });

  it("holds a client-less project, explains the fix, and focuses Link a client", async () => {
    mockProjectClientId = null;
    render(
      <InvoiceComposer context={{ projectId: "project-1" }} onDrafted={jest.fn()} />,
    );
    const act = screen.getByRole("button", { name: "Draft the invoice" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act).not.toBeDisabled();
    expect(screen.getByText("Hollis House has no client yet. Link one to bill it.")).toBeInTheDocument();
    fireEvent.click(act);
    expect(reasonLine()).toHaveTextContent("Link a client before drafting this invoice.");
    expect(spotWindows()).toEqual(["link-client", "invoice-lines"]);
    await waitFor(() => expect(screen.getByRole("link", { name: "Link a client" })).toHaveFocus());
  });

  it("allows a complete project to draft when it has a billable line", () => {
    mockFfeItems = [{ id: "ffe-1", name: "Side table", quantity: 1, unit_price_cents: 12000, room: null }];
    render(
      <InvoiceComposer context={{ projectId: "project-1", initialFfeItemIds: ["ffe-1"] }} onDrafted={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Draft the invoice" })).toBeEnabled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// US-35 repairs (SQ-1028) — the held act says what holds it, lands on the fix,
// and never offers a door the server would shut.
// ─────────────────────────────────────────────────────────────────────────────

describe("InvoiceComposer · held, said and landed (US-35)", () => {
  const SIDE_TABLE = { id: "ffe-1", name: "Side table", quantity: 1, unit_price_cents: 12000, room: null };
  const LAMPS = {
    id: "p1",
    status: "recorded",
    billable_to_client: true,
    invoice_line_id: null,
    payee_name: "CB2",
    description: "Pair of table lamps",
    purchased_on: "2026-10-03",
    amount_cents: 120050,
    tax_cents: 9600,
    buyer_premium_cents: 0,
    shipping_cents: 0,
  };
  const studioWith = (role: string) => [
    {
      id: "studio-1",
      name: "Middle West Studio",
      type: "design_studio",
      status: "active",
      membership: { role, status: "active" },
    },
  ];
  const GapError = () =>
    jest.requireMock("@patina/supabase").InvoiceBillingGapError as new (
      gap: string,
      message?: string,
    ) => Error;
  const act = () => screen.getByRole("button", { name: "Draft the invoice" });
  const composer = (context: Record<string, unknown> = { projectId: "project-1" }) => (
    <InvoiceComposer context={context} onDrafted={jest.fn()} />
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockFlag = { value: false, isLoading: false };
    mockOrganizations = [
      { id: "studio-1", name: "Middle West Studio", type: "design_studio", status: "active" },
    ];
    mockOrganizationsLoading = false;
    mockFfeItems = [];
    mockCoverage = undefined;
    mockStages = undefined;
  });

  it("F3: keeps the server's gap past the next render, until a newer projects read shows it filled", async () => {
    mockFfeItems = [SIDE_TABLE];
    const Gap = GapError();
    mockCreateDraft.mockRejectedValue(new Gap("client", "This project has no client yet. Link one to bill it."));
    const context = { projectId: "project-1", initialFfeItemIds: ["ffe-1"] };
    const view = render(composer(context));
    // The cached project still says linked; the server says otherwise.
    expect(act()).toBeEnabled();
    fireEvent.click(act());
    expect(await screen.findByText("Hollis House has no client yet. Link one to bill it.")).toBeInTheDocument();

    view.rerender(composer(context));
    expect(act()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Hollis House has no client yet. Link one to bill it.")).toBeInTheDocument();

    // The refetch the refusal asked for comes back with the client linked.
    mockProjectsUpdatedAt = 2;
    view.rerender(composer(context));
    await waitFor(() => expect(act()).toBeEnabled());
    expect(screen.queryByText(/has no client yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("F1/F9: the lead's Link a client opens the sheet in place on its document, keeping the draft", () => {
    mockProjectClientId = null;
    mockPathname = "/doc/project-1";
    const opened = jest.fn();
    window.addEventListener(OPEN_HOUSEHOLD_SHEET_EVENT, opened);
    try {
      const view = render(composer());
      fireEvent.change(screen.getByLabelText("Line description"), { target: { value: "Design fee" } });
      fireEvent.change(screen.getByLabelText("Unit price (dollars)"), { target: { value: "450" } });
      fireEvent.change(screen.getByLabelText("memo · shown to the client"), { target: { value: "Thank you" } });

      const link = screen.getByRole("link", { name: "Link a client" });
      expect(link).toHaveAttribute("href", "/doc/project-1?sheet=household");
      // Default prevented: no navigation, the folio and its draft stay put.
      expect(fireEvent.click(link)).toBe(false);
      expect(opened).toHaveBeenCalledTimes(1);
      // The sheet captures the opener as its return point.
      expect(link).toHaveFocus();

      // Linked in the sheet: the projects read refreshes underneath.
      mockProjectClientId = "client-9";
      mockProjectsUpdatedAt = 2;
      view.rerender(composer());
      expect(act()).toBeEnabled();
      expect(screen.getByLabelText("Line description")).toHaveValue("Design fee");
      expect(screen.getByLabelText("memo · shown to the client")).toHaveValue("Thank you");
    } finally {
      window.removeEventListener(OPEN_HOUSEHOLD_SHEET_EVENT, opened);
    }
  });

  it("F2: off its document, Link a client walks to the sheet's address instead", () => {
    mockProjectClientId = null;
    mockPathname = "/desk";
    const opened = jest.fn();
    // Records whether the click was left to walk, then stops jsdom, which
    // cannot navigate.
    let walked: boolean | null = null;
    const stopNavigation = (e: MouseEvent) => {
      walked = !e.defaultPrevented;
      e.preventDefault();
    };
    window.addEventListener(OPEN_HOUSEHOLD_SHEET_EVENT, opened);
    window.addEventListener("click", stopNavigation);
    try {
      render(composer());
      const link = screen.getByRole("link", { name: "Link a client" });
      expect(link).toHaveAttribute("href", "/doc/project-1?sheet=household");
      fireEvent.click(link);
      expect(walked).toBe(true);
      expect(opened).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(OPEN_HOUSEHOLD_SHEET_EVENT, opened);
      window.removeEventListener("click", stopNavigation);
    }
  });

  it("K5: anyone the server won't admit is told to ask the lead, with a note to copy and no Link act", () => {
    mockProjectClientId = null;
    mockViewerId = "co-member-2";
    mockLinkHold = "not_permitted";
    render(composer());
    expect(screen.getByText("Hollis House has no client yet. Ask Leah Ames to link one.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Link a client" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy a note" })).toBeInTheDocument();
    fireEvent.click(act());
    expect(document.getElementById(act().getAttribute("aria-describedby") ?? "")).toHaveTextContent(
      "Ask Leah Ames to link a client.",
    );
  });

  it("SQ-1084/R186: a viewer who can't link gets one window on the Ask line, focused on its live Copy a note", async () => {
    mockProjectClientId = null;
    mockViewerId = "co-member-2";
    mockLinkHold = "not_permitted";
    render(composer());
    fireEvent.click(act());
    expect(spotWindows()).toEqual(["ask-link-client", "invoice-lines"]);
    expect(
      screen.getByText("Hollis House has no client yet. Ask Leah Ames to link one.").closest("[inert]"),
    ).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy a note" })).toHaveFocus());
  });

  it("SQ-1084/R186: with the lead gone, the owner's window holds the support line and its live Copy the address", async () => {
    mockProjectClientId = null;
    mockViewerId = "studio-admin-3";
    mockLinkHold = "lead_not_in_studio";
    render(composer());
    fireEvent.click(act());
    // The held reason repeats the support sentence in the status line, so find the line itself.
    const supportLine = document.querySelector<HTMLElement>('[data-focus-key="support-link-client"]');
    expect(supportLine).toHaveTextContent(/^The lead on this job has left the studio/);
    expect(spotWindows()).toEqual(["support-link-client", "invoice-lines"]);
    expect(supportLine?.closest("[inert]")).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Copy the address" })).toHaveFocus());
  });

  it("K5: an owner/admin of the project's studio is offered Link a client, though not its lead", async () => {
    mockProjectClientId = null;
    mockViewerId = "studio-admin-3";
    mockLinkHold = null;
    render(composer());
    expect(screen.getByText("Hollis House has no client yet. Link one to bill it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy a note" })).not.toBeInTheDocument();
    fireEvent.click(act());
    expect(document.getElementById(act().getAttribute("aria-describedby") ?? "")).toHaveTextContent(
      "Link a client before drafting this invoice.",
    );
    await waitFor(() => expect(screen.getByRole("link", { name: "Link a client" })).toHaveFocus());
  });

  it("SQ-1069: when the lead has left the studio, the owner gets the support path, never Link, Reassign or a note", async () => {
    mockProjectClientId = null;
    mockViewerId = "studio-admin-3";
    mockLinkHold = "lead_not_in_studio";
    const writeText = jest.fn().mockResolvedValue(undefined);
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      render(composer());
      const support =
        "The lead on this job has left the studio. Write to hello@patina.cloud and we'll move the job to someone on your team.";
      expect(screen.getByText(/The lead on this job has left the studio/)).toHaveTextContent(support);
      expect(screen.getByText("hello@patina.cloud").tagName).toBe("SPAN");
      expect(screen.queryByRole("link", { name: "Link a client" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /reassign/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /reassign/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copy a note" })).not.toBeInTheDocument();
      expect(screen.queryByText(/Ask Leah Ames/)).not.toBeInTheDocument();
      expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
      fireEvent.click(act());
      expect(document.getElementById(act().getAttribute("aria-describedby") ?? "")).toHaveTextContent(support);
      expect(mockCreateDraft).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole("button", { name: "Copy the address" }));
      expect(writeText).toHaveBeenCalledWith("hello@patina.cloud");
      const copyRow = screen.getByRole("button", { name: "Copy the address" }).parentElement as HTMLElement;
      await waitFor(() => expect(within(copyRow).getByRole("status")).toHaveTextContent("Copied."));
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else delete (navigator as unknown as Record<string, unknown>).clipboard;
    }
  });

  describe("K5: Copy a note", () => {
    const NOTE = "Could you link a client to Hollis House? I'm drafting its invoice.";
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    afterEach(() => {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else delete (navigator as unknown as Record<string, unknown>).clipboard;
      window.getSelection()?.removeAllRanges();
    });
    const withClipboard = (writeText: jest.Mock) =>
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    it("copies the one-line note inside the click and says Copied., sending nothing", async () => {
      mockProjectClientId = null;
      mockViewerId = "co-member-2";
      const writeText = jest.fn().mockResolvedValue(undefined);
      withClipboard(writeText);
      render(composer());
      fireEvent.click(screen.getByRole("button", { name: "Copy a note" }));
      // Called synchronously, inside the click.
      expect(writeText).toHaveBeenCalledWith(NOTE);
      const copyRow = screen.getByRole("button", { name: "Copy a note" }).parentElement as HTMLElement;
      await waitFor(() => expect(within(copyRow).getByRole("status")).toHaveTextContent("Copied."));
      expect(mockCreateDraft).not.toHaveBeenCalled();
    });

    it("selects the note's text for a manual copy when the clipboard refuses", async () => {
      mockProjectClientId = null;
      mockViewerId = "co-member-2";
      withClipboard(jest.fn().mockRejectedValue(new Error("NotAllowedError")));
      render(composer());
      fireEvent.click(screen.getByRole("button", { name: "Copy a note" }));
      await waitFor(() => expect(window.getSelection()?.toString()).toBe(NOTE));
      const copyRow = screen.getByRole("button", { name: "Copy a note" }).parentElement as HTMLElement;
      expect(within(copyRow).getByRole("status").textContent).toBe("");
    });
  });

  it.each([
    ["a dropped connection before anything was written", true, () => {
      mockCreateDraft.mockRejectedValue(new Error("Failed to fetch"));
    }],
    ["a billing gap", false, () => {
      mockCreateDraft.mockRejectedValue(new (GapError())("studio", "This project isn't tied to a studio yet."));
    }],
    ["a refused request", false, () => {
      mockCreateDraft.mockRejectedValue(new Error("Invoice client does not match the selected project"));
    }],
  ])("F4: Try again after %s: %s", async (_label, retryable, arrange) => {
    mockFfeItems = [SIDE_TABLE];
    arrange();
    render(composer({ projectId: "project-1", initialFfeItemIds: ["ffe-1"] }));
    fireEvent.click(act());
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    if (retryable) {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    }
  });

  it("F4/F5: never offers Try again after a money write, and never prints an unknown refusal", async () => {
    mockPurchases = [LAMPS];
    mockAddBilling.mockRejectedValue({ message: "network error" });
    render(composer({ projectId: "project-1", initialPurchaseIds: ["p1"] }));
    fireEvent.click(act());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The billing lines couldn't be added to the draft. Nothing was billed.",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    // A refusal that names no line unticks none.
    expect(screen.getByLabelText("Bill Pair of table lamps")).toBeChecked();
  });

  it.each([
    [
      "a refusal it knows",
      "Failed to create draft invoice: invoices are denominated in USD; selection 3f0c9d2e-0000-4000-8000-000000000002 is priced in another currency",
      "A selection is priced in another currency. Invoices bill in US dollars only.",
      false,
    ],
    // SQ-1272 F4 — an answer to the write it doesn't know may hide a landed draft.
    [
      "one it doesn't",
      'Failed to create draft invoice: duplicate key value violates unique constraint "invoices_pkey" (12000 cents)',
      "We couldn't confirm the draft. Check the invoices before drafting again. If it landed, it may be missing hours or lines, so don't send it.",
      false,
    ],
  ])("F13: says create_draft_invoice's %s in the composer's words", async (_label, raw, sentence, retryable) => {
    mockFfeItems = [SIDE_TABLE];
    mockCreateDraft.mockRejectedValue(new Error(raw));
    render(composer({ projectId: "project-1", initialFfeItemIds: ["ffe-1"] }));
    fireEvent.click(act());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(sentence);
    expect(alert).not.toHaveTextContent(/Failed to create|create_draft_invoice|3f0c9d2e|invoices_pkey|cents/);
    if (retryable) {
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    }
  });

  // useClaimTimeEntries rethrows supabase-js's PostgrestError, an Error.
  const postgrestError = (message: string) =>
    Object.assign(new Error(message), { name: "PostgrestError", code: "P0001", details: "", hint: "" });

  it.each([
    [
      "a refusal it knows",
      postgrestError(
        "Time entry 5b1f0c7e-0000-4000-8000-000000000001 is attached to invoice 9a2e4d10-0000-4000-8000-000000000003; only notes (and detaching the invoice) may change.",
      ),
      "Some of these hours were just billed on another invoice. Nothing was billed.",
    ],
    [
      "one it doesn't",
      postgrestError("claim_time_entries: 30000 cents on entry 5b1f0c7e-0000-4000-8000-000000000001 refused"),
      "The hours couldn't be attached to the draft. Nothing was billed.",
    ],
  ])("F13: says claim_time_entries' %s in the composer's words, with no Try again", async (_label, refusal, sentence) => {
    mockUnbilledEntries = [
      {
        id: "te-1",
        user_id: "designer-1",
        duration_minutes: 120,
        amount_cents: 30000,
        started_at: "2026-10-01T15:00:00Z",
      },
    ];
    mockClaimTime.mockRejectedValue(refusal);
    render(composer({ projectId: "project-1", initialTimeEntryIds: ["te-1"] }));
    await waitFor(() => expect(act()).toBeEnabled());
    fireEvent.click(act());
    const alert = await screen.findByRole("alert");
    expect(mockClaimTime).toHaveBeenCalledWith({ invoiceId: "inv-1", projectId: "project-1", entryIds: ["te-1"] });
    expect(mockDeleteDraft).toHaveBeenCalledWith({ invoiceId: "inv-1", projectId: "project-1" });
    expect(alert).toHaveTextContent(sentence);
    expect(alert).not.toHaveTextContent(/claim_time_entries|Time entry|5b1f0c7e|9a2e4d10|cents/);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("F1: once the client is linked, putting the sheet back lands on Draft the invoice; Esc unlinked still returns to Link a client", async () => {
    mockProjectClientId = null;
    mockPathname = "/doc/project-1";
    // The page's half of the stack: the household sheet opens on the composer's
    // event, above the folio the composer is drawn in.
    function Stack() {
      const [householdOpen, setHouseholdOpen] = useState(false);
      useEffect(() => {
        const open = () => setHouseholdOpen(true);
        window.addEventListener(OPEN_HOUSEHOLD_SHEET_EVENT, open);
        return () => window.removeEventListener(OPEN_HOUSEHOLD_SHEET_EVENT, open);
      }, []);
      return (
        <>
          <PaperFolioSheet open onClose={jest.fn()} title="Draw an invoice" wide>
            {composer()}
          </PaperFolioSheet>
          <DocSheet open={householdOpen} onClose={() => setHouseholdOpen(false)} title="The household" aboveFolio>
            <button type="button">Link a household…</button>
          </DocSheet>
        </>
      );
    }
    const household = () => screen.queryByRole("dialog", { name: "The household" });
    const putBack = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    const view = render(<Stack />);
    fireEvent.change(screen.getByLabelText("Line description"), { target: { value: "Design fee" } });
    fireEvent.change(screen.getByLabelText("Unit price (dollars)"), { target: { value: "450" } });

    // Put back without linking: the sheet hands focus back to its opener.
    fireEvent.click(screen.getByRole("link", { name: "Link a client" }));
    await waitFor(() => expect(household()).toHaveFocus());
    putBack();
    expect(household()).toBeNull();
    await waitFor(() => expect(screen.getByRole("link", { name: "Link a client" })).toHaveFocus());
    expect(act()).toHaveAttribute("aria-disabled", "true");

    // Linked in the sheet: the projects read refreshes underneath while it is
    // still open, and the opener goes with the gap.
    fireEvent.click(screen.getByRole("link", { name: "Link a client" }));
    await waitFor(() => expect(household()).toHaveFocus());
    mockProjectClientId = "client-9";
    mockProjectsUpdatedAt = 2;
    view.rerender(<Stack />);
    expect(screen.queryByRole("link", { name: "Link a client" })).not.toBeInTheDocument();
    // The sheet keeps focus while it lies above the composer.
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(household()?.contains(document.activeElement)).toBe(true);

    putBack();
    expect(household()).toBeNull();
    await waitFor(() => expect(act()).toHaveFocus());
    expect(act()).toBeEnabled();
  });

  it("F1: linking the client of a project that has no studio either lands on Name studio, the next fix", async () => {
    mockProjectClientId = null;
    mockProjectStudioId = null;
    mockPathname = "/doc/project-1";
    // The lead is an admin of the studio that employs them, so they may name it.
    mockOrganizations = studioWith("admin");
    mockStudioMembers = [{ user_id: "designer-1", role: "admin", status: "active" }];
    function Stack() {
      const [householdOpen, setHouseholdOpen] = useState(false);
      useEffect(() => {
        const open = () => setHouseholdOpen(true);
        window.addEventListener(OPEN_HOUSEHOLD_SHEET_EVENT, open);
        return () => window.removeEventListener(OPEN_HOUSEHOLD_SHEET_EVENT, open);
      }, []);
      return (
        <>
          <PaperFolioSheet open onClose={jest.fn()} title="Draw an invoice" wide>
            {composer()}
          </PaperFolioSheet>
          <DocSheet open={householdOpen} onClose={() => setHouseholdOpen(false)} title="The household" aboveFolio>
            <button type="button">Link a household…</button>
          </DocSheet>
        </>
      );
    }
    const household = () => screen.queryByRole("dialog", { name: "The household" });
    const view = render(<Stack />);
    fireEvent.click(screen.getByRole("link", { name: "Link a client" }));
    await waitFor(() => expect(household()).toHaveFocus());
    mockProjectClientId = "client-9";
    mockProjectsUpdatedAt = 2;
    view.rerender(<Stack />);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    expect(household()).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Name studio" })).toHaveFocus());
    expect(act()).toHaveAttribute("aria-disabled", "true");
  });

  it("F1: a link left pending on one project never lands focus on another project's Draft", async () => {
    mockProjectClientId = null;
    mockPathname = "/doc/project-1";
    mockExtraProjects = [
      {
        id: "project-2",
        name: "Quill Lane Porch",
        status: "active",
        client_id: "client-7",
        studio_id: "studio-1",
        designer_id: "designer-1",
        designer: { id: "designer-1", display_name: "Leah Ames", full_name: "Leah Ames" },
      },
    ];
    render(composer({}));
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "project-1" } });
    fireEvent.click(screen.getByRole("link", { name: "Link a client" }));
    // The sheet went back unlinked, and focus has since left the composer.
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "project-2" } });
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    expect(act()).not.toHaveFocus();
    expect(document.activeElement).toBe(document.body);
  });

  it("F6/K1: lights a held deposit's stage group, its percent live inside the window", async () => {
    mockFfeItems = [SIDE_TABLE];
    render(composer({ projectId: "project-1", initialFfeItemIds: ["ffe-1"] }));
    fireEvent.click(screen.getByLabelText("as a deposit of"));
    fireEvent.change(screen.getByLabelText("Deposit percent"), { target: { value: "120" } });
    fireEvent.click(act());
    expect(reasonLine()).toHaveTextContent("Adjust the deposit before drafting.");
    expect(spotWindows()).toEqual(["deposit"]);
    expect(screen.getByLabelText("Deposit percent").closest("[inert]")).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("radiogroup", { name: "Bill the ticked lines" })).toContainElement(
        document.activeElement as HTMLElement,
      ),
    );
    // Fixing it closes the spotlight and hands focus back to Draft.
    fireEvent.change(screen.getByLabelText("Deposit percent"), { target: { value: "50" } });
    await waitFor(() => expect(spotWindows()).toEqual([]));
    await waitFor(() => expect(act()).toHaveFocus());
  });

  it("F6: lands a project with no line on its empty line", async () => {
    render(composer());
    fireEvent.click(act());
    expect(reasonLine()).toHaveTextContent("Add at least one line first.");
    expect(spotWindows()).toEqual(["invoice-lines"]);
    await waitFor(() => expect(screen.getByLabelText("Line description")).toHaveFocus());
  });

  it("F6: lands a figure-less rider on its billed amount", async () => {
    mockRiders = [
      {
        id: "r2",
        kind: "liftgate",
        note: null,
        billable_to_client: true,
        invoice_line_id: null,
        estimate_cents: null,
        actual_cents: null,
        purchase_order: { id: "po-1", po_number: "1042", project_id: "project-1" },
      },
    ];
    render(composer({ projectId: "project-1", initialCostLineIds: ["r2"] }));
    fireEvent.click(act());
    expect(reasonLine()).toHaveTextContent("Add the missing billing figures first.");
    expect(spotWindows()).toEqual(["billing-figures"]);
    const billed = screen.getByLabelText("Billed amount · Liftgate");
    expect(billed.closest("[inert]")).toBeNull();
    await waitFor(() =>
      expect(billed.closest("[data-at-cost-row]")).toContainElement(document.activeElement as HTMLElement),
    );
  });

  it("F7: in studio mode names and lands on what the studio invoice lacks, never a project", async () => {
    mockFlag = { value: true, isLoading: false };
    render(composer({}));
    pickStudio();
    const status = screen.getByRole("status");

    fireEvent.click(act());
    expect(status).toHaveTextContent("Choose the household this invoice is for first.");
    expect(status).not.toHaveTextContent("Choose a project first.");
    await waitFor(() => expect(screen.getByRole("button", { name: "pick household" })).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "pick household" }));
    expect(status.textContent).toBe("");
    // SQ-1204: a fixed hold's window lingers while focus stays on its fix.
    // The press on Draft moves focus there, and the household window drops.
    act().focus();
    await waitFor(() => expect(spotWindows()).not.toContain("household"));
    fireEvent.click(act());
    expect(status).toHaveTextContent("Add what this invoice is regarding first.");
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Design consultation · Sept 2026")).toHaveFocus(),
    );

    fireEvent.change(screen.getByPlaceholderText("Design consultation · Sept 2026"), {
      target: { value: "Design consultation" },
    });
    act().focus();
    await waitFor(() => expect(spotWindows()).not.toContain("regarding"));
    fireEvent.click(act());
    expect(status).toHaveTextContent("Add at least one line first.");
    await waitFor(() => expect(screen.getByLabelText("Line description")).toHaveFocus());
  });

  it("K1: in studio mode the press lights every missing field; each fix takes its window away, the last frees Draft and leaves focus in the field being typed", async () => {
    mockFlag = { value: true, isLoading: false };
    render(composer({}));
    pickStudio();
    fireEvent.click(act());
    expect(spotWindows()).toEqual(["household", "regarding", "lines"]);
    expect(reasonLine()).toHaveTextContent("Choose the household this invoice is for first.");
    await waitFor(() => expect(screen.getByRole("button", { name: "pick household" })).toHaveFocus());

    fireEvent.click(screen.getByRole("button", { name: "pick household" }));
    // SQ-1204: a fixed hold's window lingers while focus stays on its fix.
    // Focus moves on to the next field, and the household window drops.
    screen.getByPlaceholderText("Design consultation · Sept 2026").focus();
    await waitFor(() => expect(spotWindows()).toEqual(["regarding", "lines"]));
    fireEvent.change(screen.getByPlaceholderText("Design consultation · Sept 2026"), {
      target: { value: "Design consultation" },
    });
    screen.getByLabelText("Line description").focus();
    await waitFor(() => expect(spotWindows()).toEqual(["lines"]));
    fireEvent.change(screen.getByLabelText("Line description"), { target: { value: "Design fee" } });
    const price = screen.getByLabelText("Unit price (dollars)");
    price.focus();
    fireEvent.change(price, { target: { value: "450" } });
    await waitFor(() => expect(spotWindows()).toEqual([]));
    expect(document.querySelector("[data-hold-spotlight]")).toBeNull();
    // SQ-1204: the spotlight never takes focus out of a field being typed in.
    expect(price).toHaveFocus();
    expect(act()).not.toHaveAttribute("aria-disabled");
    expect(act()).toBeEnabled();
  });

  it("F8: offers Name studio to the owner of a studio that employs the designer, and says why it was refused", async () => {
    mockProjectStudioId = null;
    mockViewerId = "owner-1";
    mockOrganizations = studioWith("owner");
    mockStudioMembers = [{ user_id: "designer-1", role: "member", status: "active" }];
    mockStampStudio.mockImplementation(
      (_vars: unknown, options?: { onError?: (e: unknown) => void }) =>
        options?.onError?.({
          message:
            "stamp_project_pricing_studio: this studio holds no rate for this project's designer that somebody other than she wrote",
        }),
    );
    render(composer());
    expect(screen.getByText("Hollis House isn't tied to your studio yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Name studio" }));
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(mockStampStudio).toHaveBeenCalledWith(
      { projectId: "project-1", studioId: "studio-1" },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Middle West Studio has no rate for this project's designer yet. Add one on the studio rate card first.",
    );
  });

  it("R186: Name studio and its inline confirm stay live inside the studio hold's window", async () => {
    mockProjectStudioId = null;
    mockViewerId = "owner-1";
    mockOrganizations = studioWith("owner");
    mockStudioMembers = [{ user_id: "designer-1", role: "member", status: "active" }];
    mockFfeItems = [SIDE_TABLE];
    render(composer({ projectId: "project-1", initialFfeItemIds: ["ffe-1"] }));
    fireEvent.click(act());
    expect(spotWindows()).toEqual(["name-studio"]);
    const nameStudio = screen.getByRole("button", { name: "Name studio" });
    await waitFor(() => expect(nameStudio).toHaveFocus());
    expect(screen.getByText("Naming a studio stamps it on every invoice this project sends.").closest("[inert]")).toBeNull();
    fireEvent.click(nameStudio);
    const confirm = screen.getByRole("group", { name: "Confirm naming the studio" });
    expect(confirm.closest("[inert]")).toBeNull();
    await waitFor(() => expect(within(confirm).getByRole("button", { name: "Name" })).toHaveFocus());
  });

  it("K12: Name studio says what it stamps, then asks once inline before it does", async () => {
    mockProjectStudioId = null;
    mockViewerId = "owner-1";
    mockOrganizations = studioWith("owner");
    mockStudioMembers = [{ user_id: "designer-1", role: "member", status: "active" }];
    render(composer());
    expect(
      screen.getByText("Naming a studio stamps it on every invoice this project sends."),
    ).toBeInTheDocument();
    const nameStudio = screen.getByRole("button", { name: "Name studio" });
    expect(nameStudio).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Confirm naming the studio" })).not.toBeInTheDocument();

    fireEvent.click(nameStudio);
    expect(mockStampStudio).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const confirm = screen.getByRole("group", { name: "Confirm naming the studio" });
    expect(confirm).toHaveTextContent("Name Middle West Studio? This can't be undone.");
    expect(nameStudio).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(within(confirm).getByRole("button", { name: "Name" })).toHaveFocus());

    fireEvent.click(within(confirm).getByRole("button", { name: "Not yet" }));
    expect(mockStampStudio).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Confirm naming the studio" })).not.toBeInTheDocument();
    expect(nameStudio).toHaveFocus();

    fireEvent.click(nameStudio);
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(mockStampStudio).toHaveBeenCalledTimes(1);
    expect(mockStampStudio).toHaveBeenCalledWith(
      { projectId: "project-1", studioId: "studio-1" },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  describe("SQ-1091: an owner of two studios names the one that employs the lead", () => {
    // Her own 00295 workspace sorts first, so it is the studio she answers for.
    const twoStudios = () => [
      {
        id: "studio-0",
        name: "Leah Hartwell",
        type: "design_studio",
        status: "active",
        membership: { role: "owner", status: "active" },
      },
      ...studioWith("owner"),
    ];
    beforeEach(() => {
      selectViewerStudioId(null);
      mockProjectStudioId = null;
      mockViewerId = "owner-1";
      mockOrganizations = twoStudios();
    });

    it("offers Name studio for the second studio, confirms it by name and stamps its id", () => {
      mockStudioMembers = [
        { organization_id: "studio-0", user_id: "owner-1", role: "owner", status: "active" },
        { organization_id: "studio-1", user_id: "owner-1", role: "owner", status: "active" },
        { organization_id: "studio-1", user_id: "designer-1", role: "member", status: "active" },
      ];
      render(composer());
      expect(screen.getByText("Hollis House isn't tied to your studio yet.")).toBeInTheDocument();
      expect(
        screen.getByText("Naming a studio stamps it on every invoice this project sends."),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Name studio" }));
      const confirm = screen.getByRole("group", { name: "Confirm naming the studio" });
      expect(confirm).toHaveTextContent("Name Middle West Studio? This can't be undone.");
      fireEvent.click(within(confirm).getByRole("button", { name: "Name" }));
      expect(mockStampStudio).toHaveBeenCalledWith(
        { projectId: "project-1", studioId: "studio-1" },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
    });

    it.each([
      ["only an owner seat", "owner"],
      ["only a guest seat", "guest"],
    ])("offers no Name studio when the lead holds %s in each", (_label, role) => {
      mockStudioMembers = [
        { organization_id: "studio-0", user_id: "designer-1", role, status: "active" },
        { organization_id: "studio-1", user_id: "designer-1", role, status: "active" },
      ];
      render(composer());
      expect(screen.queryByRole("button", { name: "Name studio" })).not.toBeInTheDocument();
      expect(
        screen.queryByText("Naming a studio stamps it on every invoice this project sends."),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          "Hollis House isn't tied to a studio yet. Only a studio that employs its designer can name one.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("R173: a solo owner on a project opened before her studio had one gets the support path, never Name studio or 'ask an owner'", async () => {
    mockProjectStudioId = null;
    mockOrganizations = studioWith("owner");
    mockStudioMembers = [{ user_id: "designer-1", role: "owner", status: "active" }];
    const writeText = jest.fn().mockResolvedValue(undefined);
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      render(composer());
      expect(screen.queryByRole("button", { name: "Name studio" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /mailto/i })).not.toBeInTheDocument();
      expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
      const support =
        "This job was opened before your studio had one home. Write to hello@patina.cloud and we'll set it.";
      expect(screen.getByText(/This job was opened before your studio had one home/)).toHaveTextContent(support);
      fireEvent.click(act());
      expect(document.getElementById(act().getAttribute("aria-describedby") ?? "")).toHaveTextContent(support);
      expect(screen.queryByText(/studio owner|ask an owner/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Copy the address" }));
      expect(writeText).toHaveBeenCalledWith("hello@patina.cloud");
      const copyRow = screen.getByRole("button", { name: "Copy the address" }).parentElement as HTMLElement;
      await waitFor(() => expect(within(copyRow).getByRole("status")).toHaveTextContent("Copied."));
    } finally {
      if (original) Object.defineProperty(navigator, "clipboard", original);
      else delete (navigator as unknown as Record<string, unknown>).clipboard;
    }
  });

  it("R173: an owner who shares her studio is not a solo owner, and is never told to ask an owner", () => {
    mockProjectStudioId = null;
    mockOrganizations = studioWith("owner");
    mockStudioMembers = [
      { user_id: "designer-1", role: "owner", status: "active" },
      { user_id: "designer-2", role: "member", status: "active" },
    ];
    render(composer());
    expect(screen.queryByRole("button", { name: "Name studio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy the address" })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Hollis House isn't tied to a studio yet. Only a studio that employs its designer can name one.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(act());
    expect(reasonLine()).toHaveTextContent(
      "Hollis House can’t be billed until a studio that employs its designer names it.",
    );
    expect(screen.queryByText(/studio owner/)).not.toBeInTheDocument();
  });

  it("F8: an employee is told to ask her studio owner, with no act", () => {
    mockProjectStudioId = null;
    mockOrganizations = studioWith("member");
    render(composer());
    expect(
      screen.getByText("Hollis House isn't tied to a studio yet. Ask your studio owner to name it."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Name studio" })).not.toBeInTheDocument();
  });

  it("F11: one status region from mount; the held act points at it until the blocker resolves", () => {
    render(composer());
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    expect(act()).toHaveAttribute("aria-describedby", status.id);

    fireEvent.click(act());
    expect(reasonLine()).toBe(status);
    expect(status).toHaveTextContent("Add at least one line first.");

    fireEvent.change(screen.getByLabelText("Line description"), { target: { value: "Design fee" } });
    fireEvent.change(screen.getByLabelText("Unit price (dollars)"), { target: { value: "450" } });
    expect(act()).toBeEnabled();
    expect(status.textContent).toBe("");
    expect(act()).not.toHaveAttribute("aria-describedby");
  });

  it("F2/K7: a ticked piece that turns unpriced holds the draft, its reason on its own row", async () => {
    const LAMP = { id: "ffe-2", name: "Floor lamp", quantity: 1, unit_price_cents: 30000, room: null };
    const context = { projectId: "project-1", initialFfeItemIds: ["ffe-1", "ffe-2"] };
    mockFfeItems = [SIDE_TABLE, LAMP];
    const { rerender } = render(composer(context));
    expect(within(screen.getByText("Floor lamp").closest("label") as HTMLElement).getByRole("checkbox")).toBeChecked();

    mockFfeItems = [SIDE_TABLE, { ...LAMP, unit_price_cents: null }];
    rerender(composer(context));
    expect(act()).toHaveAttribute("aria-disabled", "true");
    const row = document.querySelector('[data-focus-key="price-line:ffe-2"]') as HTMLElement;
    expect(row).toHaveTextContent("Set a client price for Floor lamp.");
    expect(within(row).getByRole("link", { name: "Price it: Floor lamp" })).toBeInTheDocument();
    fireEvent.click(act());
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it.each([
    ["ask-link-client", "Hollis House has no client yet. Ask Leah Ames to link one.", () => {
      mockProjectClientId = null;
      mockViewerId = "co-member-2";
      mockLinkHold = "not_permitted";
    }],
    ["support-link-client", "The lead on this job has left the studio. Write to hello@patina.cloud", () => {
      mockProjectClientId = null;
      mockViewerId = "studio-admin-3";
      mockLinkHold = "lead_not_in_studio";
    }],
    ["ask-name-studio", "Hollis House isn't tied to a studio yet. Ask your studio owner to name it.", () => {
      mockProjectStudioId = null;
      mockOrganizations = studioWith("member");
    }],
    ["support-name-studio", "This job was opened before your studio had one home. Write to hello@patina.cloud", () => {
      mockProjectStudioId = null;
      mockOrganizations = studioWith("owner");
      mockStudioMembers = [{ user_id: "designer-1", role: "owner", status: "active" }];
    }],
  ])("F3: a viewer who can't make the fix has its hold keyed to the %s line", (key, line, arrange) => {
    arrange();
    render(composer());
    const keyed = document.querySelectorAll(`[data-focus-key="${key}"]`);
    expect(keyed).toHaveLength(1);
    expect(keyed[0].tagName).toBe("P");
    expect(keyed[0]).toHaveTextContent(line);
    expect(document.querySelector('[data-focus-key="link-client"], [data-focus-key="name-studio"]')).toBeNull();
  });

  it("F3: a viewer who can make the fix has it keyed to the act, never to the line", () => {
    mockProjectClientId = null;
    render(composer());
    expect(screen.getByRole("link", { name: "Link a client" })).toHaveAttribute("data-focus-key", "link-client");
    expect(document.querySelector("p[data-focus-key]")).toBeNull();
  });

  it("SQ-1203 F1: two ticked unpriced pieces light two windows, each its own row and fix; the other lines stay under the scrim", async () => {
    const LAMP = { id: "ffe-2", name: "Floor lamp", quantity: 1, unit_price_cents: 30000, room: null };
    const RUG = { id: "ffe-3", name: "Wool rug", quantity: 1, unit_price_cents: 40000, room: null };
    const context = { projectId: "project-1", initialFfeItemIds: ["ffe-1", "ffe-2", "ffe-3"] };
    mockFfeItems = [SIDE_TABLE, LAMP, RUG];
    const { rerender } = render(composer(context));

    mockFfeItems = [SIDE_TABLE, { ...LAMP, unit_price_cents: null }, { ...RUG, unit_price_cents: null }];
    rerender(composer(context));
    fireEvent.click(act());

    await waitFor(() => expect(spotWindows()).toEqual(["price-line:ffe-2", "price-line:ffe-3"]));
    const lampRow = document.querySelector('[data-focus-key="price-line:ffe-2"]') as HTMLElement;
    const rugRow = document.querySelector('[data-focus-key="price-line:ffe-3"]') as HTMLElement;
    expect(lampRow).toHaveAttribute("data-hold-region", "price-line:ffe-2");
    expect(rugRow).toHaveAttribute("data-hold-region", "price-line:ffe-3");
    // Each row's fix is live in its own window.
    expect(within(lampRow).getByRole("link", { name: "Price it: Floor lamp" }).closest("[inert]")).toBeNull();
    expect(within(rugRow).getByRole("link", { name: "Price it: Wool rug" }).closest("[inert]")).toBeNull();
    // The priced piece and the ad-hoc line are no part of either window.
    expect(screen.getByText("Side table").closest("[inert]")).not.toBeNull();
    expect(screen.getByLabelText("Line description").closest("[inert]")).not.toBeNull();
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("SQ-1203 F7: two designers' rate-pending hours keep a window each; pricing one lifts only hers", async () => {
    const hour = { duration_minutes: 60, amount_cents: 15000, started_at: "2026-10-01T15:00:00Z" };
    const context = { projectId: "project-1", initialTimeEntryIds: ["te-1", "te-2"] };
    const siteVisit = { ...hour, id: "te-1", user_id: "designer-1", notes: "Site visit" };
    const sketching = { ...hour, id: "te-2", user_id: "designer-2", notes: "Sketching" };
    mockUnbilledEntries = [siteVisit, sketching];
    const { rerender } = render(composer(context));
    await waitFor(() => expect(act()).not.toHaveAttribute("aria-disabled", "true"));

    mockUnbilledEntries = [];
    mockRatePendingEntries = [siteVisit, sketching];
    rerender(composer(context));
    fireEvent.click(act());

    await waitFor(() =>
      expect(spotWindows()).toEqual(["rate-pending:designer-1", "rate-pending:designer-2", "invoice-lines"]),
    );
    const leadRegion = screen.getByText("Site visit").closest("[data-hold-region]");
    const teamRegion = screen.getByText("Sketching").closest("[data-hold-region]");
    expect(leadRegion).toHaveAttribute("data-hold-region", "rate-pending:designer-1");
    expect(teamRegion).toHaveAttribute("data-hold-region", "rate-pending:designer-2");
    expect(leadRegion).not.toContainElement(screen.getByText("Sketching"));

    // designer-2's hour is priced; designer-1's stays pending.
    mockUnbilledEntries = [sketching];
    mockRatePendingEntries = [siteVisit];
    rerender(composer(context));
    // SQ-1204: the lines window lingers while focus stays inside it. Focus
    // moves on to Draft, and the window drops.
    act().focus();
    await waitFor(() => expect(spotWindows()).toEqual(["rate-pending:designer-1"]));
    expect(act()).toHaveAttribute("aria-disabled", "true");
    expect(mockCreateDraft).not.toHaveBeenCalled();
  });

  it("F4/F6/K1: a ticked hour that turns rate-pending lights its designer's window over her pending hours and their fix", async () => {
    const hour = { user_id: "designer-1", duration_minutes: 60, amount_cents: 15000, started_at: "2026-10-01T15:00:00Z" };
    const context = { projectId: "project-1", initialTimeEntryIds: ["te-1"] };
    mockUnbilledEntries = [{ ...hour, id: "te-1", notes: "Site visit" }];
    const { rerender } = render(composer(context));
    await waitFor(() => expect(act()).not.toHaveAttribute("aria-disabled", "true"));

    mockUnbilledEntries = [];
    mockRatePendingEntries = [
      { ...hour, id: "te-0", user_id: "designer-2", notes: "Sketching" },
      { ...hour, id: "te-1", notes: "Site visit" },
    ];
    rerender(composer(context));
    fireEvent.click(act());
    expect(reasonLine()).toHaveTextContent("These hours are waiting for a rate.");
    const row = screen.getByText("Site visit").closest("[data-rate-pending]");
    expect(row).toHaveAttribute("data-focus-key", "rate-pending:designer-1");
    expect(spotWindows()).toEqual(["rate-pending:designer-1", "invoice-lines"]);
    const region = row?.closest("[data-hold-region]");
    expect(region).toHaveAttribute("data-hold-region", "rate-pending:designer-1");
    expect(region).not.toContainElement(screen.getByText("Sketching"));
    expect(region?.closest("[inert]")).toBeNull();
    await waitFor(() => expect(region).toContainElement(document.activeElement as HTMLElement));
  });

  it("F8: keys the lines hold where its press lands, the first unfilled row, then Add line", async () => {
    render(composer());
    expect(document.querySelector('[data-focus-key="for-project"]')).toBeNull();
    fireEvent.click(act());
    const keyed = document.querySelector('[data-focus-key="invoice-lines"]');
    expect(keyed).toHaveAttribute("data-adhoc-row");
    await waitFor(() => expect(keyed).toContainElement(document.activeElement as HTMLElement));

    fireEvent.click(screen.getByRole("button", { name: "Remove line" }));
    fireEvent.click(act());
    const addLine = screen.getByRole("button", { name: "Add line" });
    expect(addLine).toHaveAttribute("data-focus-key", "invoice-lines");
    await waitFor(() => expect(addLine).toHaveFocus());
  });

  it.each([[60, '1h'], [2, '2m']])('formats %i rate-pending minutes as %s', (minutes, label) => {
    mockRatePendingEntries = [
      { id: "time-1", user_id: "designer-1", started_at: "2026-10-01T09:00:00Z", duration_minutes: minutes },
    ];
    render(composer());
    expect(screen.getByText(new RegExp(`${label} waiting for a rate`))).toBeInTheDocument();
    expect(screen.queryByText(/0\.0 hours waiting for a rate/)).not.toBeInTheDocument();
  });
});

describe("InvoiceComposer · rate-pending hours name their fix (K8)", () => {
  const studio = (id: string, role: string) => [
    {
      id,
      name: "Middle West Studio",
      type: "design_studio",
      status: "active",
      membership: { role, status: "active" },
    },
  ];
  const composer = () => (
    <InvoiceComposer context={{ projectId: "project-1" }} onDrafted={jest.fn()} />
  );

  beforeEach(() => {
    mockFlag = { value: false, isLoading: false };
    mockOrganizationsLoading = false;
    mockFfeItems = [];
    mockCoverage = undefined;
    mockStages = undefined;
    mockRoster = [{ profile_id: "maria", display_name: "Maria Obi" }];
    mockRatePendingEntries = [
      { id: "time-1", user_id: "maria", started_at: "2026-10-01T09:00:00Z", duration_minutes: 60 },
      { id: "time-2", user_id: "maria", started_at: "2026-10-02T09:00:00Z", duration_minutes: 30 },
    ];
    mockStudioMembers = [
      { user_id: "ruth", role: "owner", status: "active", profiles: { display_name: "Ruth Hale" } },
      { user_id: "maria", role: "member", status: "active", profiles: { display_name: "Maria Obi" } },
    ];
  });

  it("offers an owner/admin of the pricing studio Set <name>'s rate, which opens Studio onto that member's field", () => {
    mockOrganizations = studio("studio-1", "admin");
    const opened = jest.fn();
    const onOpen = (e: Event) => opened((e as CustomEvent).detail);
    window.addEventListener("document:open-account", onOpen);
    try {
      render(composer());
      const setRate = screen.getByRole("link", { name: "Set Maria Obi’s rate" });
      expect(screen.queryByText(/to set a rate/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Copy a note" })).not.toBeInTheDocument();

      fireEvent.click(setRate);
      expect(opened).toHaveBeenCalledWith({ page: "studio", rateFor: "maria", aboveFolio: true });
      expect(setRate).toHaveFocus();
    } finally {
      window.removeEventListener("document:open-account", onOpen);
    }
  });

  it("SQ-1060: an owner whose own workspace sorts first still gets Set, which switches her to the pricing studio", () => {
    mockOrganizations = [
      {
        id: "studio-0",
        name: "Leah Hartwell",
        type: "design_studio",
        status: "active",
        membership: { role: "owner", status: "active" },
      },
      ...studio("studio-1", "owner"),
    ];
    const opened = jest.fn();
    const onOpen = (e: Event) => opened((e as CustomEvent).detail);
    window.addEventListener("document:open-account", onOpen);
    try {
      render(composer());
      expect(screen.queryByText(/to set a rate/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("link", { name: "Set Maria Obi’s rate" }));
      expect(window.localStorage.getItem("patina.hours.viewer-studio-id")).toBe("studio-1");
      expect(opened).toHaveBeenCalledWith({ page: "studio", rateFor: "maria", aboveFolio: true });
    } finally {
      window.removeEventListener("document:open-account", onOpen);
      selectViewerStudioId(null);
    }
  });

  it("tells anyone else to ask the studio's owner, with a note to copy and no Set act", () => {
    mockOrganizations = studio("studio-1", "member");
    render(composer());

    expect(screen.getByText("Ask Ruth Hale to set a rate.")).toBeInTheDocument();
    expect(
      screen.getByText("Could you set a rate for Maria Obi? I'm drafting Hollis House's invoice."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy a note" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Set .* rate/ })).not.toBeInTheDocument();
  });

  it("does not offer Set to an owner answering for a studio that does not price this project", () => {
    mockOrganizations = studio("studio-2", "owner");
    render(composer());

    expect(screen.queryByRole("link", { name: /Set .* rate/ })).not.toBeInTheDocument();
    expect(screen.getByText("Ask Ruth Hale to set a rate.")).toBeInTheDocument();
  });

  it("offers no rate fix where no studio prices the project; the studio hold names that fix", () => {
    mockOrganizations = studio("studio-1", "owner");
    mockProjectStudioId = null;
    render(composer());

    expect(screen.getByText(/1h 30m waiting for a rate/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Set .* rate/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/to set a rate/)).not.toBeInTheDocument();
  });
});
