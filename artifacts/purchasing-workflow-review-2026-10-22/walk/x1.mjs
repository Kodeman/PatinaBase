import { open, shot, dump, BASE, PROJECT } from "./lib.mjs";
const { browser, page } = await open();
console.log(page.url()); await shot(page, "00-desk-1440");
await page.goto(`${BASE}/doc/${PROJECT}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(8000);
await shot(page, "01-document-1440"); console.log(page.url()); await dump(page);
await browser.close();
