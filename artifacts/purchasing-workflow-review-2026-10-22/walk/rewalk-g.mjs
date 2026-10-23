// SQ-1801 G: member logs a damaged receipt on the chairs' second shipment (draft claim), then Desk views. Usage: node rewalk-g.mjs save | desks
import { open, shot, txt, body, dump, openLine, BASE, overflow } from "./rewalk-lib.mjs";
if (process.argv[2] === "save") {
  const { browser, page } = await open("us50-member@patina.dev", 1440);
  await openLine(page, "Dining chair", 1440);
  await page.getByRole("button", { name: /Receive a delivery|Log inspection/ }).first().click();
  await page.waitForTimeout(1800);
  await page.getByLabel("Arrival location").selectOption({ label: "US-51 Walk Receiving Warehouse" });
  await page.getByLabel("Opened and checked?").selectOption({ label: "Yes · inspected" });
  await page.getByRole("button", { name: /^Damaged/ }).click();
  await page.getByLabel(/Condition of/).selectOption({ label: "Damaged" });
  await shot(page, "G-receive-damaged-filled-1440");
  await page.getByRole("button", { name: /Save receipt/ }).click();
  await page.waitForTimeout(4500);
  console.log("after save:", (await body(page, 500)).slice(0, 300));
  await shot(page, "G-after-save-1440");
  await browser.close();
} else {
  for (const w of [1440, 390]) for (const who of ["member", "owner"]) {
    const { browser, page } = await open(`us50-${who}@patina.dev`, w);
    await page.goto(`${BASE}/desk`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(7000);
    await shot(page, `G-desk-${who}-${w}`);
    const t = await body(page, 2400);
    console.log(`[${who} ${w}]`, t.slice(t.indexOf("TODAY"), t.indexOf("STUDIO RESOURCES")));
    if (who === "member") {
      const st = page.getByText(/THE STUDIO.?S/i).first();
      await st.click().catch(() => {});
      await page.waitForTimeout(1500);
      await shot(page, `G-desk-${who}-studio-tab-${w}`);
      const t2 = await body(page, 2400);
      console.log(`[${who} ${w} studio tab]`, t2.slice(t2.indexOf("TODAY"), t2.indexOf("STUDIO RESOURCES")));
    }
    await browser.close();
  }
}
