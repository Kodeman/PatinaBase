import { open, shot, dump, BASE, PROJECT, txt } from "./lib.mjs";
const { browser, page } = await open();
await page.goto(`${BASE}/desk`, { waitUntil: "domcontentloaded" }); await page.waitForTimeout(5000);
await page.getByRole("button", { name: "Skip for now" }).click({timeout:5000}).catch(()=>{});
await page.getByText("Purchase orders, receiving and claims").first().click({timeout:20000});
await page.waitForTimeout(2500);
for (const [tab, slug] of [["RECEIVING","46-orders-receiving-1440"],["VENDOR ACCOUNTS","47-orders-vendor-accounts-1440"]]) {
  await page.locator("[data-orders-book]").getByText(new RegExp("^"+tab+"$","i")).first().click(); await page.waitForTimeout(2500);
  await shot(page, slug, false);
  console.log("==", tab, (await txt(page.getByRole("dialog"))).slice(0,900));
}
await browser.close();
