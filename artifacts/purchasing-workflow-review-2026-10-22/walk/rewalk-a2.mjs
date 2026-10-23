// SQ-1801 A. Usage: node rewalk-a2.mjs 1440 save   (log a pending receipt on the chairs, then inspect the line act)
//                node rewalk-a2.mjs 390 complete  (open the complete drawer, finish it)
import { open, shot, txt, body, dump, overflow, openLine } from "./rewalk-lib.mjs";
const w = Number(process.argv[2] || 1440);
const mode = process.argv[3] || "look";
const { browser, page } = await open("us50-member@patina.dev", w);
await openLine(page, "Dining chair", w);
if (mode === "save") {
  await page.getByRole("button", { name: /Receive a delivery|Log inspection/ }).first().click();
  await page.waitForTimeout(1500);
  const dlg = page.locator("[role=dialog]").last();
  await page.getByLabel("Arrival location").selectOption({ label: "US-51 Walk Receiving Warehouse" });
  await page.getByLabel("Opened and checked?").selectOption({ label: "Not yet · inspection pending" });
  await shot(page, `A-receive-pending-filled-${w}`);
  await page.getByRole("button", { name: /Save receipt/ }).click();
  await page.waitForTimeout(3500);
  console.log("after save:", (await body(page, 400)));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
}
for (const id of ["line-next-act", "line-receiving-cell", "line-movement-cell"]) console.log("==", id, await txt(page.getByTestId(id)));
await page.getByTestId("line-next-act").scrollIntoViewIfNeeded();
await shot(page, `A-line-next-act-${w}`);
const act = page.getByTestId("line-next-act").getByRole("button").first();
console.log("act button:", await act.innerText());
if (mode === "finish" || mode === "look") {
  await act.click();
  await page.waitForTimeout(2000);
  await shot(page, `A-act-opens-${w}`);
  const t = (await body(page, 6000));
  console.log("drawer head:", t.slice(t.indexOf("COMPLETE"), t.indexOf("COMPLETE") + 600) || t.slice(-900));
  const h = await page.locator("[role=dialog] h1, [role=dialog] h2, [role=dialog] h3, dialog h2").allInnerTexts().catch(() => []);
  console.log("dialog heads", JSON.stringify(h));
  await dump(page, "[role=dialog] button, [role=dialog] select, [role=dialog] label");
  if (mode === "finish") {
    const sel = page.getByLabel(/Condition of/);
    console.log("condition sel", await sel.count());
    await page.getByRole("button", { name: /Complete inspection|Save/ }).last().click().catch((e) => console.log("complete click failed", String(e).slice(0, 100)));
    await page.waitForTimeout(3500);
    await shot(page, `A-after-complete-${w}`);
    console.log("after:", (await body(page, 300)));
  }
}
console.log("overflow", JSON.stringify(await overflow(page)));
console.log("errs", JSON.stringify(page.errs));
await browser.close();
