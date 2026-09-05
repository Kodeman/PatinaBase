import { open, signIn, openHouse, t, holdPress } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const sec = page.locator('[data-threshold-unit="door"]').filter({ has: page.locator('[data-testid="door-way"]') }).first();
await sec.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
const secId = await sec.getAttribute('id');
console.log('door:', t(await sec.locator('h2').innerText()));
const dw = sec.locator('[data-testid="door-way"]').first();
const sign = dw.getByRole('button', { name: /sign and authorize/i }).first();
await dw.locator('input[type=text]').first().fill('Client User');
await dw.locator('input[type=checkbox]').first().check();
await page.waitForTimeout(250);
await page.evaluate((id) => {
  window.__d = [];
  const t0 = performance.now();
  const tick = () => {
    const s = document.getElementById(id);
    const dp = s?.querySelector('[data-testid="door-delivery-pending"]');
    window.__d.push({ ms: Math.round(performance.now() - t0), sec: !!s, dp: !!dp,
      txt: dp ? dp.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : null });
    if (performance.now() - t0 < 9000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, secId);
await holdPress(page, sign, 1400);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SH}/27-delivery-pending.png` });
await page.waitForTimeout(7000);
const d = await page.evaluate(() => window.__d);
const on = d.filter((x) => x.dp);
console.log('door-delivery-pending present:', on.length ? `${on[0].ms}ms → ${on[on.length-1].ms}ms (${on[on.length-1].ms - on[0].ms}ms)` : 'never');
if (on.length) console.log('  text:', JSON.stringify(on[0].txt));
console.log('section gone at:', (d.find((x) => !x.sec) || {}).ms ?? 'never');
const after = await page.evaluate(() => ({
  dp: document.querySelectorAll('[data-testid="door-delivery-pending"]').length,
  recovery: (document.body.innerText.match(/confirmation delivery/gi) || []).length,
  url: location.href,
}));
console.log('after:', JSON.stringify(after));
await page.screenshot({ path: `${SH}/28-after-delivery-pending.png`, fullPage: true });
await browser.close();
