// NOT RE-RUN AS ONE PASS. The walk was captured step by step with the x*.mjs scripts in this folder
// (same selectors, same lib.mjs sign-in); this spec consolidates them as a replay on a FRESH seed
// (node seed.mjs, then ./start-server.sh, and `supabase functions serve --env-file <EMAIL_DEV_MODE=dry_run>`
// for po-send). It mutates the shared local DB (POs are created), so it is not idempotent.
import { test } from "@playwright/test";
import { open, openLine, shot, vshot, PROJECT, BASE } from "./lib.mjs";

test("US-50 purchasing walk (replay outline)", async () => {
  const { browser, page } = await open("us50-member@patina.dev");
  // 1-2 find buying, add items: Pieces rail -> "Add items" (door list), "Add room selection"
  await openLine(page, "US-50 Walk Channel-back sofa");
  // 3 quote: "Record a quote…" (records a vendor's quote; nothing asks the vendor for one)
  await page.getByRole("button", { name: /Record a quote/ }).first().click();
  await vshot(page, "04-quote-open-1440", page.getByTestId("line-quote-cell"));
  await page.keyboard.press("Escape");
  // 4-5 order paper, ship-to radios (receiver / studio / job site / somewhere else, ONE per PO)
  await page.getByRole("button", { name: "Order", exact: true }).first().click();
  const paper = page.getByRole("dialog", { name: "The order paper" });
  await paper.getByRole("radio", { name: /Receiving Warehouse/ }).check();
  // 7 send (one click emails the vendor), 8 ack check, 9 Record a shipment (mode/carrier/tracking), 12 Log inspection
  await paper.getByRole("button", { name: /^Send to / }).click();
  await shot(page, "09-paper-after-send-1440", false);
  await browser.close();
});
