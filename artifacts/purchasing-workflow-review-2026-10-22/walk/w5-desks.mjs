// SQ-1805: Desk MINE + THE STUDIO'S tab for owner and member at 1440 and 390; prefix tags the screenshots. Usage: node w5-desks.mjs <tag>
import { open, shot, body, BASE, overflow } from "./rewalk-lib.mjs";
const tag = process.argv[2] || "desk";
for (const w of [1440, 390]) for (const who of ["member", "owner"]) {
  const { browser, page } = await open(`us50-${who}@patina.dev`, w);
  await page.goto(`${BASE}/desk`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const cut = (t) => t.slice(t.indexOf("TODAY"), t.indexOf("STUDIO RESOURCES"));
  await shot(page, `W5-${tag}-${who}-mine-${w}`);
  console.log(`[${who} ${w} MINE]`, cut(await body(page, 4000)));
  await page.getByText(/THE STUDIO.?S/i).first().click().catch((e) => console.log("studio tab click failed"));
  await page.waitForTimeout(2000);
  await shot(page, `W5-${tag}-${who}-studio-${w}`);
  console.log(`[${who} ${w} STUDIO]`, cut(await body(page, 4000)));
  console.log("overflow", JSON.stringify(await overflow(page)));
  await browser.close();
}
