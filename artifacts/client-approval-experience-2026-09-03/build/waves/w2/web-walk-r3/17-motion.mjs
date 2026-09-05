import { open, signIn, openHouse, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
const motion = process.argv[2] === 'reduce' ? 'reduce' : 'no-preference';
const q = process.argv[3];
const { browser, page } = await open({ width: 1280, height: 1100, motion });
await signIn(page);
await openHouse(page);
const ask = askBy(page, q);
await ask.scrollIntoViewIfNeeded();
const acts = ask.locator('[data-testid="approval-acts"]');
await acts.locator('button').filter({ hasText: 'APPROVE' }).first().click();
await page.waitForTimeout(300);
await ask.locator('[data-testid="approval-signature"]').fill('Client User');
const submit = acts.locator('button').filter({ hasText: /SUBMIT/i }).first();
await submit.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
const box = await submit.boundingBox();

// sample from inside the page so no round-trip lengthens the press
await submit.evaluate((el) => {
  window.__samples = [];
  const t0 = performance.now();
  const pool = el.querySelector('.da-pool');
  const tick = () => {
    const cs = getComputedStyle(pool);
    window.__samples.push({ ms: Math.round(performance.now() - t0), state: el.getAttribute('data-hold-state'), fill: getComputedStyle(el).getPropertyValue('--hold-fill').trim(), clip: cs.clipPath, dur: cs.transitionDuration });
    if (performance.now() - t0 < 1600) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(420);
await page.mouse.up();
await page.waitForTimeout(500);
const s = await page.evaluate(() => window.__samples);
const pick = (ms) => s.reduce((a, b) => (Math.abs(b.ms - ms) < Math.abs(a.ms - ms) ? b : a));
console.log(`motion=${motion}`);
for (const ms of [20, 40, 120, 250, 400, 420, 440, 480, 560, 700]) {
  const p = pick(ms);
  console.log(`  t≈${String(ms).padStart(3)}  ms=${String(p.ms).padStart(4)} state=${(p.state || '-').padEnd(8)} fill=${p.fill.padEnd(6)} dur=${p.dur.padEnd(6)} clip=${p.clip}`);
}
await browser.close();
