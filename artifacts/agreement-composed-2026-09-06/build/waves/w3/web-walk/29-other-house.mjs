import { launch, shot, CLIENT, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/client-state.json` });
for (const id of ['b0000000-0000-0000-0000-0000000000d1', 'b0000000-0000-0000-0000-0000000000d4']) {
  const p = await ctx.newPage();
  await p.goto(`${CLIENT}/projects/${id}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(9000);
  const t = await p.evaluate(() => document.body.innerText);
  console.log(`\n=== ${id} ===`);
  console.log(t.slice(0, 1600));
  await shot(p, `29-house-${id.slice(-4)}`);
  await p.close();
}
await browser.close();
