/** (g) R22 — no fee part carries a set value: the room refuses the send. */
import fs from 'node:fs';
import { browser, ctx, shot, HERE } from './lib2.mjs';

const { proposalId } = JSON.parse(fs.readFileSync(`${HERE}/r2-walk-p1.json`, 'utf8'));
const b = await browser();
const c = await ctx(b, { storageState: `${HERE}/r2-state-designer.json` });
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(`http://localhost:3000/drafting/${proposalId}`, {
  waitUntil: 'domcontentloaded',
});
for (let i = 0; i < 60; i++) { if (await page.locator('nav[aria-label="Agreement parts"] li').count()) break; await page.waitForTimeout(2000); }
await page.waitForTimeout(2500);

await page.getByRole('button', { name: /review & send/i }).first().click();
await page.waitForTimeout(2500);
await shot(page, 'wg-r22-send-refused-1280');
console.log('--- SEND SHEET TEXT ---');
console.log(await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  return (d ?? document.body).innerText.slice(0, 2500);
}));
console.log('--- SEND BUTTONS ---');
console.log(JSON.stringify(await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]') ?? document.body;
  return [...d.querySelectorAll('button')].map((n) => ({
    t: n.innerText.trim().slice(0, 50),
    d: n.disabled,
  }));
})));
await b.close();
