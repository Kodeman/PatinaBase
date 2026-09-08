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
const openPart = async (name) => {
  await page.locator('nav[aria-label="Agreement parts"] button', { hasText: name }).first().click();
  await page.waitForTimeout(900);
};
const costLineCount = () =>
  page.evaluate(() => document.querySelectorAll('input[aria-label^="Cost line "][aria-label$="amount"]').length);
const costLines = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('input[aria-label^="Cost line "]'))
      .filter((e) => !/amount$/.test(e.getAttribute('aria-label')))
      .map((e) => e.value),
  );

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);
await openPart('Pricing basis');
await page.getByRole('button', { name: 'Cost-plus with GMP', exact: true }).click();
await page.getByLabel('Fee percent').fill('18');
for (let i = 0; i < LINES.length; i += 1) {
  await page.getByRole('button', { name: '+ Add a cost line' }).click();
  await page.waitForTimeout(300);
  const n = i + 1;
  await page.getByLabel(`Cost line ${n}`, { exact: true }).fill(LINES[i][0]);
  await page.selectOption(`select[aria-label="Cost line ${n} category"]`, LINES[i][1]);
  await page.getByLabel(`Cost line ${n} amount`, { exact: true }).fill(LINES[i][2]);
}
await page.getByLabel('GMP dollars').fill('84134');
await page.waitForTimeout(800);
console.log('cost lines after step 5:', await costLineCount(), JSON.stringify(await costLines()));

await openPart('Allowances');
await page.getByRole('button', { name: '+ Add an allowance' }).click();
await page.waitForTimeout(500);
await page.getByLabel('Allowance 1', { exact: true }).fill('Tile allowance');
await page.waitForTimeout(400);
await openPart('Pricing basis');
console.log('cost lines after naming allowance 1 (no amount):', await costLineCount(), JSON.stringify(await costLines()));

await openPart('Allowances');
await page.getByLabel('Allowance 1 amount', { exact: true }).fill('4000');
await page.waitForTimeout(600);
await openPart('Pricing basis');
console.log('cost lines after allowance 1 amount:', await costLineCount(), JSON.stringify(await costLines()));
await shot(page, '19a-allowance-duplication');
const c = await page.evaluate(() => {
  const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  return m.children[1].innerText;
});
console.log(c.split('COST LINES')[1]?.slice(0, 900));
await browser.close();
