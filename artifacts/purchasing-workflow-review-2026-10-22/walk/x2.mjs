import { open, shot, dump, BASE, PROJECT } from "./lib.mjs";
const { browser, page } = await open();
await page.goto(`${BASE}/doc/${PROJECT}`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /^Pieces \d+ lines?/i }).first().click({ timeout: 90000 });
await page.waitForTimeout(4000);
await shot(page, "02-pieces-overview-1440"); await shot(page, "02v-pieces-overview-viewport-1440", false);
console.log(page.url()); await dump(page);
console.log("-----BODY"); console.log((await page.innerText("main").catch(()=>page.innerText("body"))).slice(0,3500));
await browser.close();
