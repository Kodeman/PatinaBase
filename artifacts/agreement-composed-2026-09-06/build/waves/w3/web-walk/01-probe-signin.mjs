import { launch, shot, DESIGNER } from './lib.mjs';

const { browser, ctx } = await launch();
const page = await ctx.newPage();
await page.goto(`${DESIGNER}/auth/signin`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const els = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button, a, input, summary')).map((e) => ({
    tag: e.tagName,
    type: e.getAttribute('type'),
    text: (e.innerText || e.getAttribute('placeholder') || '').trim().slice(0, 70),
    testid: e.getAttribute('data-testid'),
  })),
);
console.log(JSON.stringify(els, null, 1));
console.log(await shot(page, '01-signin'));
await browser.close();
