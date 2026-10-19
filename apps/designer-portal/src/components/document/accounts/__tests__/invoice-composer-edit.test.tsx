import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { InvoiceComposer } from "../invoice-composer";

const mockSave = jest.fn();
const mockCreate = jest.fn();
let mockInvoice: any;
let mockHours: any[];
let mockHoursFetching = false;
let mockSavePending = false;
let mockFlag = false;
let mockPieces: any[];
let mockStages: any[];
let mockCoverage: any;
const mockLedgerScope = jest.fn();
const project = { id: "project-1", name: "Hollis House", status: "active", client_id: "client-1", studio_id: "studio-1", designer_id: "designer-1" };
const milestone = { id: "milestone-1", label: "Design retainer", amount_cents: 20000, status: "invoiced" };
const piece = { id: "piece-1", name: "Lounge chair", quantity: 1, unit_price_cents: 80000, item_type: "product", product_id: "product-1" };
const purchase = { id: "purchase-1", status: "billed", billable_to_client: true, invoice_line_id: "purchase-line", payee_name: "Maker", description: "Sample purchase", amount_cents: 3000, purchased_on: "2026-10-01" };
const rider = { id: "rider-1", kind: "freight", note: "Delivery freight", billable_to_client: true, invoice_line_id: "rider-line", actual_cents: 4000, estimate_cents: 4000 };
const read = (data: any) => ({ data, isLoading: false, isPending: false, isFetching: false, isError: false, isSuccess: data !== undefined, refetch: jest.fn() });

jest.mock("@patina/supabase", () => ({
  InvoiceBillingGapError: jest.requireActual("@patina/supabase").InvoiceBillingGapError,
  useInvoice: () => read(mockInvoice),
  useTimeEntryLedger: (params: any) => { mockLedgerScope(params); return { ...read(mockHours), isFetching: mockHoursFetching }; },
  useUpdateDraftInvoice: () => ({ mutateAsync: mockSave, isPending: mockSavePending }),
  useCreateDraftInvoice: () => ({ mutateAsync: mockCreate, isPending: false }),
  useCreateDraftStudioInvoice: () => ({ mutateAsync: mockCreate, isPending: false }),
  useProjects: () => read([project]),
  useOrganizations: () => read([{ id: "studio-1", name: "Middle West", type: "design_studio", status: "active" }]),
  useProjectPaymentMilestones: () => read([milestone]),
  useProjectInvoices: () => read([mockInvoice]),
  useProjectFFEItems: () => read(mockPieces),
  useFfeInvoiceCoverage: () => read(mockCoverage),
  useFfeInvoiceStageCoverage: () => read(mockStages),
  useUnbilledTime: () => read({ entries: [{ id: "new-hour", user_id: "designer-1", duration_minutes: 60, started_at: "2026-10-18T12:00:00Z", amount_cents: 12000, resolved_rate_cents: 12000 }], ratePendingEntries: [] }),
  useStudioPurchases: () => read([purchase]),
  useProjectPoCostLines: () => read([rider]),
  useProjectRoster: () => read([]),
  useSessionUserId: () => "designer-1",
  useOrganizationMembers: () => read([]),
  useStudiosEmployingMember: () => read([]),
  useDocumentClientLinkHold: () => read(undefined),
  useStampProjectPricingStudio: () => ({ mutate: jest.fn() }),
  useSetLaborLinePrice: () => ({ mutate: jest.fn() }),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }), usePathname: () => "/" }));
jest.mock("@/hooks/use-feature-flag", () => ({ useFeatureFlag: () => ({ value: mockFlag, isLoading: false }) }));
jest.mock("@/components/portal/client-picker", () => ({ ClientPicker: () => <div>Unlocked household</div> }));

const line = (id: string, fields: any) => ({ id, invoice_id: "invoice-1", kind: "adhoc", billing_stage: "full", billing_stage_pct: null, milestone_id: null, ffe_item_id: null, description: "Design fee", quantity: 1, unit_amount_cents: 10000, amount_cents: 10000, metadata: {}, sort_order: 0, ...fields });
const open = (onDrafted = jest.fn()) => render(<InvoiceComposer context={{ mode: "edit", invoiceId: "invoice-1" }} onDrafted={onDrafted} />, { wrapper: ({ children }: { children: ReactNode }) => <div data-spotlight-frame="">{children}</div> });
const save = () => screen.getByRole("button", { name: "Save the draft" });

beforeEach(() => {
  mockSave.mockReset().mockResolvedValue({ id: "invoice-1", project_id: "project-1" });
  mockCreate.mockReset(); mockSavePending = false; mockHoursFetching = false; mockFlag = false;
  mockLedgerScope.mockClear();
  mockPieces = [piece];
  mockCoverage = { "piece-1": { coverage: "invoiced", invoiceId: "invoice-1" } };
  mockStages = [{ ffe_item_id: "piece-1", billing_stage: "deposit", billing_stage_pct: 25, invoice_id: "invoice-1", billed_cents: 20000 }];
  mockHours = [{ id: "kept-hour", invoice_id: "invoice-1", user_id: "designer-1", duration_minutes: 30, started_at: "2026-10-17T12:00:00Z", resolved_rate_cents: 10000, amount_cents: 5000 }];
  mockInvoice = {
    id: "invoice-1", status: "draft", project_id: "project-1", studio_id: "studio-1", client_id: "client-1", client: { full_name: "Hollis Family" }, project: { name: "Hollis House" },
    updated_at: "2026-10-18T12:00:00.123456Z", tax_rate: 0.075, payment_terms_days: 21, memo: "Original memo", internal_notes: "Keep private",
    line_items: [line("hand", {}), line("time", { kind: "time", metadata: { time_entry_ids: ["kept-hour"] } })],
  };
});

test("hydrates the locked draft and saves kept, dropped and added hours with the opened timestamp", async () => {
  const onDrafted = jest.fn(); open(onDrafted);
  await screen.findByRole("button", { name: "Save the draft" });
  expect(screen.queryByRole("combobox", { name: "Project" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("tax rate (%)")).toHaveValue("7.5");
  expect(screen.getByLabelText("terms (net days)")).toHaveValue("21");
  expect(screen.getByLabelText("memo · shown to the client")).toHaveValue("Original memo");
  expect(screen.getByLabelText("internal notes · studio eyes only")).toHaveValue("Keep private");
  const hours = screen.getAllByRole("checkbox");
  const kept = hours.find((box) => box.closest("label")?.textContent?.includes("0h 30m") || box.closest("label")?.textContent?.includes("30m"))!;
  expect(kept).toBeChecked();
  fireEvent.change(screen.getByLabelText("Line description"), { target: { value: "Revised fee" } });
  fireEvent.click(save());
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
  expect(mockSave.mock.calls[0][0]).toMatchObject({ invoiceId: "invoice-1", expectedUpdatedAt: "2026-10-18T12:00:00.123456Z", entryIds: ["kept-hour"], internalNotes: "Keep private", taxRate: 0.075 });
  expect(mockSave.mock.calls[0][0].lines).toEqual(expect.arrayContaining([expect.objectContaining({ description: "Revised fee", unitAmountCents: 10000 }), expect.objectContaining({ kind: "time", unitAmountCents: 5000 })]));
  await waitFor(() => expect(onDrafted).toHaveBeenCalledWith("invoice-1", "project-1"));
  expect(mockCreate).not.toHaveBeenCalled();
  fireEvent.click(kept);
  const added = screen.getAllByRole("checkbox").find((box) => box.closest("label")?.textContent?.includes("1h"))!;
  fireEvent.click(added); fireEvent.click(save());
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
  expect(mockSave.mock.calls[1][0].entryIds).toEqual(["new-hour"]);
});

test("preselects its milestone, deposit, purchase and rider rather than hiding them as billed", async () => {
  mockInvoice.line_items = [line("milestone-line", { kind: "milestone", milestone_id: "milestone-1" }), line("deposit-line", { kind: "ffe", ffe_item_id: "piece-1", billing_stage: "deposit", billing_stage_pct: 25, metadata: { billingStage: "deposit" } }), line("purchase-line", { metadata: { studioPurchaseId: "purchase-1" }, amount_cents: 3500 }), line("rider-line", { metadata: { poCostLineId: "rider-1" }, amount_cents: 4500 })];
  open(); await screen.findByRole("button", { name: "Save the draft" });
  expect(screen.getByRole("checkbox", { name: /Design retainer/ })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /Lounge chair/ })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /Sample purchase/ })).toBeChecked();
  fireEvent.click(save());
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockSave.mock.calls[0][0].billingLines).toEqual(expect.arrayContaining([expect.objectContaining({ ffeItemId: "piece-1", stage: "deposit", depositPct: 25, amountCents: 10000 }), expect.objectContaining({ purchaseId: "purchase-1", amountCents: 3500 }), expect.objectContaining({ costLineId: "rider-1", amountCents: 4500 })]));
  expect(mockSave.mock.calls[0][0].lines.filter((row: any) => row.kind === "adhoc")).toEqual([]);
});

test.each([
  ["stale", "This draft changed since you opened it. Reopen it to edit."],
  ["not_draft", "This invoice has been sent, so it can't be edited."],
])("shows the %s refusal without retrying or opening the folio", async (stage, sentence) => {
  mockSave.mockRejectedValue(new Error(`update_draft_invoice: ${stage}`));
  const onDrafted = jest.fn(); open(onDrafted); await screen.findByRole("button", { name: "Save the draft" }); fireEvent.click(save());
  expect(await screen.findByText(sentence)).toBeInTheDocument();
  expect(onDrafted).not.toHaveBeenCalled(); expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
});

test("edits a studio draft with its household locked even when the creation flag is off", async () => {
  mockInvoice.project_id = null; mockInvoice.title = "Consultation"; mockInvoice.line_items = [line("hand", {})];
  mockHours = []; mockSave.mockResolvedValue({ id: "invoice-1", project_id: null });
  const onDrafted = jest.fn(); open(onDrafted); await screen.findByRole("button", { name: "Save the draft" });
  expect(screen.getByText("the studio · no house")).toBeInTheDocument(); expect(screen.getByText("Hollis Family")).toBeInTheDocument();
  expect(screen.queryByText("Unlocked household")).not.toBeInTheDocument();
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  fireEvent.click(save()); await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockSave.mock.calls[0][0]).toMatchObject({ entryIds: [], billingLines: [] });
  await waitFor(() => expect(onDrafted).toHaveBeenCalledWith("invoice-1", null));
});

test("waits for claimed hours and refuses to lose an unread attached hour", async () => {
  mockHoursFetching = true; const view = open();
  expect(screen.getByText("Opening the draft…")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "Save the draft" })).not.toBeInTheDocument();
  mockHoursFetching = false; mockHours = [];
  view.rerender(<InvoiceComposer context={{ mode: "edit", invoiceId: "invoice-1" }} onDrafted={jest.fn()} />);
  expect(await screen.findByText("The draft’s attached hours could not be read. Reopen it to edit.")).toBeInTheDocument(); expect(mockSave).not.toHaveBeenCalled();
});

test("closing an in-flight save retires the folio handoff", async () => {
  let resolve!: (value: any) => void; mockSave.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const onDrafted = jest.fn(); const view = open(onDrafted); await screen.findByRole("button", { name: "Save the draft" }); fireEvent.click(save());
  const signal = mockSave.mock.calls[0][0].signal; view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => resolve({ id: "invoice-1", project_id: "project-1" })); expect(onDrafted).not.toHaveBeenCalled();
});


test("retains its deposit when another invoice owns the balance", async () => {
  mockHours = [];
  mockInvoice.line_items = [line("deposit", { kind: "ffe", ffe_item_id: "piece-1", billing_stage: "deposit", billing_stage_pct: 25, amount_cents: 20000, unit_amount_cents: 20000, description: "Chair deposit" })];
  mockStages.push({ ffe_item_id: "piece-1", billing_stage: "balance", invoice_id: "other-invoice", billed_cents: 60000 });
  open(); await screen.findByRole("button", { name: "Save the draft" });
  fireEvent.change(screen.getByLabelText("memo · shown to the client"), { target: { value: "Memo only" } });
  fireEvent.click(save());
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockSave.mock.calls[0][0].billingLines).toEqual([expect.objectContaining({ ffeItemId: "piece-1", stage: "deposit", depositPct: 25, amountCents: 20000, description: "Chair deposit" })]);
});

test("switches an originally full retained item to the selected deposit", async () => {
  mockHours = [];
  mockInvoice.line_items = [line("full", { kind: "ffe", ffe_item_id: "piece-1", amount_cents: 80000, unit_amount_cents: 80000 })];
  mockStages = [{ ffe_item_id: "piece-1", billing_stage: "full", invoice_id: "invoice-1", billed_cents: 80000 }];
  open(); await screen.findByRole("button", { name: "Save the draft" });
  fireEvent.click(screen.getByRole("radio", { name: "as a deposit of" }));
  fireEvent.change(screen.getByLabelText("Deposit percent"), { target: { value: "25" } });
  fireEvent.click(save()); await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockSave.mock.calls[0][0].lines.filter((row: any) => row.ffeItemId)).toEqual([]);
  expect(mockSave.mock.calls[0][0].billingLines).toEqual([{ ffeItemId: "piece-1", stage: "deposit", depositPct: 25 }]);
});

test("round trips individual deposit percentages and stored full-line money", async () => {
  mockHours = [];
  mockPieces = [piece, { ...piece, id: "piece-2", name: "Side chair", unit_price_cents: 99999 }, { ...piece, id: "piece-3", name: "Desk", unit_price_cents: 99999 }];
  mockInvoice.line_items = [
    line("deposit-a", { kind: "ffe", ffe_item_id: "piece-1", billing_stage: "deposit", billing_stage_pct: 25, amount_cents: 2500, unit_amount_cents: 2500, description: "Original A" }),
    line("deposit-b", { kind: "ffe", ffe_item_id: "piece-2", billing_stage: "deposit", billing_stage_pct: 50, amount_cents: 5000, unit_amount_cents: 5000, description: "Original B" }),
    line("full-c", { kind: "ffe", ffe_item_id: "piece-3", quantity: 2, amount_cents: 14000, unit_amount_cents: 7000, description: "Original desk" }),
  ];
  mockCoverage = Object.fromEntries(mockPieces.map((item) => [item.id, { coverage: "invoiced", invoiceId: "invoice-1" }]));
  mockStages = mockInvoice.line_items.map((row: any) => ({ ...row, billed_cents: row.amount_cents }));
  open(); await screen.findByRole("button", { name: "Save the draft" }); fireEvent.click(save());
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockSave.mock.calls[0][0].billingLines).toEqual([
    expect.objectContaining({ ffeItemId: "piece-1", depositPct: 25, amountCents: 2500, description: "Original A" }),
    expect.objectContaining({ ffeItemId: "piece-2", depositPct: 50, amountCents: 5000, description: "Original B" }),
  ]);
  expect(mockSave.mock.calls[0][0].lines).toEqual([expect.objectContaining({ ffeItemId: "piece-3", quantity: 2, unitAmountCents: 7000, description: "Original desk" })]);
});

test("keeps a persisted zero-dollar courtesy line on a memo-only save", async () => {
  mockHours = [];
  mockInvoice.line_items = [line("courtesy", { description: "Included consultation", amount_cents: 0, unit_amount_cents: 0 }), line("fee", {})];
  open(); await screen.findByRole("button", { name: "Save the draft" }); fireEvent.click(save());
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  expect(mockSave.mock.calls[0][0].lines).toEqual(expect.arrayContaining([expect.objectContaining({ description: "Included consultation", unitAmountCents: 0 })]));
});

test("loads claimed hours by invoice rather than capped project history", async () => {
  open(); await screen.findByRole("button", { name: "Save the draft" });
  expect(mockLedgerScope).toHaveBeenCalledWith({ invoiceId: "invoice-1", includeRunning: false });
});


test.each(["40P01", "55P03"])("shows an unprefixed %s as a retryable billing refusal", async (code) => {
  const onDrafted = jest.fn();
  mockSave.mockRejectedValueOnce(Object.assign(new Error("concurrent transaction"), { code }));
  open(onDrafted);
  await screen.findByRole("button", { name: "Save the draft" });
  fireEvent.click(save());
  expect(await screen.findByText("Another change to these lines was saving at the same moment. Save again.")).toBeInTheDocument();
  expect(screen.queryByText(/save could not be confirmed/)).not.toBeInTheDocument();
  expect(onDrafted).not.toHaveBeenCalled();
  expect(mockSave).toHaveBeenCalledTimes(1);
});
