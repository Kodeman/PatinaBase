// SQ-1801 D (shipment form copy) + E (receive drawer defaults), no saves. Usage: node rewalk-de.mjs 1440|390
import { open, shot, txt, body, dump, overflow, openLine } from "./rewalk-lib.mjs";
const w = Number(process.argv[2] || 1440);
const { browser, page } = await open("us50-member@patina.dev", w);
await openLine(page, "Dining chair", w);
console.log("movement:", await txt(page.getByTestId("line-movement-cell")));
await page.getByTestId("line-movement-cell").scrollIntoViewIfNeeded();
await shot(page, `D-chairs-movement-${w}`);
await page.getByRole("button", { name: /Record another shipment/ }).first().click();
await page.waitForTimeout(1500);
await shot(page, `D-shipment-form-${w}`);
const cell = (await body(page, 20000));
const m = cell.match(/Records? [^|]{0,160}/g);
console.log("dispatch copy:", JSON.stringify(m));
const ex = cell.match(/[^|]*(remain|shipped)[^|]*/g);
console.log("shipment-form copy hits:", JSON.stringify([...new Set(ex)].slice(0, 12)));
const qty = page.locator("input").filter({ visible: true }).and(page.locator("input[value='2']")).first();
if (await qty.count()) {
  await qty.fill("1"); await page.waitForTimeout(600);
  const t2 = await body(page, 30000);
  console.log("partial-qty copy:", JSON.stringify([...new Set(t2.match(/[^|]*(remain with the vendor|in this shipment)[^|]*/g))]));
  await page.getByText(/Pieces on this shipment/i).first().scrollIntoViewIfNeeded();
  await shot(page, `D-shipment-form-partial-${w}`);
} else console.log("no qty input found");
await page.getByRole("button", { name: "Cancel", exact: true }).first().click().catch(() => {});
await page.waitForTimeout(500);
await page.waitForTimeout(800);
const rb = page.getByRole("button", { name: /Receive a delivery/ }).first();
if (await rb.count()) {
  await rb.click(); await page.waitForTimeout(1500);
  await shot(page, `E-receive-drawer-${w}`);
  const selects = page.locator("select");
  for (let i = 0; i < await selects.count(); i++) {
    const s = selects.nth(i);
    if (!(await s.isVisible())) continue;
    console.log("select", await s.getAttribute("aria-label"), "val=", await s.inputValue().catch(() => ""), "opts=", JSON.stringify(await s.locator("option").allInnerTexts()));
  }
}
console.log("overflow", JSON.stringify(await overflow(page)));
console.log("errs", JSON.stringify(page.errs));
await browser.close();
