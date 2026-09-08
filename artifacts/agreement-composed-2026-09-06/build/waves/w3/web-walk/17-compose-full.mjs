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
const DRAWS = [
  ['Deposit at signing', '10', false],
  ['Rough-in', '30', true],
  ['Cabinets set', '40', true],
  ['Substantial completion', '20', true],
];
const ALLOWANCES = [
  ['Tile allowance', '4000'],
  ['Plumbing fixtures allowance', '3500'],
  ['Lighting allowance', '2800'],
];

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  if (r.url().includes('/rest/v1/rpc/upsert_agreement_parts')) {
    let b = ''; try { b = (await r.text()).slice(0, 500); } catch {}
    console.log('RPC upsert_agreement_parts', r.status(), b);
  }
});

const centre = () =>
  page.evaluate(() => {
    const main = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return main ? main.children[1].innerText : '';
  });
const right = () =>
  page.evaluate(() => {
    const main = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return main ? main.children[2].innerText : '';
  });
const openPart = async (name) => {
  await page.locator('nav[aria-label="Agreement parts"] button', { hasText: name }).first().click();
  await page.waitForTimeout(900);
};
const ctrls = () =>
  page.evaluate(() => {
    const main = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return Array.from(main.children[1].querySelectorAll('input, select, button')).map((e) => ({
      tag: e.tagName, aria: e.getAttribute('aria-label'), ph: e.getAttribute('placeholder'),
      type: e.type, val: String(e.value).slice(0, 24), txt: (e.innerText || '').slice(0, 30),
    }));
  });

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);

// STEP 5 — pricing basis
await openPart('Pricing basis');
await page.getByRole('button', { name: 'Cost-plus with GMP', exact: true }).click();
await page.waitForTimeout(400);
await page.getByLabel('Fee percent').fill('18');
for (let i = 0; i < LINES.length; i += 1) {
  await page.getByRole('button', { name: '+ Add a cost line' }).click();
  await page.waitForTimeout(320);
  const n = i + 1;
  await page.getByLabel(`Cost line ${n}`, { exact: true }).fill(LINES[i][0]);
  await page.selectOption(`select[aria-label="Cost line ${n} category"]`, LINES[i][1]);
  await page.getByLabel(`Cost line ${n} amount`, { exact: true }).fill(LINES[i][2]);
}
await page.getByLabel('GMP dollars').fill('84134');
await page.waitForTimeout(800);

// STEP 8a — closed-book
await openPart('Who does the work');
await page.getByRole('button', { name: 'Closed-book', exact: true }).click();
await page.waitForTimeout(800);

// closed-book schedule of values, authored
await openPart('Pricing basis');
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Start with one line' }).click();
await page.waitForTimeout(900);
console.log('\n=== SOV controls after "Start with one line" ===');
console.log(JSON.stringify(await ctrls()));
console.log(await centre());
await shot(page, '17a-sov-seeded');
await browser.close();
