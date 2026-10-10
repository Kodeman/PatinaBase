// Deno test for po-send's COM print (C-24, SQ-424).
// Run: deno test supabase/functions/po-send/com.test.ts
//
// The furniture PO says "COM arriving separately — {mill} PO-…" under the
// piece a supplying fabric PO feeds, and a line's own com_spec prints the way
// a configuration's com_details does.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { comArrivingSeparately, vendorConfigurationLines } from "./lib.ts";

const KESSLER_PO = { id: "po-1043", po_number: "PO-1043", vendor: { name: "Kessler" } };

Deno.test("comArrivingSeparately prints the mill PO under the piece it supplies", () => {
  const notes = comArrivingSeparately(
    [
      { id: "line-chair", spec: {} },
      {
        id: "line-sofa",
        spec: {
          com_spec: {
            fabricName: "Brae linen",
            pattern: "Flax",
            yardage: "19",
            sidemark: "HART-ASHBY-LR-SOFA",
          },
        },
      },
    ],
    [KESSLER_PO],
    [{ purchase_order_id: "po-1043", parent_ffe_item_id: "line-sofa", link_kind: "com" }],
  );
  assertEquals(notes.get("line-chair"), undefined);
  assertEquals(notes.get("line-sofa"), [
    "COM arriving separately — Kessler PO-1043, 19 yd Brae linen, Flax, tagged HART-ASHBY-LR-SOFA",
  ]);
});

Deno.test("comArrivingSeparately reads an unnumbered fabric PO and a bare spec", () => {
  const notes = comArrivingSeparately(
    [{ id: "line-sofa", spec: [{ com_spec: null }] }],
    [{ id: "po-9", po_number: null, vendor: null }],
    [{ purchase_order_id: "po-9", parent_ffe_item_id: "line-sofa", link_kind: "com" }],
  );
  assertEquals(notes.get("line-sofa"), ["COM arriving separately — the mill PO to follow"]);
});

Deno.test("comArrivingSeparately attaches an unmatched supplying PO to the first line once", () => {
  const notes = comArrivingSeparately(
    [{ id: "line-a" }, { id: "line-b" }],
    [KESSLER_PO],
    [{ purchase_order_id: "po-1043", parent_ffe_item_id: "line-elsewhere", link_kind: "com" }],
  );
  assertEquals(notes.get("line-a"), ["COM arriving separately — Kessler PO-1043"]);
  assertEquals(notes.get("line-b"), undefined);
});

Deno.test("comArrivingSeparately says nothing without a supplying PO", () => {
  assertEquals(comArrivingSeparately([{ id: "line-a" }], [], []).size, 0);
});

Deno.test("vendorConfigurationLines prints an unconfigured line's com_spec like com_details", () => {
  assertEquals(
    vendorConfigurationLines({
      configuration_snapshot: {},
      com_spec: {
        fabricName: "Brae linen",
        mill: "Kessler",
        pattern: "Flax",
        yardage: "19",
        railroaded: false,
        shipTo: "Hale Upholstery Works",
        sidemark: "HART-ASHBY-LR-SOFA",
      },
    }),
    [
      "COM: Brae linen — Kessler, Flax",
      "COM yardage: 19 yds",
      "COM ship-to: Hale Upholstery Works",
      "Sidemark: HART-ASHBY-LR-SOFA",
      "Lead time provisional until COM fabric received",
    ],
  );
});

Deno.test("vendorConfigurationLines keeps a configuration's own com_details over com_spec", () => {
  const lines = vendorConfigurationLines({
    configuration_snapshot: {
      selections: [{ groupName: "Wood", valueLabel: "Walnut" }],
      comDetails: { fabricName: "From the configuration" },
    },
    com_spec: { fabricName: "From the line" },
  });
  assertEquals(lines.includes("COM: From the configuration"), true);
  assertEquals(lines.includes("COM: From the line"), false);
});

Deno.test("vendorConfigurationLines prints nothing new for a line with no com_spec", () => {
  assertEquals(vendorConfigurationLines({ configuration_snapshot: {}, com_spec: null }), []);
});
