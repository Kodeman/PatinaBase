import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib2.mjs';

const P = '95390bd8-86e4-4a0b-9595-9dd5657cc51e';
const { browser, ctx } = await launch({ state: `${HERE}/r2-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\//.test(u) && /countersign/i.test(u)) {
    let b = '';
    try { b = (await r.text()).slice(0, 900); } catch { /* body gone */ }
    console.log('NET', u.split('/rpc/')[1], r.status(), b);
  }
});
await page.goto(`${DESIGNER}/doc/${P}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
await dismissOverlays(page);
await page.getByLabel('Studio signer name').fill('Leah Hartwell');
await page.waitForTimeout(800);
await page.getByRole('button', { name: /^Countersign agreement$/ }).click();
await page.waitForTimeout(18000);
await shot(page, 'r2-15a-countersigned');
console.log('url:', page.url());
console.log((await textOf(page)).slice(0, 2500));
await browser.close();
