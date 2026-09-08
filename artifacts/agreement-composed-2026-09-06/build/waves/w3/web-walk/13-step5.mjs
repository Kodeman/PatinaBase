import { launch, shot, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

const LINES = [
  ['Cabinetry & millwork', 'sub', '38000'],
  ['Electrical', 'sub', '9500'],
  ['Plumbing', 'sub', '7200'],
  ['General conditions / site', 'general_conditions', '6300'],
  ['Tile allowance', 'allowance', '4000'],
  ['Plumbing fixtures allowance', 'allowance', '3500'],
  ['Lighting allowance', 'allowance', '2800'],
];

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  if (r.url().includes('/rest/v1/rpc/upsert_agreement_parts')) {
    let b = ''; try { b = (await r.text()).slice(0, 300); } catch {}
    console.log('RPC upsert', r.status(), b);
  }
});
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);
await page.getByRole('button', { name: 'Cost-plus with GMP', exact: true }).click();
await page.waitForTimeout(600);
await page.getByLabel('Fee percent').fill('18');
await page.waitForTimeout(400);

for (let i = 0; i < LINES.length; i += 1) {
  await page.getByRole('button', { name: '+ Add a cost line' }).click();
  await page.waitForTimeout(450);
  const n = i + 1;
  await page.getByLabel(`Cost line ${n}`, { exact: true }).fill(LINES[i][0]);
  await page.selectOption(`select[aria-label="Cost line ${n} category"]`, LINES[i][1]);
  await page.getByLabel(`Cost line ${n} amount`, { exact: true }).fill(LINES[i][2]);
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1500);
const centre = await page.evaluate(() => {
  const main = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  return main ? main.children[1].innerText : '';
});
console.log('--- centre after cost lines ---');
console.log(centre);
await shot(page, '13a-cost-lines');

// Save
const save = page.getByRole('button', { name: /^Save$|^Saved$/ }).first();
console.log('save label:', await save.innerText());
if ((await save.innerText()).trim().toLowerCase() === 'save') {
  await save.click();
  await page.waitForTimeout(6000);
}
await shot(page, '13b-saved');
await browser.close();
