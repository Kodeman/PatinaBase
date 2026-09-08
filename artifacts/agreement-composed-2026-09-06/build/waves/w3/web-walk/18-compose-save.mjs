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
  if (r.url().includes('/rest/v1/rpc/')) {
    const n = r.url().split('/rpc/')[1];
    if (/upsert_agreement_parts|save_agreement_part/.test(n)) {
      let b = ''; try { b = (await r.text()).slice(0, 500); } catch {}
      console.log('RPC', n, r.status(), b);
    }
  }
});

const centre = () =>
  page.evaluate(() => {
    const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return m ? m.children[1].innerText : '';
  });
const right = () =>
  page.evaluate(() => {
    const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return m ? m.children[2].innerText : '';
  });
const openPart = async (name) => {
  await page.locator('nav[aria-label="Agreement parts"] button', { hasText: name }).first().click();
  await page.waitForTimeout(900);
};

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);

// ---------- STEP 5
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
await page.waitForTimeout(700);

// ---------- STEP 8a: closed-book disclosure
await openPart('Who does the work');
await page.getByRole('button', { name: 'Closed-book', exact: true }).click();
await page.waitForTimeout(700);

// ---------- closed-book SOV
await openPart('Pricing basis');
await page.getByRole('button', { name: 'Start with one line' }).click();
await page.waitForTimeout(900);

// ---------- STEP 6: draws
await openPart('Draw schedule');
for (let i = 0; i < DRAWS.length; i += 1) {
  await page.getByRole('button', { name: '+ Add a draw' }).click();
  await page.waitForTimeout(320);
  const n = i + 1;
  await page.getByLabel(`Draw ${n}`, { exact: true }).fill(DRAWS[i][0]);
  await page.getByLabel(`Draw ${n} percent`, { exact: true }).fill(DRAWS[i][1]);
  const cb = page.getByLabel(`Retainage applies to draw ${n}`, { exact: true });
  const on = await cb.isChecked();
  if (on !== DRAWS[i][2]) await cb.setChecked(DRAWS[i][2]);
}
await page.getByLabel('Retainage percent').fill('5');
await page.waitForTimeout(1200);
console.log('\n=== STEP 6 · DRAW TABLE ===');
console.log(await centre());
await shot(page, '18a-draws');

// ---------- STEP 7: allowances
await openPart('Allowances');
for (let i = 0; i < ALLOWANCES.length; i += 1) {
  await page.getByRole('button', { name: '+ Add an allowance' }).click();
  await page.waitForTimeout(320);
  const n = i + 1;
  await page.getByLabel(`Allowance ${n}`, { exact: true }).fill(ALLOWANCES[i][0]);
  await page.getByLabel(`Allowance ${n} amount`, { exact: true }).fill(ALLOWANCES[i][1]);
  await page.selectOption(`select[aria-label="Allowance ${n} overage rule"]`, 'change_order');
}
await page.waitForTimeout(900);
console.log('\n=== STEP 7 · ALLOWANCES ===');
console.log(await centre());
await shot(page, '18b-allowances');

// ---------- STEP 8b: supervision double count
await openPart('Supervision');
await page.getByLabel('Supervision fee dollars').fill('2500');
await page.waitForTimeout(400);
await openPart('Pricing basis');
await page.getByLabel('Markup on the trades percent').fill('15');
await page.waitForTimeout(1400);
console.log('\n=== STEP 8 · DOUBLE-COUNT · pricing basis centre ===');
console.log(await centre());
console.log('\n=== STEP 8 · readiness rail ===');
console.log(await right());
await shot(page, '18c-double-count-pricing');
await openPart('Supervision');
await page.waitForTimeout(800);
console.log('\n=== STEP 8 · DOUBLE-COUNT · supervision centre ===');
console.log(await centre());
await shot(page, '18d-double-count-supervision');
const sendBtn = page.locator('[data-action-key="review-design-agreement"]');
console.log('review&send disabled?', await sendBtn.isDisabled().catch(() => 'n/a'),
  await sendBtn.getAttribute('aria-disabled').catch(() => null));

// clear the markup -> green
await openPart('Pricing basis');
await page.getByLabel('Markup on the trades percent').fill('');
await page.waitForTimeout(1400);
console.log('\n=== STEP 8 · after clearing markup · readiness ===');
console.log(await right());
await shot(page, '18e-markup-cleared');

// ---------- SAVE
await page.getByRole('button', { name: 'Save agreement' }).click();
await page.waitForTimeout(9000);
await shot(page, '18f-saved');
console.log('\n=== after save · readiness ===');
console.log(await right());
await browser.close();
