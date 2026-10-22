import { open, shot, dump, BASE, PROJECT, openLine, vshot, txt } from "./lib.mjs";
const SOFA="US-50 Walk Channel-back sofa";
const { browser, page } = await open();
await openLine(page, SOFA);
await page.getByRole("button", { name: "Mark installed" }).first().click(); await page.waitForTimeout(3000);
await vshot(page, "41-sofa-installed-1440", page.getByTestId("line-movement-cell"));
for (const id of ["line-next-act","line-movement-cell","line-receiving-cell"]) console.log("==", id, await txt(page.getByTestId(id)));
// pieces overview rows
await page.goto(`${BASE}/doc/${PROJECT}`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /^Pieces/i }).first().click({ timeout: 90000 }).catch(()=>{});
await page.waitForTimeout(3500);
await page.getByText("FF&E selections").first().scrollIntoViewIfNeeded();
await shot(page, "42-pieces-overview-status-words-1440", false);
console.log("overview:", (await page.innerText("main")).replace(/\n+/g," | ").match(/FF&E selections.{0,1500}/)?.[0]);
// Desk
await page.goto(`${BASE}/desk`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(6000);
await shot(page, "43-desk-1440", false); console.log("desk:", (await page.innerText("body")).replace(/\n+/g," | ").slice(0,900));
await dump(page, "a, button");
await browser.close();
