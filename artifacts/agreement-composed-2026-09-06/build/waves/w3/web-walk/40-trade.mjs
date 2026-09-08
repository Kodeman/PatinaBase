import { launch, shot, CLIENT } from './lib.mjs';
import fs from 'node:fs';

const TOKEN = '6613a3ff054140dd115cf27b9e3712b71d76dfc65c51e35920679600157a7396';
const URL = `${CLIENT}/trade/${TOKEN}`;
const { browser, ctx } = await launch(); // clean profile, no Patina session
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('PAGEERR', String(e).slice(0, 300)));
p.on('response', async (r) => {
  if (/\/api\/|rpc\//.test(r.url())) console.log('NET', r.url().replace(CLIENT, ''), r.status());
});
await p.goto(URL, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(9000);
console.log('cookies at load:', (await ctx.cookies()).length);
const t = await p.evaluate(() => document.body.innerText);
console.log('=== /trade page ===');
console.log(t);
const html = await p.content();
fs.writeFileSync('/Users/kody/Code/patina-merged/artifacts/agreement-composed-2026-09-06/build/waves/w3/web-walk/trade-page.html', html);
const leaks = {
  clientName: /Client User/i.test(html),
  projectName: /Client User — design services agreement|Birch Hollow/i.test(html),
  gmp: /84,?134|8413400/.test(html),
  sov: /Construction|schedule of values/i.test(html),
  otherSubs: /Electrical|Plumbing|Tile allowance|Lighting allowance/i.test(html),
  bid: /bid|trade_scope_bids/i.test(html),
  ownPrice: /38,?000|3800000/.test(html),
};
console.log('LEAKS:', JSON.stringify(leaks));
await shot(p, '40a-trade-page');
const p390 = await ctx.newPage();
await p390.setViewportSize({ width: 390, height: 844 });
await p390.goto(URL, { waitUntil: 'domcontentloaded' });
await p390.waitForTimeout(8000);
await shot(p390, '40b-trade-page-390');
await browser.close();
