import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 400)));
page.on('response', async (r) => {
  if (r.url().includes('/rest/v1/rpc/')) {
    let b = ''; try { b = (await r.text()).slice(0, 400); } catch {}
    console.log('RPC', r.status(), r.url().split('/rpc/')[1], b);
  }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await dismissOverlays(page);
await page.getByText('Start from a template', { exact: false }).first().click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /Design-build turnkey/i }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^Use this template$/i }).click();
await page.waitForTimeout(800);
await shot(page, '09e-confirm-warning');
const warn = await page.evaluate(() => document.querySelector('[role="alert"]')?.innerText ?? null);
console.log('warning:', JSON.stringify(warn));
await page.getByRole('button', { name: /^Replace the parts$/i }).click();
await page.waitForTimeout(12000);
await shot(page, '09f-turnkey-rail');
console.log('--- room text ---');
console.log((await textOf(page)).slice(0, 4000));
await browser.close();
