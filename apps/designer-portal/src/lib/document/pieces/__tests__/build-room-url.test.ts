import {
  BUILD_ROOM_LENSES,
  availableLenses,
  buildRoomHref,
  parseBuildRoomSearch,
} from "../build-room-url";

const LEGACY = ["rough", "spec", "price", "release", "finishes"];

describe("the sheet's lens contract (Purchase lens ruling, 2026-10-27)", () => {
  it("names Purchase sixth, after the five legacy lenses", () => {
    expect(BUILD_ROOM_LENSES).toEqual([...LEGACY, "purchase"]);
  });

  it("legacy lens list is unchanged: five lenses, no hidden sixth", () => {
    expect(availableLenses(true)).toEqual(LEGACY);
    expect(availableLenses(false)).toEqual(
      LEGACY.filter((lens) => lens !== "price"),
    );
  });

  it("round 8 lists Purchase in lens order, for seats with and without money", () => {
    expect(availableLenses(true, true)).toEqual([...LEGACY, "purchase"]);
    expect(availableLenses(false, true)).toEqual([
      "rough",
      "spec",
      "release",
      "finishes",
      "purchase",
    ]);
  });

  it("a legacy URL carrying lens=purchase resolves to the default lens, not an error", () => {
    const params = new URLSearchParams("lens=purchase&room=r1");
    for (const canSeeMoney of [true, false]) {
      expect(parseBuildRoomSearch(params, { canSeeMoney })).toEqual({
        lens: "rough",
        room: "r1",
      });
    }
  });

  it("round 8 reads lens=purchase as Purchase", () => {
    const params = new URLSearchParams("lens=purchase&room=r1");
    for (const canSeeMoney of [true, false]) {
      expect(
        parseBuildRoomSearch(params, { canSeeMoney, round8: true }),
      ).toEqual({ lens: "purchase", room: "r1" });
    }
  });

  it("keeps the Price rule under round 8: no money reads as Rough in", () => {
    const params = new URLSearchParams("lens=price");
    expect(
      parseBuildRoomSearch(params, { canSeeMoney: false, round8: true }).lens,
    ).toBe("rough");
    expect(
      parseBuildRoomSearch(params, { canSeeMoney: true, round8: true }).lens,
    ).toBe("price");
  });

  it("writes the Purchase address like every other lens", () => {
    expect(buildRoomHref("doc-1", { lens: "purchase", room: "r1" })).toBe(
      "/doc/doc-1/pieces?lens=purchase&room=r1",
    );
  });
});
