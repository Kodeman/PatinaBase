/**
 * US-37 #4, after approval (00810, R188): Kody's acceptance 7. Approve, then
 * edit a line: the line is flagged as differing from what the client
 * approved, with the approved figure beside the current one; the edit is in
 * the change log; the summary prints the approved total beside the current.
 * With no approval, none of it renders.
 *
 * Fixture: the pricing suite's five Living Room lines, each approved exactly
 * as it stands. Hooks are mocked @patina/supabase readers and writers.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import type {
  FfePricingEvent,
  ProjectPricingApproval,
} from "@patina/supabase";

type Row = Record<string, unknown> & { id: string };

const mockItems: { data: Row[] } = { data: [] };
const mockApproval: { data: ProjectPricingApproval | null } = { data: null };
const mockEvents: { data: FfePricingEvent[] } = { data: [] };
const mockRemoved: { data: Row[] } = { data: [] };
const mockUseRemoved = jest.fn((_projectId: string) => ({ data: mockRemoved.data }));
const mockLinePricing = jest.fn();
const mockUseEvents = jest.fn((_projectId: string, itemId?: string | null) => ({
  data: mockEvents.data.filter((e) => !itemId || e.itemId === itemId),
  isLoading: false,
  isError: false,
}));

const mutation = (fn: jest.Mock) => ({
  mutate: fn,
  mutateAsync: fn,
  isPending: false,
  isError: false,
});

jest.mock("@patina/supabase", () => ({
  useProjectFFEItems: () => ({ data: mockItems.data, isFetching: false }),
  useProjectRoomPlacements: () => ({ data: [] }),
  useSetFfeLineCommercials: () => mutation(jest.fn()),
  useSetLaborLinePrice: () => mutation(jest.fn()),
  useMakeFfeLineAllowance: () => mutation(jest.fn()),
  useAddLaborLine: () => mutation(jest.fn()),
  useArchiveProjectSelection: () => mutation(jest.fn()),
  useRestoreProjectSelection: () => mutation(jest.fn()),
  useSetFfeLinePricing: () => mutation(mockLinePricing),
  useSetFfeLineKind: () => mutation(jest.fn()),
  useResolveFfeCostChange: () => mutation(jest.fn()),
  useResetFfeLineMarkup: () => mutation(jest.fn()),
  useResetProjectMarkups: () => mutation(jest.fn()),
  useCreateNamedProjectNeed: () => mutation(jest.fn()),
  useProjectPricing: () => ({
    data: { projectId: "proj", updatedAt: null, markupTargetPercent: null, salesTaxRate: null },
    isFetching: false,
  }),
  useSetProjectPricing: () => mutation(jest.fn()),
  usePricingSettings: () => ({ data: { defaultMarkupPercent: 35 } }),
  useProjectPricingApproval: () => ({ data: mockApproval.data }),
  useFfePricingEvents: (projectId: string, itemId?: string | null) =>
    mockUseEvents(projectId, itemId),
  useRemovedProjectLines: (projectId: string) => mockUseRemoved(projectId),
}));
jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => ({ data: [{ id: "living", name: "Living Room" }] }),
  useAssignLineRoom: () => ({ mutateAsync: jest.fn(), isError: false, error: null }),
}));
jest.mock("@/hooks/use-document-state", () => ({
  useDocumentEngagement: () => ({
    data: { kind: "engagement", row: { project_id: "proj", project_status: "planning" } },
  }),
}));

import { PriceLens } from "../price-lens";

const base = {
  status: "specified",
  blocked: false,
  received_quantity: null,
  line_kind: "goods",
  item_type: "fixed",
  unit: "each",
  budget_max_cents: null,
  rough_cents: null,
  product_id: "p",
  product: null,
  vendor_id: null,
  vendor_name: null,
  parent_ffe_item_id: null,
  ffe_line_authorization: null,
  purchase_order_id: null,
  trade_scope_document_id: null,
  assignment_scope: "room",
  project_room_id: "living",
  removed_at: null,
  retail_unit_cents: null,
  pending_cost_prev_cents: null,
  pending_cost_changed_at: null,
  pending_markup_held_percent: null,
  updated_at: "2026-10-17T00:00:00Z",
  quantity: 1,
};

function fixture(): Row[] {
  return [
    { ...base, id: "s1", name: "Sofa", trade_price_cents: 100000, unit_price_cents: 135000 },
    { ...base, id: "s2", name: "Rug", trade_price_cents: 200000, unit_price_cents: 270000 },
    { ...base, id: "s3", name: "Drapery", trade_price_cents: 177700, unit_price_cents: 239895 },
    {
      ...base,
      id: "s4",
      name: "Dining chairs",
      quantity: 4,
      trade_price_cents: 40000,
      unit_price_cents: 54000,
    },
    { ...base, id: "s5", name: "Lamp", trade_price_cents: 20000, unit_price_cents: 27000 },
  ];
}

/** Every fixture line approved exactly as it stands: $8,878.95 in all. */
function approvalOf(rows: Row[]): ProjectPricingApproval {
  const lines = rows.map((row) => {
    const unit = row.unit_price_cents as number;
    const qty = row.quantity as number;
    return {
      itemId: row.id,
      approvalId: "appr-1",
      approvalSource: "project_approval" as const,
      approvedAt: "2026-10-17T10:00:00Z",
      approvedUnitClientPriceCents: unit,
      approvedQuantity: qty,
      approvedLineTotalCents: unit * qty,
      currency: "USD",
      differs: false,
    };
  });
  return {
    approvalId: "appr-1",
    approvalSource: "project_approval",
    approvalRef: "dec-1",
    approvedAt: "2026-10-17T10:00:00Z",
    approvedBy: "client-1",
    approvedTotals: [
      { currency: "USD", cents: lines.reduce((sum, l) => sum + l.approvedLineTotalCents, 0) },
    ],
    lines,
  };
}

const SOFA_EVENT: FfePricingEvent = {
  id: "ev-1",
  itemId: "s1",
  field: "unit_price_cents",
  oldValue: "135000",
  newValue: "150000",
  actorId: "designer-1",
  actorName: "Leah Ward",
  at: "2026-10-17T14:05:00Z",
};
const RUG_EVENT: FfePricingEvent = {
  id: "ev-2",
  itemId: "s2",
  field: "markup_percent",
  oldValue: "35.0000",
  newValue: "40.0000",
  actorId: "designer-1",
  actorName: "Leah Ward",
  at: "2026-10-17T14:00:00Z",
};

function renderLens() {
  return render(<PriceLens docId="doc-1" projectId="proj" room={null} canSeeMoney />);
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name, { selector: "span" }).closest("tr") as HTMLElement;
}

function cell(name: string, label: string): HTMLElement {
  return rowOf(name).querySelector(`td[data-label="${label}"]`) as HTMLElement;
}

function typeAndEnter(label: string, text: string) {
  const input = screen.getByLabelText(label);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
}

function approvedTotalRow(): HTMLElement | null {
  return document.querySelector("[data-approved-total]");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockItems.data = fixture();
  mockApproval.data = approvalOf(mockItems.data);
  mockEvents.data = [];
  mockRemoved.data = [];
});

describe("Price lens after approval (US-37 #4, acceptance 7)", () => {
  it("an approved job that has not moved: approved and current totals agree, no line is flagged", () => {
    renderLens();
    expect(approvedTotalRow()).toHaveTextContent(
      "Approved total $8,878.95 · Current $8,878.95 (no change)",
    );
    expect(document.querySelector("[data-differs-from-approved]")).toBeNull();
    expect(document.querySelector("[data-approved-value]")).toBeNull();
  });

  it("7. approve, then edit a line: it is flagged with the approved value, and the summary shows approved vs current", () => {
    renderLens();
    typeAndEnter("Unit client price, Sofa", "$1,500");
    expect(mockLinePricing).toHaveBeenCalledWith(
      { projectId: "proj", itemId: "s1", field: "unit_client_price_cents", value: 150000 },
      expect.anything(),
    );

    const sofa = rowOf("Sofa");
    expect(sofa).toHaveAttribute("data-differs-from-approved");
    expect(within(sofa).getByText("Changed since the client approved it.")).toBeInTheDocument();
    expect(cell("Sofa", "Unit client")).toHaveTextContent("Approved $1,350");
    expect(cell("Sofa", "Line total")).toHaveTextContent("$1,500Approved $1,350");
    // Its quantity did not move, so no approved quantity prints.
    expect(cell("Sofa", "Qty").querySelector("[data-approved-value]")).toBeNull();
    // The other lines still match what she approved.
    expect(rowOf("Rug")).not.toHaveAttribute("data-differs-from-approved");

    expect(approvedTotalRow()).toHaveTextContent(
      "Approved total $8,878.95 · Current $9,028.95 (+$150)",
    );
  });

  it("a quantity change prints the approved quantity beside the current one", () => {
    mockItems.data = fixture().map((row) => (row.id === "s4" ? { ...row, quantity: 3 } : row));
    renderLens();
    expect(cell("Dining chairs", "Qty")).toHaveTextContent("Approved 4");
    expect(cell("Dining chairs", "Line total")).toHaveTextContent("Approved $2,160");
    expect(cell("Dining chairs", "Unit client").querySelector("[data-approved-value]")).toBeNull();
    expect(approvedTotalRow()).toHaveTextContent("Current $8,338.95 (−$540)");
  });

  it("the server's differs flag alone (a currency move) still flags the line", () => {
    const approval = approvalOf(fixture());
    approval.lines = approval.lines.map((l) =>
      l.itemId === "s5" ? { ...l, differs: true } : l,
    );
    mockApproval.data = approval;
    renderLens();
    expect(rowOf("Lamp")).toHaveAttribute("data-differs-from-approved");
    expect(cell("Lamp", "Line total")).toHaveTextContent("Approved $270");
  });

  it("the line's change log lists its edits: who · when · field · old → new", () => {
    mockEvents.data = [SOFA_EVENT, RUG_EVENT];
    mockItems.data = fixture().map((row) =>
      row.id === "s1" ? { ...row, unit_price_cents: 150000 } : row,
    );
    renderLens();
    fireEvent.click(screen.getByRole("button", { name: "Change log, Sofa" }));

    expect(mockUseEvents).toHaveBeenLastCalledWith("proj", "s1");
    const dialog = screen.getByRole("dialog");
    const entries = within(dialog).getAllByRole("listitem");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveTextContent(/^Leah Ward · Oct 17, .+ · Unit client · \$1,350 → \$1,500$/);
  });

  it("the job's change log lists every line's edits, each naming its line", () => {
    mockEvents.data = [SOFA_EVENT, RUG_EVENT];
    renderLens();
    fireEvent.click(within(approvedTotalRow() as HTMLElement).getByRole("button", { name: "Change log" }));

    expect(mockUseEvents).toHaveBeenLastCalledWith("proj", null);
    const entries = within(screen.getByRole("dialog")).getAllByRole("listitem");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent("Sofa");
    expect(entries[1]).toHaveTextContent("Rug");
    expect(entries[1]).toHaveTextContent("Markup · 35.0% → 40.0%");
  });

  it("an approval with no logged edits says so", () => {
    renderLens();
    fireEvent.click(within(approvedTotalRow() as HTMLElement).getByRole("button", { name: "Change log" }));
    expect(
      within(screen.getByRole("dialog")).getByText("No pricing changes since the client approved."),
    ).toBeInTheDocument();
  });

  it("an approved line removed since lists under the table with its approved figure and its change log", () => {
    const lamp = fixture().find((row) => row.id === "s5") as Row;
    mockItems.data = fixture().filter((row) => row.id !== "s5");
    mockRemoved.data = [{ ...lamp, removed_at: "2026-10-17T15:00:00Z" }];
    renderLens();

    // Not a row of the editable table: the line no longer exists.
    expect(screen.queryByText("Lamp", { selector: "tr span" })).toBeNull();
    const group = document.querySelector("[data-removed-since-approval]") as HTMLElement;
    expect(group).not.toBeNull();
    expect(within(group).getByText("Removed since the client approved it.")).toBeInTheDocument();
    const entry = group.querySelector('[data-removed-approved-line="s5"]') as HTMLElement;
    expect(entry).toHaveTextContent("Lamp");
    expect(entry).toHaveTextContent("Approved $270");
    expect(mockUseRemoved).toHaveBeenLastCalledWith("proj");

    fireEvent.click(within(entry).getByRole("button", { name: "Change log, Lamp" }));
    expect(mockUseEvents).toHaveBeenLastCalledWith("proj", "s5");
    expect(approvedTotalRow()).toHaveTextContent("Current $8,608.95 (−$270)");
  });

  it("nothing removed: no removed group, and the removed lines are not read", () => {
    renderLens();
    expect(document.querySelector("[data-removed-since-approval]")).toBeNull();
    expect(mockUseRemoved).toHaveBeenLastCalledWith("");
  });

  it("approved USD and EUR lines: each total is compared with current lines in its own currency", () => {
    const pendant: Row = {
      ...base,
      id: "s6",
      name: "Murano pendant",
      currency: "EUR",
      trade_price_cents: 250000,
      unit_price_cents: 300000,
    };
    const approval = approvalOf([...fixture(), pendant]);
    approval.lines = approval.lines.map((l) =>
      l.itemId === "s6" ? { ...l, currency: "EUR" } : l,
    );
    approval.approvedTotals = [
      { currency: "EUR", cents: 300000 },
      { currency: "USD", cents: 887895 },
    ];
    mockApproval.data = approval;
    mockItems.data = [
      ...fixture().map((row) => (row.id === "s1" ? { ...row, unit_price_cents: 150000 } : row)),
      { ...pendant, unit_price_cents: 320000 },
    ];
    renderLens();

    // The dollar figure reads only dollar lines: $9,028.95, not $12,228.95.
    expect(approvedTotalRow()).toHaveTextContent(
      "Approved total $8,878.95 · Current $9,028.95 (+$150) · Approved total €3,000 · Current €3,200 (+€200)",
    );
  });

  it("no approval: no flag, no approved value, no approved total, no change log", () => {
    mockApproval.data = null;
    renderLens();
    typeAndEnter("Unit client price, Sofa", "$1,500");
    expect(document.querySelector("[data-differs-from-approved]")).toBeNull();
    expect(document.querySelector("[data-approved-value]")).toBeNull();
    expect(approvedTotalRow()).toBeNull();
    expect(screen.queryByRole("button", { name: /Change log/ })).toBeNull();
    expect(mockUseEvents).not.toHaveBeenCalled();
  });
});
