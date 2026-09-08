import { launch, textOf, CLIENT } from './lib2.mjs';
const TOKEN = '7647f2577f6aa43254029ff015728529cbdbe1badd794a8af0755feddf2e2af0';
const { browser, ctx } = await launch();
const page = await ctx.newPage();
await page.goto(`${CLIENT}/trade/${TOKEN}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);
const t = await textOf(page);
for (const w of ['Electrical','Plumbing','Lighting','Tile','bid','Bid','Client User','Birch Hollow','84,134','8413400','General conditions','allowance','draw','Draw','Rough-in','GMP']) {
  if (new RegExp(w).test(t)) console.log('TEXT HIT:', w, '→', t.slice(Math.max(0,t.search(new RegExp(w))-60), t.search(new RegExp(w))+60).replace(/\n/g,' '));
}
const dom = await page.content();
for (const w of ['Electrical','Plumbing','Lighting','Tile','84134','8413400','Client User','Birch Hollow','bidCents','bids']) {
  if (dom.includes(w)) console.log('DOM HIT:', w);
}
console.log('done');
await browser.close();
