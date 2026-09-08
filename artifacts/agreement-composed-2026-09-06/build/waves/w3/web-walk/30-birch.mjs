import { launch, shot, CLIENT, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/client-state.json` });
const p = await ctx.newPage();
await p.goto(`${CLIENT}/projects/b0000000-0000-0000-0000-0000000000d3`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(10000);
const t = await p.evaluate(() => document.body.innerText);
console.log(t.slice(0, 2000));
await shot(p, '30-birch-hollow');
await browser.close();
