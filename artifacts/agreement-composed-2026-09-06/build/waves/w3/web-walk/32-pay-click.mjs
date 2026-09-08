import { launch, shot, CLIENT, HERE } from './lib.mjs';

const TOKEN = '049ccca3d99d0e287124c5fe876a2f097b0b8598fa818a0aea86f9161c2f220c';
const { browser, ctx } = await launch({ state: `${HERE}/client-state.json` });
const p = await ctx.newPage();
p.on('response', async (r) => {
  if (r.request().method() !== 'GET' || /functions|api/.test(r.url())) {
    let b = ''; try { b = (await r.text()).slice(0, 300); } catch {}
    console.log('NET', r.url().replace('http://127.0.0.1:54321', ''), r.status(), b);
  }
});
p.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0,200)));
p.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0,200)));
await p.goto(`${CLIENT}/pay/${TOKEN}`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(8000);
await p.getByRole('button', { name: /^Pay \$/ }).click();
await p.waitForTimeout(9000);
await shot(p, '32a-pay-clicked');
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 1200));
await browser.close();
