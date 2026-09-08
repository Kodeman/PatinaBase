import { launch, shot, CLIENT, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/client-state.json` });
const page = await ctx.newPage();
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await page.getByText('THE PAPERS, IN FULL', { exact: false }).first().click();
await page.waitForTimeout(4000);
await shot(page, '28a-papers-in-full');
console.log('--- papers in full ---');
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 3000));

// also try the retired route and the ?proposal= param
for (const u of [
  `${CLIENT}/proposals/17143662-9354-4f24-87ea-503f818d0bae`,
  `${CLIENT}/?proposal=17143662-9354-4f24-87ea-503f818d0bae#door`,
]) {
  const p = await ctx.newPage();
  await p.goto(u, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(8000);
  console.log('\n=== ', u, '->', p.url(), '===');
  console.log((await p.evaluate(() => document.body.innerText)).slice(0, 1200));
  await p.close();
}
await browser.close();
