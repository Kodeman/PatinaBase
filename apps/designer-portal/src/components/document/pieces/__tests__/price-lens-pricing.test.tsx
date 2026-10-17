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

/** A query's served figures, and whether a refetch of it is in flight. */
const mockItems: { data: Row[]; fetching: boolean } = { data: [], fetching: false };
const mockProjectPricing: {
  data: { markupTargetPercent: number | null; salesTaxRate: number | null };
  fetching: boolean;
} = { data: { markupTargetPercent: null, salesTaxRate: null }, fetching: false };
const mockLinePricing = jest.fn();
const mockCommercials = jest.fn();
const mockLabor = jest.fn();
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
  useProjectFFEItems: () => ({ data: mockItems.data, isFetching: mockItems.fetching }),
  useProjectRoomPlacements: () => ({ data: [] }),
  useSetFfeLineCommercials: () => mutation(mockCommercials),
  useSetLaborLinePrice: () => mutation(mockLabor),
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
  useProjectPricingApproval: () => ({ data: null }),
  useRemovedProjectLines: () => ({ data: [] }),
  useProjectPricing: () => ({
    data: { projectId: "proj", updatedAt: null, ...mockProjectPricing.data },
    isFetching: mockProjectPricing.fetching,
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
  mockItems.fetching = false;
  mockProjectPricing.data = { markupTargetPercent: null, salesTaxRate: null };
  mockProjectPricing.fetching = false;
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

function summaryClient(): string {
  const summary = screen.getByRole("region", { name: "Job summary" });
  return within(summary).getByText("Client").nextElementSibling?.textContent ?? "";
}

describe("Price lens: the boundaries (SQ-1164)", () => {
  it("counts an allowance at its ceiling exactly: $1.00 over 3 units is $1.00 in the Client total and the tax", () => {
    mockItems.data = [
      {
        ...base,
        id: "a1",
        name: "Hardware",
        item_type: "allowance",
        quantity: 3,
        budget_max_cents: 100,
        trade_price_cents: null,
        unit_price_cents: null,
      },
    ];
    // 9.5% of 100¢ is 9.5¢ → 10¢; of a drifted 99¢ it would be 9.405¢ → 9¢.
    mockProjectPricing.data = { markupTargetPercent: null, salesTaxRate: 0.095 };
    renderLens();
    expect(cell("Hardware", "Line total")).toHaveTextContent("$1");
    expect(summaryClient()).toBe("$1");
    expect(figure("tax")).toBe("$0.10");
    expect(figure("total-with-tax")).toBe("$1.10");
  });

  it("shows a saved −100% markup as a price: −100.0%, $0 each and $0 for the line, counted at $0", () => {
    // set_ffe_line_pricing marks the line priced (price_basis); a bare 0 is the column default.
    mockItems.data = fixture({ s5: { unit_price_cents: 0, price_basis: "markup" } });
    renderLens();
    expect(screen.getByLabelText("Markup, Lamp")).toHaveValue("−100.0%");
    expect(screen.getByLabelText("Unit client price, Lamp")).toHaveValue("$0");
    expect(cell("Lamp", "Line total")).toHaveTextContent(/^\$0$/);
    expect(
      within(rowOf("Lamp")).getByText("−100.0% markup on $200 = $0 · — margin"),
    ).toBeInTheDocument();
    // The lamp's $270 is gone from the client total; its $200 cost stays in the blend.
    expect(summaryClient()).toBe("$8,608.95");
    // (860,895 − 657,700) / 657,700 = 30.9%.
    expect(figure("blended-markup")).toBe("30.9%");
  });

  it("shows a typed −100% markup as a price at once, before the server answers", () => {
    renderLens();
    typeAndEnter("Markup, Rug", "-100");
    expect(mockLinePricing).toHaveBeenCalledWith(
      { projectId: "proj", itemId: "s2", field: "markup_percent", value: -100 },
      expect.anything(),
    );
    expect(screen.getByLabelText("Markup, Rug")).toHaveValue("−100.0%");
    expect(screen.getByLabelText("Unit client price, Rug")).toHaveValue("$0");
    expect(cell("Rug", "Line total")).toHaveTextContent(/^\$0$/);
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

describe("Price lens: the status line speaks the summary after a commit (SQ-1171)", () => {
  type Callbacks = {
    onSuccess?: () => void;
    onSettled?: () => void;
    onError?: (cause: unknown) => void;
  };
  type Query = { fetching: boolean };

  /** A server line after a write: its stamp moves. */
  const later = { updated_at: "2026-10-17T01:00:00Z" };
  const labor = {
    ...base,
    id: "s6",
    name: "Install sofa",
    line_kind: "labor",
    parent_ffe_item_id: "s1",
    product_id: null,
    trade_price_cents: 10000,
    unit_price_cents: 13500,
  };
  function withLabor(overrides: Partial<Row> = {}): Row[] {
    return [...fixture(), { ...labor, ...overrides }];
  }

  /**
   * A write as TanStack 5.90 runs it: the hook's own onSuccess starts the
   * refetch of what it changed, then this call's onSuccess and onSettled
   * fire together, before that refetch lands.
   */
  function succeed(...refetches: Query[]) {
    return (_vars: unknown, options?: Callbacks) => {
      for (const query of refetches) query.fetching = true;
      options?.onSuccess?.();
      options?.onSettled?.();
    };
  }

  /**
   * Holds each call until it is answered. As in TanStack, every answered call
   * starts its refetch, but a call's own callbacks fire only while it is the
   * writer's latest call.
   */
  function held(fn: jest.Mock, ...refetches: Query[]) {
    const calls: Callbacks[] = [];
    fn.mockImplementation((_vars: unknown, options?: Callbacks) => {
      calls.push(options ?? {});
    });
    return (index: number) =>
      act(() => {
        for (const query of refetches) query.fetching = true;
        if (index !== calls.length - 1) return;
        calls[index].onSuccess?.();
        calls[index].onSettled?.();
      });
  }

  /** The refetch lands: the server's figures come back and nothing is fetching. */
  function land(
    view: ReturnType<typeof renderLens>,
    items?: Row[],
    pricing?: typeof mockProjectPricing.data,
  ) {
    if (items) mockItems.data = items;
    if (pricing) mockProjectPricing.data = pricing;
    mockItems.fetching = false;
    mockProjectPricing.fetching = false;
    rerenderLens(view);
  }

  /** The lens's one live line (the table keeps a quiet status of its own). */
  function status(): string {
    const line = screen
      .getAllByRole("status")
      .find((el) => el.hasAttribute("data-price-announce"));
    return line?.textContent ?? "";
  }

  /** How many times the live line's words have changed: each one is spoken. */
  function listen(): () => number {
    const line = document.querySelector("[data-price-announce]") as HTMLElement;
    const observer = new MutationObserver(() => undefined);
    observer.observe(line, { childList: true, characterData: true, subtree: true });
    let spoken = 0;
    return () => (spoken += observer.takeRecords().length);
  }

  function rerenderLens(view: ReturnType<typeof renderLens>) {
    view.rerender(<PriceLens docId="doc-1" projectId="proj" room={null} canSeeMoney />);
  }

  it("a committed markup speaks the new Client and Gap figures once its refetch lands", () => {
    mockLinePricing.mockImplementation(succeed(mockItems));
    const view = renderLens();
    expect(status()).toBe("");
    // The rug at 50%: +$300 on the job, $300 over the 35% target.
    typeAndEnter("Markup, Rug", "50");
    expect(status()).toBe("");
    land(view, fixture({ s2: { ...later, unit_price_cents: 300000 } }));
    expect(status()).toBe("Client $9,178.95 · gap $300 over target.");
    // The sofa at its cost: the job falls under the target.
    typeAndEnter("Unit client price, Sofa", "1000");
    land(
      view,
      fixture({
        s1: { ...later, unit_price_cents: 100000 },
        s2: { ...later, unit_price_cents: 300000 },
      }),
    );
    expect(status()).toBe("Client $8,828.95 · gap $50 under target.");
  });

  it("a tax-rate commit speaks once the job's pricing comes back", () => {
    mockSetProjectPricing.mockImplementation(succeed(mockProjectPricing, mockItems));
    const view = renderLens();
    const rate = screen.getByLabelText("Sales tax %");
    fireEvent.focus(rate);
    fireEvent.change(rate, { target: { value: "9.5" } });
    fireEvent.blur(rate);
    // The write landed; the summary has not moved yet, so nothing is said.
    expect(status()).toBe("");
    land(view, undefined, { markupTargetPercent: null, salesTaxRate: 0.095 });
    expect(status()).toBe("Client $8,878.95 · on target · tax $843.50.");
  });

  it("a target commit speaks the new gap", () => {
    mockSetProjectPricing.mockImplementation(succeed(mockProjectPricing, mockItems));
    const view = renderLens();
    typeAndEnter("Target", "40");
    land(view, undefined, { markupTargetPercent: 40, salesTaxRate: null });
    // 40% over $6,577 of cost is $9,207.80: the job sits $328.85 under it.
    expect(status()).toBe("Client $8,878.95 · gap $328.85 under target.");
  });

  it("Esc says nothing; the next committed figure does", async () => {
    mockLinePricing.mockImplementation(succeed(mockItems));
    const user = userEvent.setup();
    const view = renderLens();
    await user.click(screen.getByLabelText("Markup, Lamp"));
    await user.keyboard("99{Escape}");
    expect(mockLinePricing).not.toHaveBeenCalled();
    expect(status()).toBe("");
    await user.keyboard("50{Enter}");
    land(view, fixture({ s5: { ...later, unit_price_cents: 30000 } }));
    // The lamp at 50%: +$30 on the job.
    expect(status()).toBe("Client $8,908.95 · gap $30 over target.");
  });

  it("a refused write keeps its sentence on the line and does not speak the summary", () => {
    const sentence = "This line is invoiced, so its price stays as billed.";
    mockLinePricing.mockImplementation(succeed(mockItems));
    mockLinePricing.mockImplementationOnce((_vars, options) =>
      options?.onError?.(Object.assign(new Error(sentence), { code: "23514" })),
    );
    const view = renderLens();
    typeAndEnter("Unit client price, Sofa", "1500");
    expect(within(rowOf("Sofa")).getByRole("alert")).toHaveTextContent(sentence);
    expect(status()).toBe("");
    // The same status line still speaks the next write that lands.
    typeAndEnter("Markup, Rug", "50");
    land(view, fixture({ s2: { ...later, unit_price_cents: 300000 } }));
    expect(status()).toBe("Client $9,178.95 · gap $300 over target.");
  });

  // SQ-1183 (SQ-1179 F1–F3). Every write below runs as TanStack runs it: the
  // call's own onSuccess and onSettled come before the refetch lands.
  it("F1: a labor client price speaks once its refetch moves the summary", () => {
    mockLabor.mockImplementation(succeed(mockItems));
    mockItems.data = withLabor();
    const view = renderLens();
    typeAndEnter("Unit client price, Install sofa", "200");
    expect(mockLabor).toHaveBeenCalled();
    expect(status()).toBe("");
    land(view, withLabor({ ...later, unit_price_cents: 20000 }));
    expect(status()).toBe("Client $9,078.95 · gap $65 over target.");
  });

  it("F1: a labor trade cost (00692) speaks once its refetch moves the gap", () => {
    mockCommercials.mockImplementation(succeed(mockItems));
    mockItems.data = withLabor();
    const view = renderLens();
    typeAndEnter("Unit cost, Install sofa", "50");
    expect(mockCommercials).toHaveBeenCalled();
    expect(status()).toBe("");
    land(view, withLabor({ ...later, trade_price_cents: 5000 }));
    expect(status()).toBe("Client $9,013.95 · gap $67.50 over target.");
  });

  it("F2: an unchanged target lapses with its refetch; a later move says nothing", () => {
    mockSetProjectPricing.mockImplementation(succeed(mockProjectPricing, mockItems));
    const view = renderLens();
    // The designer's default is already 35%.
    typeAndEnter("Target", "35");
    expect(mockSetProjectPricing).toHaveBeenCalled();
    land(view, undefined, { markupTargetPercent: 35, salesTaxRate: null });
    expect(status()).toBe("");
    // Another device moves the rug's price.
    land(view, fixture({ s2: { ...later, unit_price_cents: 400000 } }));
    expect(status()).toBe("");
  });

  it("an unchanged Retail commit lapses with its refetch; a later move says nothing", () => {
    mockLinePricing.mockImplementation(succeed(mockItems));
    const view = renderLens();
    typeAndEnter("Retail, Rug", "5000");
    land(view, fixture({ s2: { ...later, retail_unit_cents: 500000 } }));
    expect(status()).toBe("");
    land(
      view,
      fixture({ s2: { ...later, retail_unit_cents: 500000, unit_price_cents: 400000 } }),
    );
    expect(status()).toBe("");
  });

  it("F3: an unchanged Retail commit before the target's refetch does not drop the target's sentence", () => {
    mockSetProjectPricing.mockImplementation(succeed(mockProjectPricing, mockItems));
    mockLinePricing.mockImplementation(succeed(mockItems));
    const view = renderLens();
    typeAndEnter("Target", "40");
    expect(status()).toBe("");
    typeAndEnter("Retail, Rug", "5000");
    expect(mockLinePricing).toHaveBeenCalled();
    land(view, fixture({ s2: { ...later, retail_unit_cents: 500000 } }), {
      markupTargetPercent: 40,
      salesTaxRate: null,
    });
    expect(status()).toBe("Client $8,878.95 · gap $328.85 under target.");
  });

  it("R: two quick markup commits speak the final figures once, after the refetch", () => {
    const answer = held(mockLinePricing, mockItems);
    const view = renderLens();
    const heard = listen();
    typeAndEnter("Markup, Rug", "50");
    typeAndEnter("Markup, Lamp", "50");
    answer(0);
    answer(1);
    expect(status()).toBe("");
    land(
      view,
      fixture({
        s2: { ...later, unit_price_cents: 300000 },
        s5: { ...later, unit_price_cents: 30000 },
      }),
    );
    expect(status()).toBe("Client $9,208.95 · gap $330 over target.");
    expect(heard()).toBe(1);
    expect(document.querySelectorAll("[data-price-announce]")).toHaveLength(1);
  });

  it("a markup still speaks when a Retail commit on the same writer follows before it answers", () => {
    const answer = held(mockLinePricing, mockItems);
    const view = renderLens();
    typeAndEnter("Markup, Rug", "50");
    typeAndEnter("Retail, Lamp", "5000");
    // Only the latest call hears its own onSuccess.
    answer(0);
    answer(1);
    land(
      view,
      fixture({
        s2: { ...later, unit_price_cents: 300000 },
        s5: { ...later, retail_unit_cents: 500000 },
      }),
    );
    expect(status()).toBe("Client $9,178.95 · gap $300 over target.");
  });
});
