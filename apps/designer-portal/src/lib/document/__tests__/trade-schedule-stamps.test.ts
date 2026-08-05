import { deriveLineStamp } from "../stamp-derivation";
import {
  buildTradeScopeIndex,
  deriveTradeLineHold,
  eligibility,
  poGate,
  type ScheduleLineInput,
} from "../authorization-derivation";

const line = (overrides: Partial<ScheduleLineInput> = {}): ScheduleLineInput => ({
  id: "line-1",
  item_type: "fixed",
  quantity: 1,
  unit_price_cents: 490_000,
  line_total_cents: 490_000,
  status: "approved",
  blocked: false,
  ...overrides,
});

const index = buildTradeScopeIndex([
  { documentId: "pcd-1", number: 1, progressState: "in_progress" },
  { documentId: "pcd-2", number: 2, progressState: "accepted" },
]);

describe("trade presence lines on the schedule", () => {
  it("stamps the scope's progress rather than the goods machine's stage", () => {
    const item = {
      status: "approved",
      blocked: false,
      received_quantity: null,
      trade_scope_document_id: "pcd-1",
    };
    expect(deriveLineStamp(item, "engaged").kind).toBe("trade_engaged");
    expect(deriveLineStamp(item, "in_progress").kind).toBe("trade_in_progress");
    expect(deriveLineStamp(item, "substantially_complete").kind).toBe(
      "trade_substantially_complete",
    );
    expect(deriveLineStamp(item, "accepted").kind).toBe("trade_accepted");
  });

  it("falls back to Engaged when the caller never tracks trade progress (argument omitted)", () => {
    expect(
      deriveLineStamp({
        status: "specified",
        blocked: false,
        received_quantity: null,
        trade_scope_document_id: "pcd-9",
      }).kind,
    ).toBe("trade_engaged");
  });

  // A caller that DOES track trade progress but has not resolved it yet
  // (its query is loading, or disabled for this view) must say so with an
  // explicit `null` — distinct from the omitted-argument case above — so the
  // line reads quiet instead of a possibly-wrong "Engaged".
  it("reads quiet (trade_pending) when the caller explicitly has no progress yet", () => {
    expect(
      deriveLineStamp(
        {
          status: "approved",
          blocked: false,
          received_quantity: null,
          trade_scope_document_id: "pcd-1",
        },
        null,
      ).kind,
    ).toBe("trade_pending");
  });

  it("still lets an open decision speak first", () => {
    expect(
      deriveLineStamp(
        {
          status: "approved",
          blocked: true,
          received_quantity: null,
          trade_scope_document_id: "pcd-1",
          blocking_decision: { status: "pending", due_date: "2026-08-10" },
        },
        "in_progress",
      ),
    ).toEqual({ kind: "decision_due", dueDate: "2026-08-10" });
  });

  it("leaves a furnishing line's stamp untouched", () => {
    expect(
      deriveLineStamp({
        status: "shipped",
        blocked: false,
        received_quantity: null,
      }).kind,
    ).toBe("shipped");
  });
});

describe("deriveTradeLineHold", () => {
  it("names the scope a presence line belongs to", () => {
    expect(deriveTradeLineHold(line({ trade_scope_document_id: "pcd-2" }), index)).toEqual(
      { onTradeScope: true, number: 2, progressState: "accepted" },
    );
  });

  it("holds an unresolvable scope as a trade line without a number", () => {
    expect(
      deriveTradeLineHold(line({ trade_scope_document_id: "pcd-missing" }), index),
    ).toEqual({ onTradeScope: true, number: 0, progressState: "none" });
  });

  it("reads a furnishing line as not on a trade scope", () => {
    expect(deriveTradeLineHold(line(), index)).toEqual({ onTradeScope: false });
  });
});

describe("trade lines and the furnishings release", () => {
  it("is ineligible, and says which scope holds it", () => {
    const item = line({ trade_scope_document_id: "pcd-1" });
    expect(eligibility(item, { track: "none" }, deriveTradeLineHold(item, index))).toEqual(
      { eligible: false, reason: "on trade scope · № 1" },
    );
  });

  it("drops the ordinal rather than inventing one", () => {
    const item = line({ trade_scope_document_id: "pcd-missing" });
    expect(
      eligibility(item, { track: "none" }, deriveTradeLineHold(item, index)),
    ).toEqual({ eligible: false, reason: "on trade scope" });
  });

  it("leaves an ordinary line eligible when no trade hold is passed", () => {
    expect(eligibility(line(), { track: "none" })).toEqual({ eligible: true });
  });

  it("refuses a purchase order on trade work, from the row alone", () => {
    expect(poGate(line({ trade_scope_document_id: "pcd-1" }), { track: "none" }, true)).toEqual({
      orderable: false,
      sentence: "Trade work is engaged on its scope, not purchase-ordered",
    });
    // Even on a non-commercial project, and even with the hold omitted.
    expect(poGate(line({ trade_scope_document_id: "pcd-1" }), { track: "none" }, false))
      .toMatchObject({ orderable: false });
  });

  it("leaves the furnishings purchase-order gate alone", () => {
    expect(
      poGate(
        line(),
        {
          track: "authorized",
          number: 3,
          signedLineTotalCents: 490_000,
          depositClear: true,
          deltaCents: null,
        },
        true,
      ),
    ).toEqual({ orderable: true, sentence: "PO available — deposit clear (A3)" });
  });
});
