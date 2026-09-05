import { open, t, BASE } from './lib.mjs';
const { browser, page } = await open();
await page.goto(`${BASE}/auth/signin`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.getByRole('button', { name: /use email and password instead/i }).first().click();
await page.waitForTimeout(2000);
console.log('--- inputs after disclosure ---');
for (const i of await page.locator('input').all()) {
  console.log('  input type=', await i.getAttribute('type'), 'id=', await i.getAttribute('id'), 'ph=', await i.getAttribute('placeholder'));
}
console.log('--- buttons ---');
for (const b of await page.locator('button').all()) console.log('  btn:', JSON.stringify(t(await b.innerText())));
console.log('--- labels ---');
for (const l of await page.locator('label').all()) console.log('  label:', JSON.stringify(t(await l.innerText())), 'for=', await l.getAttribute('for'));
await browser.close();
