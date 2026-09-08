import { launch, shot, textOf, CLIENT, HERE } from './lib2.mjs';

const TOKEN = 'e20fcb2126db7b1b2a075a6405907c1034eb2c4c4c36f10e707b38c6cf6ab6b9';
const { browser, ctx } = await launch({ state: `${HERE}/r2-client-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));

// where does the offer live after the reload?
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
const t0 = await textOf(page);
console.log('door mentions the deposit:', /deposit is ready|PAY THE DEPOSIT/i.test(t0));
console.log('door mentions $8,413.40:', t0.includes('$8,413.40'));

await page.getByText('THE PAPERS, IN FULL', { exact: false }).first().click();
await page.waitForTimeout(4000);
await shot(page, 'r2-12a-papers-in-full');
const tp = await textOf(page);
console.log('\n=== THE PAPERS, IN FULL ===');
console.log(tp.slice(0, 2200));
console.log('papers sheet names the signed prime:', /design services agreement|Design-build/i.test(tp));

// the other houses' letterboxes
for (const label of ['Marrow & Vale Residence', 'Aspen Loft Refresh']) {
  await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  const link = page.getByText(label, { exact: false }).first();
  if (await link.count()) {
    await link.click();
    await page.waitForTimeout(7000);
    const tx = await textOf(page);
    console.log(`\n=== ${label} ===`);
    console.log('  deposit offer here:', /deposit is ready|PAY THE DEPOSIT/i.test(tx));
    console.log('  invoice $8,413.40 here:', tx.includes('$8,413.40'));
    console.log('  signed prime here:', /Design-build agreement/i.test(tx));
    await shot(page, `r2-12b-${label.replace(/[^a-z]/gi, '-').toLowerCase()}`);
  }
}

// STEP 14 · the till
const pay = await ctx.newPage();
const seen = [];
pay.on('response', async (r) => {
  if (r.url().includes('/checkout')) {
    let b = '';
    try { b = (await r.text()).slice(0, 300); } catch { /* body gone */ }
    seen.push(`${r.status()} ${b}`);
    console.log('CHECKOUT ->', r.status(), b);
  }
});
await pay.goto(`${CLIENT}/pay/${TOKEN}`, { waitUntil: 'domcontentloaded' });
await pay.waitForTimeout(8000);
const before = await textOf(pay);
console.log('\n=== /pay/<token> ===');
console.log(before.slice(0, 2000));
await shot(pay, 'r2-12c-pay-page');
const btn = pay.getByRole('button', { name: /Pay \$/i }).first();
console.log('pay button present:', await btn.count());
if (await btn.count()) {
  await btn.click();
  await pay.waitForTimeout(9000);
  const after = await textOf(pay);
  await shot(pay, 'r2-12d-pay-clicked');
  console.log('\ntext changed after the click:', after !== before);
  const added = after
    .split('\n')
    .filter((l) => !before.includes(l))
    .join(' | ');
  console.log('NEW LINES:', added.slice(0, 600));
  const alert = await pay.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alert"],[role="status"]')).map((e) => e.innerText),
  );
  console.log('ALERTS:', JSON.stringify(alert));
  console.log('button re-enabled:', !(await btn.isDisabled()));
}
await browser.close();
