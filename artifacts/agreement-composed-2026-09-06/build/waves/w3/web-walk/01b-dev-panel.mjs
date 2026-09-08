import { launch, shot, DESIGNER } from './lib.mjs';

const { browser, ctx } = await launch();
const page = await ctx.newPage();
await page.goto(`${DESIGNER}/auth/signin`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.getByRole('button', { name: /DEV ACCOUNTS/i }).click();
await page.waitForTimeout(800);
console.log('--- after dev panel open ---');
const els = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button')).map((e) => (e.innerText || '').trim().slice(0, 60)),
);
console.log(JSON.stringify(els, null, 1));
console.log(await shot(page, '01b-dev-panel'));

// also test the password toggle
await page.goto(`${DESIGNER}/auth/signin`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /Use email and password instead/i }).click();
await page.waitForTimeout(800);
const els2 = await page.evaluate(() =>
  Array.from(document.querySelectorAll('button, input')).map((e) => ({
    tag: e.tagName, type: e.getAttribute('type'),
    t: (e.innerText || e.getAttribute('placeholder') || '').trim().slice(0, 60),
  })),
);
console.log('--- after password toggle ---');
console.log(JSON.stringify(els2, null, 1));
console.log(await shot(page, '01c-password-form'));
await browser.close();
