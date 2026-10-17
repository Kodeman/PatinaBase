/**
 * US-36 K7 (SQ-1046) — the invoice composer's Price it lands on the line's
 * client price in the Price lens, and while that job's composer is parked the
 * lens offers a quiet "Back to the invoice" that reopens it.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  FOCUS_FFE_LINE_EVENT,
  focusFfeLinePending,
  parkInvoiceComposer,
  unparkInvoiceComposer,
} from "@/lib/document/registry";
import type { ParkedInvoiceComposer } from "@/lib/document/invoice-composer";

type Row = Record<string, unknown> & { id: string };
const mockItems: { data: Row[] } = { data: [] };
const mutation = () => ({ mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false, isError: false });

jest.mock("@patina/supabase", () => ({
  useProjectFFEItems: () => ({ data: mockItems.data, isFetching: false }),
  useProjectRoomPlacements: () => ({ data: [] }),
  useSetFfeLineCommercials: () => mutation(),
  useSetLaborLinePrice: () => mutation(),
  useMakeFfeLineAllowance: () => mutation(),
  useAddLaborLine: () => mutation(),
  useArchiveProjectSelection: () => mutation(),
  useRestoreProjectSelection: () => mutation(),
  useSetFfeLinePricing: () => mutation(),
  useSetFfeLineKind: () => mutation(),
  useResolveFfeCostChange: () => mutation(),
  useResetFfeLineMarkup: () => mutation(),
  useResetProjectMarkups: () => mutation(),
  useCreateNamedProjectNeed: () => mutation(),
  useProjectPricingApproval: () => ({ data: null }),
  useProjectPricing: () => ({
    data: { projectId: "proj", updatedAt: null, markupTargetPercent: null, salesTaxRate: null },
    isFetching: false,
  }),
  useSetProjectPricing: () => mutation(),
  usePricingSettings: () => ({ data: { defaultMarkupPercent: 35, isDefault: false, updatedAt: null } }),
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
  parent_ffe_item_id: null,
  purchase_order_id: null,
  trade_scope_document_id: null,
  assignment_scope: "room",
  project_room_id: "living",
  removed_at: null,
  retail_unit_cents: null,
  pending_cost_prev_cents: null,
  updated_at: "2026-10-17T00:00:00Z",
  quantity: 1,
};

const PARKED: ParkedInvoiceComposer = {
  milestoneIds: [],
  timeEntryIds: [],
  ffeItemIds: ["c1"],
  ffeStage: "full",
  depositPctText: "50",
  balanceItemIds: [],
  purchaseIds: [],
  riderIds: [],
  overrides: [],
  adhoc: [],
  taxRatePercent: "0",
  termsDays: "15",
  memo: "",
};

const renderLens = () =>
  render(<PriceLens docId="doc-1" projectId="proj" room={null} canSeeMoney />);

beforeEach(() => {
  mockItems.data = [
    { ...base, id: "s1", name: "Sofa", trade_price_cents: 100000, unit_price_cents: 135000 },
    { ...base, id: "c1", name: "Walnut console", trade_price_cents: 80000, unit_price_cents: null },
  ];
  unparkInvoiceComposer("proj");
  focusFfeLinePending.request = null;
});

describe("PriceLens · the composer's Price it lands here (K7)", () => {
  it("lands a request made before it mounted on the line's client price, with Back to the invoice", () => {
    parkInvoiceComposer("proj", PARKED);
    focusFfeLinePending.request = { itemId: "c1", cell: "price" };
    renderLens();
    expect(screen.getByLabelText("Unit client price, Walnut console")).toHaveFocus();
    expect(focusFfeLinePending.request).toBeNull();

    const opened = jest.fn();
    window.addEventListener("document:open-invoice-composer", opened);
    fireEvent.click(screen.getByRole("button", { name: "Back to the invoice" }));
    window.removeEventListener("document:open-invoice-composer", opened);
    expect(opened).toHaveBeenCalledTimes(1);
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toEqual({ projectId: "proj" });
  });

  it("answers a price request while open, and takes it from the Document's Pieces", () => {
    renderLens();
    const request = new CustomEvent(FOCUS_FFE_LINE_EVENT, {
      cancelable: true,
      detail: { itemId: "c1", cell: "price" },
    });
    act(() => {
      window.dispatchEvent(request);
    });
    expect(request.defaultPrevented).toBe(true);
    expect(screen.getByLabelText("Unit client price, Walnut console")).toHaveFocus();
  });

  it("leaves every other landing to the Document, and offers no Back act with nothing parked", () => {
    renderLens();
    const request = new CustomEvent(FOCUS_FFE_LINE_EVENT, {
      cancelable: true,
      detail: { itemId: "c1", cell: "maker" },
    });
    act(() => {
      window.dispatchEvent(request);
    });
    expect(request.defaultPrevented).toBe(false);
    expect(screen.queryByRole("button", { name: "Back to the invoice" })).not.toBeInTheDocument();
  });

  it("drops Back to the invoice once the parked composer is taken back", () => {
    parkInvoiceComposer("proj", PARKED);
    renderLens();
    expect(screen.getByRole("button", { name: "Back to the invoice" })).toBeInTheDocument();
    act(() => unparkInvoiceComposer("proj"));
    expect(screen.queryByRole("button", { name: "Back to the invoice" })).not.toBeInTheDocument();
  });
});
