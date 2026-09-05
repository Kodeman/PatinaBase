import { open, signIn, openHouse, t, holdPress } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const sec = page.locator('[data-threshold-unit="door"]').filter({ has: page.locator('[data-testid="door-way"]') }).first();
await sec.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
const secId = await sec.getAttribute('id');
console.log('door:', t(await sec.locator('h2').innerText()), '| id:', secId);
const dw = sec.locator('[data-testid="door-way"]').first();
const sign = dw.getByRole('button', { name: /sign and authorize/i }).first();
await dw.locator('input[type=text]').first().fill('Client User');
await dw.locator('input[type=checkbox]').first().check();
await page.waitForTimeout(250);
await page.evaluate((id) => {
  window.__r = [];
  const t0 = performance.now();
  const tick = () => {
    const s = document.getElementById(id);
    const rec = s?.querySelector('[data-testid="door-receipt"]');
    window.__r.push({ ms: Math.round(performance.now() - t0), present: !!rec, op: rec ? Number(getComputedStyle(rec).opacity) : null, sec: !!s });
    if (performance.now() - t0 < 9000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}, secId);
await holdPress(page, sign, 1400);
await page.waitForTimeout(1600);
await page.screenshot({ path: `${SH}/24-receipt-visible.png` });
await page.waitForTimeout(6500);
const r = await page.evaluate(() => window.__r);
const on = r.filter((x) => x.present);
const full = r.filter((x) => x.present && x.op >= 0.99);
console.log(`receipt present  : ${on.length ? `${on[0].ms}ms → ${on[on.length-1].ms}ms  (${on[on.length-1].ms - on[0].ms}ms)` : 'never'}`);
console.log(`receipt at op≥.99: ${full.length ? `${full[0].ms}ms → ${full[full.length-1].ms}ms  (${full[full.length-1].ms - full[0].ms}ms)` : 'never'}`);
console.log('section gone at  :', (r.find((x) => !x.sec) || {}).ms ?? 'never');
const after = await page.evaluate(() => ({
  seal: (document.body.innerText.match(/has your signature/gi) || []).length,
  counters: (document.documentElement.outerHTML.match(/countersign\w*/gi) || []).length,
  previously: [...document.querySelectorAll('[data-testid="previously-state"]')].map((n) => n.textContent.trim()).slice(0, 8),
}));
console.log('after the section is gone — "has your signature" on the page:', after.seal);
console.log('countersign in DOM:', after.counters);
console.log('previously states :', JSON.stringify(after.previously));
await page.screenshot({ path: `${SH}/25-after-receipt-gone.png` });
await browser.close();
