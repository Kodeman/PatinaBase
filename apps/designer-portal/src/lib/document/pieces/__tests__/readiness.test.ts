/**
 * T-41 (a3; S7, D1 row 6, D18, Q13): the Release lens's derivations.
 * Fixture: SPEC §4.2, Whole Home Renovation, in its worked state. The release
 * set is L1, L3, F1, D1, T1, R1 and R1a: 6 pieces, the wallpaper's install,
 * $30,760.
 */

import {
  deriveReleaseLens,
  readinessSentence,
  readyLineIds,
  releaseActLabel,
  releaseAmountCents,
  releaseConsequence,
  releaseSetHead,
  releaseStamp,
  type ReleaseLensLine,
  type ServerReadiness,
} from "../readiness";

const ROOMS = [
  { id: "hall", name: "Hall" },
  { id: "living", name: "Living Room" },
  { id: "dining", name: "Dining" },
  { id: "kitchen", name: "Kitchen" },
  { id: "bath", name: "Primary Bath" },
  { id: "sunroom", name: "Sunroom" },
  { id: "bedroom", name: "Bedroom" },
];

function line(
  id: string,
  room: string,
  name: string,
  over: Partial<ReleaseLensLine> = {},
): ReleaseLensLine {
  const quantity = over.quantity ?? 1;
  const unit = over.unit_price_cents ?? 0;
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

const ready = (over: Partial<ReleaseLensLine>) => ({
  design_disposition: "selected",
  vendor_id: "v-maker",
  ...over,
});

function fixture(): ReleaseLensLine[] {
  return [
    line("H1", "hall", "Console table"),
    line(
      "L1",
      "living",
      "Custom cabinet",
      ready({ quantity: 2, unit_price_cents: 480000 }),
    ),
    line("L2", "living", "Countertop for custom cabinets"),
    line(
      "L3",
      "living",
      "Hardware, 2 knobs for custom cabinet",
      ready({ product_id: "p-knob", quantity: 2, unit_price_cents: 3800 }),
    ),
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
    line("R2", "bedroom", "Bed, king, upholstered"),
    // Entered last; it rides under its piece.
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

function allReady(
  lines: readonly ReleaseLensLine[],
): Map<string, ServerReadiness> {
  return new Map(
    readyLineIds(lines).map((id) => [id, { ready: true, missingFields: [] }]),
  );
}

describe("readiness sentences", () => {
  it("names the blocker: product or maker, client price, or Ready", () => {
    const lines = [
      ...fixture(),
      line("X1", "living", "Sconce", {
        product_id: "p-sconce",
        unit_price_cents: 0,
      }),
    ];
    const at = (id: string) => {
      const l = lines.find((x) => x.id === id)!;
      return readinessSentence(l, releaseStamp(l, lines), lines);
    };
    expect(at("H1")).toBe("Needs a product or a maker");
    expect(at("X1")).toBe("Needs a client price");
    expect(at("L1")).toBe("Ready");
  });

  it("a priced line with no product and no maker still needs one (D1 row 9)", () => {
    const lines = [line("P1", "hall", "Console", { unit_price_cents: 50000 })];
    expect(releaseStamp(lines[0], lines)).toBe("placeholder");
    expect(readinessSentence(lines[0], "placeholder", lines)).toBe(
      "Needs a product or a maker",
    );
  });

  it("a READY line prints the server's own blocker, never Selected as one", () => {
    const lines = fixture();
    const d1 = lines.find((l) => l.id === "D1")!;
    expect(
      readinessSentence(d1, "ready", lines, {
        ready: false,
        missingFields: ["designDisposition", "vendor"],
      }),
    ).toBe("Needs a maker");
    expect(
      readinessSentence(d1, "ready", lines, {
        ready: false,
        missingFields: ["designDisposition"],
      }),
    ).toBe("Ready");
  });
});

describe("the stage comes from the D1 mirror", () => {
  it("a Trade Scope line and an ordered line are never READY, never released here", () => {
    const lines = [
      ...fixture(),
      line(
        "TS",
        "living",
        "Tile setting",
        ready({ trade_scope_document_id: "pcd-1", unit_price_cents: 90000 }),
      ),
      line(
        "O1",
        "living",
        "Lamp",
        ready({ status: "ordered", unit_price_cents: 40000 }),
      ),
    ];
    expect(releaseStamp(lines.find((l) => l.id === "TS")!, lines)).not.toBe(
      "ready",
    );
    expect(releaseStamp(lines.find((l) => l.id === "O1")!, lines)).toBe(
      "ordered",
    );
    expect(readyLineIds(lines)).not.toEqual(expect.arrayContaining(["TS"]));
    expect(readyLineIds(lines)).not.toEqual(expect.arrayContaining(["O1"]));
    const model = deriveReleaseLens(lines, ROOMS, null, allReady(lines));
    const ids = model.set.rows.map((r) => r.line.id);
    expect(ids).not.toContain("TS");
    expect(ids).not.toContain("O1");
    const ordered = model.groups
      .flatMap((g) => g.rows)
      .find((r) => r.line.id === "O1")!;
    expect(ordered.readiness).toBeNull();
    expect(ordered.disposition).toBe("none");
  });
});

describe("the table and the set (a3)", () => {
  it("groups by room in room order with labor under its piece", () => {
    const lines = fixture();
    const model = deriveReleaseLens(lines, ROOMS, null, allReady(lines));
    expect(model.groups.map((g) => g.name)).toEqual([
      "Hall",
      "Living Room",
      "Dining",
      "Primary Bath",
      "Bedroom",
    ]);
    const bedroom = model.groups.find((g) => g.roomId === "bedroom")!;
    expect(bedroom.rows.map((r) => r.line.id)).toEqual(["R1", "R1a", "R2"]);
    expect(bedroom.rows[1].labor).toBe(true);
  });

  it("FOR THE CLIENT is a select on specced and ready lines; placeholders print —", () => {
    const lines = fixture();
    const rows = deriveReleaseLens(
      lines,
      ROOMS,
      null,
      allReady(lines),
    ).groups.flatMap((g) => g.rows);
    const at = (id: string) => rows.find((r) => r.line.id === id)!;
    expect(at("H1").disposition).toBe("none");
    expect(at("L1").disposition).toBe("select");
  });

  it("names 7 lines · $30,760: 6 pieces and the one labor line, ending with the install", () => {
    const lines = fixture();
    const { set } = deriveReleaseLens(lines, ROOMS, null, allReady(lines));
    expect(set.rows.map((r) => r.line.id)).toEqual([
      "L1",
      "L3",
      "F1",
      "D1",
      "T1",
      "R1",
      "R1a",
    ]);
    expect(set.pieces).toBe(6);
    expect(set.labor).toBe(1);
    expect(set.totalCents).toBe(3_076_000);
    expect(releaseAmountCents(set.rows[6].line)).toBe(76_500);
    expect(releaseSetHead(set)).toBe("This release · 7 lines · $30,760:");
    expect(releaseConsequence(set)).toBe(
      "Releasing sends these 7 lines to the client for authorization: 6 pieces and the one labor line that goes with its piece. Their prices lock when the client signs.",
    );
    expect(releaseActLabel(set)).toBe(
      "Release 7 lines · $30,760 for authorization",
    );
  });

  it("leaves out a ready line Leah has not selected, and one the server refuses", () => {
    const lines = fixture().map((l) =>
      l.id === "D1" ? { ...l, design_disposition: "alternate" } : l,
    );
    const server = allReady(lines);
    server.set("T1", { ready: false, missingFields: ["image"] });
    const model = deriveReleaseLens(lines, ROOMS, null, server);
    const ids = model.set.rows.map((r) => r.line.id);
    expect(ids).not.toContain("D1");
    expect(ids).not.toContain("T1");
    const t1 = model.groups
      .flatMap((g) => g.rows)
      .find((r) => r.line.id === "T1")!;
    expect(t1.readiness).toBe("Needs an image");
  });

  it("holds a piece back whose labor is not ready, so the release is never refused for it", () => {
    const lines = fixture().map((l) =>
      l.id === "R1a" ? { ...l, design_disposition: "candidate" } : l,
    );
    const model = deriveReleaseLens(lines, ROOMS, null, allReady(lines));
    const ids = model.set.rows.map((r) => r.line.id);
    expect(ids).not.toContain("R1");
    expect(ids).not.toContain("R1a");
    const r1 = model.groups
      .flatMap((g) => g.rows)
      .find((r) => r.line.id === "R1")!;
    expect(r1.readiness).toBe("Waits on its labor");
  });

  it("a room's release names that room's set", () => {
    const lines = fixture();
    const model = deriveReleaseLens(lines, ROOMS, "bedroom", allReady(lines));
    expect(model.groups.map((g) => g.roomId)).toEqual(["bedroom"]);
    expect(releaseActLabel(model.set)).toBe(
      "Release 2 lines · $2,835 for authorization",
    );
    expect(releaseConsequence(model.set)).toBe(
      "Releasing sends these 2 lines to the client for authorization: 1 piece and the one labor line that goes with its piece. Their prices lock when the client signs.",
    );
  });

  it("an allowance asks for its ceiling", () => {
    const allowance = line("A1", "hall", "Rug", {
      item_type: "allowance",
      budget_max_cents: 120000,
      unit_price_cents: 0,
    });
    expect(releaseAmountCents(allowance)).toBe(120000);
  });

  it("after release the lines read RELEASED and leave the set", () => {
    const lines = fixture().map((l) =>
      ["L1", "R1", "R1a"].includes(l.id)
        ? { ...l, ffe_line_authorization: "sent" }
        : l,
    );
    const model = deriveReleaseLens(lines, ROOMS, null, allReady(lines));
    const rows = model.groups.flatMap((g) => g.rows);
    for (const id of ["L1", "R1", "R1a"]) {
      const row = rows.find((r) => r.line.id === id)!;
      expect(row.kind).toBe("released");
      expect(row.disposition).toBe("read");
      expect(row.readiness).toBeNull();
    }
    expect(model.set.rows.map((r) => r.line.id)).toEqual([
      "L3",
      "F1",
      "D1",
      "T1",
    ]);
  });
});
