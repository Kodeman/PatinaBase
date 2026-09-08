import { launch, CLIENT, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/client-state.json` });
const page = await ctx.newPage();
const seen = new Set();
page.on('request', (r) => {
  const u = r.url();
  if (/54321|\/api\//.test(u)) seen.add(`${r.method()} ${u.split('?')[0]}`);
});
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
console.log([...seen].join('\n'));
await browser.close();
