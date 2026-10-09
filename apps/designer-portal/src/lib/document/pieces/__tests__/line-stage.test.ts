import { lineStampLabel } from "@/lib/document/stamp-derivation";
import { pieceLineStage, type PieceLineStageRow } from "../line-stage";
import { deriveRoomCounts } from "../room-counts";
import {
  deriveOverviewJob,
  deriveOverviewRows,
  overviewRowCounts,
} from "../overview-derivation";

/**
 * T-33c (F3): D1's R3/R5 precedence in the Build room. Rough in and Spec print
 * `pieceLineStage(...).kind`; the head counts and the overview count its
 * `stage`. One fixture, read by all of them.
 */
function line(
  id: string,
  extra: Partial<PieceLineStageRow & Record<string, unknown>> = {},
) {
  return {
    id,
    project_room_id: "bath",
    assignment_scope: "room",
    status: "specified",
    quantity: 1,
    item_type: "tbd",
    product_id: null,
    vendor_id: null,
    vendor_name: null,
    unit_price_cents: 0,
    budget_max_cents: null,
    ffe_line_authorization: null,
    line_kind: "goods",
    parent_ffe_item_id: null,
    trade_scope_document_id: null,
    removed_at: null,
    ...extra,
  };
}

// "Paintwork and plaster": a Trade Scope presence line, installed, no product.
const PAINTWORK = line("paint", {
  status: "installed",
  item_type: "fixed",
  unit_price_cents: 640000,
  trade_scope_document_id: "pcd-1",
});
// A named piece in another room, before an order.
const VANITY = line("vanity", {
  project_room_id: "hall",
  vendor_name: "Hollis Millwork",
});

describe("pieceLineStage", () => {
  it("never reads an installed Trade Scope line as a placeholder (R3)", () => {
    const read = pieceLineStage(PAINTWORK);
    expect(read.kind).toBe("trade_engaged");
    expect(lineStampLabel(read.kind)).toBe("Engaged");
    expect(read.stage).toBe("released");
    expect(read.lock).toBe("trade_scope");
  });

  it("reads a presence line before an order in its trade word, with no stage", () => {
    const read = pieceLineStage({ ...PAINTWORK, status: "approved" });
    expect(read).toEqual({
      kind: "trade_engaged",
      stage: null,
      lock: "trade_scope",
    });
  });

  it("follows the trade progress it is given, as the stamp does", () => {
    expect(pieceLineStage(PAINTWORK, null, "accepted").kind).toBe(
      "trade_accepted",
    );
  });

  it("reads a line ordered without an authorization in its order word (R5)", () => {
    const ordered = line("sconce", {
      status: "ordered",
      product_id: "p-1",
      item_type: "fixed",
      unit_price_cents: 3800,
    });
    const read = pieceLineStage(ordered);
    expect(read.kind).toBe("ordered");
    expect(lineStampLabel(read.kind)).toBe("Released to maker");
    expect(read.stage).toBe("released");
    expect(read.lock).toBe("ordered");
    // No product and no maker: still its order word, never Placeholder or Ready.
    for (const status of ["production", "shipped", "delivered", "installed"]) {
      const bare = pieceLineStage(line("bare", { status }));
      expect(bare.kind).toBe(status);
      expect(bare.stage).toBe("released");
    }
  });

  it("keeps D1's pre-order word, open to every act, before an order", () => {
    expect(pieceLineStage(line("tbd"))).toEqual({
      kind: "placeholder",
      stage: "placeholder",
      lock: null,
    });
    expect(pieceLineStage(VANITY)).toEqual({
      kind: "specced",
      stage: "specced",
      lock: null,
    });
    expect(
      pieceLineStage(
        line("sent", { vendor_name: "Maker", ffe_line_authorization: "sent" }),
      ),
    ).toEqual({ kind: "released", stage: "released", lock: null });
  });

  it("reads a labor line's stage through its piece", () => {
    const piece = line("r1", {
      product_id: "p-hemp",
      item_type: "fixed",
      unit_price_cents: 23000,
      quantity: 9,
    });
    const labor = line("r1a", {
      vendor_name: "Hanger",
      item_type: "fixed",
      unit_price_cents: 8500,
      quantity: 9,
      line_kind: "labor",
      parent_ffe_item_id: "r1",
    });
    expect(pieceLineStage(labor, piece).kind).toBe("ready");
    expect(pieceLineStage(labor, null).kind).toBe("specced");
  });
});

describe("the head counts and the overview agree (F3)", () => {
  const lines = [PAINTWORK, VANITY];
  const counts = deriveRoomCounts(lines, [], ["bath", "hall"]);
  const rows = deriveOverviewRows(
    lines,
    [],
    [
      { id: "bath", name: "Bath" },
      { id: "hall", name: "Hall" },
    ],
  );
  const bath = rows.find((r) => r.key === "bath")!;

  it("counts the installed Trade Scope line as a line, never a placeholder", () => {
    expect(counts.rooms.bath).toMatchObject({ lines: 1, placeholders: 0 });
    expect(overviewRowCounts(bath)).toBe("1 line · 0 placeholders");
    expect(bath.placeholderLines).toBe(counts.rooms.bath.placeholders);
  });

  it("counts the job the same on both surfaces", () => {
    expect(counts.job).toMatchObject({ lines: 2, placeholders: 0, specced: 1 });
    const job = deriveOverviewJob(lines);
    expect(job.lines).toBe(counts.job.lines);
    expect(job.placeholders).toBe(counts.job.placeholders);
  });

  it("counts a line ordered without an authorization as released on both", () => {
    const ordered = [line("o1", { status: "ordered" })];
    expect(deriveRoomCounts(ordered, [], ["bath"]).rooms.bath).toMatchObject({
      lines: 1,
      placeholders: 0,
      released: 1,
    });
    const [row] = deriveOverviewRows(
      ordered,
      [],
      [{ id: "bath", name: "Bath" }],
    );
    expect(row.tally).toMatchObject({ lines: 1, placeholders: 0, released: 1 });
  });
});

describe("R1 and R2 decide first, as in Release (W4 review F-C1)", () => {
  // A READY piece: a maker, a client price, a quantity.
  const READY = {
    vendor_id: "v-maker",
    item_type: "fixed",
    unit_price_cents: 680000,
  };
  const DECISION = {
    blocked: true,
    blocking_decision: { status: "pending", due_date: "2026-10-20" },
  };

  it("a pending blocking decision reads DECISION DUE and never counts as ready", () => {
    const held = line("d1", { ...READY, ...DECISION });
    const read = pieceLineStage(held);
    expect(read.kind).toBe("decision_due");
    expect(lineStampLabel(read.kind)).toBe("Decision due");
    expect(read.stage).toBe("specced");
    expect(read.lock).toBeNull();

    // The head and the overview do not count it ready.
    const lines = [held, line("d2", READY)];
    expect(deriveRoomCounts(lines, [], ["bath"]).rooms.bath).toMatchObject({
      lines: 2,
      ready: 1,
      specced: 1,
    });
    expect(deriveOverviewJob(lines)).toMatchObject({ ready: 1, specced: 1 });
  });

  it("a settled decision leaves D1's word alone", () => {
    const read = pieceLineStage(
      line("d1", {
        ...READY,
        blocked: true,
        blocking_decision: { status: "resolved", due_date: null },
      }),
    );
    expect(read.kind).toBe("ready");
    expect(read.stage).toBe("ready");
  });

  it("an open damage claim reads DAMAGED on an ordered line, still released", () => {
    const read = pieceLineStage(
      line("o1", { status: "delivered", item_claims: [{ state: "drafted" }] }),
    );
    expect(read.kind).toBe("damaged");
    expect(read.stage).toBe("released");
    expect(read.lock).toBe("ordered");
  });
});
