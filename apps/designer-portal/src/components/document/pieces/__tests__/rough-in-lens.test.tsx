/**
 * US-21 T-27 — the Rough in lens assembled (SPEC a2, a8, a9; S1, S5, S6, D8,
 * D13). The tables are T-24's; this suite proves the lens wires each one to
 * its hook, that undo calls restore, that the elevation pane is there, and
 * that nothing here buys, bills or releases. Fixture names are SPEC §4.2's.
 */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockBatch = jest.fn();
const mockBuild = jest.fn();
const mockArchive = jest.fn();
const mockRestore = jest.fn();
const mockPlace = jest.fn();
const mockAssign = jest.fn();
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
  useAssignLineRoom: () => ({ mutate: mockAssign, isError: false }),
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
  render(
    <RoughInLens docId="doc-1" projectId={PROJECT} rooms={ROOMS} room={room} />,
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
    const option = await screen.findByRole("option", {
      name: /Emtek Ribbon & Reed knob · satin brass · \$38 each/,
    });
    await user.click(option);
    await waitFor(() => expect(mockPlace).toHaveBeenCalledTimes(1));
    expect(mockPlace.mock.calls[0][0]).toEqual({
      projectId: PROJECT,
      productId: "p-emtek",
      placeholderSelectionId: "l3",
      assignmentScope: "room",
      roomId: LIVING,
      quantity: 2,
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
