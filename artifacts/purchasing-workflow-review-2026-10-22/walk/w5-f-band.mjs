// SQ-1805 F: expand the project guide band (+N MORE) and read every line. Usage: NEWPROJ=<id> node w5-f-band.mjs [owner|member]
import { open, shot, body, BASE } from "./rewalk-lib.mjs";
const NEW = process.env.NEWPROJ;
const who = process.argv[2] || "owner";
for (const w of [1440, 390]) {
  const { browser, page } = await open(`us50-${who}@patina.dev`, w);
  await page.goto(`${BASE}/doc/${NEW}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  const more = page.getByRole("button", { name: /\+\d+ MORE/i }).first();
  console.log(`[${who} ${w}] more button count`, await more.count());
  await more.click({ timeout: 15000 }).catch((e) => console.log("more click failed", String(e).slice(0, 80)));
  await page.waitForTimeout(1500);
  await shot(page, `W5-F-band-expanded-${who}-${w}`);
  const t = await body(page, 20000);
  const i = t.indexOf("MORE");
  console.log("band:", t.slice(Math.max(0, i - 200), i + 700));
  console.log("Nothing ordered yet:", /Nothing ordered yet/.test(t), "| Release the next room:", /Release the next room/.test(t), "| forbidden:", /Everything ordered is moving|Owner not named/.test(t));
  await browser.close();
}
