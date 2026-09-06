import { open, signIn, openHouse, shot, t } from './lib.mjs';

const { browser, page } = await open();
await signIn(page);
console.log('URL after signin:', page.url());
await openHouse(page);
await shot(page, '00-doorstep-1280');

const asks = await page.locator('[data-testid="doorstep-approval"]').all();
console.log('doorstep-approval count:', asks.length);
for (const [i, a] of asks.entries()) {
  console.log(`  ask[${i}]:`, t(await a.locator('[data-testid="approval-question"]').first().textContent().catch(() => '(none)')));
}
console.log('--- MAIN TEXT ---');
console.log(t(await page.locator('main').first().innerText().catch(() => '')).slice(0, 6000));
await browser.close();
