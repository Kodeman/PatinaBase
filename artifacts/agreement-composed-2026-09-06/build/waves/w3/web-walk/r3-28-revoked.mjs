import { launch, shot, textOf, CLIENT } from './lib3.mjs';

const REVOKED = 'ff9e58073c0e84134289593051b22539ad0faeefa45bde516fb17fbe3fcd867e';
const NONSENSE = '0000000000000000000000000000000000000000000000000000000000000000';
const { browser, ctx } = await launch();
for (const [label, token] of [['REVOKED-UNSPENT', REVOKED], ['NONSENSE', NONSENSE]]) {
  const page = await ctx.newPage();
  const resp = await page.goto(`${CLIENT}/trade/${token}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);
  console.log(`\n=== ${label} · HTTP ${resp?.status()} ===`);
  console.log((await textOf(page)).slice(0, 900));
  await shot(page, `r3-28-${label.toLowerCase()}`);
  await page.close();
}
await browser.close();
