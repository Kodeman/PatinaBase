// Deno test for the labor gate on the maker's PO (US-21 T-20; S4, a7, Q5).
// Run: deno test supabase/functions/po-send/lib.test.ts
//
// The wallpaper: 9 rolls of grasscloth from Phillip Jeffries, with its
// install as a labor line on the piece (link_kind 'labor', 00732). The
// maker's PO prints `9 roll` in the Qty cell, and the labor child never
// prints "COM arriving separately": only a 'com' link is the COM pair.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { comArrivingSeparately } from "./lib.ts";
import { poQuantityLabel } from "../_shared/po-pdf.ts";

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
