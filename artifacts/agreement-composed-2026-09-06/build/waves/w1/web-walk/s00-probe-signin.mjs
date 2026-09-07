import { browser, ctx, shot } from './lib.mjs';

const b = await browser();
const c = await ctx(b);
const page = await c.newPage();
await page.goto('http://localhost:3000/auth/signin?callbackUrl=%2Fdesk', {
  waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(4000);
const btns = await page.$$eval('button', (ns) =>
  ns.map((n) => n.textContent?.trim() ?? '').filter(Boolean),
);
console.log('BUTTONS:', JSON.stringify(btns));
const disclosure = page.getByRole('button', {
  name: /sign in with email|use email and password instead/i,
});
if (await disclosure.count()) {
  await disclosure.first().click();
  await page.waitForTimeout(1500);
}
const inputs = await page.$$eval('input', (ns) =>
  ns.map((n) => ({
    type: n.type,
    name: n.name,
    id: n.id,
    ph: n.placeholder,
    al: n.getAttribute('aria-label'),
  })),
);
console.log('INPUTS:', JSON.stringify(inputs, null, 1));
const labels = await page.$$eval('label', (ns) =>
  ns.map((n) => ({ t: n.textContent?.trim(), f: n.htmlFor })),
);
console.log('LABELS:', JSON.stringify(labels));
const btns2 = await page.$$eval('button', (ns) =>
  ns.map((n) => n.textContent?.trim() ?? '').filter(Boolean),
);
console.log('BUTTONS2:', JSON.stringify(btns2));
await shot(page, '00-signin-probe');
await b.close();
