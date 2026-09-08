import { launch, shot, dismissOverlays, HERE } from './lib3.mjs';
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

const url = fs.readFileSync(`${HERE}/r3-room-url.txt`, 'utf8').trim();
const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  if (r.url().includes('/rest/v1/rpc/upsert_agreement_parts')) {
    let b = '';
    try { b = (await r.text()).slice(0, 600); } catch { /* body gone */ }
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
  await page.waitForTimeout(900);
};
const send = () => page.locator('[data-action-key="review-design-agreement"]');
const sendState = async () => ({
  disabled: await send().isDisabled(),
  aria: await send().getAttribute('aria-disabled'),
});

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
await dismissOverlays(page);

// ── STEP 5 ────────────────────────────────────────────────────────────────
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
await page.waitForTimeout(1500);
console.log('\n=== STEP 5 · pricing basis (centre) ===');
console.log(await centre());
await shot(page, 'r3-05a-step5-pricing-basis');

// R48 · the hide act must NOT exist on the pricing basis
console.log(
  '\nR48 · hide toggle on PRICING BASIS (expect 0):',
  await page.getByRole('button', { name: /Hidden from your client/i }).count(),
);

// ── STEP 6 ────────────────────────────────────────────────────────────────
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
await page.waitForTimeout(1500);
console.log('\n=== STEP 6 · draws (centre) ===');
console.log(await centre());
console.log(
  'R48 · hide toggle on DRAW SCHEDULE (expect 0):',
  await page.getByRole('button', { name: /Hidden from your client/i }).count(),
);
await shot(page, 'r3-05b-step6-draws');

// ── STEP 7 ────────────────────────────────────────────────────────────────
const before = await page.evaluate(
  () => document.querySelectorAll('input[aria-label^="Cost line "][aria-label$=" amount"]').length,
);
await openPart('Allowances');
for (let i = 0; i < ALLOWANCES.length; i += 1) {
  await page.getByRole('button', { name: '+ Add an allowance' }).click();
  await page.waitForTimeout(250);
  const n = i + 1;
  await page.getByLabel(`Allowance ${n}`, { exact: true }).fill(ALLOWANCES[i][0]);
  await page.getByLabel(`Allowance ${n} amount`, { exact: true }).fill(ALLOWANCES[i][1]);
  await page.selectOption(`select[aria-label="Allowance ${n} overage rule"]`, 'change_order');
  await page.waitForTimeout(300);
}
await page.waitForTimeout(1000);
console.log('\n=== STEP 7 · allowances (centre) ===');
console.log(await centre());
await shot(page, 'r3-05c-step7-allowances');
await openPart('Pricing basis');
await page.waitForTimeout(1200);
const after = await page.evaluate(() =>
  Array.from(
    document.querySelectorAll('input[aria-label^="Cost line "]:not([aria-label$=" amount"])'),
  ).map((e) => e.value),
);
console.log('cost lines BEFORE allowances:', before, ' AFTER:', after.length, JSON.stringify(after));
await shot(page, 'r3-05d-step7-no-duplication');

// ── STEP 8 · closed book + BOTH supervision fee and markup ────────────────
await openPart('Who does the work');
await page.getByRole('button', { name: 'Closed-book', exact: true }).click();
await page.waitForTimeout(900);
await openPart('Supervision');
await page.getByLabel('Supervision fee dollars').fill('2500');
await page.waitForTimeout(700);
await openPart('Pricing basis');
await page.getByLabel('Markup on the trades percent').fill('15');
await page.waitForTimeout(2000);
console.log('\n=== STEP 8 · pricing basis with BOTH ===');
console.log(await centre());
await shot(page, 'r3-05e-step8-pricing-double-count');
await openPart('Supervision');
await page.waitForTimeout(900);
console.log('\n=== STEP 8 · supervision with BOTH ===');
console.log(await centre());
await shot(page, 'r3-05f-step8-supervision-double-count');
console.log('\n=== STEP 8 · READINESS with BOTH ===');
console.log((await right()).split('JURISDICTION')[0]);
console.log('STEP 8 · review&send', JSON.stringify(await sendState()));
await shot(page, 'r3-05g-step8-readiness');

// open the send sheet while the rule stands — must refuse
const openSheet = async (tag) => {
  await send().click({ force: true });
  await page.waitForTimeout(2500);
  const t = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[role="dialog"]'));
    const d = nodes[nodes.length - 1];
    return d ? d.innerText : null;
  });
  await shot(page, tag);
  return t;
};
const sheetWhileRed = await openSheet('r3-05h-send-sheet-while-red');
console.log('\n=== SEND SHEET while the double-count stands ===');
console.log(sheetWhileRed);
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);

// clear the markup → green
await openPart('Pricing basis');
await page.getByLabel('Markup on the trades percent').fill('');
await page.waitForTimeout(2000);
console.log('\n=== after clearing the markup ===');
console.log((await right()).split('JURISDICTION')[0]);
console.log('review&send now', JSON.stringify(await sendState()));

// closed-book SOV — R43 studio-authored lines
const startOne = page.getByRole('button', { name: 'Start with one line' });
if (await startOne.count()) {
  await startOne.click();
  await page.waitForTimeout(1000);
}
console.log('\n=== SOV under CLOSED-BOOK (R43) ===');
console.log((await centre()).split('COST LINES')[1]?.slice(0, 2200));
await shot(page, 'r3-05i-sov-closed-book');

// TERMS
await openPart('Terms');
await page.locator('textarea').first().fill(
  'Invoices are due on receipt. Work proceeds against the draw schedule above. Wisconsin law governs this agreement.',
);
await page.waitForTimeout(700);

// R39 · hide one clause for good
await openPart('Change orders');
const hideClause = page.getByRole('button', { name: /Hidden from your client/i }).first();
console.log('\nR39 · hide toggle on CHANGE ORDERS (expect 1):', await hideClause.count());
await hideClause.click();
await page.waitForTimeout(1500);
await shot(page, 'r3-05j-r39-change-orders-hidden');

// R51 · the studio's live preview under closed book
console.log('\n=== R51 · THE CLIENT\'S COPY · LIVE (closed book) ===');
console.log((await right()).split("THE CLIENT'S COPY")[1]?.slice(0, 6000));
await shot(page, 'r3-05k-preview-closed-book');

console.log('\n=== readiness before save ===');
console.log((await right()).split('JURISDICTION')[0]);
await page.getByRole('button', { name: 'Save agreement' }).click();
await page.waitForTimeout(14000);
await shot(page, 'r3-05l-saved');
console.log('\n=== readiness after save ===');
console.log((await right()).split('JURISDICTION')[0]);
console.log('review&send after save', JSON.stringify(await sendState()));
await browser.close();
