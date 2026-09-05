import { open, signIn, openHouse, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';

// Press for exactly `ms` with no intervening round-trips, then report.
async function press(motion, question, ms) {
  const { browser, page } = await open({ width: 1280, height: 1100, motion });
  await signIn(page);
  await openHouse(page);
  const ask = askBy(page, question);
  await ask.scrollIntoViewIfNeeded();
  const acts = ask.locator('[data-testid="approval-acts"]');
  await acts.getByRole('button', { name: /^HOLD$/i }).click();
  await page.waitForTimeout(500);
  const submit = acts.getByRole('button', { name: /submit response/i }).first();
  const still = await submit.evaluate((el) => el.className.includes('da-hold-still'));
  // page-side rAF sampler, installed before the press
  await submit.evaluate((el) => {
    window.__samples = [];
    const pool = el.querySelector('.da-pool');
    const t0 = performance.now();
    const tick = () => {
      window.__samples.push([Math.round(performance.now() - t0), el.getAttribute('data-hold-state'),
        getComputedStyle(el).getPropertyValue('--hold-fill').trim(), getComputedStyle(pool).clipPath]);
      if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const b = await submit.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(2500);
  const stamps = await ask.locator('[data-testid="approval-stamp"]').count();
  const samples = await page.evaluate(() => window.__samples || []);
  console.log(`\n=== ${motion} · press ${ms}ms · still-class=${still} -> stamps=${stamps} ${stamps ? 'SUBMITTED' : 'not submitted'}`);
  for (const s of samples.filter((_, i) => i % 4 === 0).slice(0, 14)) console.log('   ', JSON.stringify(s));
  await browser.close();
  return stamps;
}

await press('reduce', 'Approve the mudroom bench detail?', 400);
await press('no-preference', 'Approve the pantry shelving run?', 400);
