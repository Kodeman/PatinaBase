import { launch, shot, textOf, dismissOverlays, DESIGNER, HERE } from './lib2.mjs';

const P = '95390bd8-86e4-4a0b-9595-9dd5657cc51e';
const { browser, ctx } = await launch({ state: `${HERE}/r2-designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
page.on('response', async (r) => {
  const u = r.url();
  if (/rpc\//.test(u) && /waiver|trade/i.test(u)) {
    let b = '';
    try { b = (await r.text()).slice(0, 500); } catch { /* body gone */ }
    console.log('NET', u.split('/rpc/')[1], r.status(), b);
  }
});
await page.goto(`${DESIGNER}/drafting/${P}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(13000);
await dismissOverlays(page);

// open the Rough-in row's recorder first
await page.locator('section[aria-label="Lien waivers"] li[data-draw-key="draw_2"]')
  .getByRole('button', { name: /^Record a waiver$/ }).click();
await page.waitForTimeout(1200);
const trade = page.locator('select[aria-label="Trade for Rough-in"]');
const kind = page.locator('select[aria-label="Waiver kind for Rough-in"]');
console.log(
  'trade options:',
  JSON.stringify(await trade.evaluate((s) => Array.from(s.options).map((o) => `${o.value}=${o.text}`))),
);
console.log(
  'waiver kinds:',
  JSON.stringify(await kind.evaluate((s) => Array.from(s.options).map((o) => `${o.value}=${o.text}`))),
);
await trade.selectOption({ index: 1 });
const kinds = await kind.evaluate((s) => Array.from(s.options).map((o) => o.value));
const cond = kinds.find((k) => /conditional_progress|conditional/.test(k)) ?? kinds[0];
await kind.selectOption(cond);
console.log('chose waiver kind:', cond);
await page.waitForTimeout(600);
await shot(page, 'r2-28a-waiver-form');
await page.locator('section[aria-label="Lien waivers"] li[data-draw-key="draw_2"]')
  .getByRole('button', { name: /^Record$/ }).click();
await page.waitForTimeout(9000);
await shot(page, 'r2-28b-waiver-recorded');
const right = await page.evaluate(() => {
  const m = document.querySelector('nav[aria-label="Agreement parts"]')?.parentElement;
  return m ? m.children[2].innerText : '';
});
console.log('=== LIEN WAIVERS after recording ===');
console.log(right.split('LIEN WAIVERS')[1]?.split('TRADE AGREEMENTS')[0]);
console.log('=== TRADE AGREEMENTS ===');
console.log(right.split('TRADE AGREEMENTS')[1]?.split("THE CLIENT'S COPY")[0]?.slice(0, 900));
await browser.close();
