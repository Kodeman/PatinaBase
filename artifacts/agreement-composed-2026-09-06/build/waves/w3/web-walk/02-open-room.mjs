import { launch, shot, textOf, DESIGNER, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 200)));
await page.goto(`${DESIGNER}/desk`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
console.log('url', page.url());

await page.keyboard.press('Meta+k');
await page.waitForTimeout(1500);
await shot(page, '02a-command-bar');
const inputs = page.locator('input');
console.log('inputs', await inputs.count());
await inputs.first().fill('agreement');
await page.waitForTimeout(1500);
console.log('--- command bar text ---');
console.log((await textOf(page)).slice(0, 2000));
await shot(page, '02b-command-bar-agreement');
await browser.close();
