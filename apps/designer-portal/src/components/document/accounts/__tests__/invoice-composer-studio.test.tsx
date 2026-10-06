/**
 * R136 — the composer's houseless branch. Three things have to hold: the
 * choice is fail-closed behind the `studio-invoice` flag (never offered while
 * the flag is still resolving), choosing it puts the house-bound pull-through
 * sections away (S6), and the Draft act calls the studio RPC with the
 * household, the regarding line and the resolved studio (S4 · S12 · S8).
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { InvoiceComposer } from "../invoice-composer";

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

jest.mock("@patina/supabase", () => ({
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
        client_id: "client-9",
      },
    ],
  }),
  useClaimTimeEntries: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUnbilledTime: () => ({ data: { entries: [] }, isLoading: false }),
  // HT-21 (W5) — names the composer's time rows; unused by this suite's
  // studio-mode/empty-selection scenarios but called unconditionally.
  useProjectRoster: () => ({ data: [] }),
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

beforeEach(() => {
  mockCreateDraft.mockReset().mockResolvedValue({ id: "inv-1" });
  mockAddBilling.mockReset().mockResolvedValue([]);
  mockDeleteDraft.mockReset().mockResolvedValue(undefined);
  mockPurchases = [];
  mockRiders = [];
});

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

  it("deletes the draft when the writer refuses, and says why", async () => {
    mockAddBilling.mockRejectedValue({
      message: "add_invoice_billing_lines: purchase p1 is already billed",
    });
    const onDrafted = jest.fn();
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialPurchaseIds: ["p1"] }}
        onDrafted={onDrafted}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));
    expect(await screen.findByText(/purchase p1 is already billed/)).toBeInTheDocument();
    expect(mockDeleteDraft).toHaveBeenCalledWith({ invoiceId: "inv-1", projectId: "project-1" });
    expect(onDrafted).not.toHaveBeenCalled();
  });
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
    expect(act).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Draft the invoice" })).toBeDisabled();
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
    expect(act()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "pick household" }));
    expect(act()).toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText("Design consultation · Sept 2026"),
      {
        target: { value: "Design consultation · 12 Sept 2026" },
      },
    );
    expect(act()).toBeDisabled();

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
    ).toBeDisabled();
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

  it("renders the R83 failure band inline when the draft is refused", async () => {
    mockCreateStudioDraft.mockRejectedValue(
      new Error("The household is not on this studio’s roster."),
    );
    render(<InvoiceComposer context={{}} onDrafted={jest.fn()} />);
    pickStudio();

    fireEvent.click(screen.getByRole("button", { name: "pick household" }));
    fireEvent.change(
      screen.getByPlaceholderText("Design consultation · Sept 2026"),
      {
        target: { value: "Design consultation" },
      },
    );
    fireEvent.change(screen.getByLabelText("Line description"), {
      target: { value: "Design consultation, on site (2 h)" },
    });
    fireEvent.change(screen.getByLabelText("Unit price (dollars)"), {
      target: { value: "450" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Draft the invoice" }));

    expect(
      await screen.findByText("The household is not on this studio’s roster."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Try again" }),
    ).toBeInTheDocument();
  });
});
