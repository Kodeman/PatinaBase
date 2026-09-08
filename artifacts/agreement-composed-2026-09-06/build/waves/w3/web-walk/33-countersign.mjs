import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib.mjs';

const P = '17143662-9354-4f24-87ea-503f818d0bae';
const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\/countersign|rpc\/.*countersign|functions\/v1\//.test(u)) {
    let b = ''; try { b = (await r.text()).slice(0, 500); } catch {}
    console.log('NET', u.split('/').pop(), r.status(), b);
  }
});
await page.goto(`${DESIGNER}/doc/${P}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(11000);
await dismissOverlays(page);
await shot(page, '33a-doc-client-signed');
const t = await page.evaluate(() => document.body.innerText);
console.log(t.slice(0, 3500));
const acts = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button,a'))
    .map((e) => (e.innerText || '').trim())
    .filter((x) => /sign|counter|authori|accept/i.test(x))
    .slice(0, 30),
);
console.log('ACTS:', JSON.stringify(acts));
await browser.close();
