import { launch, shot, textOf, CLIENT, HERE } from './lib2.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r2-client-state.json` });
const page = await ctx.newPage();
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await page.getByText('THE PAPERS, IN FULL', { exact: false }).first().click();
await page.waitForTimeout(5000);
let t = await textOf(page);
console.log('=== PAPERS IN FULL ===');
const i = t.indexOf('WHAT YOU HAVE SIGNED');
console.log(t.slice(i, i + 2500));
await shot(page, 'r2-30a-papers-executed');

// open the instrument itself
const inst = page.getByText('Client User — design services agreement', { exact: false });
const n = await inst.count();
console.log('instrument links:', n);
for (let k = 0; k < n; k += 1) {
  const el = inst.nth(k);
  const tag = await el.evaluate((e) => e.tagName + '|' + (e.closest('a')?.getAttribute('href') ?? 'no-href'));
  console.log(' link', k, tag);
}
const readAll = page.getByText(/read (it )?in full/i).first();
console.log('read-in-full present:', await readAll.count());
if (await readAll.count()) {
  await readAll.click();
  await page.waitForTimeout(5000);
  t = await textOf(page);
  const j = t.indexOf('DESIGN-BUILD AGREEMENT');
  console.log('\n=== THE PAPER (executed) ===');
  console.log(t.slice(j, j + 4000));
  await shot(page, 'r2-30c-paper-executed');
}
console.log('\nmentions Rough-in:', /Rough-in/i.test(t));
console.log('mentions waiver:', /waiver/i.test(t));
console.log('mentions billed:', /billed/i.test(t));
await browser.close();
