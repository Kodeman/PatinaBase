/**
 * US-36 K7 + K13 (SQ-1046) — a selected unpriced piece holds the draft, and
 * the composer carries its fix: a labor line is priced in its own row through
 * set_labor_line_price; any other line parks the composer and walks to the
 * Price lens, and reopening the composer on that project brings its work back.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { InvoiceComposer } from "../invoice-composer";
import {
  focusFfeLinePending,
  parkedInvoiceComposer,
  unparkInvoiceComposer,
} from "@/lib/document/registry";

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
const LABOR = {
  id: "ffe-l",
  name: "Install labor",
  quantity: 1,
  unit_price_cents: null,
  line_kind: "labor",
  room: null,
};
const CONSOLE = { id: "ffe-2", name: "Walnut console", quantity: 1, unit_price_cents: null, room: null };

const act = () => screen.getByRole("button", { name: "Draft the invoice" });
const checkboxOf = (name: string) =>
  within(screen.getByText(name).closest("label") as HTMLElement).getByRole("checkbox");
const composer = (context: Record<string, unknown>, onClose = jest.fn()) => (
  <InvoiceComposer context={context} onDrafted={jest.fn()} onClose={onClose} />
);

beforeEach(() => {
  jest.clearAllMocks();
  mockFfeItems = [SIDE_TABLE, LABOR, CONSOLE];
  unparkInvoiceComposer("project-1");
  unparkInvoiceComposer("project-2");
  focusFfeLinePending.request = null;
});

describe("InvoiceComposer · a selected unpriced piece (K7)", () => {
  it("prices a labor line in its own row, and the hold clears once the line is priced", () => {
    const context = { projectId: "project-1", initialFfeItemIds: ["ffe-1", "ffe-l"] };
    const { rerender } = render(composer(context));
    expect(act()).toHaveAttribute("aria-disabled", "true");
    const row = document.querySelector('[data-focus-key="price-line:ffe-l"]') as HTMLElement;
    expect(row).toHaveTextContent("Set a client price for Install labor.");

    const field = within(row).getByLabelText("Client price, Install labor");
    fireEvent.change(field, { target: { value: "$450" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(mockSetLaborPrice).toHaveBeenCalledTimes(1);
    expect(mockSetLaborPrice.mock.calls[0][0]).toEqual({
      projectId: "project-1",
      itemId: "ffe-l",
      unitPriceCents: 45000,
    });
    // Leaving the field does not save the same figure twice.
    fireEvent.blur(field);
    expect(mockSetLaborPrice).toHaveBeenCalledTimes(1);

    // The writer's refetch returns the line priced: still ticked, now billable.
    mockFfeItems = [SIDE_TABLE, { ...LABOR, unit_price_cents: 45000 }, CONSOLE];
    rerender(composer(context));
    expect(document.querySelector('[data-focus-key="price-line:ffe-l"]')).toBeNull();
    expect(screen.queryByText("Set a client price for Install labor.")).not.toBeInTheDocument();
    expect(checkboxOf("Install labor")).toBeChecked();
    expect(act()).not.toHaveAttribute("aria-disabled", "true");
  });

  it("says the server's refusal beside the labor line", () => {
    mockSetLaborPrice.mockImplementation((_vars, { onError }) =>
      onError(new Error("set_labor_line_price: line is released")),
    );
    render(composer({ projectId: "project-1", initialFfeItemIds: ["ffe-l"] }));
    const field = screen.getByLabelText("Client price, Install labor");
    fireEvent.change(field, { target: { value: "450" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByText("set_labor_line_price: line is released")).toBeInTheDocument();
  });

  it("an unpriced line ticks only once priced; one never ticked does not hold", () => {
    render(composer({ projectId: "project-1", initialFfeItemIds: ["ffe-1"] }));
    expect(checkboxOf("Walnut console")).toBeDisabled();
    expect(checkboxOf("Walnut console")).not.toBeChecked();
    expect(screen.queryByText(/Set a client price/)).not.toBeInTheDocument();
    expect(act()).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("InvoiceComposer · Price it parks the composer (K7, K13)", () => {
  it("parks the selection, closes, and walks to the line's price in the Price lens", () => {
    const onClose = jest.fn();
    render(composer({ projectId: "project-1", initialFfeItemIds: ["ffe-1", "ffe-2"] }, onClose));
    fireEvent.change(screen.getByLabelText("memo · shown to the client"), {
      target: { value: "Spring visit" },
    });
    const priceIt = screen.getByRole("link", { name: "Price it: Walnut console" });
    expect(priceIt).toHaveAttribute("href", "/doc/project-1/pieces?lens=price");
    fireEvent.click(priceIt);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/doc/project-1/pieces?lens=price");
    expect(focusFfeLinePending.request).toEqual({ itemId: "ffe-2", cell: "price" });
    expect(parkedInvoiceComposer("project-1")).toMatchObject({
      ffeItemIds: ["ffe-1", "ffe-2"],
      memo: "Spring visit",
    });
  });

  it("reopening on the project restores its selection; another project's composer starts empty", () => {
    const first = render(composer({ projectId: "project-1", initialFfeItemIds: ["ffe-1", "ffe-2"] }));
    fireEvent.change(screen.getByLabelText("memo · shown to the client"), {
      target: { value: "Spring visit" },
    });
    fireEvent.click(screen.getByRole("link", { name: "Price it: Walnut console" }));
    first.unmount();
    // Leaving through Price it keeps the parked work.
    expect(parkedInvoiceComposer("project-1")).not.toBeNull();

    const other = render(composer({ projectId: "project-2" }));
    expect(checkboxOf("Side table")).not.toBeChecked();
    expect(checkboxOf("Walnut console")).not.toBeChecked();
    expect(screen.getByLabelText("memo · shown to the client")).toHaveValue("");
    other.unmount();
    expect(parkedInvoiceComposer("project-1")).not.toBeNull();

    const back = render(composer({ projectId: "project-1" }));
    expect(checkboxOf("Side table")).toBeChecked();
    expect(checkboxOf("Walnut console")).toBeChecked();
    expect(screen.getByLabelText("memo · shown to the client")).toHaveValue("Spring visit");
    expect(screen.getByText("Set a client price for Walnut console.")).toBeInTheDocument();

    // Put away any other way (discarded, or drafted), it leaves nothing parked.
    back.unmount();
    expect(parkedInvoiceComposer("project-1")).toBeNull();
    render(composer({ projectId: "project-1" }));
    expect(checkboxOf("Side table")).not.toBeChecked();
  });
});
