/**
 * SQ-2213 (SQ-2211 F1) — the Bill composer re-reads useProjectFFEItems on its
 * own. A line under external responsibility (C5) is never offered there: not
 * as a billable checkbox, not as an unpriced "Price it" row. It stays in view
 * as external work. The hook is answered with mixed rows, so the composer's
 * own re-read and partition are what run here.
 */

import { render, screen, within } from "@testing-library/react";
import { InvoiceComposer } from "../invoice-composer";
import { unparkInvoiceComposer } from "@/lib/document/registry";

const mockSetLaborPrice = jest.fn();
const mockPush = jest.fn();
let mockFfeItems: Array<Record<string, unknown>> = [];

jest.mock("@patina/supabase", () => ({
  InvoiceBillingGapError: class InvoiceBillingGapError extends Error {},
  useStampProjectPricingStudio: () => ({ mutate: jest.fn(), isPending: false }),
  useDocumentClientLinkHold: () => ({ data: null }),
  useSessionUserId: () => "designer-1",
  useOrganizationMembers: () => ({ data: [] }),
  useStudiosEmployingMember: () => ({ data: [] }),
  useCreateDraftInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useCreateDraftStudioInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteDraftInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useFfeInvoiceCoverage: () => ({ data: undefined, isLoading: false }),
  useFfeInvoiceStageCoverage: () => ({ data: undefined, isLoading: false }),
  useAddInvoiceBillingLines: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProjectPoCostLines: () => ({ data: [], isLoading: false, isPending: false, isFetching: false, isError: false, isSuccess: true }),
  useOrganizations: () => ({
    data: [{ id: "studio-1", name: "Middle West Studio", type: "design_studio", status: "active" }],
    isLoading: false,
  }),
  useProjectFFEItems: () => ({ data: mockFfeItems, isLoading: false }),
  useProjectInvoices: () => ({ data: [] }),
  useProjectPaymentMilestones: () => ({ data: [] }),
  useProjects: () => ({
    data: ["project-1", "project-2"].map((id) => ({
      id,
      name: id === "project-1" ? "Hollis House" : "Grove Street",
      status: "active",
      client_id: "client-9",
      studio_id: "studio-1",
      designer_id: "designer-1",
      designer: { id: "designer-1", display_name: "Leah Ames", full_name: "Leah Ames" },
    })),
    dataUpdatedAt: 1,
  }),
  useClaimTimeEntries: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useSetLaborLinePrice: () => ({ mutate: mockSetLaborPrice, isPending: false }),
  useUnbilledTime: () => ({ data: { entries: [], ratePendingEntries: [] }, isLoading: false }),
  useProjectRoster: () => ({ data: [] }),
  useStudioPurchases: () => ({ data: [], isLoading: false, isPending: false, isFetching: false, isError: false, isSuccess: true }),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/doc/project-1",
}));

jest.mock("@/hooks/use-feature-flag", () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock("@/components/portal/client-picker", () => ({
  ClientPicker: () => null,
}));

const SIDE_TABLE = { id: "ffe-1", name: "Side table", quantity: 1, unit_price_cents: 12000, room: null };
// The SQ-2211 probe shape: product-backed, $0, external fulfilment set.
const GC_RANGE = {
  id: "ffe-gc",
  name: "GC range hood",
  quantity: 1,
  unit_price_cents: 0,
  product_id: "product-hood",
  external_fulfilment_id: "ext-1",
  room: { name: "Kitchen" },
};
const GC_UNPRICED = {
  id: "ffe-gc2",
  name: "GC tile",
  quantity: 1,
  unit_price_cents: null,
  external_fulfilment_id: "ext-2",
  room: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFfeItems = [SIDE_TABLE, GC_RANGE, GC_UNPRICED];
  unparkInvoiceComposer("project-1");
});

describe("InvoiceComposer · external responsibility (SQ-2213)", () => {
  it("offers only the studio line; external lines are listed, never a checkbox", () => {
    render(
      <InvoiceComposer
        context={{ projectId: "project-1", initialFfeItemIds: ["ffe-1", "ffe-gc", "ffe-gc2"] }}
        onDrafted={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const studioBox = within(
      screen.getByText("Side table").closest("label") as HTMLElement,
    ).getByRole("checkbox");
    expect(studioBox).toBeChecked();

    const external = screen.getByTestId("composer-external-lines");
    expect(external).toHaveTextContent("external responsibility");
    for (const id of ["ffe-gc", "ffe-gc2"]) {
      const row = external.querySelector(
        `[data-composer-external-line="${id}"]`,
      ) as HTMLElement;
      expect(row).not.toBeNull();
      expect(row).toHaveTextContent("not billed here");
      expect(within(row).queryByRole("checkbox")).toBeNull();
    }
    // Not offered anywhere else: no checkbox row, no unpriced Price it row.
    expect(screen.getByText("GC range hood").closest("label")).toBeNull();
    expect(screen.getByText("GC tile").closest("label")).toBeNull();
    expect(document.querySelector('[data-focus-key="price-line:ffe-gc2"]')).toBeNull();
    expect(screen.queryByRole("link", { name: "Price it: GC tile" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draft the invoice" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
