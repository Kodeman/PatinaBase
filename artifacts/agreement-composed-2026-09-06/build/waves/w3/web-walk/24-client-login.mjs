import { launch, shot, signIn, CLIENT, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: null });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
for (let i = 0; i < 3; i += 1) {
  try {
    await signIn(page, CLIENT, 'client@patina.dev');
  } catch (e) {
    console.log('attempt', i, String(e).slice(0, 120));
  }
  await page.waitForTimeout(4000);
  if (!page.url().includes('/auth/')) break;
}
console.log('url:', page.url());
await ctx.storageState({ path: `${HERE}/client-state.json` });
await page.waitForTimeout(3000);
await shot(page, '24a-client-door');
console.log((await page.evaluate(() => document.body.innerText)).slice(0, 3000));
await browser.close();
