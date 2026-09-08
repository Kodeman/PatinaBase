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

const col = (i) =>
  page.evaluate((n) => {
    const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    return m ? m.children[n].innerText : '';
  }, i);
const centre = () => col(1);
const right = () => col(2);
const openPart = async (n) => {
  await page.locator('nav[aria-label="Agreement parts"] button', { hasText: n }).first().click();
  await page.waitForTimeout(900);
};
// the hide act, scoped to the OPEN EDITOR (the rail also prints the phrase as a chip)
const hideActs = () =>
  page.evaluate(() => {
    const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
    const editor = m ? m.children[1] : document.body;
    return Array.from(editor.querySelectorAll('label, button')).filter((e) =>
      /Hidden from your client/i.test(e.innerText || ''),
    ).length;
  });
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
console.log('R48 · hide acts inside the PRICING BASIS editor (expect 0):', await hideActs());

// step 5's SOV table — under OPEN-BOOK, the pro-rated seven
await openPart('Who does the work');
await page.getByRole('button', { name: 'Open-book', exact: true }).click();
await page.waitForTimeout(900);
await openPart('Pricing basis');
await page.waitForTimeout(1500);
console.log('\n=== STEP 5 · SOV under OPEN-BOOK ===');
console.log((await centre()).split('COST LINES')[1]?.slice(0, 2500));
await shot(page, 'r3-06a-sov-open-book');

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
console.log('R48 · hide acts inside the DRAW SCHEDULE editor (expect 0):', await hideActs());
await shot(page, 'r3-06b-draws');

// ── STEP 7 ────────────────────────────────────────────────────────────────
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
await page.waitForTimeout(900);

// ── STEP 8 · closed book + BOTH ───────────────────────────────────────────
await openPart('Who does the work');
await page.getByRole('button', { name: 'Closed-book', exact: true }).click();
await page.waitForTimeout(900);
await openPart('Supervision');
await page.getByLabel('Supervision fee dollars').fill('2500');
await page.waitForTimeout(700);
await openPart('Pricing basis');
await page.getByLabel('Markup on the trades percent').fill('15');
await page.waitForTimeout(2200);
console.log('\n=== STEP 8 · READINESS with BOTH ===');
console.log((await right()).split('JURISDICTION')[0]);
console.log('STEP 8 · review&send in the room', JSON.stringify(await sendState()));
const pbErr = await page.evaluate(() => {
  const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  const e = m ? m.children[1] : document.body;
  const t = e.innerText;
  return {
    namesRule: /Supervision is paid once/.test(t),
    markupFieldAria: document
      .querySelector('input[aria-label="Markup on the trades percent"]')
      ?.getAttribute('aria-invalid'),
    feeAria: document.querySelector('input[aria-label="Fee percent"]')?.getAttribute('aria-invalid'),
  };
});
console.log('STEP 8 · pricing basis editor:', JSON.stringify(pbErr));
await shot(page, 'r3-06c-step8-double-count');

// clear the markup → green
await page.getByLabel('Markup on the trades percent').fill('');
await page.waitForTimeout(2200);
console.log('\n=== after clearing the markup ===');
console.log((await right()).split('JURISDICTION')[0]);
console.log('review&send now', JSON.stringify(await sendState()));

// closed-book SOV — R43 studio-authored lines
const startOne = page.getByRole('button', { name: 'Start with one line' });
if (await startOne.count()) {
  await startOne.click();
  await page.waitForTimeout(1200);
}
console.log('\n=== SOV under CLOSED-BOOK (R43) ===');
console.log((await centre()).split('SCHEDULE OF VALUES')[1]?.slice(0, 2200));
await shot(page, 'r3-06d-sov-closed-book');

// TERMS
await openPart('Terms');
await page.locator('textarea').first().fill(
  'Invoices are due on receipt. Work proceeds against the draw schedule above. Wisconsin law governs this agreement.',
);
await page.waitForTimeout(700);

// R39 · hide one clause for good
await openPart('Change orders');
console.log('\nR39 · hide acts inside the CHANGE ORDERS editor (expect 1):', await hideActs());
await page
  .locator('label', { hasText: 'Hidden from your client' })
  .first()
  .locator('input[type="checkbox"]')
  .check();
await page.waitForTimeout(1800);
await shot(page, 'r3-06e-r39-change-orders-hidden');

// R51 · the studio's live preview under closed book
console.log("\n=== R51 · THE CLIENT'S COPY · LIVE (closed book) ===");
console.log((await right()).split("THE CLIENT'S COPY")[1]?.slice(0, 6000));
await shot(page, 'r3-06f-preview-closed-book');

console.log('\n=== readiness before save ===');
console.log((await right()).split('JURISDICTION')[0]);
await page.getByRole('button', { name: 'Save agreement' }).click();
await page.waitForTimeout(15000);
await shot(page, 'r3-06g-saved');
console.log('\n=== readiness after save ===');
console.log((await right()).split('JURISDICTION')[0]);
console.log('review&send after save', JSON.stringify(await sendState()));
await browser.close();
