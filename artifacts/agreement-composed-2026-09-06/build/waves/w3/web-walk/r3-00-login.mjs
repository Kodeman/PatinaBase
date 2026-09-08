import { launch, shot, signInPersist, textOf, DESIGNER, CLIENT, HERE } from './lib3.mjs';

const { browser, ctx } = await launch();
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200));
});
const url = await signInPersist(
  page,
  ctx,
  DESIGNER,
  'designer@patina.dev',
  `${HERE}/r3-designer-state.json`,
);
console.log('designer settled url:', url);
console.log('shot:', await shot(page, 'r3-00-designer-signed-in'));

const page2 = await ctx.browser().newContext({ viewport: { width: 1280, height: 900 } });
const p2 = await page2.newPage();
const url2 = await signInPersist(p2, page2, CLIENT, 'client@patina.dev', `${HERE}/r3-client-state.json`);
console.log('client settled url:', url2);
console.log('client text:', (await textOf(p2)).slice(0, 600));
await browser.close();
