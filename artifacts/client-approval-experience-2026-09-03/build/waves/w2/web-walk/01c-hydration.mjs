import { open, t, BASE } from './lib.mjs';
const { browser, page } = await open();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
page.on('console', (m) => console.log('[console.' + m.type() + ']', m.text().slice(0, 300)));
page.on('requestfailed', (r) => console.log('[reqfail]', r.url().slice(0, 160), r.failure()?.errorText));
await page.goto(`${BASE}/auth/signin`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
const clicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /password instead/i.test(x.textContent || ''));
  if (!b) return 'no button';
  return Object.keys(b).filter((k) => k.startsWith('__react')).join(',') || 'NO REACT PROPS';
});
console.log('react props on disclosure:', clicked);
await browser.close();
