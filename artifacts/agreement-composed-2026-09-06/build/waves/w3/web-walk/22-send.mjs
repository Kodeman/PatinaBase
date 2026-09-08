import { launch, shot, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\/send_commercial_document|functions\/v1\/proposal-send/.test(u)) {
    let b = ''; try { b = (await r.text()).slice(0, 700); } catch {}
    console.log('NET', u.split('/').pop(), r.status(), b);
  }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await dismissOverlays(page);
await page.locator('[data-action-key="review-design-agreement"]').click();
await page.waitForTimeout(2500);
await shot(page, '22a-send-sheet');
const dlg = await page.evaluate(() => {
  const ds = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = ds[ds.length - 1];
  return d ? { text: d.innerText, buttons: Array.from(d.querySelectorAll('button')).map((b) => ({ t: b.innerText.trim().slice(0, 40), disabled: b.disabled })) } : null;
});
console.log('=== send sheet ===');
console.log(dlg?.text?.slice(0, 3000));
console.log('BUTTONS', JSON.stringify(dlg?.buttons));
await browser.close();
