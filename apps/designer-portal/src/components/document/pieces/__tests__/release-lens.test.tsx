/**
 * T-41 (a3; S7, D1 row 6, D18, Q13): the Release lens. The table across rooms
 * `LINE · ROOM · STAGE · READINESS · FOR THE CLIENT`; the blocker sentences;
 * Leah's disposition select (placeholders print `—`); `READY FOR LEAH` writes
 * only a hand-back; the ceremony names its 7 lines and $30,760, ends the set
 * with the wallpaper's install, and releases through
 * `create_furnishings_authorization_from_schedule` then the send; afterwards
 * the lines read RELEASED. Fixture: SPEC §4.2, Whole Home Renovation.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";

type Row = Record<string, unknown> & { id: string };

const mockItems: { data: Row[] } = { data: [] };
const mockHandbacks: { data: unknown[] } = { data: [] };
const mockTriage = jest.fn();
const mockHandBack = jest.fn();
const mockRelease = jest.fn();
const mockSend = jest.fn();

jest.mock("@patina/supabase", () => ({
  useProjectFFEItems: () => ({ data: mockItems.data }),
  useProjectFfeReadiness: (ids: readonly string[]) => ({
    data: ids.map((id) => ({
      selectionId: id,
      ready: true,
      missingFields: [],
    })),
    isError: false,
    refetch: jest.fn(),
  }),
  useTriageProjectFfeItems: () => ({ mutate: mockTriage, isError: false }),
  useRoomHandbacks: () => ({ data: mockHandbacks.data }),
  useHandBackRoom: () => ({
    mutate: mockHandBack,
    isPending: false,
    isError: false,
  }),
}));
jest.mock("@/hooks/use-commercial-documents", () => ({
  useProjectInstruments: () => ({ data: [{ number: 2 }] }),
  useReleaseForAuthorization: () => ({
    mutateAsync: mockRelease,
    isPending: false,
  }),
  useSendFurnishingsAuthorization: () => ({
    mutateAsync: mockSend,
    isPending: false,
  }),
}));
jest.mock("@/hooks/use-document-rooms", () => ({
  useDocumentRooms: () => ({
    data: [
      { id: "hall", name: "Hall" },
      { id: "living", name: "Living Room" },
      { id: "dining", name: "Dining" },
      { id: "bath", name: "Primary Bath" },
      { id: "bedroom", name: "Bedroom" },
    ],
  }),
}));

import { ReleaseLens } from "../release-lens";

function line(
  id: string,
  room: string,
  name: string,
  over: Row | object = {},
): Row {
  const o = over as Record<string, number | undefined>;
  const quantity = o.quantity ?? 1;
  const unit = o.unit_price_cents ?? 0;
  return {
    id,
    name,
    status: "specified",
    blocked: false,
    received_quantity: null,
    product_id: null,
    vendor_id: null,
    vendor_name: null,
    item_type: "fixed",
    budget_max_cents: null,
    ffe_line_authorization: null,
    line_kind: "goods",
    parent_ffe_item_id: null,
    design_disposition: "candidate",
    assignment_scope: "room",
    project_room_id: room,
    line_total_cents: quantity * unit,
    ...over,
    quantity,
    unit_price_cents: unit,
  };
}

const ready = (over: object) => ({
  design_disposition: "selected",
  vendor_id: "v-maker",
  ...over,
});

function fixture(): Row[] {
  return [
    line("H1", "hall", "Console table"),
    line(
      "L1",
      "living",
      "Custom cabinet",
      ready({ quantity: 2, unit_price_cents: 480000 }),
    ),
    line(
      "L3",
      "living",
      "Hardware, 2 knobs for custom cabinet",
      ready({ product_id: "p-knob", quantity: 2, unit_price_cents: 3800 }),
    ),
    line("L6", "living", "Sconce", {
      product_id: "p-sconce",
      design_disposition: "alternate",
    }),
    line(
      "F1",
      "living",
      "White oak floor, satin Bona finish",
      ready({ quantity: 830, unit_price_cents: 1150 }),
    ),
    line(
      "D1",
      "dining",
      "Dining table, custom walnut",
      ready({ unit_price_cents: 680000 }),
    ),
    line(
      "T1",
      "bath",
      "Porcelain floor tile, 12 × 24, matte",
      ready({ quantity: 280, unit_price_cents: 680 }),
    ),
    line(
      "R1",
      "bedroom",
      "Wallpaper, grasscloth",
      ready({ product_id: "p-hemp", quantity: 9, unit_price_cents: 23000 }),
    ),
    line(
      "R1a",
      "bedroom",
      "Install, wallpaper hanger",
      ready({
        line_kind: "labor",
        parent_ffe_item_id: "R1",
        quantity: 9,
        unit_price_cents: 8500,
      }),
    ),
  ];
}

const props = {
  docId: "doc-1",
  projectId: "proj-1",
  room: null,
  canSeeMoney: true,
};

const rowOf = (name: string) =>
  screen.getByText(name, { selector: "td, td *" }).closest("tr") as HTMLElement;

beforeEach(() => {
  mockItems.data = fixture();
  mockHandbacks.data = [];
  mockTriage.mockReset();
  mockHandBack.mockReset();
  mockRelease
    .mockReset()
    .mockResolvedValue({
      proposalId: "prop-3",
      documentId: "doc-3",
      itemCount: 7,
    });
  mockSend.mockReset().mockResolvedValue({});
});

describe("ReleaseLens", () => {
  it("prints the table across rooms: LINE · ROOM · STAGE · READINESS · FOR THE CLIENT", () => {
    render(<ReleaseLens {...props} />);
    const table = screen.getByRole("table", { name: "Release" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Line", "Room", "Stage", "Readiness", "For the client"]);
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((th) => th.textContent),
    ).toEqual(["Hall", "Living Room", "Dining", "Primary Bath", "Bedroom"]);
  });

  it("names each line's blocker, and placeholders print — for the client", () => {
    render(<ReleaseLens {...props} />);
    const h1 = within(rowOf("Console table"));
    expect(h1.getByText("Placeholder")).toBeInTheDocument();
    expect(h1.getByText("Needs a product or a maker")).toBeInTheDocument();
    expect(h1.getByText("—")).toBeInTheDocument();
    expect(h1.queryByRole("combobox")).toBeNull();

    expect(
      within(rowOf("Sconce")).getByText("Needs a client price"),
    ).toBeInTheDocument();
    const l1 = within(rowOf("Custom cabinet"));
    expect(l1.getByText("Ready", { selector: "td" })).toBeInTheDocument();
    expect(
      l1.getByRole("combobox", { name: "For the client, Custom cabinet" }),
    ).toHaveValue("selected");
  });

  it("FOR THE CLIENT sets the disposition and leaves the room as it is", () => {
    render(<ReleaseLens {...props} />);
    const select = within(rowOf("Sconce")).getByRole("combobox");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Candidate", "Selected", "Alternate"]);
    fireEvent.change(select, { target: { value: "selected" } });
    expect(mockTriage).toHaveBeenCalledWith({
      projectId: "proj-1",
      selectionIds: ["L6"],
      assignmentScope: "room",
      roomId: "living",
      disposition: "selected",
    });
  });

  it("READY FOR LEAH records the hand-back and writes nothing else", () => {
    mockHandbacks.data = [
      {
        id: "hb-1",
        projectRoomId: "dining",
        handedBackBy: "u-1",
        handedBackAt: "2026-10-08T15:00:00Z",
      },
    ];
    render(<ReleaseLens {...props} />);
    const bedroom = screen.getByRole("button", {
      name: "Ready for Leah, Bedroom",
    });
    expect(bedroom).toHaveTextContent("READY FOR LEAH");
    fireEvent.click(bedroom);
    expect(mockHandBack).toHaveBeenCalledWith({
      projectId: "proj-1",
      roomId: "bedroom",
    });
    expect(mockTriage).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Ready for Leah, Dining" }),
    ).toHaveAccessibleDescription(/^Handed back /);
  });

  it("the ceremony names its set, then the consequence, then the terminal act", async () => {
    render(<ReleaseLens {...props} />);
    const ceremony = within(
      screen.getByRole("region", { name: "This release" }),
    );
    expect(
      ceremony.getByText("This release · 7 lines · $30,760:"),
    ).toBeInTheDocument();
    const items = ceremony.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(7);
    expect(items[0]).toBe("Custom cabinet $9,600");
    expect(items[6]).toBe("↳ Install, wallpaper hanger (labor) $765");
    expect(
      ceremony.getByText(
        "Releasing sends these 7 lines to the client for authorization: 6 pieces and the one labor line that goes with its piece. Their prices lock when the client signs.",
      ),
    ).toBeInTheDocument();
    const act_ = ceremony.getByRole("button", {
      name: "Release 7 lines · $30,760 for authorization",
    });
    expect(act_).toHaveClass("act--terminal");

    await act(async () => {
      fireEvent.click(act_);
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockRelease).toHaveBeenCalledWith({
      name: "Furnishings authorization № 3",
      ffeItemIds: ["L1", "L3", "F1", "D1", "T1", "R1", "R1a"],
    });
    expect(mockSend).toHaveBeenCalledWith("prop-3");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Released 7 lines to the client for authorization.",
    );
  });

  it("a failed send retries the send alone, never a second authorization", async () => {
    mockSend.mockRejectedValueOnce(new Error("The send did not go through."));
    render(<ReleaseLens {...props} />);
    const act_ = screen.getByRole("button", { name: /^Release 7 lines/ });
    await act(async () => {
      fireEvent.click(act_);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The send did not go through.",
    );
    await act(async () => {
      fireEvent.click(act_);
    });
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it("after release the lines read RELEASED and the act is gone", () => {
    const { rerender } = render(<ReleaseLens {...props} />);
    mockItems.data = fixture().map((l) =>
      ["H1", "L6"].includes(l.id)
        ? l
        : { ...l, ffe_line_authorization: "sent" },
    );
    rerender(<ReleaseLens {...props} />);
    for (const name of [
      "Custom cabinet",
      "Wallpaper, grasscloth",
      "Install, wallpaper hanger",
    ]) {
      const row = within(rowOf(name));
      expect(row.getByText("Released")).toHaveClass("stamp--released");
      expect(row.queryByRole("combobox")).toBeNull();
      expect(row.getByText("Selected")).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: /^Release / })).toBeNull();
  });

  it("a seat without money sees the table and never the ceremony", () => {
    render(<ReleaseLens {...props} canSeeMoney={false} />);
    expect(screen.getByRole("table", { name: "Release" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "This release" })).toBeNull();
    expect(screen.queryByText(/\$30,760/)).toBeNull();
  });
});
