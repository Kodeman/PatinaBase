// SQ-1805 inbound qty: open the stool line's inbound notices and read the piece lines in the UI. Usage: node w5-inb4.mjs
import { open, shot, body, dump, openLine, overflow } from "./rewalk-lib.mjs";
for (const w of [1440, 390]) {
  const { browser, page } = await open("us50-member@patina.dev", w);
  await openLine(page, "Bar stool W5", w);
  const notice = page.getByText(/INBOUND NOTICE TO THE RECEIVER/i).first();
  await notice.scrollIntoViewIfNeeded();
  await shot(page, `W5-inb-notice-${w}`);
  await dump(page, "[data-testid=line-movement-cell] button, [data-testid=line-movement-cell] a, [data-testid=line-movement-cell] summary");
  const t = await body(page, 30000);
  console.log(`[${w}] piece lines visible in page:`, JSON.stringify(t.match(/\d+ ×[^|]*Bar stool[^|]*/g)));
  const open1 = page.getByRole("button", { name: /Review|Open|Read|Preview|Edit/i }).filter({ has: page.locator("xpath=self::*") });
  const sub = page.getByText(/^Subject$/).first();
  await sub.click().catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, `W5-inb-notice-open-${w}`);
  const t2 = await body(page, 30000);
  console.log(`[${w}] after click pieces:`, JSON.stringify(t2.match(/\d+ ×[^|]*Bar stool[^|]*/g)));
  console.log("overflow", JSON.stringify(await overflow(page)));
  await browser.close();
}
