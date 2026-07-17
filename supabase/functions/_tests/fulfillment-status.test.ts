/// <reference lib="deno.ns" />
// ^ see catalog-normalizer.test.ts / apns-send.test.ts for why this reference
// is needed against the monorepo root tsconfig.json.
//
// fulfillment-status (S4, spec §6/§9.5) — the derived-status API for iOS.
// Structural tests against core.ts's pure transform: response shape, the
// closed status-kind enum, and a deep-scan for vendor/po_/cost keys (the same
// leak-guard posture as fulfillment-notify.test.ts, applied to the OTHER
// object mentioned in the S4 package brief: "no rendered template or API
// response contains a vendor name or PO number"). No live stack, no network.
// Run:
//   deno test --no-check -A supabase/functions/_tests/fulfillment-status.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type ClientOrderStatusRow,
  getOrderStatuses,
  labelForStatus,
  normalizeStatusKind,
  rowToStatusOrder,
  STATUS_KINDS,
  type StatusSupabaseLike,
} from "../fulfillment-status/core.ts";

const FORBIDDEN_KEY_PATTERN = /vendor|po_number|po_id|cost|price/i;
const PO_NUMBER_PATTERN = /\bPO-\d/;

/** Deep-scans an arbitrary JSON value for forbidden key names (recursing into
 *  every object/array) and, on every string leaf, the PO number pattern. */
function deepScanForLeaks(value: unknown, path = "$"): string[] {
  const hits: string[] = [];
  if (value == null) return hits;
  if (typeof value === "string") {
    if (PO_NUMBER_PATTERN.test(value)) hits.push(`${path}: string value matches PO number pattern ("${value}")`);
    return hits;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...deepScanForLeaks(v, `${path}[${i}]`)));
    return hits;
  }
  if (typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY_PATTERN.test(key)) hits.push(`${path}.${key}: forbidden key name`);
      hits.push(...deepScanForLeaks(v, `${path}.${key}`));
    }
  }
  return hits;
}

function fakeStatusSupabase(rows: ClientOrderStatusRow[]): StatusSupabaseLike {
  return {
    from: (table: string) => {
      if (table !== "client_order_status_v") {
        throw new Error(`unexpected table in fulfillment-status test double: ${table}`);
      }
      return {
        select: (_cols?: string) => ({
          // deno-lint-ignore require-await
          order: async (_col: string, _opts?: { ascending?: boolean }) => ({ data: rows, error: null }),
        }),
      };
    },
  };
}

Deno.test("STATUS_KINDS is the closed 5-value enum the API contract promises", () => {
  assertEquals(STATUS_KINDS, ["confirmed", "in_production", "shipped", "delivered", "delayed"]);
});

Deno.test("normalizeStatusKind: known values pass through; unknown falls back to confirmed (never open-ended)", () => {
  assertEquals(normalizeStatusKind("shipped"), "shipped");
  assertEquals(normalizeStatusKind("delayed"), "delayed");
  assertEquals(normalizeStatusKind("some_future_derived_status"), "confirmed");
  assertEquals(normalizeStatusKind(""), "confirmed");
});

Deno.test("labelForStatus covers every kind with a non-empty client-safe label", () => {
  for (const kind of STATUS_KINDS) {
    const label = labelForStatus(kind);
    assert(label.length > 0);
  }
});

// Base row with every enriched column null — individual tests override just
// the fields they care about (confirmed_at/in_production_at/shipped_at/
// delivered_at/eta), matching what client_order_status_v (00358) now emits.
const BLANK_ROW: ClientOrderStatusRow = {
  order_id: "order-0",
  order_no: 0,
  intake_at: "2026-07-01T12:00:00Z",
  client_status: "confirmed",
  eta: null,
  confirmed_at: null,
  in_production_at: null,
  shipped_at: null,
  delivered_at: null,
};

Deno.test("rowToStatusOrder: confirmed order with confirmed_at populated carries a single real-timestamp entry", () => {
  const row: ClientOrderStatusRow = {
    ...BLANK_ROW,
    order_id: "order-1",
    order_no: 1,
    client_status: "confirmed",
    confirmed_at: "2026-07-02T09:00:00Z",
  };
  const order = rowToStatusOrder(row);
  assertEquals(order, {
    order_number: 1,
    status: "confirmed",
    status_label: "Confirmed",
    eta: null,
    timeline: [{ at: "2026-07-02T09:00:00Z", kind: "confirmed", label: "Confirmed" }],
  });
});

Deno.test("rowToStatusOrder: confirmed order pre-PO (confirmed_at still null) reports an honest at:null, NOT intake_at", () => {
  const row: ClientOrderStatusRow = { ...BLANK_ROW, order_id: "order-1b", order_no: 1, client_status: "confirmed" };
  const order = rowToStatusOrder(row);
  assertEquals(order.timeline, [{ at: null, kind: "confirmed", label: "Confirmed" }]);
});

Deno.test("rowToStatusOrder: in_production order carries two real-timestamp entries", () => {
  const row: ClientOrderStatusRow = {
    ...BLANK_ROW,
    order_id: "order-2",
    order_no: 2,
    client_status: "in_production",
    confirmed_at: "2026-06-10T09:00:00Z",
    in_production_at: "2026-06-15T09:00:00Z",
  };
  const order = rowToStatusOrder(row);
  assertEquals(order.timeline, [
    { at: "2026-06-10T09:00:00Z", kind: "confirmed", label: "Confirmed" },
    { at: "2026-06-15T09:00:00Z", kind: "in_production", label: "In production" },
  ]);
});

Deno.test("rowToStatusOrder: shipped order carries three real-timestamp entries + a non-null eta", () => {
  const row: ClientOrderStatusRow = {
    ...BLANK_ROW,
    order_id: "order-3",
    order_no: 3,
    client_status: "shipped",
    confirmed_at: "2026-06-01T09:00:00Z",
    in_production_at: "2026-06-05T09:00:00Z",
    shipped_at: "2026-06-20T09:00:00Z",
    eta: "2026-06-30",
  };
  const order = rowToStatusOrder(row);
  assertEquals(order.timeline.map((e) => e.kind), ["confirmed", "in_production", "shipped"]);
  assertEquals(order.timeline[2], { at: "2026-06-20T09:00:00Z", kind: "shipped", label: "Shipped" });
  assertEquals(order.eta, "2026-06-30");
});

Deno.test("rowToStatusOrder: delivered order carries all four stage entries, every timestamp real", () => {
  const row: ClientOrderStatusRow = {
    ...BLANK_ROW,
    order_id: "order-4",
    order_no: 4,
    client_status: "delivered",
    confirmed_at: "2026-05-01T09:00:00Z",
    in_production_at: "2026-05-05T09:00:00Z",
    shipped_at: "2026-05-20T09:00:00Z",
    delivered_at: "2026-05-28T09:00:00Z",
    eta: "2026-05-28",
  };
  const order = rowToStatusOrder(row);
  assertEquals(order.timeline, [
    { at: "2026-05-01T09:00:00Z", kind: "confirmed", label: "Confirmed" },
    { at: "2026-05-05T09:00:00Z", kind: "in_production", label: "In production" },
    { at: "2026-05-20T09:00:00Z", kind: "shipped", label: "Shipped" },
    { at: "2026-05-28T09:00:00Z", kind: "delivered", label: "Delivered" },
  ]);
});

Deno.test("rowToStatusOrder: delayed order keeps the pre-enrichment shape — no delayed_at column exists to attach", () => {
  const row: ClientOrderStatusRow = {
    ...BLANK_ROW,
    order_id: "order-5",
    order_no: 5,
    client_status: "delayed",
    confirmed_at: "2026-04-01T09:00:00Z", // an exception can interrupt any underlying stage —
    in_production_at: "2026-04-05T09:00:00Z", // even a well-progressed order — so these enriched
                                               // columns are deliberately NOT consulted for 'delayed'.
  };
  const order = rowToStatusOrder(row);
  assertEquals(order.timeline, [
    { at: "2026-07-01T12:00:00Z", kind: "confirmed", label: "Confirmed" },
    { at: null, kind: "delayed", label: "Delayed" },
  ]);
});

Deno.test("every timeline kind stays inside the closed enum, across every client_status the view can emit", () => {
  const emittedByView = ["confirmed", "in_production", "shipped", "delivered", "delayed"];
  for (const clientStatus of emittedByView) {
    const order = rowToStatusOrder({ ...BLANK_ROW, order_id: "o", order_no: 9, client_status: clientStatus });
    for (const entry of order.timeline) {
      assert((STATUS_KINDS as readonly string[]).includes(entry.kind), `unexpected kind '${entry.kind}'`);
    }
    assert((STATUS_KINDS as readonly string[]).includes(order.status));
  }
});

Deno.test("rowToStatusOrder: an unrecognized client_status normalizes to confirmed with the pre-PO honest gap", () => {
  const order = rowToStatusOrder({ ...BLANK_ROW, order_id: "o", order_no: 9, client_status: "some_future_status" });
  assertEquals(order.status, "confirmed");
  assertEquals(order.timeline, [{ at: null, kind: "confirmed", label: "Confirmed" }]);
});

Deno.test("getOrderStatuses: response shape + deep-scan finds zero vendor/po_/cost keys or PO-number strings", async () => {
  const rows: ClientOrderStatusRow[] = [
    { ...BLANK_ROW, order_id: "order-1", order_no: 1, client_status: "confirmed", confirmed_at: "2026-07-02T09:00:00Z" },
    {
      ...BLANK_ROW,
      order_id: "order-2",
      order_no: 2,
      intake_at: "2026-06-15T09:00:00Z",
      client_status: "shipped",
      confirmed_at: "2026-06-01T09:00:00Z",
      in_production_at: "2026-06-05T09:00:00Z",
      shipped_at: "2026-06-20T09:00:00Z",
      eta: "2026-06-30",
    },
    { ...BLANK_ROW, order_id: "order-3", order_no: 3, intake_at: "2026-05-20T09:00:00Z", client_status: "delayed" },
  ];
  const response = await getOrderStatuses({ supabase: fakeStatusSupabase(rows) });

  assertEquals(Object.keys(response), ["orders"]);
  assertEquals(response.orders.length, 3);
  for (const order of response.orders) {
    assertEquals(
      Object.keys(order).sort(),
      ["eta", "order_number", "status", "status_label", "timeline"].sort(),
    );
    assert((STATUS_KINDS as readonly string[]).includes(order.status));
    for (const entry of order.timeline) {
      assertEquals(Object.keys(entry).sort(), ["at", "kind", "label"].sort());
    }
  }

  const hits = deepScanForLeaks(response);
  console.log("[leak test] fulfillment-status: deep-scanned the full response object (3 orders,", response.orders.reduce((n, o) => n + o.timeline.length, 0), "timeline entries) — 0 forbidden keys/patterns expected");
  assertEquals(hits, [], `Deep scan found forbidden content in the status API response: ${JSON.stringify(hits, null, 2)}`);
});

Deno.test("getOrderStatuses: empty result for a caller with no orders (not an error)", async () => {
  const response = await getOrderStatuses({ supabase: fakeStatusSupabase([]) });
  assertEquals(response, { orders: [] });
});
