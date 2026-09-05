import { open, signIn, openHouse, t, holdPress } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r2';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const dw = page.locator('[data-testid="door-way"]').first();
await dw.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
console.log('door text:', t(await dw.innerText()).slice(0, 260));
await dw.screenshot({ path: `${SH}/16-door2-1280.png` });
const sign = dw.getByRole('button', { name: /sign and authorize/i }).first();
console.log('sign primary?', ((await sign.getAttribute('class')) || '').match(/da-(primary|secondary|tertiary)/)?.[0]);
await dw.locator('input[type=text]').first().fill('Client User');
await dw.locator('input[type=checkbox]').first().check();
await page.waitForTimeout(200);
await dw.screenshot({ path: `${SH}/16b-door2-armed.png` });
await holdPress(page, sign, 1400);
for (const ms of [200, 600, 1200, 2200, 3600]) {
  await page.waitForTimeout(ms === 200 ? 200 : 400);
  const rec = page.locator('[data-testid="door-receipt"]').first();
  const cnt = await rec.count();
  console.log(`t~${ms}  door-way=${await page.locator('[data-testid="door-way"]').count()} receipt=${cnt}${cnt ? ' "' + t(await rec.innerText()) + '" opacity=' + (await rec.evaluate((el) => getComputedStyle(el).opacity)) : ''}`);
  await page.screenshot({ path: `${SH}/16c-swing-${ms}.png` });
}
await page.waitForTimeout(2500);
console.log('after: door-way =', await page.locator('[data-testid="door-way"]').count());
const lines = page.locator('[data-testid="previously-line"]');
for (let i = 0; i < await lines.count(); i++) console.log('  previously:', t(await lines.nth(i).innerText()));
await page.screenshot({ path: `${SH}/16d-door2-signed.png`, fullPage: true });
await browser.close();
