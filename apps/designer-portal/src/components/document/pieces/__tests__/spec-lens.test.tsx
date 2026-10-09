/**
 * T-29 (a4, a6, a14; S3, S4, D2, D15): the Spec lens. The left pane lists the
 * room's lines as `name · stage · N OF 6`; the right pane carries a4's fields
 * in order; naming a maker or filling flips PLACEHOLDER to SPECCED; the fill
 * previews a6's sentence before `FILL THIS LINE`; `NEXT UNFINISHED →` walks
 * the unfinished lines; the image writes `selected_media`; no money,
 * procurement or receiving prints, a labor line's client price included.
 * T-33b: released and Trade Scope lines take no act (F7); a fill keeps an
 * allowance (F8), focuses the heading and says so (F4/F5); a tap at 390
 * focuses the pane (F9); Spec prints no client price (F10).
 * Fixture: SPEC §4.2, Whole Home Renovation (Living Room, Bedroom).
 */

import type { ReactNode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

type Row = Record<string, unknown> & { id: string };

const mockItems: { data: Row[] } = { data: [] };
const mockPlacements: { data: unknown[] } = { data: [] };
const mockSpecs: { data: Row[] } = { data: [] };
const mockThreads: { data: Row[] } = { data: [] };
const mockGroups: { data: unknown[] } = { data: [] };
const mockUpdateSpec = jest.fn();
const mockCommercials = jest.fn();
const mockBuildFields = jest.fn();
const mockLaborPrice = jest.fn();
const mockPlace = jest.fn();

const mutation = (fn: jest.Mock) => ({ mutateAsync: fn, isPending: false });

jest.mock("@patina/supabase", () => ({
  createBrowserClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: async () => ({
          data:
            table === "project_ffe_specs" ? mockSpecs.data : mockThreads.data,
          error: null,
        }),
      }),
    }),
  }),
  useProjectFFEItems: () => ({ data: mockItems.data }),
  useProjectRoomPlacements: () => ({ data: mockPlacements.data }),
  useProjectLineGroups: () => ({ data: mockGroups.data }),
  useUpdateProjectFfeSpec: () => mutation(mockUpdateSpec),
  useSetFfeLineCommercials: () => mutation(mockCommercials),
  useSetFfeLineBuildFields: () => mutation(mockBuildFields),
  useSetLaborLinePrice: () => mutation(mockLaborPrice),
  usePlaceProductInProjectV2: () => mutation(mockPlace),
  useSetLinePlacements: () => mutation(jest.fn()),
  useAddLaborLine: () => mutation(jest.fn()),
  useFfePairLines: () => ({ data: [] }),
  useLinkFfePair: () => mutation(jest.fn()),
  useCreateNamedProjectNeed: () => mutation(jest.fn()),
}));
jest.mock("@/lib/analytics/document-events", () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => ({
    data: [
      { id: "hall", name: "Hall" },
      { id: "living", name: "Living Room" },
      { id: "bedroom", name: "Bedroom" },
    ],
  }),
}));
jest.mock("../../line-unfold/the-buy-cell", () => ({
  MakerSearch: ({ onChoose }: { onChoose: (o: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChoose({ kind: "vendor", id: "v-hollis", name: "Hollis Millwork" })
      }
    >
      Hollis Millwork
    </button>
  ),
  MakerMatchLine: () => null,
  useAddMaker: () => ({
    add: jest.fn(),
    match: null,
    clearMatch: jest.fn(),
    isPending: false,
  }),
}));
jest.mock("../library-inline-search", () => {
  const actual = jest.requireActual("../library-inline-search");
  const emtek = {
    id: "prod-emtek",
    name: "Emtek Ribbon & Reed knob",
    finish: "satin brass",
    price_retail: 3800,
  };
  return {
    ...actual,
    // The result row prints through the real `libraryResultLine`.
    LibraryInlineSearch: ({
      onChoose,
      onSearchLibrary,
    }: {
      onChoose: (row: unknown) => void;
      onSearchLibrary: (query: string) => void;
    }) => (
      <>
        <span data-testid="inline-result">{actual.libraryResultLine(emtek)}</span>
        <button type="button" onClick={() => onChoose(emtek)}>
          Choose Emtek
        </button>
        <button type="button" onClick={() => onSearchLibrary("knob")}>
          Search the whole Library
        </button>
      </>
    ),
  };
});
jest.mock("../placement-chips", () => ({
  ...jest.requireActual("../placement-chips"),
  PlacementChips: ({ canEdit }: { canEdit: boolean }) => (
    <div data-testid="placement-chips" data-can-edit={String(canEdit)} />
  ),
}));
jest.mock("../labor-act", () => ({
  ...jest.requireActual("../labor-act"),
  LaborAct: ({ canEdit }: { canEdit: boolean }) => (
    <div data-testid="labor-act" data-can-edit={String(canEdit)} />
  ),
}));
jest.mock("../com-toggle", () => ({
  ComToggle: ({ canEdit }: { canEdit: boolean }) => (
    <div data-testid="com-toggle" data-can-edit={String(canEdit)} />
  ),
}));
jest.mock("@/components/portal/proposals/product-picker-modal", () => ({
  ProductPickerModal: ({
    open,
    showPrice,
    configureStep,
  }: {
    open: boolean;
    showPrice?: boolean;
    configureStep?: boolean;
  }) =>
    open ? (
      <div
        data-testid="product-picker"
        data-show-price={String(showPrice)}
        data-configure-step={String(configureStep)}
      />
    ) : null,
}));

import { SpecLens } from "../spec-lens";
import {
  linesForPlace,
  nextUnfinishedId,
  specProgress,
} from "@/lib/document/pieces/spec-progress";

const base = {
  quantity: 1,
  unit: "each",
  product_id: null,
  vendor_id: null,
  vendor_name: null,
  item_type: "tbd",
  unit_price_cents: 0,
  budget_max_cents: null,
  ffe_line_authorization: null,
  line_kind: "goods",
  parent_ffe_item_id: null,
  link_kind: null,
  project_room_id: "living",
  assignment_scope: "room",
  design_disposition: "candidate",
  role_identity: "default",
  purchase_order_id: null,
  trade_scope_document_id: null,
  rough_cents: null,
  status: "specified",
  product: null,
};

const L1: Row = {
  ...base,
  id: "l1",
  name: "Custom cabinet",
  quantity: 2,
  rough_cents: 480000,
  selection_thread_id: "t1",
};
const L2: Row = {
  ...base,
  id: "l2",
  name: "Countertop for custom cabinets",
  quantity: 2,
  rough_cents: 140000,
  selection_thread_id: "t2",
};
const L3: Row = {
  ...base,
  id: "l3",
  name: "Hardware, 2 knobs for custom cabinet",
  quantity: 2,
  selection_thread_id: "t3",
};
const F1: Row = {
  ...base,
  id: "f1",
  name: "White oak floor, satin Bona finish",
  quantity: 830,
  unit: "sq_ft",
  vendor_name: "Nord Hardwood Co.",
  selection_thread_id: "t4",
};
const R1: Row = {
  ...base,
  id: "r1",
  name: "Wallpaper, grasscloth",
  quantity: 9,
  unit: "roll",
  project_room_id: "bedroom",
  product_id: "prod-hemp",
  vendor_id: "v-pj",
  item_type: "fixed",
  unit_price_cents: 23000,
  selection_thread_id: "t5",
};
const R1A: Row = {
  ...base,
  id: "r1a",
  name: "Install, wallpaper hanger",
  quantity: 9,
  unit: "roll",
  project_room_id: "bedroom",
  line_kind: "labor",
  link_kind: "labor",
  parent_ffe_item_id: "r1",
  rough_cents: 8500,
  unit_price_cents: 8500,
  selection_thread_id: "t6",
};

const spec = (
  ffeItemId: string,
  fields: Record<string, unknown> = {},
): Row => ({
  id: `spec-${ffeItemId}`,
  ffe_item_id: ffeItemId,
  row_version: 3,
  finish: null,
  material: null,
  color_fabric: null,
  selected_dimensions: null,
  exact_location: null,
  trade_notes: null,
  selected_media: [],
  ...fields,
});

function seed() {
  mockItems.data = [L1, L2, L3, F1, R1, R1A];
  mockPlacements.data = [
    {
      id: "p1",
      ffeItemId: "f1",
      projectRoomId: "living",
      quantity: 320,
      areaNote: null,
      sortOrder: 0,
    },
    {
      id: "p2",
      ffeItemId: "f1",
      projectRoomId: "hall",
      quantity: 120,
      areaNote: null,
      sortOrder: 1,
    },
  ];
  mockSpecs.data = [
    spec("l1", {
      finish: "Painted",
      material: "Paint grade",
      color_fabric: "Farrow & Ball Railings No. 31",
      trade_notes: "Fluted doors, see elevation 3",
    }),
    spec("l2"),
    spec("l3"),
    spec("f1", {
      finish: "Satin Bona",
      selected_media: [{ url: "https://example.com/oak.jpg" }],
      selected_dimensions: { width: "TBD", unit: "in" },
    }),
    spec("r1"),
    spec("r1a"),
  ];
  mockThreads.data = [
    { id: "t1", need_label: "Custom cabinet" },
    { id: "t3", need_label: "Hardware, 2 knobs for custom cabinet" },
  ];
  mockGroups.data = [];
}

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderLens = (room = "living", canSeeMoney = true) =>
  render(
    <SpecLens
      docId="d1"
      projectId="p1"
      room={room}
      canSeeMoney={canSeeMoney}
    />,
    { wrapper },
  );

/** The fields pane, once the spec rows have loaded. */
const pane = async () => {
  const section = await screen.findByTestId("spec-fields-pane");
  await within(section).findByRole("group", { name: "Finish" });
  return section;
};

const rowFor = (name: string) =>
  screen
    .getByRole("list", { name: "Lines" })
    .querySelector(
      `li:nth-child(${["Custom cabinet", "Countertop for custom cabinets", "Hardware, 2 knobs for custom cabinet", "White oak floor, satin Bona finish"].indexOf(name) + 1}) button`,
    ) as HTMLElement;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest.clearAllMocks();
  seed();
  mockUpdateSpec.mockImplementation(
    async ({ changes }: { changes: object }) => ({
      ...spec("l1"),
      ...changes,
      row_version: 4,
    }),
  );
  mockCommercials.mockResolvedValue({});
  mockPlace.mockResolvedValue({ outcome: "filled" });
  mockLaborPrice.mockResolvedValue({});
});

describe("the left pane", () => {
  it("lists the room's lines as name · stage · N OF 6", async () => {
    renderLens();
    await pane();
    const list = screen.getByRole("list", { name: "Lines" });
    const rows = within(list).getAllByRole("button");
    expect(rows.map((r) => r.textContent)).toEqual([
      "Custom cabinetPlaceholder3 OF 6",
      "Countertop for custom cabinetsPlaceholder0 OF 6",
      "Hardware, 2 knobs for custom cabinetPlaceholder0 OF 6",
      expect.stringMatching(
        /^White oak floor, satin Bona finishALSO IN HALL · 320 SQ FT HERESpecced4 OF 6$/,
      ),
    ]);
    // The first unfinished line is open.
    expect(rows[0]).toHaveAttribute("aria-current", "true");
  });

  it("puts a labor line under its piece, with LABOR beside its stage", async () => {
    renderLens("bedroom");
    await pane();
    const rows = within(
      screen.getByRole("list", { name: "Lines" }),
    ).getAllByRole("button");
    expect(rows[0]).toHaveTextContent("Wallpaper, grasscloth");
    // No maker named for the labor yet, so D1 reads it as a placeholder.
    expect(rows[1]).toHaveTextContent(
      "↳Install, wallpaper hangerLaborPlaceholder0 OF 6",
    );
  });

  it("prints the shower as a heading over its six lines, each ↳ (T-52, S3)", async () => {
    const bath = (id: string, name: string, grouped: boolean): Row => ({
      ...base,
      id,
      name,
      quantity: 1,
      // The mocked rooms have no Primary Bath; the bedroom stands in.
      project_room_id: "bedroom",
      line_group_id: grouped ? "g1" : null,
    });
    mockItems.data = [
      bath("b1", "Valve and trim", true),
      bath("b2", "Shower head", true),
      bath("b3", "Hand shower", true),
      bath("b4", "Linear drain", true),
      bath("b5", "Niche tile", true),
      bath("b6", "Glass panel", true),
      bath("b7", "Vanity, 60 in, double", false),
    ];
    mockSpecs.data = [];
    mockGroups.data = [
      {
        id: "g1",
        projectId: "p1",
        projectRoomId: "bedroom",
        name: "Shower",
        sortOrder: 0,
      },
    ];
    renderLens("bedroom");
    const list = await screen.findByRole("list", { name: "Lines" });
    const items = within(list).getAllByRole("listitem");
    // The heading: its name only, no stamp, no count, no act.
    expect(items[0]).toHaveTextContent(/^Shower$/);
    expect(within(items[0]).queryByRole("button")).toBeNull();
    expect(items[0].querySelector(".stamp")).toBeNull();
    expect(items.slice(1).map((li) => li.textContent)).toEqual([
      "↳Valve and trimPlaceholder0 OF 6",
      "↳Shower headPlaceholder0 OF 6",
      "↳Hand showerPlaceholder0 OF 6",
      "↳Linear drainPlaceholder0 OF 6",
      "↳Niche tilePlaceholder0 OF 6",
      "↳Glass panelPlaceholder0 OF 6",
      "Vanity, 60 in, doublePlaceholder0 OF 6",
    ]);
  });
});

describe("the right pane", () => {
  it("carries a4's fields in order, with the need label and See drawings", async () => {
    renderLens();
    const section = await pane();
    expect(within(section).getByText("What we need")).toBeInTheDocument();
    expect(
      within(section).getByRole("heading", { level: 2 }),
    ).toHaveTextContent("Custom cabinet · ×2");
    const labels = within(section)
      .getAllByRole("group")
      .map((g) => g.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Maker",
      "Product",
      "Image",
      "Finish",
      "Material",
      "Color",
      "Dimensions",
      "Exact location",
      "Notes",
      "Rooms",
      "Unit",
      "Labor",
      "COM",
    ]);
    expect(
      within(section).getByRole("button", { name: "FILL WITH A PRODUCT" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("button", { name: "BRING IN…" }),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole("textbox", { name: "Exact location" }),
    ).toHaveAttribute("placeholder", "See drawings");
    expect(
      within(section).getByRole("textbox", { name: "Finish" }),
    ).toHaveValue("Painted");
  });

  it("prints the rough figure dim, pointing to Price", async () => {
    renderLens();
    await pane();
    expect(screen.getByTestId("spec-rough")).toHaveTextContent(
      "~$4,800 each · set the price in Price",
    );
  });

  it("hides money, procurement and receiving on a goods line", async () => {
    renderLens();
    const section = await pane();
    for (const word of [
      /client price/i,
      /trade cost/i,
      /markup/i,
      /purchase order/i,
      /receiv/i,
      /\bbill\b/i,
      /\border\b/i,
    ]) {
      expect(within(section).queryAllByText(word)).toHaveLength(0);
    }
  });
});

describe("the stamp", () => {
  it("flips PLACEHOLDER to SPECCED on naming a maker (a4)", async () => {
    const view = renderLens();
    const section = await pane();
    expect(within(section).getByTestId("spec-stamp")).toHaveTextContent(
      "Placeholder",
    );

    fireEvent.click(
      within(section).getByRole("button", { name: "NAME A MAKER" }),
    );
    fireEvent.click(
      within(section).getByRole("button", { name: "Hollis Millwork" }),
    );
    await waitFor(() =>
      expect(mockCommercials).toHaveBeenCalledWith({
        projectId: "p1",
        itemId: "l1",
        vendorId: "v-hollis",
      }),
    );

    mockItems.data = mockItems.data.map((r) =>
      r.id === "l1"
        ? { ...r, vendor_id: "v-hollis", vendor_name: "Hollis Millwork" }
        : r,
    );
    view.rerender(
      <SpecLens docId="d1" projectId="p1" room="living" canSeeMoney />,
    );
    expect(screen.getByTestId("spec-stamp")).toHaveTextContent("Specced");
    expect(rowFor("Custom cabinet")).toHaveTextContent(
      "Custom cabinetSpecced4 OF 6",
    );
  });

  it("fills in place through the a6 preview, keeping the need label, then flips (a6)", async () => {
    const view = renderLens();
    await pane();
    fireEvent.click(rowFor("Hardware, 2 knobs for custom cabinet"));
    const section = await pane();
    expect(within(section).getByTestId("spec-stamp")).toHaveTextContent(
      "Placeholder",
    );

    fireEvent.click(
      within(section).getByRole("button", { name: "FILL WITH A PRODUCT" }),
    );
    fireEvent.click(
      within(section).getByRole("button", { name: "Choose Emtek" }),
    );

    const preview = within(section).getByTestId("fill-preview");
    expect(preview).toHaveTextContent("Hardware, 2 knobs for custom cabinet");
    expect(preview).toHaveTextContent(
      "Emtek Ribbon & Reed knob, satin brass · ×2",
    );
    expect(preview).toHaveTextContent(
      "The need stays on the line. The PO carries the product.",
    );
    expect(mockPlace).not.toHaveBeenCalled();

    // F4/F5: the chosen product's act takes focus, and the choice is said.
    const fillAct = within(preview).getByRole("button", {
      name: "FILL THIS LINE",
    });
    expect(fillAct).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Emtek Ribbon & Reed knob chosen. Fill this line, or put it back.",
    );

    fireEvent.click(fillAct);
    await waitFor(() => expect(mockPlace).toHaveBeenCalledTimes(1));
    expect(mockPlace.mock.calls[0][0]).toMatchObject({
      projectId: "p1",
      productId: "prod-emtek",
      placeholderSelectionId: "l3",
      assignmentScope: "room",
      roomId: "living",
      disposition: "candidate",
      duplicateMode: "reuse",
      itemType: "fixed",
      quantity: 2,
      roleConfigurationIdentity: "default",
    });
    expect(mockPlace.mock.calls[0][0]).not.toHaveProperty("budgetMaxCents");
    expect(typeof mockPlace.mock.calls[0][0].idempotencyKey).toBe("string");

    // F4/F5: focus lands on the filled line's heading, and the fill is said.
    await waitFor(() =>
      expect(within(section).getByRole("heading", { level: 2 })).toHaveFocus(),
    );
    expect(document.activeElement).toHaveTextContent(
      "Hardware, 2 knobs for custom cabinet · ×2",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Hardware, 2 knobs for custom cabinet filled with Emtek Ribbon & Reed knob.",
    );

    // The fill renames the line to the product; the need label stays on the thread.
    mockItems.data = mockItems.data.map((r) =>
      r.id === "l3"
        ? {
            ...r,
            name: "Emtek Ribbon & Reed knob",
            product_id: "prod-emtek",
            product: {
              id: "prod-emtek",
              name: "Emtek Ribbon & Reed knob",
              images: [],
            },
          }
        : r,
    );
    view.rerender(
      <SpecLens docId="d1" projectId="p1" room="living" canSeeMoney />,
    );
    const after = await pane();
    expect(within(after).getByTestId("spec-stamp")).toHaveTextContent(
      "Specced",
    );
    expect(within(after).getByRole("heading", { level: 2 })).toHaveTextContent(
      "Hardware, 2 knobs for custom cabinet · ×2",
    );
    expect(
      within(after).getAllByText("Emtek Ribbon & Reed knob").length,
    ).toBeGreaterThan(0);
  });

  it.each([true, false])(
    "leaves out the price in the preview (canSeeMoney %s; Q7)",
    async (canSeeMoney) => {
      renderLens("living", canSeeMoney);
      await pane();
      fireEvent.click(rowFor("Hardware, 2 knobs for custom cabinet"));
      const section = await pane();
      fireEvent.click(
        within(section).getByRole("button", { name: "FILL WITH A PRODUCT" }),
      );
      fireEvent.click(
        within(section).getByRole("button", { name: "Choose Emtek" }),
      );
      expect(within(section).getByTestId("fill-preview")).not.toHaveTextContent(
        "$",
      );
    },
  );

  it.each([true, false])(
    "the Spec-mounted search and picker print no money (canSeeMoney %s; T-55b, F18)",
    async (canSeeMoney) => {
      renderLens("living", canSeeMoney);
      await pane();
      fireEvent.click(rowFor("Hardware, 2 knobs for custom cabinet"));
      const section = await pane();
      fireEvent.click(
        within(section).getByRole("button", { name: "FILL WITH A PRODUCT" }),
      );
      expect(within(section).getByTestId("inline-result")).toHaveTextContent(
        "Emtek Ribbon & Reed knob · satin brass",
      );
      expect(within(section).getByTestId("inline-result")).not.toHaveTextContent(
        "$",
      );

      fireEvent.click(
        within(section).getByRole("button", { name: "Search the whole Library" }),
      );
      const picker = screen.getByTestId("product-picker");
      expect(picker).toHaveAttribute("data-show-price", "false");
      expect(picker).toHaveAttribute("data-configure-step", "false");
    },
  );

  it("keeps an allowance an allowance, with its ceiling (F8, Q12)", async () => {
    mockItems.data = mockItems.data.map((r) =>
      r.id === "l3"
        ? {
            ...r,
            item_type: "allowance",
            budget_min_cents: 2000,
            budget_max_cents: 120000,
          }
        : r,
    );
    renderLens();
    await pane();
    fireEvent.click(rowFor("Hardware, 2 knobs for custom cabinet"));
    const section = await pane();
    fireEvent.click(
      within(section).getByRole("button", { name: "FILL WITH A PRODUCT" }),
    );
    fireEvent.click(
      within(section).getByRole("button", { name: "Choose Emtek" }),
    );
    fireEvent.click(
      within(section).getByRole("button", { name: "FILL THIS LINE" }),
    );
    await waitFor(() => expect(mockPlace).toHaveBeenCalledTimes(1));
    expect(mockPlace.mock.calls[0][0]).toMatchObject({
      placeholderSelectionId: "l3",
      itemType: "allowance",
      budgetMinCents: 2000,
      budgetMaxCents: 120000,
      duplicateMode: "reuse",
    });
  });
});

describe("at 390 (a14, F9)", () => {
  const setStacked = (matches: boolean) => {
    (window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches,
      media: query,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  };
  afterEach(() => setStacked(false));

  it("brings a tapped line's pane into view by focusing its heading", async () => {
    setStacked(true);
    renderLens();
    await pane();
    fireEvent.click(rowFor("Countertop for custom cabinets"));
    const section = await pane();
    const heading = within(section).getByRole("heading", { level: 2 });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveTextContent("Countertop for custom cabinets · ×2");
    expect(window.matchMedia).toHaveBeenCalledWith("(max-width: 767.98px)");
  });

  it("leaves focus on the list at 1440, where the pane sits beside it", async () => {
    setStacked(false);
    renderLens();
    await pane();
    const row = rowFor("Countertop for custom cabinets");
    row.focus();
    fireEvent.click(row);
    const section = await pane();
    expect(
      within(section).getByRole("heading", { level: 2 }),
    ).toHaveTextContent("Countertop for custom cabinets · ×2");
    expect(row).toHaveFocus();
  });
});

describe("NEXT UNFINISHED →", () => {
  it("walks to the next line with fewer than six fields", async () => {
    renderLens();
    await pane();
    fireEvent.click(screen.getByRole("button", { name: "NEXT UNFINISHED →" }));
    const section = await pane();
    expect(
      within(section).getByRole("heading", { level: 2 }),
    ).toHaveTextContent("Countertop for custom cabinets · ×2");
  });
});

describe("the image (D15)", () => {
  it("writes a pasted link to selected_media", async () => {
    renderLens();
    const section = await pane();
    const input = within(section).getByLabelText("Paste an image link");
    fireEvent.change(input, {
      target: { value: "https://example.com/cabinet.jpg" },
    });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mockUpdateSpec).toHaveBeenCalledTimes(1));
    expect(mockUpdateSpec.mock.calls[0][0]).toEqual({
      projectId: "p1",
      specId: "spec-l1",
      expectedRowVersion: 3,
      changes: { selected_media: [{ url: "https://example.com/cabinet.jpg" }] },
    });
  });

  it("writes a dropped link, and refuses a link that is not a web link", async () => {
    renderLens();
    const section = await pane();
    const box = within(section).getByTestId("spec-image-drop");
    fireEvent.drop(box, {
      dataTransfer: {
        getData: (type: string) =>
          type === "text/uri-list" ? "https://example.com/dropped.jpg" : "",
      },
    });
    await waitFor(() =>
      expect(mockUpdateSpec.mock.calls[0][0].changes).toEqual({
        selected_media: [{ url: "https://example.com/dropped.jpg" }],
      }),
    );

    const input = within(section).getByLabelText("Paste an image link");
    fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockUpdateSpec).toHaveBeenCalledTimes(1);
    expect(
      within(section).getByText(/That is not a web link/),
    ).toBeInTheDocument();
  });

  it("saves a spec field on blur with its row version", async () => {
    renderLens();
    const section = await pane();
    const material = within(section).getByRole("textbox", { name: "Material" });
    fireEvent.change(material, { target: { value: "Maple" } });
    await act(async () => {
      fireEvent.blur(material);
    });
    expect(mockUpdateSpec.mock.calls[0][0]).toMatchObject({
      specId: "spec-l1",
      expectedRowVersion: 3,
      changes: { material: "Maple" },
    });
  });
});

describe("no client price in Spec (F10, Q7)", () => {
  it.each([
    ["unreleased", null],
    ["released", "sent"],
  ])(
    "prints none on a %s labor line, even for a seat with money",
    async (_label, authorization) => {
      mockItems.data = mockItems.data.map((r) =>
        r.id === "r1a" || r.id === "r1"
          ? {
              ...r,
              ffe_line_authorization: authorization,
              ...(r.id === "r1a" ? { unit_price_cents: 9000 } : {}),
            }
          : r,
      );
      renderLens("bedroom", true);
      await pane();
      fireEvent.click(
        within(screen.getByRole("list", { name: "Lines" })).getAllByRole(
          "button",
        )[1],
      );
      const section = await pane();
      expect(
        within(section).getByRole("heading", { level: 2 }),
      ).toHaveTextContent("Install, wallpaper hanger");
      expect(within(section).queryAllByText(/client price/i)).toHaveLength(0);
      expect(
        within(section).queryByRole("group", { name: "Client price / unit" }),
      ).toBeNull();
      // r1a's client price is $90 a roll; only Rough $ (~$85) may print.
      expect(section).not.toHaveTextContent("$90");
      expect(
        within(section).queryByRole("textbox", { name: /price/i }),
      ).toBeNull();
      expect(screen.getByTestId("spec-rough")).toHaveTextContent(
        "~$85 / roll · set the price in Price",
      );
      expect(mockLaborPrice).not.toHaveBeenCalled();
    },
  );

  it("prints none on a priced goods line", async () => {
    renderLens("bedroom", true);
    const section = await pane();
    expect(
      within(section).getByRole("heading", { level: 2 }),
    ).toHaveTextContent("Wallpaper, grasscloth");
    expect(within(section).queryAllByText(/client price/i)).toHaveLength(0);
    expect(section).not.toHaveTextContent("$");
  });
});

describe("a released line, or a Trade Scope line, takes no act (F7)", () => {
  const TS: Row = {
    ...base,
    id: "ts1",
    name: "Paintwork and plaster",
    project_room_id: "kitchen",
    status: "installed",
    trade_scope_document_id: "pcd-1",
    selection_thread_id: "t9",
  };
  const RL: Row = {
    ...base,
    id: "rl1",
    name: "Dining chairs, allowance",
    project_room_id: "kitchen",
    item_type: "allowance",
    budget_max_cents: 120000,
    ffe_line_authorization: "sent",
    selection_thread_id: "t10",
  };

  beforeEach(() => {
    mockItems.data = [TS, RL];
    mockPlacements.data = [];
    mockSpecs.data = [spec("ts1"), spec("rl1")];
  });

  it.each([
    [0, "Trade Scope lines change in their scope."],
    [1, "Released lines change through Record a change."],
  ])(
    "row %i offers no fill, maker, COM, chip or labor act, and says why",
    async (index, reason) => {
      renderLens("kitchen");
      await pane();
      fireEvent.click(
        within(screen.getByRole("list", { name: "Lines" })).getAllByRole(
          "button",
        )[index],
      );
      const section = await pane();

      for (const name of [/MAKER$/, "FILL WITH A PRODUCT", "BRING IN…"]) {
        const act = within(section).getByRole("button", { name });
        expect(act).toHaveAttribute("aria-disabled", "true");
        expect(act).toHaveAccessibleDescription(reason);
        fireEvent.click(act);
      }
      expect(screen.queryByTestId("product-picker")).toBeNull();
      expect(
        within(section).queryByRole("button", { name: "Hollis Millwork" }),
      ).toBeNull();
      expect(
        within(section).queryByRole("button", { name: "Choose Emtek" }),
      ).toBeNull();

      for (const [group, testId] of [
        ["Rooms", "placement-chips"],
        ["Labor", "labor-act"],
        ["COM", "com-toggle"],
      ]) {
        const field = within(section).getByRole("group", { name: group });
        expect(within(field).getByTestId(testId)).toHaveAttribute(
          "data-can-edit",
          "false",
        );
        expect(field).toHaveTextContent(reason);
      }
    },
  );

  it("leaves an open line's chips, labor and COM editable", async () => {
    seed();
    renderLens();
    const section = await pane();
    for (const testId of ["placement-chips", "labor-act", "com-toggle"]) {
      expect(within(section).getByTestId(testId)).toHaveAttribute(
        "data-can-edit",
        "true",
      );
    }
  });
});

describe("a line past ordered, or a Trade Scope line (T-33c, F3)", () => {
  const T1: Row = {
    ...base,
    id: "t1",
    name: "Paintwork and plaster",
    project_room_id: "kitchen",
    status: "installed",
    item_type: "fixed",
    trade_scope_document_id: "pcd-1",
    selection_thread_id: "t7",
  };
  const O1: Row = {
    ...base,
    id: "o1",
    name: "Sconce, aged brass",
    project_room_id: "kitchen",
    status: "ordered",
    product_id: "prod-sconce",
    item_type: "fixed",
    unit_price_cents: 3800,
    selection_thread_id: "t8",
  };

  beforeEach(() => {
    mockItems.data = [T1, O1];
    mockPlacements.data = [];
    mockSpecs.data = [spec("t1"), spec("o1")];
  });

  it.each([
    [0, "Engaged", "Trade Scope lines change in their scope."],
    [
      1,
      "Released to maker",
      "This line is released. Quantity and unit change through Record a change.",
    ],
  ])(
    "row %i reads %s, never Placeholder, and its acts are locked",
    async (index, word, unitReason) => {
      renderLens("kitchen");
      await pane();
      const rows = within(
        screen.getByRole("list", { name: "Lines" }),
      ).getAllByRole("button");
      expect(rows[index]).toHaveTextContent(word);
      expect(rows[index]).not.toHaveTextContent("Placeholder");
      fireEvent.click(rows[index]);
      const section = await pane();
      expect(within(section).getByTestId("spec-stamp")).toHaveTextContent(word);
      const maker = within(section).getByRole("button", { name: /MAKER$/ });
      expect(maker).toHaveAttribute("aria-disabled", "true");
      const unit = within(section).getByRole("combobox", { name: "Unit" });
      expect(unit).toHaveAttribute("aria-disabled", "true");
      expect(unit).toHaveAccessibleDescription(unitReason);
    },
  );
});

describe("spec-progress", () => {
  it("counts product or maker, image, finish, material, color and dimensions", () => {
    expect(specProgress({ product_id: null, vendor_name: "  " }, null)).toBe(0);
    expect(
      specProgress(
        { vendor_name: "Hollis Millwork" },
        {
          finish: "Painted",
          material: "Paint grade",
          color_fabric: "Railings",
          selected_media: ["https://example.com/a.jpg"],
          selected_dimensions: { width: 72, unit: "in" },
        },
      ),
    ).toBe(6);
    expect(specProgress({}, { selected_dimensions: { unit: "in" } })).toBe(0);
  });

  it("finds the next unfinished line after the current one, wrapping", () => {
    const progress: Record<string, number> = { a: 6, b: 2, c: 6, d: 0 };
    const ids = ["a", "b", "c", "d"];
    expect(nextUnfinishedId(ids, "b", (id) => progress[id])).toBe("d");
    expect(nextUnfinishedId(ids, "d", (id) => progress[id])).toBe("b");
    expect(nextUnfinishedId(["a", "b"], "b", (id) => progress[id])).toBeNull();
  });

  it("holds a room's primary and placed lines, and the lines in no room elsewhere", () => {
    const lines = [
      { id: "x", project_room_id: "hall", assignment_scope: "room" },
      { id: "y", project_room_id: "living", assignment_scope: "room" },
      { id: "z", project_room_id: null, assignment_scope: "unassigned" },
      { id: "w", project_room_id: null, assignment_scope: "throughout" },
    ];
    const placements = [{ ffeItemId: "y", projectRoomId: "hall" }];
    const rooms = ["hall", "living"];
    expect(
      linesForPlace(lines, placements, "hall", rooms).map((l) => l.id),
    ).toEqual(["x", "y"]);
    expect(
      linesForPlace(lines, placements, "unassigned", rooms).map((l) => l.id),
    ).toEqual(["z"]);
    expect(
      linesForPlace(lines, placements, "throughout", rooms).map((l) => l.id),
    ).toEqual(["w"]);
    expect(linesForPlace(lines, placements, "removed", rooms)).toEqual([]);
    expect(linesForPlace(lines, placements, null, rooms)).toHaveLength(4);
  });
});
