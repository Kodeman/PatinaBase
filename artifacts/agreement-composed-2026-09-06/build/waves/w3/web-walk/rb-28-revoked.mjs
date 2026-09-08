import { launch, shot, textOf, CLIENT } from './lib2.mjs';

const REVOKED = 'dc713686462dd5c579967a58b478b2a873c1f68f26665132500f8fba8be39e57';
const NONSENSE = '0000000000000000000000000000000000000000000000000000000000000000';
const { browser, ctx } = await launch();
for (const [label, token] of [['REVOKED-UNSPENT', REVOKED], ['NONSENSE', NONSENSE]]) {
  const page = await ctx.newPage();
  const resp = await page.goto(`${CLIENT}/trade/${token}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  console.log(`\n=== ${label} · HTTP ${resp?.status()} ===`);
  console.log((await textOf(page)).slice(0, 900));
  await shot(page, `rb-28-${label.toLowerCase()}`);
  await page.close();
}
await browser.close();
