import { browser, ctx, shot, HERE } from './lib2.mjs';

const b = await browser();
const c = await ctx(b);
const page = await c.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto('http://localhost:3002/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
console.log('URL', page.url());
console.log('BUTTONS', JSON.stringify(await page.$$eval('button', (ns) => ns.map((n) => n.innerText.trim().slice(0, 40)))));
console.log('INPUTS', JSON.stringify(await page.$$eval('input', (ns) => ns.map((n) => ({ t: n.type, ph: n.placeholder })))));
await shot(page, 'c00-client-signin');
// password disclosure, if any
const d = page.getByRole('button', { name: /use email and password instead|sign in with email/i });
for (let i = 0; i < 20 && (await page.locator('input[type="password"]').count()) === 0; i++) {
  if (await d.count()) await d.first().click().catch(() => {});
  await page.waitForTimeout(1000);
}
await page.locator('input[type="email"]').first().fill('client@patina.dev');
await page.locator('input[type="password"]').first().fill('password123');
await page.getByRole('button', { name: /^sign in$/i }).click();
await page.waitForTimeout(12000);
console.log('URL after', page.url());
await shot(page, 'c01-client-landed');
await c.storageState({ path: `${HERE}/r2-state-client.json` });
await b.close();
