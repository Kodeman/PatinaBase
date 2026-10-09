/**
 * US-21 T-27 — the Rough in lens assembled (SPEC a2, a8, a9; S1, S5, S6, D8,
 * D13). The tables are T-24's; this suite proves the lens wires each one to
 * its hook, that undo calls restore, that the elevation pane is there, and
 * that nothing here buys, bills or releases. Fixture names are SPEC §4.2's.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockBatch = jest.fn();
/** Thread id → need_label, as `project_ffe_selection_threads` returns it. */
const mockThreads: Record<string, string | null> = {};
const mockMatches = { phone: false };
const mockBuild = jest.fn();
const mockArchive = jest.fn();
const mockRestore = jest.fn();
const mockPlace = jest.fn();
const mockAssign = jest.fn();
const mockAssignState: { isError: boolean; error: unknown } = {
  isError: false,
  error: null,
};
const mockPush = jest.fn();
const mockState: {
  lines: Array<Record<string, unknown>>;
  removed: Array<Record<string, unknown>>;
} = { lines: [], removed: [] };

const EMTEK = {
  id: "p-emtek",
  name: "Emtek Ribbon & Reed knob",
  brand: "Emtek",
  finish: "satin brass",
  price_retail: 3800,
  price_trade: null,
  images: null,
  source_url: null,
  status: "active",
  category: "hardware",
  configuration_mode: "standard",
  configuration_summary: null,
  layer: "studio",
  owner_user_id: null,
  studio_id: "studio-1",
  created_at: "2026-10-01T00:00:00Z",
  capture_source: null,
  captured_at: null,
  field_capture_id: null,
};

jest.mock("@patina/supabase", () => ({
  createBrowserClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: async (_col: string, ids: string[]) =>
          table === "project_ffe_selection_threads"
            ? {
                data: ids
                  .filter((id) => id in mockThreads)
                  .map((id) => ({ id, need_label: mockThreads[id] })),
                error: null,
              }
            : { data: [], error: null },
      }),
    }),
  }),
  useProjectFFEItems: () => ({ data: mockState.lines }),
  useProjectRoomPlacements: () => ({ data: [] }),
  useRemovedProjectLines: () => ({ data: mockState.removed }),
  useBatchCreateNamedProjectNeeds: () => ({
    mutateAsync: mockBatch,
    isPending: false,
  }),
  useSetFfeLineBuildFields: () => ({ mutate: mockBuild }),
  useArchiveProjectSelection: () => ({ mutateAsync: mockArchive }),
  useRestoreProjectSelection: () => ({
    mutateAsync: mockRestore,
    mutate: (vars: unknown) => mockRestore(vars),
  }),
  usePlaceProductInProjectV2: () => ({ mutateAsync: mockPlace }),
  useSetLinePlacements: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useProjectLineGroups: () => ({ data: [] }),
  useSetLineGroup: () => ({ mutate: jest.fn() }),
  useCrossLayerSearch: (opts: { enabled?: boolean }) => ({
    data:
      opts.enabled === false
        ? undefined
        : { byLayer: { personal: [], studio: [EMTEK], catalog: [] } },
    isLoading: false,
    isError: false,
  }),
}));
jest.mock("@/hooks/use-document-rooms", () => ({
  useAssignLineRoom: () => ({ mutate: mockAssign, ...mockAssignState }),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { REMOVED_PLACE } from "@/lib/document/pieces/build-room-url";
import { RoughInLens } from "../rough-in-lens";

const PROJECT = "project-1";
const LIVING = "room-living";
const KITCHEN = "room-kitchen";
const ROOMS = [
  { id: LIVING, name: "Living Room" },
  { id: KITCHEN, name: "Kitchen" },
];

function line(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    quantity: 2,
    unit: "each",
    rough_cents: null,
    project_room_id: LIVING,
    assignment_scope: "room",
    design_disposition: "candidate",
    status: "specified",
    product_id: null,
    vendor_id: null,
    vendor_name: null,
    item_type: "tbd",
    unit_price_cents: 0,
    budget_max_cents: null,
    ffe_line_authorization: null,
    line_kind: "goods",
    parent_ffe_item_id: null,
    purchase_order_id: null,
    trade_scope_document_id: null,
    removed_at: null,
    ...extra,
  };
}

const L1 = line("l1", "Custom cabinet", { rough_cents: 480000 });
const L3 = line("l3", "Hardware, 2 knobs for custom cabinet");

function setup(room: string | null = LIVING) {
  const user = userEvent.setup();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <RoughInLens
        docId="doc-1"
        projectId={PROJECT}
        rooms={ROOMS}
        room={room}
      />
    </QueryClientProvider>,
  );
  return { user };
}

function livingTable() {
  return screen.getByRole("region", { name: "Living Room" });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.lines = [];
  mockState.removed = [];
  mockAssignState.isError = false;
  mockAssignState.error = null;
  for (const id of Object.keys(mockThreads)) delete mockThreads[id];
  mockMatches.phone = false;
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches: query === "(max-width: 767px)" ? mockMatches.phone : false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  })) as unknown as typeof window.matchMedia;
  let n = 0;
  mockBatch.mockImplementation(async () => ({ selectionIds: [`new-${++n}`] }));
  mockArchive.mockResolvedValue({});
  mockRestore.mockResolvedValue({ selectionId: "l3", restored: true });
  mockPlace.mockResolvedValue({ outcome: "filled", selectionId: "l3" });
});

describe("RoughInLens — S1", () => {
  it("four Enters make four lines, with no sheet", async () => {
    const { user } = setup();
    const entry = within(livingTable()).getByRole("textbox", {
      name: "New line in Living Room",
    });
    const names = [
      "Custom cabinet",
      "Countertop for custom cabinets",
      "Hardware, 2 knobs for custom cabinet",
      "Hardware, 4 pulls for custom cabinet",
    ];
    await user.click(entry);
    for (const name of names) await user.keyboard(`${name}{Enter}`);

    expect(mockBatch).toHaveBeenCalledTimes(4);
    names.forEach((name, i) => {
      expect(mockBatch.mock.calls[i][0]).toEqual({
        projectId: PROJECT,
        roomId: LIVING,
        assignmentScope: "room",
        lines: [{ name, quantity: 1, unit: "each" }],
        idempotencyKey: expect.any(String),
      });
    });
    // Each line shows at once, in order, while the next is typed.
    const table = within(livingTable());
    names.forEach((name, i) =>
      expect(table.getByRole("textbox", { name: `Line ${i + 1}` })).toHaveValue(
        name,
      ),
    );
    expect(entry).toHaveFocus();
    expect(entry).toHaveValue("");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("RoughInLens — the hooks", () => {
  it("a cell edit writes through set_project_ffe_line_build_fields", async () => {
    mockState.lines = [L1];
    const { user } = setup();
    const qty = screen.getByRole("textbox", { name: "Qty, Custom cabinet" });
    await user.clear(qty);
    await user.type(qty, "3");
    await user.tab();
    expect(mockBuild).toHaveBeenCalledWith(
      { projectId: PROJECT, itemId: "l1", quantity: 3 },
      expect.anything(),
    );
  });

  it("Move to room… moves the line through useAssignLineRoom", async () => {
    mockState.lines = [L1];
    const { user } = setup();
    await user.click(
      screen.getByRole("button", { name: "Acts for Custom cabinet" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Move to room…" }));
    await user.click(screen.getByRole("menuitem", { name: "Kitchen" }));
    expect(mockAssign).toHaveBeenCalledWith({
      itemId: "l1",
      roomId: KITCHEN,
      assignmentScope: "room",
    });
  });

  it.each([
    "This line sits in 4 rooms. Change its rooms instead.",
    "Labor moves with its piece.",
    "This line is on a drafted release. Send it or void the draft first.",
  ])("a refused move prints the server's sentence: %s", (sentence) => {
    mockState.lines = [L1];
    mockAssignState.isError = true;
    mockAssignState.error = Object.assign(new Error(sentence), {
      code: "23514",
    });
    setup();
    expect(screen.getByRole("alert")).toHaveTextContent(sentence);
    expect(screen.queryByText(/The move did not save/)).toBeNull();
  });

  it("a move that fails for no named reason keeps the generic sentence", () => {
    mockState.lines = [L1];
    mockAssignState.isError = true;
    mockAssignState.error = new Error("Failed to fetch");
    setup();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The move did not save. Use Move to room… to try again.",
    );
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it("Fill with a product fills the placeholder through place_product_in_project_v2", async () => {
    mockState.lines = [L3];
    const { user } = setup();
    await user.click(
      screen.getByRole("button", {
        name: "Acts for Hardware, 2 knobs for custom cabinet",
      }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Fill with a product" }),
    );
    const search = screen.getByRole("combobox", {
      name: "Fill Hardware, 2 knobs for custom cabinet with a product",
    });
    await user.type(search, "knob");
    // Rough in shows no money: the result prints no price (T-55b, F18).
    const option = await screen.findByRole("option", {
      name: "Emtek Ribbon & Reed knob · satin brass",
    });
    expect(option).not.toHaveTextContent("$");
    await user.click(option);
    await waitFor(() => expect(mockPlace).toHaveBeenCalledTimes(1));
    expect(mockPlace.mock.calls[0][0]).toEqual({
      projectId: PROJECT,
      productId: "p-emtek",
      placeholderSelectionId: "l3",
      assignmentScope: "room",
      roomId: LIVING,
      quantity: 2,
      itemType: "fixed",
      disposition: "candidate",
      duplicateMode: "reuse",
      roleConfigurationIdentity: "default",
      idempotencyKey: expect.any(String),
    });
  });

  it("a pasted list previews, then lands through one batch call", async () => {
    const { user } = setup();
    const entry = within(livingTable()).getByRole("textbox", {
      name: "New line in Living Room",
    });
    await user.click(entry);
    await user.paste("Sofa\nCoffee table\nFloor lamp");
    const preview = screen.getByRole("region", { name: /3 lines/i });
    expect(preview).toBeInTheDocument();
    await user.click(
      within(preview).getByRole("button", { name: /add 3 lines/i }),
    );
    await waitFor(() => expect(mockBatch).toHaveBeenCalledTimes(1));
    expect(mockBatch.mock.calls[0][0]).toMatchObject({
      roomId: LIVING,
      assignmentScope: "room",
      lines: [
        { name: "Sofa" },
        { name: "Coffee table" },
        { name: "Floor lamp" },
      ],
    });
  });
});

describe("RoughInLens — remove with undo (D8)", () => {
  it("Remove archives the line, and UNDO calls restore", async () => {
    mockState.lines = [L1, L3];
    const { user } = setup();
    await user.click(
      screen.getByRole("button", {
        name: "Acts for Hardware, 2 knobs for custom cabinet",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Remove" }));

    expect(mockArchive).toHaveBeenCalledWith({
      projectId: PROJECT,
      selectionId: "l3",
      reason: "",
    });
    // The row leaves at once; the toast names it.
    expect(
      screen.queryByRole("textbox", {
        name: "Qty, Hardware, 2 knobs for custom cabinet",
      }),
    ).toBeNull();
    const toast = screen.getByText(
      "Removed Hardware, 2 knobs for custom cabinet ×2 from Living Room.",
    );
    await user.click(
      within(toast.closest("[data-undo-toast]") as HTMLElement).getByRole(
        "button",
        { name: "Undo" },
      ),
    );

    await waitFor(() =>
      expect(mockRestore).toHaveBeenCalledWith({
        projectId: PROJECT,
        selectionId: "l3",
      }),
    );
    expect(
      await screen.findByRole("textbox", {
        name: "Qty, Hardware, 2 knobs for custom cabinet",
      }),
    ).toBeInTheDocument();
  });

  it("a released line's Remove is gated with the door's name, and never archives", async () => {
    mockState.lines = [
      L1,
      line("d1", "Dining table, custom walnut", {
        ffe_line_authorization: "sent",
      }),
    ];
    const { user } = setup();
    await user.click(
      screen.getByRole("button", {
        name: "Acts for Dining table, custom walnut",
      }),
    );
    const remove = screen.getByRole("menuitem", { name: "Remove" });
    expect(remove).toHaveAttribute("aria-disabled", "true");
    expect(remove).toHaveAccessibleDescription(
      "Released lines change through Record a change.",
    );
    await user.click(remove);
    expect(mockArchive).not.toHaveBeenCalled();
  });

  // T-33c (F3): D1's R3/R5 precedence, and every act locked.
  it.each([
    [
      "an installed Trade Scope line",
      "Paintwork and plaster",
      { status: "installed", trade_scope_document_id: "pcd-1" },
      "Engaged",
      "Trade Scope lines change in their scope.",
    ],
    [
      "a line ordered without an authorization",
      "Sconce, aged brass",
      { status: "ordered", product_id: "p-1", item_type: "fixed" },
      "Released to maker",
      "Released lines change through Record a change.",
    ],
  ])(
    "%s prints its own word, never Placeholder, and refuses every act",
    async (_case, name, extra, word, reason) => {
      mockState.lines = [line("x1", name, extra)];
      const { user } = setup();
      expect(within(livingTable()).getByText(word)).toBeInTheDocument();
      expect(within(livingTable()).queryByText("Placeholder")).toBeNull();
      await user.click(
        screen.getByRole("button", { name: `Acts for ${name}` }),
      );
      for (const act of [
        "Fill with a product",
        "Move to room…",
        "Also place in…",
        "Remove",
      ]) {
        const item = screen.getByRole("menuitem", { name: act });
        expect(item).toHaveAttribute("aria-disabled", "true");
        expect(item).toHaveAccessibleDescription(reason);
      }
      await user.click(screen.getByRole("menuitem", { name: "Remove" }));
      expect(mockArchive).not.toHaveBeenCalled();
    },
  );

  it("Removed in the rail puts a line back through restore", async () => {
    mockState.removed = [
      line("r1", "Rattan lounge chair", { removed_at: "2026-10-08T12:00:00Z" }),
    ];
    const { user } = setup(REMOVED_PLACE);
    await user.click(
      screen.getByRole("button", { name: "Put back Rattan lounge chair" }),
    );
    expect(mockRestore).toHaveBeenCalledWith({
      projectId: PROJECT,
      selectionId: "r1",
    });
  });
});

describe("RoughInLens — the elevation pane and what is absent (a2)", () => {
  it("shows the room's elevation with ELEVATION NOT ON FILE and + FILE", async () => {
    mockState.lines = [L1];
    const { user } = setup();
    const pane = screen.getByRole("complementary", {
      name: /living room · elevation/i,
    });
    expect(within(pane).getByText("ELEVATION NOT ON FILE")).toBeInTheDocument();
    expect(within(pane).getByRole("link", { name: "+ File" })).toHaveAttribute(
      "href",
      "/doc/doc-1/plans",
    );

    const toggle = within(livingTable()).getByRole("button", {
      name: "Elevation, Living Room",
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(
      within(screen.getByRole("region", { name: "Kitchen" })).getByRole(
        "button",
        {
          name: "Elevation, Kitchen",
        },
      ),
    );
    expect(
      screen.getByRole("complementary", { name: /kitchen · elevation/i }),
    ).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await user.click(
      screen.getByRole("button", { name: "Elevation, Kitchen" }),
    );
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("prints no buying cells, no Bill, no Release and no roads", () => {
    mockState.lines = [L1, L3];
    setup();
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/\bbill\b/i);
    expect(body).not.toMatch(/releas/i);
    expect(body).not.toMatch(/add to the job|bring in/i);
    expect(body).not.toMatch(/trade cost|client price|markup|order|invoice/i);
    for (const header of within(livingTable()).getAllByRole("columnheader")) {
      expect(header.textContent).toMatch(
        /^(Line|Qty|Unit|Rough \$|Stage|Acts)$/,
      );
    }
  });
});

// T-33a (SQ-679): the T-33 review's F1, F2, F4/F5, F6 and F8 in Rough in.
describe("RoughInLens — at 390 (a13, F1)", () => {
  it("prints cards, not the table, with a visible ADD and every act on screen", async () => {
    mockMatches.phone = true;
    mockState.lines = [L1, L3];
    const { user } = setup();
    const living = livingTable();

    expect(within(living).queryByRole("table")).toBeNull();
    const cards = within(living).getByRole("list");
    expect(within(cards).getAllByRole("listitem")).toHaveLength(2);
    expect(within(cards).getAllByRole("listitem")[0]).toHaveTextContent(
      "×2 · each · ~$4,800 ·Placeholder",
    );
    // No sideways scroller on the phone: only md and up may scroll.
    const scroller = living.closest("[data-rough-in-lens]")
      ?.firstElementChild as HTMLElement;
    expect(scroller.className.split(" ")).not.toContain("overflow-x-auto");
    expect(scroller.className).toContain("md:overflow-x-auto");

    // ADD is a visible act, not only Enter (R3-7).
    await user.type(
      within(living).getByRole("textbox", { name: "New line in Living Room" }),
      "Floor lamp",
    );
    await user.click(
      within(living).getByRole("button", { name: "Add to Living Room" }),
    );
    expect(mockBatch).toHaveBeenCalledTimes(1);
    expect(mockBatch.mock.calls[0][0]).toMatchObject({
      roomId: LIVING,
      lines: [{ name: "Floor lamp", quantity: 1, unit: "each" }],
    });
    expect(
      within(living).getByRole("button", { name: "Done adding, Living Room" }),
    ).toBeInTheDocument();

    // Every act is one tap on the card's ⋯.
    await user.click(
      within(living).getByRole("button", {
        name: "Acts for Hardware, 2 knobs for custom cabinet",
      }),
    );
    for (const act of [
      "Fill with a product",
      "Move to room…",
      "Also place in…",
      "Remove",
    ])
      expect(screen.getByRole("menuitem", { name: act })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(mockArchive).toHaveBeenCalledWith({
      projectId: PROJECT,
      selectionId: "l3",
      reason: "",
    });

    // The hint names no keyboard-only key.
    const text = living.textContent ?? "";
    expect(text).not.toMatch(/⌘↓|TAB MOVES|ENTER ADDS/);
  });
});

describe("RoughInLens — at 1440 with the elevation pane open (F2)", () => {
  it("keeps the pane beside a fluid table, so no column is clipped", () => {
    mockState.lines = [L1];
    setup();
    const pane = screen.getByRole("complementary", {
      name: /living room · elevation/i,
    });
    const lens = pane.closest("[data-rough-in-lens]") as HTMLElement;
    const table = within(livingTable()).getByRole("table");
    // The table fills its scroller and never asks for the a2 956px.
    expect(table.className).toContain("w-full");
    expect(table.className).toContain("min-w-[640px]");
    expect(table.className).not.toMatch(/(^| )w-\[956px\]/);
    expect(lens.contains(table)).toBe(true);
    // STAGE and the ⋯ column are in the table, not past a cut.
    expect(
      within(table).getByRole("columnheader", { name: "Stage" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("button", { name: "Acts for Custom cabinet" }),
    ).toBeInTheDocument();
  });
});

describe("RoughInLens — focus and announcements (F4, F5)", () => {
  it("UNDO puts focus on the restored line and says so", async () => {
    mockState.lines = [L1, L3];
    const { user } = setup();
    await user.click(
      screen.getByRole("button", {
        name: "Acts for Hardware, 2 knobs for custom cabinet",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Remove" }));
    const toast = screen.getByText(
      "Removed Hardware, 2 knobs for custom cabinet ×2 from Living Room.",
    );
    await user.click(
      within(toast.closest("[data-undo-toast]") as HTMLElement).getByRole(
        "button",
        { name: "Undo" },
      ),
    );
    const restored = await screen.findByRole("textbox", { name: "Line 2" });
    await waitFor(() => expect(restored).toHaveFocus());
    expect(restored).toHaveValue("Hardware, 2 knobs for custom cabinet");
    const region = document.querySelector(
      "[data-rough-in-announce]",
    ) as HTMLElement;
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent(
      "Put back Hardware, 2 knobs for custom cabinet ×2 in Living Room.",
    );
  });

  it("Put back under Removed says where the line went and keeps focus on the list", async () => {
    mockState.removed = [
      line("r1", "Rattan lounge chair", { removed_at: "2026-10-08T12:00:00Z" }),
      line("r2", "Side table", { removed_at: "2026-10-08T11:00:00Z" }),
    ];
    const { user } = setup(REMOVED_PLACE);
    await user.click(
      screen.getByRole("button", { name: "Put back Rattan lounge chair" }),
    );
    expect(mockRestore).toHaveBeenCalledWith({
      projectId: PROJECT,
      selectionId: "r1",
    });
    expect(
      await screen.findByText(
        "Put back Rattan lounge chair ×2 in Living Room.",
      ),
    ).toHaveAttribute("aria-live", "polite");
    expect(
      screen.queryByRole("button", { name: "Put back Rattan lounge chair" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Put back Side table" }),
    ).toHaveFocus();

    // The last one: focus rests on the Removed heading, never on BODY.
    await user.click(
      screen.getByRole("button", { name: "Put back Side table" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Removed" })).toHaveFocus(),
    );
  });

  it("Enter-add is announced", async () => {
    const { user } = setup();
    await user.type(
      within(livingTable()).getByRole("textbox", {
        name: "New line in Living Room",
      }),
      "Floor lamp{Enter}",
    );
    expect(within(livingTable()).getByRole("status")).toHaveTextContent(
      "Added Floor lamp to Living Room.",
    );
  });
});

describe("RoughInLens — the need survives a fill (F6, D2, a6)", () => {
  const FILLED = line("l3", "Emtek Ribbon & Reed knob", {
    product_id: "p-emtek",
    item_type: "fixed",
    selection_thread_id: "t3",
  });

  it("prints the thread's need label, not the product's name, in the row, menu and toast", async () => {
    mockThreads.t3 = "Hardware, 2 knobs for custom cabinet";
    mockState.lines = [L1, FILLED];
    const { user } = setup();
    const row = await screen.findByDisplayValue(
      "Hardware, 2 knobs for custom cabinet",
    );
    expect(row).toHaveAccessibleName("Line 2");
    expect(screen.queryByDisplayValue("Emtek Ribbon & Reed knob")).toBeNull();
    await user.click(
      screen.getByRole("button", {
        name: "Acts for Hardware, 2 knobs for custom cabinet",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(
      screen.getByText(
        "Removed Hardware, 2 knobs for custom cabinet ×2 from Living Room.",
      ),
    ).toBeInTheDocument();
  });

  it("a rename of a filled line names the need, never the product", async () => {
    mockThreads.t3 = "Hardware, 2 knobs for custom cabinet";
    mockState.lines = [FILLED];
    const { user } = setup();
    const cell = await screen.findByDisplayValue(
      "Hardware, 2 knobs for custom cabinet",
    );
    await user.clear(cell);
    await user.type(cell, "Hardware, 4 knobs");
    await user.tab();
    expect(mockBuild).toHaveBeenCalledWith(
      { projectId: PROJECT, itemId: "l3", needLabel: "Hardware, 4 knobs" },
      expect.anything(),
    );
  });
});

describe("RoughInLens — a filled allowance keeps its ceiling (F8, Q12)", () => {
  it("sends the line's own item type and budget", async () => {
    mockState.lines = [
      line("a1", "Pendant allowance", {
        item_type: "allowance",
        budget_min_cents: 20000,
        budget_max_cents: 60000,
      }),
    ];
    const { user } = setup();
    await user.click(
      screen.getByRole("button", { name: "Acts for Pendant allowance" }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Fill with a product" }),
    );
    await user.type(
      screen.getByRole("combobox", {
        name: "Fill Pendant allowance with a product",
      }),
      "knob",
    );
    await user.click(
      await screen.findByRole("option", { name: /Emtek Ribbon & Reed knob/ }),
    );
    await waitFor(() => expect(mockPlace).toHaveBeenCalledTimes(1));
    expect(mockPlace.mock.calls[0][0]).toMatchObject({
      placeholderSelectionId: "a1",
      itemType: "allowance",
      budgetMinCents: 20000,
      budgetMaxCents: 60000,
      duplicateMode: "reuse",
    });
  });
});
