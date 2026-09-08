import { launch, shot, signIn, textOf, DESIGNER } from './lib.mjs';

const { browser, ctx } = await launch();
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 300));
});
const url = await signIn(page, DESIGNER, 'designer@patina.dev');
console.log('after signin url:', url);
await page.waitForLoadState('domcontentloaded').catch(() => {});
await page.waitForTimeout(6000);
console.log('settled url:', page.url());
console.log('---- text ----');
console.log((await textOf(page)).slice(0, 3000));
console.log('shot:', await shot(page, '00-after-signin'));
await ctx.storageState({ path: '/Users/kody/Code/patina-merged/artifacts/agreement-composed-2026-09-06/build/waves/w3/web-walk/designer-state.json' });
await browser.close();
