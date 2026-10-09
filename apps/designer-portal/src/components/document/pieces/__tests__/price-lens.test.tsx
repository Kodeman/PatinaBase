/**
 * T-40 (a7; S4, D12, Q7, Q16): the Price lens. Front matter
 * `Job · $30,760 priced · ~$36,368 roughed`; the a7 columns with labor `↳`
 * under its piece and the room subtotal; trade cost typed through
 * `set_project_ffe_line_commercials`; markup and client price read-only, with
 * the a7 sentence on an active job; a labor line's own client price typed
 * until it is released (ruling F1); the row menu's four acts; stacked cards at
 * 390; absent for a seat without money.
 * Fixture: SPEC §4.2/§4.4 — Bedroom R1, R1a, R2, R3, and two Living Room
 * lines that bring the job to $30,760 priced and ~$36,368 roughed.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";

type Row = Record<string, unknown> & { id: string };

const mockItems: { data: Row[] } = { data: [] };
const mockStatus: { value: string | null } = { value: "active" };
const mockUseItems = jest.fn(() => ({ data: mockItems.data }));
const mockCommercials = jest.fn();
const mockLaborPrice = jest.fn();
const mockAllowance = jest.fn(async () => ({}));
const mockAddLabor = jest.fn(async () => ({ selectionId: "new-labor" }));
const mockArchive = jest.fn(async () => ({}));
const mockRestore = jest.fn(async () => ({}));
const mockAssign = jest.fn();
const mockAssignState: { isError: boolean; error: unknown } = {
  isError: false,
  error: null,
};

const mutation = (fn: jest.Mock) => ({
  mutate: fn,
  mutateAsync: fn,
  isPending: false,
  isError: false,
});

jest.mock("@patina/supabase", () => ({
  useProjectFFEItems: () => mockUseItems(),
  useProjectRoomPlacements: () => ({ data: [] }),
  useSetFfeLineCommercials: () => mutation(mockCommercials),
  useSetLaborLinePrice: () => mutation(mockLaborPrice),
  useMakeFfeLineAllowance: () => mutation(mockAllowance),
  useAddLaborLine: () => mutation(mockAddLabor),
  useArchiveProjectSelection: () => mutation(mockArchive),
  useRestoreProjectSelection: () => mutation(mockRestore),
  useSetLinePlacements: () => mutation(jest.fn()),
}));
jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => ({
    data: [
      { id: "living", name: "Living Room" },
      { id: "bedroom", name: "Bedroom" },
    ],
  }),
  useAssignLineRoom: () => ({ mutate: mockAssign, ...mockAssignState }),
}));
jest.mock("@/hooks/use-document-state", () => ({
  useDocumentEngagement: () => ({
    data: {
      kind: "engagement",
      row: { project_id: "proj", project_status: mockStatus.value },
    },
  }),
}));

import { ACTIVE_JOB_SENTENCE, PriceLens } from "../price-lens";

const base = {
  status: "specified",
  blocked: false,
  received_quantity: null,
  line_kind: "goods",
  item_type: "fixed",
  unit: "each",
  unit_price_cents: 0,
  trade_price_cents: null,
  budget_max_cents: null,
  rough_cents: null,
  product_id: null,
  product: null,
  vendor_id: null,
  vendor_name: null,
  parent_ffe_item_id: null,
  ffe_line_authorization: null,
  purchase_order_id: null,
  trade_scope_document_id: null,
  assignment_scope: "room",
  removed_at: null,
};

function fixture(overrides: Record<string, Partial<Row>> = {}): Row[] {
  const rows: Row[] = [
    {
      ...base,
      id: "r1",
      name: "Wallpaper, grasscloth",
      project_room_id: "bedroom",
      product_id: "p-pj",
      product: { name: "Phillip Jeffries Manila Hemp, Chalk" },
      quantity: 9,
      unit: "roll",
      unit_price_cents: 23000,
      trade_price_cents: 18400,
    },
    {
      ...base,
      id: "r1a",
      name: "Install, wallpaper hanger",
      project_room_id: "bedroom",
      line_kind: "labor",
      parent_ffe_item_id: "r1",
      vendor_name: "Ridge Installers",
      quantity: 9,
      unit: "roll",
      unit_price_cents: 8500,
      trade_price_cents: 8500,
    },
    {
      ...base,
      id: "r2",
      name: "Bed, king, upholstered",
      project_room_id: "bedroom",
      quantity: 1,
      rough_cents: 420000,
    },
    {
      ...base,
      id: "r3",
      name: "Nightstands",
      project_room_id: "bedroom",
      quantity: 2,
      rough_cents: 95000,
    },
    {
      ...base,
      id: "l1",
      name: "Custom cabinet",
      project_room_id: "living",
      product_id: "p-hollis",
      quantity: 1,
      unit_price_cents: 2792500,
    },
    {
      ...base,
      id: "l2",
      name: "Countertop for custom cabinets",
      project_room_id: "living",
      quantity: 1,
      rough_cents: 3026800,
    },
  ];
  return rows.map((row) => ({ ...row, ...(overrides[row.id] ?? {}) }));
}

function renderLens(room: string | null = "bedroom", canSeeMoney = true) {
  return render(
    <PriceLens
      docId="doc-1"
      projectId="proj"
      room={room}
      canSeeMoney={canSeeMoney}
    />,
  );
}

function rowOf(name: string): HTMLElement {
  return screen
    .getByText(name, { selector: "span" })
    .closest("tr") as HTMLElement;
}

function openMenu(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Acts for ${name}` }));
  return screen.getByRole("menu", { name: `Acts for ${name}` });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockItems.data = fixture();
  mockStatus.value = "active";
  mockAssignState.isError = false;
  mockAssignState.error = null;
});

describe("PriceLens: front matter and the table (a7)", () => {
  it("prints the job's front matter, as the overview counts it", () => {
    renderLens();
    expect(
      screen.getByText("Job · $30,760 priced · ~$36,368 roughed"),
    ).toBeInTheDocument();
  });

  it("prints the a7 columns in order", () => {
    renderLens();
    const heads = screen
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(heads).toEqual([
      "Line",
      "Qty",
      "Unit",
      "Trade cost",
      "Markup",
      "Client price",
      "Rough ~",
      "Acts",
    ]);
  });

  it("prints Bedroom's rows: the labor line indented under its piece, then the subtotal", () => {
    renderLens("bedroom");
    const table = screen.getByRole("table", { name: "Bedroom" });
    const ids = within(table)
      .getAllByRole("row")
      .map((tr) => tr.getAttribute("data-line-id"))
      .filter(Boolean);
    expect(ids).toEqual(["r1", "r1a", "r2", "r3"]);

    const r1 = rowOf("Wallpaper, grasscloth");
    expect(
      within(r1).getByText("Phillip Jeffries Manila Hemp, Chalk"),
    ).toBeInTheDocument();
    expect(
      within(r1).getByLabelText("Trade cost, Wallpaper, grasscloth"),
    ).toHaveValue("$184");
    expect(within(r1).getByText("25%")).toBeInTheDocument();
    expect(within(r1).getByText("$230")).toBeInTheDocument();
    expect(within(r1).getByText("roll")).toBeInTheDocument();

    const labor = rowOf("Install, wallpaper hanger");
    expect(within(labor).getByText("↳")).toBeInTheDocument();
    expect(within(labor).getByText("Labor")).toBeInTheDocument();
    expect(labor.querySelector(".pl-6")).not.toBeNull();
    // No markup on labor priced at its trade cost.
    expect(within(labor).getAllByText("—").length).toBeGreaterThan(0);

    const bed = rowOf("Bed, king, upholstered");
    expect(within(bed).getByText("Placeholder")).toBeInTheDocument();
    expect(within(bed).getByText("~$4,200")).toBeInTheDocument();
    expect(within(bed).getByText("Not priced")).toBeInTheDocument();
    expect(within(rowOf("Nightstands")).getByText("~$950")).toBeInTheDocument();

    expect(
      within(table).getByText("Bedroom · $2,835 priced · ~$6,100 roughed"),
    ).toBeInTheDocument();
    // The rail's room only.
    expect(screen.queryByRole("table", { name: "Living Room" })).toBeNull();
  });

  it("stacks every room holding a line when the rail names none", () => {
    renderLens(null);
    expect(
      screen.getByRole("table", { name: "Living Room" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Bedroom" })).toBeInTheDocument();
  });

  it("prints each figure under its column word at 390 (stacked cards)", () => {
    renderLens();
    const r1 = rowOf("Wallpaper, grasscloth");
    expect(r1.className).toContain("max-md:grid");
    const labels = Array.from(r1.querySelectorAll("td[data-label]")).map((td) =>
      td.getAttribute("data-label"),
    );
    expect(labels).toEqual([
      "Line",
      "Qty",
      "Unit",
      "Trade cost",
      "Markup",
      "Client price",
      "Rough ~",
    ]);
    expect(screen.getByRole("table", { name: "Bedroom" }).className).toContain(
      "max-md:block",
    );
  });
});

describe("PriceLens: what can be typed", () => {
  it("types trade cost through useSetFfeLineCommercials", () => {
    renderLens();
    const input = screen.getByLabelText("Trade cost, Wallpaper, grasscloth");
    fireEvent.focus(input);
    expect(input).toHaveValue("184");
    fireEvent.change(input, { target: { value: "190" } });
    fireEvent.blur(input);
    expect(mockCommercials).toHaveBeenCalledWith(
      { projectId: "proj", itemId: "r1", tradePriceCents: 19000 },
      expect.anything(),
    );
  });

  it("prints markup and a placed line's client price read-only", () => {
    renderLens();
    expect(
      screen.queryByLabelText("Client price, Wallpaper, grasscloth"),
    ).toBeNull();
    expect(screen.queryByLabelText(/^Markup/)).toBeNull();
    expect(
      screen.queryAllByRole("textbox", { name: /Client price, Bed/ }),
    ).toHaveLength(0);
  });

  it("says so on an active job, a7 word for word", () => {
    renderLens();
    expect(screen.getByText(ACTIVE_JOB_SENTENCE)).toBeInTheDocument();
    expect(ACTIVE_JOB_SENTENCE).toBe(
      "This job is active. Markup and client price are read-only here; they change through Record a change. Trade cost can still be typed.",
    );
  });

  it("prints no sentence on a job that is not active, and client price stays read-only", () => {
    mockStatus.value = "planning";
    renderLens();
    expect(screen.queryByText(ACTIVE_JOB_SENTENCE)).toBeNull();
    expect(
      screen.queryByLabelText("Client price, Wallpaper, grasscloth"),
    ).toBeNull();
  });

  it("types an unreleased labor line's client price through useSetLaborLinePrice", () => {
    renderLens();
    const input = screen.getByLabelText(
      "Client price, Install, wallpaper hanger",
    );
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "90" } });
    fireEvent.blur(input);
    expect(mockLaborPrice).toHaveBeenCalledWith(
      { projectId: "proj", itemId: "r1a", unitPriceCents: 9000 },
      expect.anything(),
    );
  });

  it("prints a released labor line's client price read-only; trade cost can still be typed", () => {
    mockItems.data = fixture({
      r1: { ffe_line_authorization: "sent" },
      r1a: { ffe_line_authorization: "sent" },
    });
    renderLens();
    expect(
      screen.queryByLabelText("Client price, Install, wallpaper hanger"),
    ).toBeNull();
    expect(
      within(rowOf("Install, wallpaper hanger")).getByText("$85"),
    ).toBeInTheDocument();
    expect(
      within(rowOf("Install, wallpaper hanger")).getByText("Released"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Trade cost, Wallpaper, grasscloth"),
    ).toBeInTheDocument();
  });

  it("prints trade cost read-only once the line is on an order", () => {
    mockItems.data = fixture({
      r1: { purchase_order_id: "po-1", status: "ordered" },
    });
    renderLens();
    expect(
      screen.queryByLabelText("Trade cost, Wallpaper, grasscloth"),
    ).toBeNull();
    expect(
      within(rowOf("Wallpaper, grasscloth")).getByText("$184"),
    ).toBeInTheDocument();
  });
});

describe("PriceLens: the row menu", () => {
  it("carries Add labor, Make it an allowance, Move to room… and Remove", () => {
    renderLens();
    const menu = openMenu("Wallpaper, grasscloth");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Add labor", "Make it an allowance", "Move to room…", "Remove"]);
  });

  it("makes a line an allowance: typed per unit, sent as the line total (per unit × quantity)", async () => {
    renderLens();
    const menu = openMenu("Wallpaper, grasscloth");
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Make it an allowance" }),
    );
    const form = screen.getByRole("form", {
      name: "Make Wallpaper, grasscloth an allowance",
    });
    const ceiling = within(form).getByLabelText("Ceiling / roll");
    expect(ceiling).toHaveValue("230");
    expect(
      within(form).getByText("Up to $2,070 for the line"),
    ).toBeInTheDocument();
    fireEvent.change(ceiling, { target: { value: "250" } });
    expect(
      within(form).getByText("Up to $2,250 for the line"),
    ).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(
        within(form).getByRole("button", { name: "Make it an allowance" }),
      );
    });
    // 00744 step 10 reads budget_max_cents as the line total: 9 rolls × $250.
    expect(mockAllowance).toHaveBeenCalledWith({
      projectId: "proj",
      itemId: "r1",
      budgetMaxCents: 225000,
    });
  });

  it("prefills an allowance's ceiling per unit from its line total", () => {
    mockItems.data = fixture({
      r1: { item_type: "allowance", budget_max_cents: 225000 },
    });
    renderLens();
    const menu = openMenu("Wallpaper, grasscloth");
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Make it an allowance" }),
    );
    const form = screen.getByRole("form", {
      name: "Make Wallpaper, grasscloth an allowance",
    });
    expect(within(form).getByLabelText("Ceiling / roll")).toHaveValue("250");
    expect(
      within(form).getByText("Up to $2,250 for the line"),
    ).toBeInTheDocument();
  });

  it("prints an allowance line from its ceiling, never its old price, with no markup", () => {
    // After Make it an allowance on a priced line: 00743 keeps unit_price_cents.
    mockItems.data = fixture({
      r1: { item_type: "allowance", budget_max_cents: 225000 },
    });
    renderLens();
    const r1 = rowOf("Wallpaper, grasscloth");
    const client = r1.querySelector(
      'td[data-label="Client price"]',
    ) as HTMLElement;
    expect(within(client).getByText("Up to $250")).toBeInTheDocument();
    expect(
      within(client).getByText("Up to $2,250 for the line"),
    ).toBeInTheDocument();
    expect(within(r1).queryByText("$230")).toBeNull();
    const markup = r1.querySelector('td[data-label="Markup"]') as HTMLElement;
    expect(markup).toHaveTextContent(/^—$/);
    expect(within(r1).queryByText("25%")).toBeNull();
    // The subtotal and the job count the ceiling once: $2,250 + $765 labor.
    expect(
      screen.getByText("Bedroom · $3,015 priced · ~$6,100 roughed"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Job · $30,940 priced · ~$36,368 roughed"),
    ).toBeInTheDocument();
  });

  it("gates labor's acts with the server's own sentences", () => {
    renderLens();
    const menu = openMenu("Install, wallpaper hanger");
    const allowance = within(menu).getByRole("menuitem", {
      name: "Make it an allowance",
    });
    expect(allowance).toHaveAttribute("aria-disabled", "true");
    expect(
      within(menu).getByText("Labor can't be an allowance."),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Add labor" }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(allowance);
    expect(screen.queryByRole("form")).toBeNull();
    expect(mockAllowance).not.toHaveBeenCalled();
  });

  it("gates a released line's allowance and remove: Record a change", () => {
    mockItems.data = fixture({
      r1: { ffe_line_authorization: "client_signed" },
    });
    renderLens();
    const menu = openMenu("Wallpaper, grasscloth");
    expect(
      within(menu).getByRole("menuitem", { name: "Make it an allowance" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(menu).getByRole("menuitem", { name: "Remove" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      within(menu).getAllByText(
        "Released lines change through Record a change.",
      ),
    ).toHaveLength(2);
  });

  it("adds labor under its piece through useAddLaborLine, with its client price", async () => {
    renderLens();
    const menu = openMenu("Wallpaper, grasscloth");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Add labor" }));
    const form = screen.getByRole("form", {
      name: "Add labor to Wallpaper, grasscloth",
    });
    fireEvent.change(within(form).getByLabelText("Labor"), {
      target: { value: "Install, wallpaper hanger" },
    });
    fireEvent.change(within(form).getByLabelText("Client price / roll"), {
      target: { value: "85" },
    });
    await act(async () => {
      fireEvent.click(
        within(form).getByRole("button", { name: "Add the labor line" }),
      );
    });
    expect(mockAddLabor).toHaveBeenCalledWith({
      projectId: "proj",
      parentItemId: "r1",
      name: "Install, wallpaper hanger",
      quantity: 9,
      unit: "roll",
      unitPriceCents: 8500,
    });
  });

  it("moves a line to another room", () => {
    renderLens();
    const menu = openMenu("Bed, king, upholstered");
    fireEvent.click(
      within(menu).getByRole("menuitem", { name: "Move to room…" }),
    );
    fireEvent.click(
      within(screen.getByRole("menu", { name: "Move to room" })).getByRole(
        "menuitem",
        {
          name: "Living Room",
        },
      ),
    );
    expect(mockAssign).toHaveBeenCalledWith({
      itemId: "r2",
      roomId: "living",
      assignmentScope: "room",
    });
  });

  it.each([
    "This line sits in 4 rooms. Change its rooms instead.",
    "Labor moves with its piece.",
    "This line is on a drafted release. Send it or void the draft first.",
  ])("a refused move prints the server's sentence: %s", (sentence) => {
    mockAssignState.isError = true;
    mockAssignState.error = Object.assign(new Error(sentence), {
      code: "23514",
    });
    renderLens();
    expect(screen.getByRole("alert")).toHaveTextContent(sentence);
    expect(screen.queryByText(/The move did not save/)).toBeNull();
  });

  it("a move that fails for no named reason keeps the generic sentence", () => {
    mockAssignState.isError = true;
    mockAssignState.error = new Error(
      'duplicate key value violates unique constraint "x"',
    );
    renderLens();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The move did not save. Use Move to room… to try again.",
    );
    expect(screen.queryByText(/duplicate key/)).toBeNull();
  });

  it("removes a line with an undo", async () => {
    renderLens();
    const menu = openMenu("Nightstands");
    await act(async () => {
      fireEvent.click(within(menu).getByRole("menuitem", { name: "Remove" }));
    });
    expect(mockArchive).toHaveBeenCalledWith({
      projectId: "proj",
      selectionId: "r3",
      reason: "",
    });
    expect(
      screen.queryByRole("button", { name: "Acts for Nightstands" }),
    ).toBeNull();
    expect(
      screen.getByText("Removed Nightstands ×2 from Bedroom."),
    ).toBeInTheDocument();
  });
});

describe("PriceLens: access (R1, Q7)", () => {
  it("is absent for a seat without money, and reads nothing", () => {
    const { container } = renderLens("bedroom", false);
    expect(container).toBeEmptyDOMElement();
    expect(mockUseItems).not.toHaveBeenCalled();
    expect(screen.queryByText(/priced/)).toBeNull();
  });
});
