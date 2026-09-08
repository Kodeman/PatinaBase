import { launch, shot, textOf, dismissOverlays, DESIGNER, CLIENT, HERE } from './lib3.mjs';

const P = '8cac8743-9b06-40ba-aeab-aa6a1829070b';

// ── the door, with the deposit now PAID (R50: a paid deposit is not an offer)
const c = await launch({ state: `${HERE}/r3-client-state.json` });
const cp = await c.ctx.newPage();
await cp.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await cp.waitForTimeout(9000);
const td = await textOf(cp);
console.log('=== DOOR after the deposit is PAID ===');
console.log('offer still standing:', /deposit is ready|PAY THE DEPOSIT/i.test(td));
console.log('receipt still standing:', /It opened on your name/i.test(td));
await shot(cp, 'r3-13a-door-deposit-paid');
console.log(td.slice(0, 1400));
await c.browser.close();

// ── the studio's /doc view at client_signed, then countersign
const { browser, ctx } = await launch({ state: `${HERE}/r3-designer-state.json` });
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
await page.waitForTimeout(14000);
await dismissOverlays(page);
const before = await textOf(page);
console.log('\n=== /doc at client_signed (W3R2-07 chips) ===');
console.log(before.slice(0, 2600));
await shot(page, 'r3-13b-doc-client-signed');

await page.getByLabel('Studio signer name').fill('Leah Hartwell');
await page.waitForTimeout(800);
await page.getByRole('button', { name: /^Countersign agreement$/ }).click();
await page.waitForTimeout(20000);
await shot(page, 'r3-13c-countersigned');
console.log('\nurl:', page.url());
console.log((await textOf(page)).slice(0, 2500));
await browser.close();
