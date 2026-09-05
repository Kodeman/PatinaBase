import { open, BASE } from './lib.mjs';
const { browser, page } = await open();
await page.goto(`${BASE}/auth/signin`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
console.log(await page.evaluate(() => {
  const probe = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return sel + ' : MISSING';
    const keys = Object.keys(el).filter((k) => k.startsWith('__react'));
    return sel + ' : ' + (keys.length ? keys.join(',') : 'NO REACT KEYS');
  };
  return [probe('body'), probe('#portal-auth-email'), probe('form'), probe('button'),
          'nextData=' + !!window.__NEXT_DATA__,
          'reactRoot=' + !!document.querySelector('[data-reactroot]'),
         ].join('\n');
}));
await browser.close();
