import {
  deriveRoomCounts,
  type RoomCountsLine,
  type RoomCountsPlacement,
} from "../room-counts";

/**
 * SPEC §4.4 "before" (frame 1): Whole Home Renovation, seven rooms. A placed
 * line counts in each of its rooms; the labor line counts as a line.
 */
const ROOMS = [
  "hall",
  "living",
  "dining",
  "kitchen",
  "bath",
  "sunroom",
  "bedroom",
];

function placeholder(
  id: string,
  room: string,
  extra: Partial<RoomCountsLine> = {},
): RoomCountsLine {
  return {
    id,
    project_room_id: room,
    assignment_scope: "room",
    quantity: 1,
    item_type: "tbd",
    ...extra,
  };
}

function specced(
  id: string,
  room: string,
  extra: Partial<RoomCountsLine> = {},
): RoomCountsLine {
  return placeholder(id, room, { vendor_name: "Maker", ...extra });
}

const LINES: RoomCountsLine[] = [
  placeholder("H1", "hall", { rough_cents: 120000 }),
  placeholder("H2", "hall", { rough_cents: 68000 }),
  placeholder("L1", "living", { quantity: 2, rough_cents: 480000 }),
  placeholder("L2", "living", { quantity: 2, rough_cents: 140000 }),
  placeholder("L3", "living", { quantity: 2 }),
  placeholder("L4", "living", { quantity: 4, rough_cents: 5200 }),
  placeholder("L5", "living", { rough_cents: 720000 }),
  // Before frame 7 nothing is priced, so every named piece reads SPECCED.
  specced("F1", "living", { quantity: 830, rough_cents: 1150 }),
  specced("D1", "dining"),
  placeholder("D2", "dining", { quantity: 8 }),
  placeholder("D3", "dining", { quantity: 3 }),
  placeholder("K1", "kitchen", { quantity: 3 }),
  placeholder("K2", "kitchen"),
  ...["B1", "B2", "B3", "B4", "B5", "B6", "B7"].map((id) =>
    placeholder(id, "bath"),
  ),
  specced("T1", "bath", { quantity: 280 }),
  placeholder("S1", "sunroom", { quantity: 2 }),
  specced("R1", "bedroom", { quantity: 9 }),
  specced("R1a", "bedroom", {
    quantity: 9,
    line_kind: "labor",
    parent_ffe_item_id: "R1",
  }),
  placeholder("R2", "bedroom"),
  placeholder("R3", "bedroom", { quantity: 2 }),
];

// The primary room is the first placement (00734).
const PLACEMENTS: RoomCountsPlacement[] = [
  { ffeItemId: "F1", projectRoomId: "living", quantity: 320 },
  { ffeItemId: "F1", projectRoomId: "hall", quantity: 120 },
  { ffeItemId: "F1", projectRoomId: "dining", quantity: 180 },
  { ffeItemId: "F1", projectRoomId: "kitchen", quantity: 210 },
  { ffeItemId: "T1", projectRoomId: "bath", quantity: 72 },
  { ffeItemId: "T1", projectRoomId: "sunroom", quantity: 148 },
  { ffeItemId: "T1", projectRoomId: "hall", quantity: 36 },
  { ffeItemId: "T1", projectRoomId: "kitchen", quantity: 24 },
];

describe("deriveRoomCounts", () => {
  const counts = deriveRoomCounts(LINES, PLACEMENTS, ROOMS);

  it("counts placed lines in each of their rooms, as SPEC §4.4 prints the rooms", () => {
    const read = (room: string) => [
      counts.rooms[room].lines,
      counts.rooms[room].placeholders,
    ];
    expect(read("hall")).toEqual([4, 2]);
    expect(read("living")).toEqual([6, 5]);
    expect(read("dining")).toEqual([4, 2]);
    expect(read("kitchen")).toEqual([4, 2]);
    expect(read("bath")).toEqual([8, 7]);
    expect(read("sunroom")).toEqual([2, 1]);
    expect(read("bedroom")).toEqual([4, 2]);
  });

  it("counts each line once on the job, the labor line among them", () => {
    expect(counts.job.lines).toBe(26);
    expect(counts.job.placeholders).toBe(21);
    // F1, D1, T1, R1 and R1a, whose piece is specced.
    expect(counts.job.specced).toBe(5);
    expect(counts.job.ready + counts.job.released).toBe(0);
  });

  it("never counts the primary room twice when it is also a placement", () => {
    const totalInRooms = ROOMS.reduce(
      (sum, room) => sum + counts.rooms[room].lines,
      0,
    );
    // 26 lines; F1 sits in 3 more rooms and T1 in 3 more.
    expect(totalInRooms).toBe(32);
  });

  it("splits a placed line’s rough figure by its room share, never multiplying it", () => {
    const only = deriveRoomCounts(
      [specced("F1", "living", { quantity: 830, rough_cents: 1150 })],
      PLACEMENTS.filter((p) => p.ffeItemId === "F1"),
      ROOMS,
    );
    expect(only.rooms.hall.roughCents).toBe(120 * 1150);
    expect(only.rooms.living.roughCents).toBe(320 * 1150);
    expect(only.job.roughCents).toBe(830 * 1150);
  });

  it("multiplies an unplaced line’s rough figure by its quantity in its room", () => {
    expect(counts.rooms.living.roughCents).toBe(
      2 * 480000 + 2 * 140000 + 4 * 5200 + 720000 + 320 * 1150,
    );
  });

  it("follows the stage: a labor line is ready only with its piece", () => {
    const ready = deriveRoomCounts(
      [
        specced("R1", "bedroom", {
          quantity: 9,
          item_type: "fixed",
          unit_price_cents: 23000,
        }),
        specced("R1a", "bedroom", {
          quantity: 9,
          item_type: "fixed",
          unit_price_cents: 8500,
          line_kind: "labor",
          parent_ffe_item_id: "R1",
        }),
        specced("D1", "dining", { ffe_line_authorization: "sent" }),
      ],
      [],
      ROOMS,
    );
    expect(ready.rooms.bedroom).toMatchObject({ lines: 2, ready: 2 });
    expect(ready.rooms.dining).toMatchObject({ lines: 1, released: 1 });
    expect(ready.job).toMatchObject({ lines: 3, ready: 2, released: 1 });
  });

  it("leaves removed lines out, and sorts roomless lines into Not in a room yet or Throughout", () => {
    const roomless = deriveRoomCounts(
      [
        placeholder("gone", "living", { removed_at: "2026-10-08T12:00:00Z" }),
        placeholder("loose", "", {
          project_room_id: null,
          assignment_scope: "unassigned",
        }),
        placeholder("whole", "", {
          project_room_id: null,
          assignment_scope: "throughout",
        }),
        placeholder("stale", "deleted-room"),
      ],
      [],
      ROOMS,
    );
    expect(roomless.rooms.living.lines).toBe(0);
    expect(roomless.unassigned.lines).toBe(1);
    expect(roomless.throughout.lines).toBe(2);
    expect(roomless.job.lines).toBe(3);
  });

  it("gives every room an entry, at zero, when it has no lines", () => {
    expect(deriveRoomCounts([], [], ["empty"]).rooms.empty).toEqual({
      lines: 0,
      placeholders: 0,
      specced: 0,
      ready: 0,
      released: 0,
      roughCents: 0,
    });
  });

  it("never counts a superseded predecessor or a removed line (T-55b, F7)", () => {
    const counts = deriveRoomCounts(
      [
        specced("new", "living", { rough_cents: 1000 }),
        specced("old", "living", {
          rough_cents: 1000,
          design_disposition: "superseded",
        }),
        specced("gone", "living", { removed_at: "2026-10-01T00:00:00Z" }),
      ],
      [{ ffeItemId: "old", projectRoomId: "dining", quantity: 1 }],
      ROOMS,
    );
    expect(counts.rooms.living.lines).toBe(1);
    expect(counts.rooms.dining.lines).toBe(0);
    expect(counts.job.lines).toBe(1);
    expect(counts.job.roughCents).toBe(1000);
  });
});
