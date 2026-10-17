// Deno test for the labor gate on the maker's PO (US-21 T-20; S4, a7, Q5).
// Run: deno test supabase/functions/po-send/lib.test.ts
//
// The wallpaper: 9 rolls of grasscloth from Phillip Jeffries, with its
// install as a labor line on the piece (link_kind 'labor', 00732). The
// maker's PO prints `9 roll` in the Qty cell, and the labor child never
// prints "COM arriving separately": only a 'com' link is the COM pair.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { comArrivingSeparately, poLineRoomLabel, poPdfLine } from "./lib.ts";
import { PoDocument, poLineItemLabel, poQuantityLabel } from "../_shared/po-pdf.ts";

Deno.test("PO line labels lead the item name when present", () => {
  assertEquals(poLineItemLabel("Linen sofa", "LR-01"), "LR-01 · Linen sofa");
});

Deno.test("PO lines without a label preserve the existing item name", () => {
  assertEquals(poLineItemLabel("Linen sofa"), "Linen sofa");
  assertEquals(poLineItemLabel("Linen sofa", "  "), "Linen sofa");
});

// SQ-1173 R6: the label reaches the printed page — the FFE row's doc_code
// maps onto the PDF line, and the item cell prints it before the name.
const SOFA_ROW = {
  id: "line-sofa",
  name: "Linen sofa",
  doc_code: "LR-01",
  quantity: 1,
  unit: null,
  trade_price_cents: 410000,
  unit_price_cents: 650000,
  notes: null,
  ffe_category: null,
  room: { name: "Living Room" },
  placements: null,
  spec: null,
  product: null,
};

// deno-lint-ignore no-explicit-any
function printedStrings(node: any, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((child) => printedStrings(child, out));
  else if (node && typeof node === "object" && "props" in node) printedStrings(node.props.children, out);
  return out;
}

Deno.test("the FFE row's label maps onto the PO line", () => {
  assertEquals(poPdfLine(SOFA_ROW, new Map()).docCode, "LR-01");
});

Deno.test("the PO item cell prints the label before the name", () => {
  const page = PoDocument({
    poNumber: "PO-1043",
    issuedAt: "2026-10-17T00:00:00Z",
    studioName: "Middle West",
    designerName: "Leah",
    designerEmail: null,
    vendorName: "Kessler",
    vendorContactLines: [],
    projectName: "Ellsworth",
    sidemark: null,
    shipTo: null,
    paymentPatternLabel: "Net 30",
    payments: [],
    lines: [poPdfLine(SOFA_ROW, new Map())],
    tradeTotalCents: 410000,
  });
  const strings = printedStrings(page);
  assertEquals(strings.includes("LR-01 · Linen sofa"), true);
  assertEquals(strings.includes("Linen sofa"), false);
});

const WALLPAPER = { id: "line-wallpaper", spec: {} };
const INSTALLER_PO = { id: "po-2001", po_number: "PO-2001", vendor: { name: "Hang Right" } };
const KESSLER_PO = { id: "po-1043", po_number: "PO-1043", vendor: { name: "Kessler" } };
const INSTALL = {
  purchase_order_id: "po-2001",
  parent_ffe_item_id: "line-wallpaper",
  link_kind: "labor",
};

Deno.test("a labor child on a supplying PO never prints COM arriving separately", () => {
  const notes = comArrivingSeparately([WALLPAPER], [INSTALLER_PO], [INSTALL]);
  assertEquals(notes.size, 0);
});

Deno.test("a labor-only supplying PO does not fall back to the first line", () => {
  const notes = comArrivingSeparately(
    [{ id: "line-chair" }, WALLPAPER],
    [INSTALLER_PO],
    [INSTALL, { purchase_order_id: "po-2001", parent_ffe_item_id: "line-elsewhere", link_kind: "accessory" }],
  );
  assertEquals(notes.size, 0);
});

Deno.test("a COM link beside a labor link still prints, on its own piece only", () => {
  const notes = comArrivingSeparately(
    [{ id: "line-sofa", spec: { com_spec: { yardage: "19" } } }, WALLPAPER],
    [KESSLER_PO, INSTALLER_PO],
    [{ purchase_order_id: "po-1043", parent_ffe_item_id: "line-sofa", link_kind: "com" }, INSTALL],
  );
  assertEquals(notes.get("line-sofa"), ["COM arriving separately — Kessler PO-1043, 19 yd"]);
  assertEquals(notes.get("line-wallpaper"), undefined);
});

Deno.test("F12: the first-item fallback skips a labor line and attaches to the next item", () => {
  const LABOR_ITEM = { id: "line-labor", link_kind: "labor", line_kind: "labor" };
  const SOFA = { id: "line-sofa", spec: { com_spec: { yardage: "19" } } };
  const notes = comArrivingSeparately([LABOR_ITEM, SOFA], [KESSLER_PO], []);
  assertEquals(notes.get("line-labor"), undefined);
  assertEquals(notes.get("line-sofa"), ["COM arriving separately — Kessler PO-1043, 19 yd"]);
});

Deno.test("F12: when every item is labor, the fallback attaches to no item", () => {
  const LABOR_ITEM = { id: "line-labor", link_kind: "labor", line_kind: "labor" };
  const notes = comArrivingSeparately([LABOR_ITEM], [KESSLER_PO], []);
  assertEquals(notes.size, 0);
});

Deno.test("the maker's PO line prints the unit: 9 roll", () => {
  assertEquals(poQuantityLabel(9, "roll"), "9 roll");
  assertEquals(poQuantityLabel(320, "sq_ft"), "320 sq ft");
  assertEquals(poQuantityLabel(12, "lin_ft"), "12 lin ft");
});

Deno.test("each, or no unit, prints the bare quantity as before", () => {
  assertEquals(poQuantityLabel(2, "each"), "2");
  assertEquals(poQuantityLabel(1, null), "1");
  assertEquals(poQuantityLabel(3), "3");
});

// T-51 (D7 phase 3): the oak floor, 913 sq ft ordered over 830 measured in
// four rooms. The embed arrives in any order; the room cell reads in
// placement order, the unit once, and the 83 sq ft of waste is no room.
const OAK_PLACEMENTS = [
  { quantity: 210, sort_order: 3, room: { name: "Kitchen" } },
  { quantity: 120, sort_order: 0, room: { name: "Hall" } },
  { quantity: 180, sort_order: 2, room: { name: "Dining" } },
  { quantity: 320, sort_order: 1, room: { name: "Living Room" } },
];

Deno.test("the oak floor's PO line names every room with its share", () => {
  assertEquals(
    poLineRoomLabel("Hall", OAK_PLACEMENTS, "sq_ft"),
    "Hall 120 · Living Room 320 · Dining 180 · Kitchen 210 sq ft",
  );
});

Deno.test("a multi-room line counted each prints the shares without a unit", () => {
  assertEquals(
    poLineRoomLabel("Hall", [
      { quantity: 2, sort_order: 0, room: { name: "Hall" } },
      { quantity: 1, sort_order: 1, room: { name: "Dining" } },
    ], "each"),
    "Hall 2 · Dining 1",
  );
});

Deno.test("a single-room line prints its primary room, as before", () => {
  assertEquals(poLineRoomLabel("Kitchen", [], "sq_ft"), "Kitchen");
  assertEquals(poLineRoomLabel("Kitchen", null, "sq_ft"), "Kitchen");
  assertEquals(
    poLineRoomLabel("Kitchen", [{ quantity: 210, sort_order: 0, room: { name: "Kitchen" } }], "sq_ft"),
    "Kitchen",
  );
  assertEquals(poLineRoomLabel(null, undefined, null), null);
});
