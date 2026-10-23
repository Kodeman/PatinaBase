// SQ-1805 F: project head band + pieces head + line NEXT on the fresh approved-line project. Usage: NEWPROJ=<id> node w5-f-top.mjs [owner|member]
import { open, shot, txt, body, dump, overflow, BASE } from "./rewalk-lib.mjs";
const NEW = process.env.NEWPROJ;
const who = process.argv[2] || "owner";
for (const w of [1440, 390]) {
  const { browser, page } = await open(`us50-${who}@patina.dev`, w);
  await page.goto(`${BASE}/doc/${NEW}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);
  await shot(page, `W5-F-top-${who}-${w}`);
  let t = await body(page, 20000);
  const i = t.indexOf("Nothing ordered yet");
  console.log(`[${who} ${w}] top band:`, i >= 0 ? t.slice(Math.max(0, i - 150), i + 250) : "(NOT FOUND) " + t.slice(0, 700));
  const bad = (s) => /Everything ordered is moving/.test(s) || /Owner not named/.test(s);
  console.log("forbidden present (top):", bad(t));
  if (w === 1440) await page.getByRole("button", { name: /Pieces & purchasing/ }).first().click();
  else { await page.getByRole("button", { name: /Open project contents/i }).first().click(); await page.waitForTimeout(800); await page.getByRole("dialog").getByRole("button", { name: /Pieces & purchasing/i }).first().click(); }
  await page.waitForTimeout(3000);
  t = await body(page, 20000);
  console.log("pieces head:", t.slice(t.lastIndexOf("Pieces & purchasing"), t.lastIndexOf("Pieces & purchasing") + 420));
  console.log("forbidden present (pieces):", bad(t), "| Nothing ordered yet:", /Nothing ordered yet/.test(t), "| Next:", JSON.stringify(t.match(/Next: [^|]*/g)));
  await page.getByRole("heading", { name: /Pieces & purchasing/i }).first().scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, `W5-F-pieces-${who}-${w}`);
  const ln = page.getByRole("button", { name: /Rewalk credenza/ }).first();
  await ln.click({ timeout: 30000 });
  await page.getByTestId("line-po-cell").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  console.log("line next:", await txt(page.getByTestId("line-next-act")));
  console.log("line po cell:", (await txt(page.getByTestId("line-po-cell"))).slice(0, 400));
  await page.getByTestId("line-next-act").scrollIntoViewIfNeeded();
  await shot(page, `W5-F-line-${who}-${w}`);
  console.log("overflow", JSON.stringify(await overflow(page)));
  await browser.close();
}
