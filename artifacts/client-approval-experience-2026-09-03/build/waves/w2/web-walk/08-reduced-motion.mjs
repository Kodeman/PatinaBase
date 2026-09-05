import { open, signIn, openHouse, t, askBy } from './lib.mjs';
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
  const pool = submit.locator('.da-pool').first();
  console.log(`[${motion}] pool present:`, await pool.count(), '| still class:', await submit.evaluate((el) => el.className.includes('da-hold-still')));
  const b = await submit.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(70);
  const snap = await pool.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { transition: cs.transitionProperty + ' ' + cs.transitionDuration, clipPath: cs.clipPath, holdFill: getComputedStyle(el.closest('.da-hold') || el).getPropertyValue('--hold-fill') };
  });
  console.log(`[${motion}] 70ms into hold:`, JSON.stringify(snap));
  await submit.screenshot({ path: `${SH}/10-hold-fill-${motion}.png` });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await browser.close();
  return snap;
}
await run('no-preference');
await run('reduce');
