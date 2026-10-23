// SQ-1801 B exploration: sofa line (draft PO) actions as member; Desk state for both users. Usage: node rewalk-b0.mjs
import { open, shot, txt, body, dump, openLine, BASE } from "./rewalk-lib.mjs";
const { browser, page } = await open("us50-member@patina.dev", 1440);
await openLine(page, "Channel-back sofa", 1440);
console.log("next:", await txt(page.getByTestId("line-next-act")));
console.log("po cell:", await txt(page.getByTestId("line-po-cell")));
await dump(page, "[data-testid=line-po-cell] button, [data-testid=line-next-act] button");
await page.goto(`${BASE}/desk`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(7000);
await shot(page, "B0-member-desk-1440");
console.log("member desk:", await body(page, 1800));
await browser.close();
const o = await open("us50-owner@patina.dev", 1440);
await o.page.goto(`${BASE}/desk`, { waitUntil: "domcontentloaded" }); await o.page.waitForTimeout(7000);
await shot(o.page, "B0-owner-desk-1440");
console.log("owner desk:", await body(o.page, 1800));
await o.browser.close();
