import { open, signIn, openHouse, t } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r2';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const dw = page.locator('[data-testid="door-way"]').first();
console.log('door-way count:', await dw.count());
if (!(await dw.count())) { await browser.close(); process.exit(0); }
await dw.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
await dw.screenshot({ path: `${SH}/11-door-1280.png` });
console.log('--- DOOR TEXT ---');
console.log(t(await dw.innerText()).slice(0, 1200));
console.log('--- acts on the leaf ---');
for (const b of await dw.locator('button').all()) {
  const cls = (await b.getAttribute('class')) || '';
  console.log('  ', JSON.stringify(t(await b.innerText())), '| variant', cls.match(/da-(primary|secondary|tertiary|quiet)/)?.[0] ?? '(none)', '| disabled', await b.isDisabled());
}
await browser.close();
