import { launch, shot, shot390, textOf, CLIENT, HERE } from './lib2.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/r2-client-state.json` });
const page = await ctx.newPage();
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);

// open the paper from THE PAPERS
const paper = page
  .getByText('Design-build agreement · Client User — design services agreement', { exact: false })
  .first();
console.log('paper link count:', await paper.count());
await paper.click();
await page.waitForTimeout(6000);
const t = await textOf(page);
console.log('url:', page.url().replace(CLIENT, ''));
console.log('=== THE PAPER AFTER EXECUTION ===');
const i = t.indexOf('DESIGN-BUILD AGREEMENT');
console.log(i >= 0 ? t.slice(i, i + 5000) : t.slice(0, 4000));
console.log('\npaper names Rough-in:', /Rough-in/i.test(t));
console.log('paper names a waiver received:', /waiver/i.test(t));
console.log('paper names BILLED:', /billed/i.test(t));
await shot(page, 'r2-30a-papers-executed');
await shot390(page, 'r2-30b-papers-executed-390');
await browser.close();
