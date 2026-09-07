import { browser, ctx, shot } from './lib.mjs';

const b = await browser();
const c = await ctx(b);
const page = await c.newPage();
await page.goto('http://localhost:3000/auth/signin?callbackUrl=%2Fdesk', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(3000);
const d = page.getByRole('button', { name: /use email and password instead/i });
console.log('disclosure count', await d.count());
await d.first().click({ force: true });
await page.waitForTimeout(2000);
console.log(
  'INPUTS',
  JSON.stringify(
    await page.$$eval('input', (ns) =>
      ns.map((n) => ({ type: n.type, id: n.id, ph: n.placeholder })),
    ),
  ),
);
console.log(
  'LABELS',
  JSON.stringify(
    await page.$$eval('label', (ns) => ns.map((n) => n.textContent?.trim())),
  ),
);
console.log(
  'BUTTONS',
  JSON.stringify(
    await page.$$eval('button', (ns) => ns.map((n) => n.textContent?.trim())),
  ),
);
await shot(page, '00b-signin-expanded');
// dev accounts
await page.getByRole('button', { name: /dev accounts/i }).first().click({ force: true });
await page.waitForTimeout(1200);
console.log(
  'BUTTONS-AFTER-DEV',
  JSON.stringify(
    await page.$$eval('button', (ns) => ns.map((n) => n.textContent?.trim())),
  ),
);
await shot(page, '00c-dev-accounts');
await b.close();
