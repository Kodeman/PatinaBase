import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 400)));
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 400)));
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('/rest/v1/rpc/')) {
    let body = '';
    try { body = (await r.text()).slice(0, 600); } catch {}
    console.log('RPC', r.status(), u.split('/rpc/')[1], body);
  }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await dismissOverlays(page);
await page.getByText('Start from a template', { exact: false }).first().click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /Design-build turnkey/i }).click();
await page.waitForTimeout(600);
console.log('use-button disabled?', await page.getByRole('button', { name: /^Use this template$/i }).isDisabled());
await page.getByRole('button', { name: /^Use this template$/i }).click();
await page.waitForTimeout(10000);
await shot(page, '09d-after-use-template');
const t = await textOf(page);
console.log('--- excerpt ---');
console.log(t.slice(0, 1800));
await browser.close();
