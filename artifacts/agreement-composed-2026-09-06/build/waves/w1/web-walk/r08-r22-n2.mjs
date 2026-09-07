/** r2 · (g) R22 send refused in the room's words, plus the N2 preview of an unwritten money part. */
import { browser, ctx, shot, HERE } from './lib2.mjs';

const proposalId = process.argv[2];
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(`http://localhost:3000/drafting/${proposalId}`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 60; i++) {
  if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break;
  await page.waitForTimeout(2000);
}
await page.waitForTimeout(3000);

// N2 — the live preview of a freshly materialized composition.
await page.getByRole('button', { name: /Preview client copy/i }).click();
await page.waitForTimeout(2500);
await shot(page, 'r17-n2-fresh-preview-1280');
console.log('--- FRESH PREVIEW ---');
console.log((await page.evaluate(() => {
  const d = [...document.querySelectorAll('[role="dialog"]')].pop();
  return (d ?? document.body).innerText;
})).slice(0, 2000));
await page.keyboard.press('Escape');
await page.waitForTimeout(1500);

// (g) R22
await page.getByRole('button', { name: /review & send/i }).first().click();
await page.waitForTimeout(2500);
await shot(page, 'r18-r22-send-refused-1280');
console.log('--- SEND SHEET ---');
console.log((await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  return (d ?? document.body).innerText;
})).slice(0, 2000));
console.log('--- SEND BUTTONS ---');
console.log(JSON.stringify(await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]') ?? document.body;
  return [...d.querySelectorAll('button')].map((n) => ({ t: n.innerText.trim().slice(0, 40), d: n.disabled }));
})));
await b.close();
