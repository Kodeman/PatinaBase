import { open, signIn, openHouse, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
async function run(motion) {
  const { browser, page } = await open({ width: 1280, height: 1100, motion });
  await signIn(page);
  await openHouse(page);
  const ask = askBy(page, 'Approve the kitchen sconce placement?');
  await ask.scrollIntoViewIfNeeded();
  const acts = ask.locator('[data-testid="approval-acts"]');
  await acts.getByRole('button', { name: /^HOLD$/i }).click();
  await page.waitForTimeout(400);
  const submit = acts.getByRole('button', { name: /submit response/i }).first();
  const b = await submit.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  const rows = [];
  for (const at of [40, 100, 200, 400, 700, 880]) {
    await page.waitForTimeout(at - (rows.length ? [40,100,200,400,700,880][rows.length-1] : 0));
    rows.push(await submit.evaluate((el) => {
      const pool = el.querySelector('.da-pool');
      const cs = getComputedStyle(pool);
      return { state: el.getAttribute('data-hold-state'), fill: getComputedStyle(el).getPropertyValue('--hold-fill').trim(), clip: cs.clipPath, dur: cs.transitionDuration };
    }));
  }
  await page.mouse.up();
  console.log(`--- ${motion} ---`);
  [40,100,200,400,700,880].forEach((ms, i) => console.log(`  ${String(ms).padStart(4)}ms`, JSON.stringify(rows[i])));
  await page.waitForTimeout(400);
  await browser.close();
}
await run('no-preference');
await run('reduce');
