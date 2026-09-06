import { open, t, BASE } from './lib.mjs';
const { browser, page } = await open();
await page.goto(`${BASE}/auth/signin`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);
console.log('--- visible text ---');
console.log(t(await page.locator('body').innerText()));
console.log('--- buttons ---');
for (const b of await page.locator('button').all()) {
  console.log('  btn:', JSON.stringify(t(await b.innerText())), 'type=', await b.getAttribute('type'));
}
console.log('--- inputs ---');
for (const i of await page.locator('input').all()) {
  console.log('  input type=', await i.getAttribute('type'), 'name=', await i.getAttribute('name'), 'id=', await i.getAttribute('id'), 'ph=', await i.getAttribute('placeholder'));
}
await page.screenshot({ path: '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1/x-signin.png' });
await browser.close();
