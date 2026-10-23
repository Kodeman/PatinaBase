// SQ-1801 F step 2: add lines to the fresh project (owner) via Add items. Usage: node rewalk-f2.mjs explore|add|view 1440|390
import { open, shot, txt, body, dump, BASE, overflow } from "./rewalk-lib.mjs";
const mode = process.argv[2];
const w = Number(process.argv[3] || 1440);
const NEW = process.env.NEWPROJ || "6545eb31-73ce-4947-8a71-c05c83cf5efc";
const { browser, page } = await open("us50-owner@patina.dev", w);
await page.goto(`${BASE}/doc/${NEW}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
if (mode === "need") {
  if (w === 1440) await page.getByRole("button", { name: /Pieces & purchasing/ }).first().click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Add items", exact: true }).first().click();
  await page.getByRole("button", { name: /Name a need/ }).click();
  await page.waitForTimeout(1500);
  await shot(page, "F-new-need-form-1440");
  await dump(page, "[role=dialog] button, [role=dialog] input, [role=dialog] label, input, textarea");
}
if (mode === "custom") {
  if (w === 1440) await page.getByRole("button", { name: /Pieces & purchasing/ }).first().click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Add items", exact: true }).first().click();
  await page.getByRole("button", { name: /A custom piece/ }).click();
  await page.waitForTimeout(1500);
  await shot(page, "F-new-custom-form-1440");
  await dump(page, "[role=dialog] button, [role=dialog] input, [role=dialog] label, input, textarea, select");
}
if (mode === "line") {
  const names = ["Rewalk credenza", "Rewalk bench"];
  if (w === 1440) await page.getByRole("button", { name: /Pieces & purchasing/ }).first().click();
  await page.waitForTimeout(2500);
  for (const [i, nm] of names.entries()) {
    await page.getByRole("button", { name: "Add items", exact: true }).first().click();
    await page.getByRole("button", { name: /Name a need/ }).click();
    await page.waitForTimeout(1200);
    await page.getByLabel("Name", { exact: true }).fill(nm);
    await page.getByPlaceholder("Maker").fill("US-51 Walk Hale");
    await page.waitForTimeout(1200);
    const opt = page.getByText(/US-51 Walk Hale Furniture/).first();
    console.log("maker option:", await opt.count());
    await opt.click().catch((e) => console.log("maker pick fail", String(e).slice(0, 80)));
    await page.waitForTimeout(500);
    await page.getByText("custom piece", { exact: true }).first().click().catch((e) => console.log("radio fail", String(e).slice(0, 80)));
    await page.getByLabel("QUANTITY").fill("1").catch(() => {});
    await page.getByLabel("TRADE COST PER ITEM").fill("900").catch(() => {});
    const st = page.getByLabel(/SELECTION STATUS/i);
    await st.selectOption({ label: "Selected" }).catch((e) => console.log("status sel failed", String(e).slice(0, 80)));
    if (i === 0) await shot(page, "F-new-line-form-filled-1440");
    await page.getByRole("button", { name: /Put it on the schedule/ }).click();
    await page.waitForTimeout(3500);
    console.log("added", nm);
    await page.keyboard.press("Escape"); await page.waitForTimeout(1000);
  }
  await shot(page, "F-new-after-lines-1440");
}
if (mode === "explore" || mode === "add") {
  if (w === 1440) await page.getByRole("button", { name: /Pieces & purchasing/ }).first().click();
  await page.waitForTimeout(2500);
  await shot(page, "F-new-pieces-1440");
  await dump(page, "button, a");
  const add = page.getByRole("button", { name: "Add items", exact: true }).first();
  console.log("add items count", await add.count());
  if (await add.count()) { await add.click(); await page.waitForTimeout(1500); await shot(page, "F-new-additems-1440"); await dump(page, "[role=dialog] button, [role=dialog] input, [role=dialog] label"); }
}
await browser.close();
