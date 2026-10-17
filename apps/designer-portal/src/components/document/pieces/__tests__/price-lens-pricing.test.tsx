/**
 * US-37 #4 (contract D4, 00809): two-way pricing on the Price lens, Kody's
 * acceptance 1–6, plus the retail note, the resets and the keys.
 *
 * Fixture: five goods lines in the Living Room, each at 35% over its cost;
 * the dining chairs are four. Every write is a mocked @patina/supabase hook;
 * the lens applies each committed figure at once, so the summary is read
 * straight after the commit.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type Row = Record<string, unknown> & { id: string };

const mockItems: { data: Row[] } = { data: [] };
const mockProjectPricing: {
  data: { markupTargetPercent: number | null; salesTaxRate: number | null };
} = { data: { markupTargetPercent: null, salesTaxRate: null } };
const mockLinePricing = jest.fn();
const mockCommercials = jest.fn();
const mockLineKind = jest.fn(async () => ({}));
const mockResolve = jest.fn();
const mockResetLine = jest.fn();
const mockResetAll = jest.fn();
const mockCreateLine = jest.fn(async () => ({ selectionId: "f-new" }));
const mockSetProjectPricing = jest.fn();

const mutation = (fn: jest.Mock) => ({
  mutate: fn,
  mutateAsync: fn,
  isPending: false,
  isError: false,
});

jest.mock("@patina/supabase", () => ({
  useProjectFFEItems: () => ({ data: mockItems.data }),
  useProjectRoomPlacements: () => ({ data: [] }),
  useSetFfeLineCommercials: () => mutation(mockCommercials),
  useSetLaborLinePrice: () => mutation(jest.fn()),
  useMakeFfeLineAllowance: () => mutation(jest.fn()),
  useAddLaborLine: () => mutation(jest.fn()),
  useArchiveProjectSelection: () => mutation(jest.fn()),
  useRestoreProjectSelection: () => mutation(jest.fn()),
  useSetFfeLinePricing: () => mutation(mockLinePricing),
  useSetFfeLineKind: () => mutation(mockLineKind),
  useResolveFfeCostChange: () => mutation(mockResolve),
  useResetFfeLineMarkup: () => mutation(mockResetLine),
  useResetProjectMarkups: () => mutation(mockResetAll),
  useCreateNamedProjectNeed: () => mutation(mockCreateLine),
  useProjectPricing: () => ({
    data: { projectId: "proj", updatedAt: null, ...mockProjectPricing.data },
  }),
  useSetProjectPricing: () => mutation(mockSetProjectPricing),
  usePricingSettings: () => ({
    data: {
      defaultMarkupPercent: 35,
      freightMarkupPercent: 20,
      deliveryMarkupPercent: 35,
      installMarkupPercent: 35,
      isDefault: false,
      updatedAt: null,
    },
  }),
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

/** Five lines at 35%: cost → client. */
function fixture(overrides: Record<string, Partial<Row>> = {}): Row[] {
  const rows: Row[] = [
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
  return rows.map((row) => ({ ...row, ...(overrides[row.id] ?? {}) }));
}

function renderLens() {
  return render(
    <PriceLens docId="doc-1" projectId="proj" room={null} canSeeMoney />,
  );
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name, { selector: "span" }).closest("tr") as HTMLElement;
}

function cell(name: string, label: string): HTMLElement {
  return rowOf(name).querySelector(`td[data-label="${label}"]`) as HTMLElement;
}

function figure(key: string): string {
  return (
    document.querySelector(`[data-figure="${key}"] dd`)?.textContent ?? ""
  );
}

function gap(): string {
  return document.querySelector("[data-gap] dd")?.textContent ?? "";
}

/** Types over a cell's figure and commits it, as the designer does: focus, type, Enter. */
function typeAndEnter(label: string, text: string) {
  const input = screen.getByLabelText(label);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.keyDown(input, { key: "Enter" });
  return input;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockItems.data = fixture();
  mockProjectPricing.data = { markupTargetPercent: null, salesTaxRate: null };
});

describe("Price lens: Kody's acceptance (US-37 #4)", () => {
  it("1. five items at 35%; the four chairs' line total is 4 × the unit", () => {
    renderLens();
    for (const name of ["Sofa", "Rug", "Drapery", "Dining chairs", "Lamp"]) {
      expect(screen.getByLabelText(`Markup, ${name}`)).toHaveValue("35.0%");
    }
    expect(screen.getByLabelText("Unit client price, Dining chairs")).toHaveValue("$540");
    expect(cell("Dining chairs", "Line total")).toHaveTextContent("$2,160");
    expect(cell("Sofa", "Line total")).toHaveTextContent("$1,350");
    expect(figure("blended-markup")).toBe("35.0%");
    expect(gap()).toBe("0.0% · $0");
  });

  it("2. the rug at 50% markup: its client price and margin follow from the cost", () => {
    renderLens();
    typeAndEnter("Markup, Rug", "50");
    expect(mockLinePricing).toHaveBeenCalledWith(
      { projectId: "proj", itemId: "s2", field: "markup_percent", value: 50 },
      expect.anything(),
    );
    expect(screen.getByLabelText("Unit client price, Rug")).toHaveValue("$3,000");
    expect(screen.getByLabelText("Unit cost, Rug")).toHaveValue("$2,000");
    expect(cell("Rug", "Margin")).toHaveTextContent("33.3%");
    expect(
      within(rowOf("Rug")).getByText("50.0% markup on $2,000 = $3,000 · 33.3% margin"),
    ).toBeInTheDocument();
  });

  it("3. a typed round drapery price is kept exactly; markup and margin are worked back", () => {
    renderLens();
    typeAndEnter("Unit client price, Drapery", "$2,400");
    expect(mockLinePricing).toHaveBeenCalledWith(
      { projectId: "proj", itemId: "s3", field: "unit_client_price_cents", value: 240000 },
      expect.anything(),
    );
    expect(screen.getByLabelText("Unit client price, Drapery")).toHaveValue("$2,400");
    // (2400 − 1777) / 1777 = 35.06%; (2400 − 1777) / 2400 = 25.96%.
    expect(screen.getByLabelText("Markup, Drapery")).toHaveValue("35.1%");
    expect(cell("Drapery", "Margin")).toHaveTextContent("26.0%");
    expect(screen.getByLabelText("Unit cost, Drapery")).toHaveValue("$1,777");
  });

  it("4. a freight line at its own default counts in the blend; Add freight adds one of that kind", async () => {
    mockItems.data = [
      ...fixture(),
      {
        ...base,
        id: "f1",
        name: "Freight",
        line_kind: "freight",
        assignment_scope: "throughout",
        project_room_id: null,
        trade_price_cents: 30000,
        unit_price_cents: 36000,
      },
    ];
    renderLens();
    expect(screen.getByLabelText("Markup, Freight")).toHaveValue("20.0%");
    // (923,895 − 687,700) / 687,700 = 34.35%: the freight's 20% pulls the blend down.
    expect(figure("blended-markup")).toBe("34.3%");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add freight" }));
    });
    expect(mockCreateLine).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "proj",
        name: "Freight",
        quantity: 1,
        assignmentScope: "throughout",
        roomId: null,
      }),
    );
    expect(mockLineKind).toHaveBeenCalledWith({
      projectId: "proj",
      itemId: "f-new",
      lineKind: "freight",
    });
  });

  it("5. the blend and the gap move on each commit, from extended totals", () => {
    renderLens();
    expect(figure("blended-markup")).toBe("35.0%");
    expect(gap()).toBe("0.0% · $0");

    // Four chairs at 50%: +$60 a chair, +$240 on the job.
    typeAndEnter("Markup, Dining chairs", "50");
    expect(figure("blended-markup")).toBe("38.6%");
    expect(figure("blended-margin")).toBe("27.9%");
    expect(gap()).toBe("+3.6% · +$240");

    // The sofa at its cost: −$350 on the job.
    typeAndEnter("Unit client price, Sofa", "1000");
    expect(figure("blended-markup")).toBe("33.3%");
    expect(gap()).toBe("−1.7% · −$110");
  });

  it("6. a cost change flags the line until it is settled, and both settlements call the RPC", () => {
    mockItems.data = fixture({
      s1: {
        trade_price_cents: 100000,
        unit_price_cents: 121500,
        pending_cost_prev_cents: 90000,
        pending_cost_changed_at: "2026-10-17T01:00:00Z",
        pending_markup_held_percent: 35,
      },
    });
    renderLens();
    const flag = document.querySelector('[data-cost-change-for="s1"]') as HTMLElement;
    expect(flag).toHaveTextContent("Sofa: cost changed from $900 to $1,000.");
    expect(within(flag).getByText("$1,215, 21.5% markup")).toBeInTheDocument();
    expect(within(flag).getByText("35.0%, $1,350")).toBeInTheDocument();
    expect(document.querySelector('[data-cost-change-for="s2"]')).toBeNull();

    fireEvent.click(within(flag).getByRole("button", { name: "Keep client price" }));
    expect(mockResolve).toHaveBeenCalledWith(
      { projectId: "proj", itemId: "s1", resolution: "keep_client" },
      expect.anything(),
    );
    fireEvent.click(within(flag).getByRole("button", { name: "Keep markup" }));
    expect(mockResolve).toHaveBeenLastCalledWith(
      { projectId: "proj", itemId: "s1", resolution: "keep_markup" },
      expect.anything(),
    );
    // The flag stands until the server's line says it is settled.
    expect(document.querySelector('[data-cost-change-for="s1"]')).not.toBeNull();
  });
});

describe("Price lens: the summary's tax, target and uncosted lines", () => {
  it("prints sales tax on its own row, outside the blend, and sets the rate as a percent", () => {
    mockProjectPricing.data = { markupTargetPercent: null, salesTaxRate: 0.0825 };
    renderLens();
    expect(screen.getByLabelText("Sales tax %")).toHaveValue("8.25%");
    expect(figure("tax")).toBe("$732.51");
    expect(figure("total-with-tax")).toBe("$9,611.46");
    expect(figure("blended-markup")).toBe("35.0%");

    const rate = screen.getByLabelText("Sales tax %");
    fireEvent.focus(rate);
    fireEvent.change(rate, { target: { value: "9.5" } });
    fireEvent.blur(rate);
    expect(mockSetProjectPricing).toHaveBeenCalledWith(
      { projectId: "proj", markupTargetPercent: null, salesTaxRate: 0.095 },
      expect.anything(),
    );
  });

  it("measures the gap against the job's own target, typed in the summary", () => {
    mockProjectPricing.data = { markupTargetPercent: 40, salesTaxRate: 0.05 };
    renderLens();
    expect(gap()).toMatch(/^−5\.0% · /);
    const target = screen.getByLabelText("Target");
    fireEvent.focus(target);
    fireEvent.change(target, { target: { value: "" } });
    fireEvent.blur(target);
    // Blank puts the job back on the designer's default; the tax rate rides along.
    expect(mockSetProjectPricing).toHaveBeenCalledWith(
      { projectId: "proj", markupTargetPercent: null, salesTaxRate: 0.05 },
      expect.anything(),
    );
  });

  it("says how many lines have no cost", () => {
    mockItems.data = [
      ...fixture(),
      { ...base, id: "n1", name: "Mirror", trade_price_cents: null, unit_price_cents: 0 },
    ];
    renderLens();
    expect(screen.getByText("1 line has no cost.")).toBeInTheDocument();
  });
});

describe("Price lens: retail, refusals and resets", () => {
  it("notes a client price above retail, softly; none without a retail or under it", () => {
    mockItems.data = fixture({
      s2: { retail_unit_cents: 250000 },
      s5: { retail_unit_cents: 30000 },
    });
    renderLens();
    expect(within(rowOf("Rug")).getByText("Above retail ($2,500)")).toBeInTheDocument();
    expect(within(rowOf("Lamp")).queryByText(/Above retail/)).toBeNull();
    expect(within(rowOf("Sofa")).queryByText(/Above retail/)).toBeNull();
    // Soft: the price can still be typed.
    expect(screen.getByLabelText("Unit client price, Rug")).toBeInTheDocument();
  });

  it("prints a refusal on its line, verbatim, and puts the typed figure back", () => {
    const sentence = "This line is invoiced, so its price stays as billed.";
    mockLinePricing.mockImplementation((_vars, options) =>
      options?.onError?.(Object.assign(new Error(sentence), { code: "23514" })),
    );
    renderLens();
    typeAndEnter("Unit client price, Sofa", "1500");
    expect(within(rowOf("Sofa")).getByRole("alert")).toHaveTextContent(sentence);
    expect(screen.getByLabelText("Unit client price, Sofa")).toHaveValue("$1,350");
  });

  it("resets one line to its kind's default from its menu", () => {
    renderLens();
    fireEvent.click(screen.getByRole("button", { name: "Acts for Rug" }));
    fireEvent.click(
      within(screen.getByRole("menu", { name: "Acts for Rug" })).getByRole("menuitem", {
        name: "Reset to default markup",
      }),
    );
    expect(mockResetLine).toHaveBeenCalledWith(
      { projectId: "proj", itemId: "s2" },
      expect.anything(),
    );
  });

  it("resets every line only once the inline question is answered", () => {
    renderLens();
    fireEvent.click(screen.getByRole("button", { name: "Reset all to default markup" }));
    const ask = screen.getByRole("group", { name: "Reset all to default markup" });
    expect(mockResetAll).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole("button", { name: "Keep prices" }));
    expect(mockResetAll).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Reset all to default markup" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Reset all to default markup" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    expect(mockResetAll).toHaveBeenCalledWith({ projectId: "proj" }, expect.anything());
  });
});

describe("Price lens: the keys", () => {
  it("selects the whole figure on focus, so a round price is typed straight over it", async () => {
    const user = userEvent.setup();
    renderLens();
    const input = screen.getByLabelText("Unit client price, Sofa") as HTMLInputElement;
    act(() => input.focus());
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("$1,350".length);
    await user.keyboard("1,400{Enter}");
    expect(mockLinePricing).toHaveBeenCalledWith(
      { projectId: "proj", itemId: "s1", field: "unit_client_price_cents", value: 140000 },
      expect.anything(),
    );
    // Enter commits and keeps the cell, selected for the next figure.
    expect(document.activeElement).toBe(input);
  });

  it("Esc puts the figure back and sends nothing", async () => {
    const user = userEvent.setup();
    renderLens();
    const input = screen.getByLabelText("Markup, Lamp");
    await user.click(input);
    await user.keyboard("99{Escape}");
    expect(input).toHaveValue("35.0%");
    await user.tab();
    expect(mockLinePricing).not.toHaveBeenCalled();
  });

  it("Tab walks a line's figures, then on to the next line; leaving a typed cell commits it", async () => {
    const user = userEvent.setup();
    renderLens();
    await user.click(screen.getByLabelText("Quantity, Sofa"));
    const walk: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      walk.push(document.activeElement?.getAttribute("aria-label") ?? "");
    }
    expect(walk).toEqual([
      "Unit cost, Sofa",
      "Markup, Sofa",
      "Unit client price, Sofa",
      "Retail, Sofa",
      "Acts for Sofa",
      "Quantity, Rug",
    ]);

    await user.click(screen.getByLabelText("Retail, Rug"));
    await user.keyboard("2,500");
    await user.tab();
    expect(mockLinePricing).toHaveBeenCalledWith(
      { projectId: "proj", itemId: "s2", field: "retail_unit_cents", value: 250000 },
      expect.anything(),
    );
  });
});
