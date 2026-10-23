// SQ-1801 C step 3: record the clean pickup arrival for the rug, then read the line. Usage: node rewalk-c3.mjs save|look 1440|390
import { open, shot, txt, body, dump, openLine, overflow, BASE, PROJECT } from "./rewalk-lib.mjs";
const mode = process.argv[2];
const w = Number(process.argv[3] || 1440);
const { browser, page } = await open("us50-member@patina.dev", w);
await openLine(page, "Hand-knotted rug", w);
if (mode === "save") {
  await page.getByTestId("line-next-act").getByRole("button").first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Record arrival" }).first().click();
  await page.waitForTimeout(2000);
  await shot(page, `C-arrival-drawer-${w}`);
  await dump(page, "[role=dialog] select, [role=dialog] label, [role=dialog] button");
  const loc = page.getByLabel("Arrival location");
  if (await loc.count()) await loc.selectOption({ label: "US-51 Walk Receiving Warehouse" }).catch(async () => { await loc.selectOption({ index: 1 }); });
  const op = page.getByLabel("Opened and checked?");
  if (await op.count()) await op.selectOption({ label: "Yes · inspected" });
  await shot(page, `C-arrival-filled-${w}`);
  await page.getByRole("button", { name: /Save receipt/ }).click();
  await page.waitForTimeout(4500);
  console.log("after save:", (await body(page, 300)));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
}
for (const id of ["line-next-act", "line-movement-cell", "line-receiving-cell"]) console.log("==", id, await txt(page.getByTestId(id)));
await page.getByTestId("line-next-act").scrollIntoViewIfNeeded();
await shot(page, `C-rug-after-arrival-${w}`);
await page.goto(`${BASE}/doc/${PROJECT}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
console.log("rug row:", (await page.getByRole("button", { name: /Hand-knotted rug/ }).first().innerText().catch(() => "(none)")).replace(/\n+/g, " | "));
console.log("overflow", JSON.stringify(await overflow(page)));
await browser.close();
