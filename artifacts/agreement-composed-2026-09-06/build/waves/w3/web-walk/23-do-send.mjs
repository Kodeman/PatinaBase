import { launch, shot, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\/send_commercial_document|functions\/v1\/proposal-send|rpc\/issue_agreement/.test(u)) {
    let b = ''; try { b = (await r.text()).slice(0, 800); } catch {}
    console.log('NET', u.split('/').pop(), r.status(), b);
  }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await dismissOverlays(page);
await page.locator('[data-action-key="review-design-agreement"]').click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /Send agreement/ }).click();
await page.waitForTimeout(12000);
await shot(page, '23a-after-send');
console.log('url:', page.url());
const t = await page.evaluate(() => document.body.innerText.slice(0, 2500));
console.log(t);
await browser.close();
