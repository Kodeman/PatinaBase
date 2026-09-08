import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib.mjs';

const P = '17143662-9354-4f24-87ea-503f818d0bae';
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\//.test(u)) {
    const n = u.split('/rpc/')[1];
    if (/countersign/i.test(n)) {
      let b = ''; try { b = (await r.text()).slice(0, 900); } catch {}
      console.log('NET', n, r.status(), b);
    }
  }
});
await page.goto(`${DESIGNER}/doc/${P}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await dismissOverlays(page);
await page.getByLabel('Studio signer name').fill('Leah Hartwell');
await page.waitForTimeout(600);
await page.getByRole('button', { name: /^Countersign agreement$/ }).click();
await page.waitForTimeout(14000);
await shot(page, '36a-countersigned');
console.log('url', page.url());
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 2500));
await browser.close();
