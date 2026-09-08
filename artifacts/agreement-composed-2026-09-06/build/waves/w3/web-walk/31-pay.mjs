import { launch, shot, CLIENT, HERE } from './lib.mjs';

const TOKEN = '049ccca3d99d0e287124c5fe876a2f097b0b8598fa818a0aea86f9161c2f220c';
const { browser, ctx } = await launch({ state: `${HERE}/client-state.json` });
const p = await ctx.newPage();
p.on('response', async (r) => {
  if (/functions\/v1\/create-checkout-session|\/api\//.test(r.url())) {
    let b = ''; try { b = (await r.text()).slice(0, 400); } catch {}
    console.log('NET', r.url().split('/').slice(-2).join('/'), r.status(), b);
  }
});
await p.goto(`${CLIENT}/pay/${TOKEN}`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(9000);
console.log('url', p.url());
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 2500));
await shot(p, '31a-pay-page');
const p2 = await ctx.newPage();
await p2.setViewportSize({ width: 390, height: 844 });
await p2.goto(`${CLIENT}/pay/${TOKEN}`, { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(8000);
await shot(p2, '31b-pay-page-390');
await browser.close();
