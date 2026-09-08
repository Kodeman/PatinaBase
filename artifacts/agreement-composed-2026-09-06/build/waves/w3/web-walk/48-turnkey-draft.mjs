import { launch, shot, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const url = fs.readFileSync(`${HERE}/second-draft-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('response', async (r) => {
  if (/rpc\/materialize_agreement_template/.test(r.url())) {
    let b = ''; try { b = (await r.text()).slice(0, 200); } catch {}
    console.log('RPC materialize', r.status(), b);
  }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await dismissOverlays(page);
await page.getByText('Start from a template', { exact: false }).first().click();
await page.waitForTimeout(2200);
await page.getByRole('button', { name: /Design-build turnkey/i }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^Use this template$/i }).click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: /^Replace the parts$/i }).click();
await page.waitForTimeout(10000);
fs.writeFileSync(`${HERE}/turnkey-draft-url.txt`, page.url());
console.log('turnkey draft:', page.url());
await shot(page, '48a-turnkey-draft');
await browser.close();
