// SQ-1805 G: member logs a damaged receipt on the chairs' second shipment (draft claim), then Desk views. Usage: node rewalk-g.mjs save | desks
import { open, shot, txt, body, dump, openLine, BASE, overflow } from "./rewalk-lib.mjs";
{
  const { browser, page } = await open("us50-member@patina.dev", 1440);
  await openLine(page, process.argv[3] || "Table lamp", 1440);
  await page.getByRole("button", { name: /Receive a delivery|Log inspection/ }).first().click();
  await page.waitForTimeout(1800);
  await page.getByLabel("Arrival location").selectOption({ label: "US-51 Walk Receiving Warehouse" });
  await page.getByLabel("Opened and checked?").selectOption({ label: "Yes · inspected" });
  await page.getByRole("button", { name: /^Damaged/ }).click();
  await page.getByLabel(/Condition of/).selectOption({ label: "Damaged" });
  await shot(page, "W5-G-receive-damaged-filled-1440");
  await page.getByRole("button", { name: /Save receipt/ }).click();
  await page.waitForTimeout(4500);
  console.log("after save:", (await body(page, 500)).slice(0, 300));
  await shot(page, "W5-G-after-save-1440");
  await browser.close();
}
