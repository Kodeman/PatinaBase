import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib.mjs';

const P = '17143662-9354-4f24-87ea-503f818d0bae';
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\//.test(u) && /countersign/.test(u)) {
    let b = ''; try { b = (await r.text()).slice(0, 700); } catch {}
    console.log('NET', u.split('/rpc/')[1], r.status(), b);
  }
});
await page.goto(`${DESIGNER}/doc/${P}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await dismissOverlays(page);
await page.getByRole('button', { name: /^Countersign agreement$/ }).click();
await page.waitForTimeout(4000);
await shot(page, '34a-countersign-sheet');
const dlg = await page.evaluate(() => {
  const ds = Array.from(document.querySelectorAll('[role="dialog"]'));
  const d = ds[ds.length - 1];
  return d ? { text: d.innerText.slice(0, 2500), buttons: Array.from(d.querySelectorAll('button')).map((b) => b.innerText.trim().slice(0, 40)) } : null;
});
console.log(JSON.stringify(dlg, null, 1));
await browser.close();
