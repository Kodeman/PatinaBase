// SQ-1801 B: owner approves the held release from their Desk (UI); then desks as member + owner at 1440 and 390.
// Usage: node rewalk-b2.mjs approve | desks
import { open, shot, txt, body, dump, BASE, overflow } from "./rewalk-lib.mjs";
const mode = process.argv[2];
async function desk(who, w, tag) {
  const { browser, page } = await open(`us50-${who}@patina.dev`, w);
  await page.goto(`${BASE}/desk`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  await shot(page, `B-${tag}-desk-${who}-${w}`);
  const t = await body(page, 2200);
  console.log(`[${who} ${w} ${tag}]`, t.slice(t.indexOf("TODAY"), t.indexOf("STUDIO RESOURCES")));
  console.log("overflow", JSON.stringify(await overflow(page)));
  return { browser, page };
}
if (mode === "approve") {
  const { browser, page } = await desk("owner", 1440, "before-approve");
  await page.getByText("Approve release", { exact: true }).first().click({ timeout: 15000 });
  await page.waitForTimeout(2000);
  await shot(page, "B-owner-approve-dialog-1440");
  await dump(page, "[role=dialog] button, [role=dialog] h2, [role=dialog] label");
  console.log((await body(page, 1800)));
  const btn = page.getByRole("dialog").getByRole("button", { name: /Approve|Release/ }).last();
  console.log("confirm btn:", await btn.innerText());
  await btn.click();
  await page.waitForTimeout(4000);
  await shot(page, "B-owner-after-approve-click-1440");
  const t = await body(page, 1500);
  console.log("after:", t.slice(t.indexOf("TODAY"), t.indexOf("STUDIO RESOURCES")));
  await browser.close();
} else {
  for (const w of [1440, 390]) for (const who of ["member", "owner"]) { const { browser } = await desk(who, w, "after"); await browser.close(); }
}
