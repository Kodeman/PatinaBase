import { launch, shot, dismissOverlays, HERE } from './lib.mjs';
import fs from 'node:fs';

// Cost lines the pricing basis owns. The three allowance-category lines are
// authored in the Allowances part instead — see walk-web-r1.md finding W3R1-02.
const LINES = [
  ['Cabinetry & millwork', 'sub', '38000'],
  ['Electrical', 'sub', '9500'],
  ['Plumbing', 'sub', '7200'],
  ['General conditions / site', 'general_conditions', '6300'],
];
const ALLOWANCES = [
  ['Tile allowance', '4000'],
  ['Plumbing fixtures allowance', '3500'],
  ['Lighting allowance', '2800'],
];
const DRAWS = [
  ['Deposit at signing', '10', false],
  ['Rough-in', '30', true],
  ['Cabinets set', '40', true],
  ['Substantial completion', '20', true],
];

const url = fs.readFileSync(`${HERE}/room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (u.includes('/rest/v1/rpc/upsert_agreement_parts')) {
    let b = ''; try { b = (await r.text()).slice(0, 600); } catch {}
    console.log('RPC upsert_agreement_parts ->', r.status(), b);
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
const openPart = async (n) => {
  await page.locator('nav[aria-label="Agreement parts"] button', { hasText: n }).first().click();
  await page.waitForTimeout(800);
};

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);

// ALLOWANCES first (they generate their own cost lines)
await openPart('Allowances');
for (let i = 0; i < ALLOWANCES.length; i += 1) {
  await page.getByRole('button', { name: '+ Add an allowance' }).click();
  await page.waitForTimeout(300);
  const n = i + 1;
  await page.getByLabel(`Allowance ${n}`, { exact: true }).fill(ALLOWANCES[i][0]);
  await page.getByLabel(`Allowance ${n} amount`, { exact: true }).fill(ALLOWANCES[i][1]);
  await page.selectOption(`select[aria-label="Allowance ${n} overage rule"]`, 'change_order');
}
await page.waitForTimeout(600);

// PRICING BASIS
await openPart('Pricing basis');
await page.getByRole('button', { name: 'Cost-plus with GMP', exact: true }).click();
await page.waitForTimeout(400);
await page.getByLabel('Fee percent').fill('18');
const existing = await page.evaluate(
  () => document.querySelectorAll('input[aria-label^="Cost line "][aria-label$=" amount"]').length,
);
console.log('cost lines already present (from allowances):', existing);
for (let i = 0; i < LINES.length; i += 1) {
  await page.getByRole('button', { name: '+ Add a cost line' }).click();
  await page.waitForTimeout(300);
  const n = existing + i + 1;
  await page.getByLabel(`Cost line ${n}`, { exact: true }).fill(LINES[i][0]);
  await page.selectOption(`select[aria-label="Cost line ${n} category"]`, LINES[i][1]);
  await page.getByLabel(`Cost line ${n} amount`, { exact: true }).fill(LINES[i][2]);
}
await page.getByLabel('GMP dollars').fill('84134');
await page.waitForTimeout(900);
console.log('\n=== chips ===');
console.log((await centre()).split('+ Add a cost line')[1]?.slice(0, 400));
await shot(page, '20a-pricing-chips');

// STEP 8: double count — supervision fee AND markup
await openPart('Supervision');
await page.getByLabel('Supervision fee dollars').fill('2500');
await page.waitForTimeout(400);
await openPart('Pricing basis');
await page.getByLabel('Markup on the trades percent').fill('15');
await page.waitForTimeout(1400);
console.log('\n=== STEP8 double-count · pricing basis ===');
console.log(await centre());
await shot(page, '20b-double-count-pricing');
await openPart('Supervision');
await page.waitForTimeout(700);
console.log('\n=== STEP8 double-count · supervision ===');
console.log(await centre());
console.log('\n=== STEP8 double-count · readiness ===');
console.log((await right()).split('JURISDICTION')[0]);
await shot(page, '20c-double-count-supervision');
const send = page.locator('[data-action-key="review-design-agreement"]');
console.log('review&send disabled:', await send.isDisabled(), 'aria:', await send.getAttribute('aria-disabled'));

// clear markup
await openPart('Pricing basis');
await page.getByLabel('Markup on the trades percent').fill('');
await page.waitForTimeout(1200);
console.log('\n=== after clearing markup ===');
console.log((await right()).split('JURISDICTION')[0]);

// closed-book
await openPart('Who does the work');
await page.getByRole('button', { name: 'Closed-book', exact: true }).click();
await page.waitForTimeout(700);
await openPart('Pricing basis');
await page.getByRole('button', { name: 'Start with one line' }).click();
await page.waitForTimeout(800);

// DRAWS
await openPart('Draw schedule');
for (let i = 0; i < DRAWS.length; i += 1) {
  await page.getByRole('button', { name: '+ Add a draw' }).click();
  await page.waitForTimeout(300);
  const n = i + 1;
  await page.getByLabel(`Draw ${n}`, { exact: true }).fill(DRAWS[i][0]);
  await page.getByLabel(`Draw ${n} percent`, { exact: true }).fill(DRAWS[i][1]);
  const cb = page.getByLabel(`Retainage applies to draw ${n}`, { exact: true });
  if ((await cb.isChecked()) !== DRAWS[i][2]) await cb.setChecked(DRAWS[i][2]);
}
await page.getByLabel('Retainage percent').fill('5');
await page.waitForTimeout(1200);
console.log('\n=== STEP6 draws ===');
console.log(await centre());
await shot(page, '20d-draws');

// TERMS body (required, empty)
await openPart('Terms');
const ta = page.locator('textarea').first();
await ta.fill(
  'Invoices are due on receipt. Work proceeds against the draw schedule above. Wisconsin law governs this agreement.',
);
await page.waitForTimeout(600);

console.log('\n=== readiness before save ===');
console.log((await right()).split('JURISDICTION')[0]);
await page.getByRole('button', { name: 'Save agreement' }).click();
await page.waitForTimeout(10000);
await shot(page, '20e-saved');
console.log('\n=== readiness after save ===');
console.log((await right()).split('JURISDICTION')[0]);
console.log('\n=== client copy preview ===');
console.log((await right()).split("THE CLIENT'S COPY")[1]?.slice(0, 4000));
await browser.close();
