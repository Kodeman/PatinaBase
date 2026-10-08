/**
 * T-30 (S2, D7 phase 1, a5): one line in several rooms. The chips print each
 * room's share, edit it and add a room through useSetLinePlacements; the
 * sentence prints the line's total and its waste; the also-in line names the
 * other rooms. Fixture: SPEC §4.2–4.3, F1 and T1 on Whole Home Renovation.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { FfeRoomPlacement } from "@patina/types";

const mockSet = jest.fn();

jest.mock("@patina/supabase", () => ({
  useSetLinePlacements: () => ({ mutateAsync: mockSet, isPending: false }),
}));

import {
  PlacementChips,
  alsoInText,
  totalsSentence,
  type PieceRoom,
  type PlacedLine,
} from "../placement-chips";

const ROOMS: PieceRoom[] = [
  { id: "hall", name: "Hall" },
  { id: "living", name: "Living Room" },
  { id: "dining", name: "Dining" },
  { id: "kitchen", name: "Kitchen" },
  { id: "bath", name: "Primary Bath" },
  { id: "sunroom", name: "Sunroom" },
  { id: "bedroom", name: "Bedroom" },
];

const placement = (
  ffeItemId: string,
  projectRoomId: string,
  quantity: number,
  sortOrder: number,
  areaNote: string | null = null,
): FfeRoomPlacement => ({
  id: `${ffeItemId}-${projectRoomId}`,
  ffeItemId,
  projectRoomId,
  quantity,
  areaNote,
  sortOrder,
});

// F1: White oak floor, $11.50 / sq ft, in Hall 120 · Living Room 320 · Dining 180 · Kitchen 210.
const F1_PLACEMENTS = [
  placement("f1", "hall", 120, 0),
  placement("f1", "living", 320, 1),
  placement("f1", "dining", 180, 2),
  placement("f1", "kitchen", 210, 3),
];
const F1: PlacedLine = {
  id: "f1",
  quantity: 830,
  unit: "sq_ft",
  unitPriceCents: 1150,
  projectRoomId: "hall",
};

// T1: Porcelain tile in Primary Bath 72 · Sunroom 148 · Hall 36 (back entry) · Kitchen 24 (pantry).
const T1_PLACEMENTS = [
  placement("t1", "bath", 72, 0),
  placement("t1", "sunroom", 148, 1),
  placement("t1", "hall", 36, 2, "back entry"),
  placement("t1", "kitchen", 24, 3, "pantry"),
];

const renderChips = (
  line: PlacedLine,
  placements: FfeRoomPlacement[],
  canEdit = true,
) =>
  render(
    <PlacementChips
      projectId="p1"
      line={line}
      placements={placements}
      rooms={ROOMS}
      canEdit={canEdit}
    />,
  );

beforeEach(() => {
  mockSet.mockReset();
  mockSet.mockResolvedValue({ placements: [], wasteQuantity: 0 });
});

describe("the chips", () => {
  it("prints one chip per room with its square feet, then + ROOM", () => {
    renderChips(F1, F1_PLACEMENTS);
    const chips = within(
      screen.getByRole("list", { name: "Rooms" }),
    ).getAllByRole("listitem");
    expect(chips.map((c) => c.textContent)).toEqual([
      "Hall · 120 sq ft",
      "Living Room · 320 sq ft",
      "Dining · 180 sq ft",
      "Kitchen · 210 sq ft",
      "+ ROOM",
    ]);
  });

  it("prints the area note on its chip", () => {
    renderChips(
      {
        id: "t1",
        quantity: 280,
        unit: "sq_ft",
        unitPriceCents: 680,
        projectRoomId: "bath",
      },
      T1_PLACEMENTS,
    );
    expect(
      screen.getByText("Hall · 36 sq ft · back entry"),
    ).toBeInTheDocument();
    expect(screen.getByText("Kitchen · 24 sq ft · pantry")).toBeInTheDocument();
  });

  it("shows a line with no placements in its primary room with all of its quantity, and no sentence", () => {
    renderChips(
      {
        id: "l1",
        quantity: 2,
        unit: "each",
        unitPriceCents: 0,
        projectRoomId: "living",
      },
      [],
    );
    expect(screen.getByText("Living Room · ×2")).toBeInTheDocument();
    expect(screen.queryByTestId("placement-totals")).toBeNull();
  });

  it("reads only, with no + ROOM, when the seat cannot edit", () => {
    renderChips(F1, F1_PLACEMENTS, false);
    expect(screen.getByText("Hall · 120 sq ft")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ ROOM" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Change Hall/ })).toBeNull();
  });
});

describe("the totals sentence (a5, D7 case 1)", () => {
  it("prints 830 sq ft × $11.50 / sq ft = $9,545 when the rooms take the whole line", () => {
    renderChips(F1, F1_PLACEMENTS);
    expect(screen.getByTestId("placement-totals")).toHaveTextContent(
      /^830 sq ft × \$11\.50 \/ sq ft = \$9,545$/,
    );
  });

  it("prints the waste when the line quantity exceeds the rooms: 913 over 830 is waste 83 sq ft", () => {
    renderChips({ ...F1, quantity: 913 }, F1_PLACEMENTS);
    expect(screen.getByTestId("placement-totals")).toHaveTextContent(
      "913 sq ft × $11.50 / sq ft = $10,499.50 · waste 83 sq ft",
    );
  });

  it("prints the quantity alone for an unpriced line", () => {
    expect(
      totalsSentence(
        { ...F1, unitPriceCents: null, quantity: 913 },
        F1_PLACEMENTS,
      ),
    ).toBe("913 sq ft · waste 83 sq ft");
  });
});

describe("the also-in line", () => {
  it("names the other rooms in placement order, then the share here", () => {
    expect(alsoInText(F1_PLACEMENTS, ROOMS, "hall", "sq_ft")).toBe(
      "ALSO IN LIVING ROOM · DINING · KITCHEN · 120 SQ FT HERE",
    );
  });

  it("carries the area note of the room it prints in", () => {
    expect(alsoInText(T1_PLACEMENTS, ROOMS, "hall", "sq_ft")).toBe(
      "ALSO IN PRIMARY BATH · SUNROOM · KITCHEN · 36 SQ FT HERE · BACK ENTRY",
    );
    expect(alsoInText(T1_PLACEMENTS, ROOMS, "sunroom", "sq_ft")).toBe(
      "ALSO IN PRIMARY BATH · HALL · KITCHEN · 148 SQ FT HERE",
    );
  });

  it("prints nothing for a line in one room", () => {
    expect(
      alsoInText([placement("l1", "living", 2, 0)], ROOMS, "living", "each"),
    ).toBeNull();
  });
});

describe("editing through useSetLinePlacements", () => {
  it("writes a room's new share with the whole set, in order, keeping the area notes", async () => {
    renderChips(
      {
        id: "t1",
        quantity: 300,
        unit: "sq_ft",
        unitPriceCents: 680,
        projectRoomId: "bath",
      },
      T1_PLACEMENTS,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Change Sunroom's share/ }),
    );
    const field = screen.getByRole("textbox", { name: "Quantity in sq ft" });
    expect(field).toHaveValue("148");
    fireEvent.change(field, { target: { value: "160" } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
    await waitFor(() => expect(mockSet).toHaveBeenCalledTimes(1));
    expect(mockSet).toHaveBeenCalledWith({
      projectId: "p1",
      itemId: "t1",
      placements: [
        { roomId: "bath", quantity: 72, areaNote: null },
        { roomId: "sunroom", quantity: 160, areaNote: null },
        { roomId: "hall", quantity: 36, areaNote: "back entry" },
        { roomId: "kitchen", quantity: 24, areaNote: "pantry" },
      ],
    });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "SAVE" })).toBeNull(),
    );
  });

  it("refuses rooms that would take more than the line, without writing", () => {
    renderChips(F1, F1_PLACEMENTS);
    fireEvent.click(
      screen.getByRole("button", { name: /Change Kitchen's share/ }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Quantity in sq ft" }),
      { target: { value: "240" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The rooms would take 860 sq ft; the line is 830 sq ft. Raise the line's quantity first.",
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("+ ROOM places the line in another room, offering what is left of the line", async () => {
    renderChips({ ...F1, quantity: 913 }, F1_PLACEMENTS);
    fireEvent.click(screen.getByRole("button", { name: "+ ROOM" }));
    const room = screen.getByRole("combobox", { name: "Room" });
    expect(
      within(room)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Primary Bath", "Sunroom", "Bedroom"]);
    expect(
      screen.getByRole("textbox", { name: "Quantity in sq ft" }),
    ).toHaveValue("83");
    fireEvent.change(room, { target: { value: "sunroom" } });
    fireEvent.click(screen.getByRole("button", { name: "PLACE" }));
    await waitFor(() => expect(mockSet).toHaveBeenCalledTimes(1));
    expect(mockSet.mock.calls[0][0].placements).toEqual([
      { roomId: "hall", quantity: 120, areaNote: null },
      { roomId: "living", quantity: 320, areaNote: null },
      { roomId: "dining", quantity: 180, areaNote: null },
      { roomId: "kitchen", quantity: 210, areaNote: null },
      { roomId: "sunroom", quantity: 83, areaNote: null },
    ]);
  });

  it("REMOVE takes a room out of the set", async () => {
    renderChips(F1, F1_PLACEMENTS);
    fireEvent.click(
      screen.getByRole("button", { name: /Change Dining's share/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "REMOVE" }));
    await waitFor(() => expect(mockSet).toHaveBeenCalledTimes(1));
    expect(
      mockSet.mock.calls[0][0].placements.map(
        (p: { roomId: string }) => p.roomId,
      ),
    ).toEqual(["hall", "living", "kitchen"]);
  });

  it("Escape puts the editor back without writing", () => {
    renderChips(F1, F1_PLACEMENTS);
    fireEvent.click(
      screen.getByRole("button", { name: /Change Hall's share/ }),
    );
    fireEvent.keyDown(
      screen.getByRole("textbox", { name: "Quantity in sq ft" }),
      { key: "Escape" },
    );
    expect(
      screen.queryByRole("textbox", { name: "Quantity in sq ft" }),
    ).toBeNull();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("prints the RPC's refusal", async () => {
    mockSet.mockRejectedValueOnce(
      new Error("set_line_placements: a room belongs to another project"),
    );
    renderChips(F1, F1_PLACEMENTS);
    fireEvent.click(
      screen.getByRole("button", { name: /Change Hall's share/ }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Quantity in sq ft" }),
      { target: { value: "100" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "a room belongs to another project",
    );
  });

  it("gates + ROOM when every room already has a share", () => {
    const everywhere = ROOMS.map((r, i) => placement("x", r.id, 1, i));
    renderChips(
      {
        id: "x",
        quantity: 7,
        unit: "lot",
        unitPriceCents: null,
        projectRoomId: "hall",
      },
      everywhere,
    );
    const act = screen.getByRole("button", { name: "+ ROOM" });
    expect(act).toHaveAttribute("aria-disabled", "true");
    expect(act).not.toHaveAttribute("disabled");
    expect(act).toHaveAccessibleDescription("Every room already has a share.");
    fireEvent.click(act);
    expect(screen.queryByRole("combobox", { name: "Room" })).toBeNull();
  });
});
