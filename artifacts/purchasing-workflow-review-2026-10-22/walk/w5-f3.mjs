// SQ-1801 F: Pieces head + per-line Next in the fresh project (nothing ordered). Usage: node rewalk-f3.mjs 1440|390 [who]
import { open, shot, txt, body, dump, BASE, overflow } from "./rewalk-lib.mjs";
const w = Number(process.argv[2] || 1440);
const who = process.argv[3] || "owner";
const NEW = process.env.NEWPROJ || "6545eb31-73ce-4947-8a71-c05c83cf5efc";
const { browser, page } = await open(`us50-${who}@patina.dev`, w);
await page.goto(`${BASE}/doc/${NEW}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
if (w === 1440) await page.getByRole("button", { name: /Pieces & purchasing/ }).first().click();
else { await page.getByRole("button", { name: /Open project contents/i }).first().click(); await page.waitForTimeout(800); await page.getByRole("dialog").getByRole("button", { name: /Pieces & purchasing/i }).first().click(); }
await page.waitForTimeout(3000);
const h2 = page.getByRole("heading", { name: /Pieces & purchasing/i }).first();
await h2.scrollIntoViewIfNeeded();
await shot(page, `W5-F-pieces-head-${who}-${w}`);
const t = await body(page, 20000);
const i = t.indexOf("Pieces & purchasing | ");
console.log("head region:", t.slice(t.lastIndexOf("Pieces & purchasing"), t.lastIndexOf("Pieces & purchasing") + 1200));
console.log("has 'Everything ordered is moving':", /Everything ordered is moving/.test(t), "| 'Owner not named':", /Owner not named/.test(t), "| 'Nothing ordered yet':", /Nothing ordered yet/.test(t));
console.log("Next lines:", JSON.stringify(t.match(/Next: [^|]*/g)));
await page.evaluate(() => window.scrollBy(0, 400));
await shot(page, `W5-F-pieces-lines-${who}-${w}`);
console.log("overflow", JSON.stringify(await overflow(page)));
console.log("errs", JSON.stringify(page.errs.slice(0, 4)));
await browser.close();
