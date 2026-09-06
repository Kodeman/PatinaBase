import { open, signIn, openHouse, t, holdPress } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r2';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
console.log('door sections before:', await page.locator('[data-threshold-unit="door"]').count());
const dw = page.locator('[data-testid="door-way"]').first();
await dw.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
const sign = dw.getByRole('button', { name: /sign and authorize/i }).first();
await dw.locator('input[type=text]').first().fill('Client User');
await dw.locator('input[type=checkbox]').first().check();
await page.waitForTimeout(200);
await holdPress(page, sign, 1400);
for (let i = 0; i < 26; i++) {
  await page.waitForTimeout(200);
  const sections = await page.locator('[data-threshold-unit="door"]').count();
  const way = await page.locator('[data-testid="door-way"]').count();
  const rec = page.locator('[data-testid="door-receipt"]').first();
  const rc = await rec.count();
  const line = rc ? `"${t(await rec.innerText())}" op=${await rec.evaluate((el) => getComputedStyle(el).opacity)}` : '';
  const head = await page.locator('[data-threshold-unit="door"] p').first().innerText().catch(() => '');
  console.log(`t=${(i + 1) * 200}ms sections=${sections} way=${way} receipt=${rc} ${line} head="${t(head).slice(0, 40)}"`);
  if (i === 3) await page.screenshot({ path: `${SH}/17-swing-800ms.png` });
  if (i === 12) await page.screenshot({ path: `${SH}/17b-after-2600ms.png` });
}
await page.screenshot({ path: `${SH}/17c-door3-final.png`, fullPage: true });
await browser.close();
