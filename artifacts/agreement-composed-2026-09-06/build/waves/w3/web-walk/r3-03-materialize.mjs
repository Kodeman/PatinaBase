import { launch, shot, textOf, dismissOverlays, HERE } from './lib3.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/r3-room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 400)));
page.on('response', async (r) => {
  if (r.url().includes('/rest/v1/rpc/')) {
    let b = '';
    try { b = (await r.text()).slice(0, 300); } catch { /* body gone */ }
    console.log('RPC', r.status(), r.url().split('/rpc/')[1], b);
  }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);
await page.getByText('Start from a template', { exact: false }).first().click();
await page.waitForTimeout(3000);
const db = page.getByRole('button', { name: /Design-build turnkey/i }).first();
console.log('design-build disabled now?', await db.isDisabled());
await db.click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /^Use this template$/i }).click();
await page.waitForTimeout(1200);
const warn = await page.evaluate(() => document.querySelector('[role="alert"]')?.innerText ?? null);
console.log('confirm warning:', JSON.stringify(warn));
const replace = page.getByRole('button', { name: /^Replace the parts$/i });
if (await replace.count()) {
  await replace.click();
}
await page.waitForTimeout(14000);
await shot(page, 'r3-03a-turnkey-rail');
const rail = await page.evaluate(() =>
  Array.from(document.querySelectorAll('nav[aria-label="Agreement parts"] button')).map((b) =>
    (b.innerText || '').replace(/\n/g, ' | ').trim(),
  ),
);
console.log('RAIL (', rail.length, '):');
console.log(JSON.stringify(rail, null, 1));
console.log('--- room text ---');
console.log((await textOf(page)).slice(0, 3500));
await browser.close();
