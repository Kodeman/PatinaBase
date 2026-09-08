import { launch, shot, dismissOverlays, textOf, DESIGNER, HERE } from './lib3.mjs';
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

const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\/(upsert_agreement_parts|send_commercial_document|materialize_agreement_template)/.test(u)) {
    let b = '';
    try { b = (await r.text()).slice(0, 300); } catch { /* body gone */ }
    console.log('NET', u.split('/rpc/')[1], r.status(), b);
  }
});

const right = () =>
  page.evaluate(() => {
    const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return m ? m.children[2].innerText : '';
  });
const openPart = async (n) => {
  await page.locator('nav[aria-label="Agreement parts"] button', { hasText: n }).first().click();
  await page.waitForTimeout(900);
};

await page.goto(`${DESIGNER}/desk`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await dismissOverlays(page);
await page.getByText('FIND ANYTHING', { exact: false }).first().click();
await page.waitForTimeout(1500);
await page.locator('input').last().fill('agreement');
await page.waitForTimeout(1500);
await page
  .locator('[role="dialog"][aria-label="Command bar"]')
  .getByText('Draft a design agreement')
  .first()
  .click();
await page.waitForTimeout(4000);
await page.locator('[data-testid="client-picker-trigger"]').click();
await page.waitForTimeout(2500);
await page.locator('input[placeholder="Search or add a client…"]').first().fill('Client User');
await page.waitForTimeout(3500);
await page.getByRole('option', { name: /Client User/ }).first().click();
await page.waitForTimeout(13000);
const url = page.url();
console.log('second draft url:', url);
fs.writeFileSync(`${HERE}/r3-second-draft-url.txt`, url);

await page.getByText('Start from a template', { exact: false }).first().click();
await page.waitForTimeout(3000);
await page.getByRole('button', { name: /Design-build turnkey/i }).first().click();
await page.waitForTimeout(600);
await page.getByRole('button', { name: /^Use this template$/i }).click();
await page.waitForTimeout(1500);
const replace = page.getByRole('button', { name: /^Replace the parts$/i });
if (await replace.count()) await replace.click();
await page.waitForTimeout(14000);

// pricing basis — three allowance-category cost lines, and NO allowance part filled
await openPart('Pricing basis');
await page.getByRole('button', { name: 'Cost-plus with GMP', exact: true }).click();
await page.waitForTimeout(500);
await page.getByLabel('Fee percent').fill('18');
for (let i = 0; i < LINES.length; i += 1) {
  await page.getByRole('button', { name: '+ Add a cost line' }).click();
  await page.waitForTimeout(250);
  const n = i + 1;
  await page.getByLabel(`Cost line ${n}`, { exact: true }).fill(LINES[i][0]);
  await page.selectOption(`select[aria-label="Cost line ${n} category"]`, LINES[i][1]);
  await page.getByLabel(`Cost line ${n} amount`, { exact: true }).fill(LINES[i][2]);
}
await page.getByLabel('GMP dollars').fill('84134');
await page.waitForTimeout(1200);
await openPart('Who does the work');
await page.getByRole('button', { name: 'Closed-book', exact: true }).click();
await page.waitForTimeout(900);
await openPart('Pricing basis');
await page.waitForTimeout(1200);
const startOne = page.getByRole('button', { name: 'Start with one line' });
if (await startOne.count()) {
  await startOne.click();
  await page.waitForTimeout(1200);
}
await openPart('Draw schedule');
for (let i = 0; i < DRAWS.length; i += 1) {
  await page.getByRole('button', { name: '+ Add a draw' }).click();
  await page.waitForTimeout(250);
  const n = i + 1;
  await page.getByLabel(`Draw ${n}`, { exact: true }).fill(DRAWS[i][0]);
  await page.getByLabel(`Draw ${n} percent`, { exact: true }).fill(DRAWS[i][1]);
  const cb = page.getByLabel(`Retainage applies to draw ${n}`, { exact: true });
  if ((await cb.isChecked()) !== DRAWS[i][2]) await cb.setChecked(DRAWS[i][2]);
}
await page.getByLabel('Retainage percent').fill('5');
await page.waitForTimeout(1200);
await openPart('Terms');
await page.locator('textarea').first().fill(
  'Invoices are due on receipt. Work proceeds against the draw schedule above. Wisconsin law governs this agreement.',
);
await page.waitForTimeout(700);
console.log('\n=== readiness (allowance lines, no allowances) ===');
console.log((await right()).split('JURISDICTION')[0]);
await page.getByRole('button', { name: 'Save agreement' }).click();
await page.waitForTimeout(14000);
await shot(page, 'r3-40a-second-draft-saved');
console.log('\n=== readiness after save ===');
console.log((await right()).split('JURISDICTION')[0]);

// W3R2-17 · the send sheet must not print a warning and "every facet is present"
await page.locator('[data-action-key="review-design-agreement"]').click();
await page.waitForTimeout(3500);
await shot(page, 'r3-40b-send-sheet-warning');
const dlg = await page.evaluate(() => {
  const ds = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = ds[ds.length - 1];
  return d ? d.innerText : null;
});
console.log('\n=== SEND SHEET (warning case) ===');
console.log(dlg);
console.log('\nW3R2-17 · sheet carries a warning:', /allowance lines with no allowance|needs attention|carries/i.test(dlg || ''));
console.log('W3R2-17 · sheet also says every facet is present:', /every contractual facet is present/i.test(dlg || ''));

await page.getByRole('button', { name: /Send agreement/ }).click();
await page.waitForTimeout(16000);
await shot(page, 'r3-40c-second-sent');
console.log('\nurl after send:', page.url());
await browser.close();
