import { open, shot, dump, BASE, PROJECT } from "./lib.mjs";
const { browser, page } = await open();
await page.goto(`${BASE}/doc/${PROJECT}`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /^Pieces \d+ lines?/i }).first().click({ timeout: 90000 });
await page.getByText("US-50 Walk Channel-back sofa", { exact: true }).first().click({ timeout: 30000 });
await page.waitForTimeout(3000);
await shot(page, "03-line-unfold-sofa-1440");
for (const id of ["line-buy-cell","line-quote-cell","line-po-cell","line-movement-cell","line-receiving-cell","line-money-out-cell","line-next-act"]) {
  const l = page.getByTestId(id); if (await l.count()) { console.log("==", id, "::", (await l.first().innerText()).replace(/\n+/g," | ")); await l.first().scrollIntoViewIfNeeded(); }
}
await page.getByTestId("line-buy-cell").first().scrollIntoViewIfNeeded();
await shot(page, "03v-line-unfold-viewport-1440", false);
await page.getByText("More", { exact: false }).first().click().catch(()=>{});
await browser.close();
