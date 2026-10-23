// SQ-1801 F step 1: create a fresh project through the UI (owner) so no order has reached a vendor. Usage: node rewalk-f1.mjs
import { open, shot, txt, body, dump, BASE } from "./rewalk-lib.mjs";
const { browser, page } = await open("us50-owner@patina.dev", 1440);
await page.goto(`${BASE}/desk`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await page.getByRole("button", { name: /Create a project file/ }).first().click();
await page.waitForTimeout(2500);
await page.getByLabel(/PROJECT TITLE/i).fill(process.argv[2] || "US-51 Rewalk F");
await page.locator("select").filter({ hasText: "Choose a studio" }).first().selectOption({ label: "US-51 Walk Studio" });
await shot(page, "F-create-project-filled-1440");
await dump(page, "[role=dialog] button, dialog button");
const create = page.getByRole("button", { name: /^Create|Start the project|Create project/i }).last();
console.log("create btn:", await create.innerText());
await create.click();
await page.waitForTimeout(6000);
console.log("url", page.url());
await shot(page, "F-after-create-1440");
console.log((await body(page, 700)));
await browser.close();
