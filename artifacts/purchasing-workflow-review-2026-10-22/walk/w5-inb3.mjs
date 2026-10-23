// SQ-1805 inbound qty step 3: member opens the letters review sheet from the Desk and reads the piece lines. Usage: node w5-inb3.mjs
import { open, shot, body, dump, BASE, overflow } from "./rewalk-lib.mjs";
for (const w of [1440, 390]) {
  const { browser, page } = await open("us50-member@patina.dev", w);
  await page.goto(`${BASE}/desk`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const t0 = await body(page, 3000);
  console.log(`[${w}] desk:`, t0.slice(t0.indexOf("TODAY"), t0.indexOf("STUDIO RESOURCES")));
  const act = page.getByRole("button", { name: /Review and send/ }).or(page.getByRole("link", { name: /Review and send/ })).first();
  await act.click({ timeout: 20000 });
  await page.waitForTimeout(3500);
  await shot(page, `W5-inb-review-sheet-${w}`);
  await dump(page, "[role=dialog] button, [role=dialog] h2, [role=dialog] h3, dialog button");
  const t = await body(page, 20000);
  console.log(`[${w}] piece lines:`, JSON.stringify(t.match(/\d+ ×[^|]*/g)));
  console.log(`[${w}] sheet:`, t.slice(t.indexOf("Hello there") > 0 ? t.indexOf("Hello there") : 0, (t.indexOf("Hello there") > 0 ? t.indexOf("Hello there") : 0) + 700));
  console.log("overflow", JSON.stringify(await overflow(page)));
  await browser.close();
}
