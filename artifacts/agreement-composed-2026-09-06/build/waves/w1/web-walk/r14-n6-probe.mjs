/** r2 · N6 — does the designer portal hydrate on 127.0.0.1:3000? */
import { browser, ctx, shot } from './lib2.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const b = await browser();
const c = await ctx(b);
const page = await c.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
await page.goto(`${base}/auth/signin`, { waitUntil: 'domcontentloaded' });
const d = page.getByRole('button', { name: /use email and password instead|sign in with email/i });
await d.first().waitFor({ state: 'visible', timeout: 60000 });
let expanded = 'never';
for (let i = 0; i < 20; i++) {
  await d.first().click().catch(() => {});
  await page.waitForTimeout(1000);
  if (await page.locator('input[type="password"]').count()) { expanded = `after ${i + 1} click(s)`; break; }
}
console.log(`${base} — password field appeared: ${expanded}`);
console.log('aria-expanded:', await d.first().getAttribute('aria-expanded'));
await shot(page, `r33-n6-${base.replace(/\W+/g, '-')}`);
await b.close();
