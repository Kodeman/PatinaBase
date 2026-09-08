import { launch, shot, CLIENT, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/client-state.json` });
const page = await ctx.newPage();
await page.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await shot(page, '27a-door-reloaded');
const t = await page.evaluate(() => document.body.innerText);
console.log(t.slice(0, 2200));
const pay = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a,button'))
    .filter((e) => /pay the deposit/i.test(e.innerText || ''))
    .map((e) => ({ tag: e.tagName, href: e.getAttribute('href'), t: e.innerText.trim() })),
);
console.log('PAY:', JSON.stringify(pay));
// mobile
const page2 = await ctx.newPage();
await page2.setViewportSize({ width: 390, height: 844 });
await page2.goto(`${CLIENT}/`, { waitUntil: 'domcontentloaded' });
await page2.waitForTimeout(9000);
await shot(page2, '27b-door-reloaded-390');
await browser.close();
