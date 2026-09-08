import { launch, shot, dismissOverlays, HERE } from './lib2.mjs';

const URL = 'http://localhost:3000/drafting/de3970a0-de56-4e0f-9c02-421e870d9dcf';
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

const { browser, ctx } = await launch({ state: `${HERE}/r2-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\/(upsert_agreement_parts|send_commercial_document)/.test(u)) {
    let b = '';
    try { b = (await r.text()).slice(0, 400); } catch { /* gone */ }
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
const hideBox = () =>
  page.locator('label', { hasText: 'Hidden from your client' }).locator('input[type="checkbox"]').first();

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(13000);
await dismissOverlays(page);

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
await page.waitForTimeout(1000);

await openPart('Who does the work');
await page.getByRole('button', { name: 'Closed-book', exact: true }).click();
await page.waitForTimeout(900);
await openPart('Pricing basis');
await page.waitForTimeout(900);
const startOne = page.getByRole('button', { name: 'Start with one line' });
if (await startOne.count()) {
  await startOne.click();
  await page.waitForTimeout(900);
}
await openPart('Terms');
await page.locator('textarea').first().fill('Invoices are due on receipt. Wisconsin law governs this agreement.');
await page.waitForTimeout(600);

console.log('readiness before hiding the price:', (await right()).split('JURISDICTION')[0].trim());

// hide the part that carries the whole price
await openPart('Pricing basis');
await hideBox().check();
await page.waitForTimeout(1500);
console.log('readiness with the PRICE hidden:', (await right()).split('JURISDICTION')[0].trim());
const send = page.locator('[data-action-key="review-design-agreement"]');
console.log('review&send disabled:', await send.isDisabled());
const preview = (await right()).split("THE CLIENT'S COPY")[1] || '';
console.log('client copy still names a GMP:', /GUARANTEED MAXIMUM|84,134/.test(preview));
await shot(page, 'rb-35a-price-hidden');
await page.getByRole('button', { name: 'Save agreement' }).click();
await page.waitForTimeout(11000);

await send.click();
await page.waitForTimeout(3500);
const sheet = await page.evaluate(() => {
  const ds = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = ds[ds.length - 1];
  return d ? d.innerText.slice(0, 1200) : null;
});
console.log('\n=== SEND SHEET with the price hidden ===');
console.log(sheet);
await shot(page, 'rb-35b-send-sheet-price-hidden');
const go = page.getByRole('button', { name: /Send agreement/ });
if (await go.count()) {
  await go.click();
  await page.waitForTimeout(14000);
}
await shot(page, 'rb-35c-after-send-price-hidden');
console.log('url after send:', page.url());
await browser.close();
