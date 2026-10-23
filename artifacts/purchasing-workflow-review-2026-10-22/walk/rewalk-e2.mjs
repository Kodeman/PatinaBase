// SQ-1801 E at 390 (and 1440 re-check): record the remaining 2 chairs as a second shipment, then open the receive drawer. Usage: node rewalk-e2.mjs 390
import { open, shot, txt, body, overflow, openLine } from "./rewalk-lib.mjs";
const w = Number(process.argv[2] || 390);
const { browser, page } = await open("us50-member@patina.dev", w);
await openLine(page, "Dining chair", w);
if (process.argv[3] !== "look") {
  await page.getByRole("button", { name: /Record another shipment/ }).first().click();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /Record dispatch/ }).click();
  await page.waitForTimeout(3500);
}
console.log("movement:", await txt(page.getByTestId("line-movement-cell")));
console.log("next:", await txt(page.getByTestId("line-next-act")));
await page.getByTestId("line-movement-cell").scrollIntoViewIfNeeded();
await shot(page, `D-after-second-shipment-${w}`);
await page.getByRole("button", { name: /Receive a delivery|Log inspection/ }).first().click();
await page.waitForTimeout(1800);
await shot(page, `E-receive-drawer-one-shipment-${w}`);
for (const lab of ["Shipment", "Responsible person"]) {
  const s = page.getByLabel(lab, { exact: true });
  console.log(lab, "val=", await s.inputValue(), "selectedText=", await s.evaluate((el) => el.options[el.selectedIndex]?.text), "opts=", JSON.stringify(await s.locator("option").allInnerTexts()));
}
console.log("overflow", JSON.stringify(await overflow(page)));
console.log("errs", JSON.stringify(page.errs.slice(0, 3)));
await browser.close();
