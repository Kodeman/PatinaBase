import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r2';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const ask = askBy(page, 'kitchen sconce');
await ask.scrollIntoViewIfNeeded();
const acts = ask.locator('[data-testid="approval-acts"]');
await acts.locator('button').filter({ hasText: 'APPROVE' }).first().click();
await page.waitForTimeout(300);
await ask.locator('[data-testid="approval-signature"]').fill('Client User');
const submit = acts.locator('button').filter({ hasText: /SUBMIT/i }).first();
await submit.focus();

// a short Enter hold must not submit
await page.keyboard.down('Enter');
await page.waitForTimeout(500);
await page.keyboard.up('Enter');
await page.waitForTimeout(900);
console.log('after 500ms Enter — stamp ct:', await ask.locator('[data-testid="approval-stamp"]').count());

// the full hold; sample mid-way
await submit.focus();
await page.keyboard.down('Enter');
await page.waitForTimeout(430);
const mid = await submit.evaluate((el) => {
  const pool = el.querySelector('.da-pool');
  const label = el.querySelector('.da-label') || el;
  const parse = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const lum = (rgb) => { const s = rgb.map((v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };
  const wc = getComputedStyle(label).color, pb = getComputedStyle(pool).backgroundColor;
  const L1 = lum(parse(wc)), L2 = lum(parse(pb));
  const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  return { state: el.getAttribute('data-hold-state'), active: el.matches(':active'), wordInk: wc, poolBg: pb, clip: getComputedStyle(pool).clipPath, contrast: Math.round(ratio * 100) / 100 };
});
console.log('KEYBOARD mid-hold:', JSON.stringify(mid));
const box = await submit.boundingBox();
await page.screenshot({ path: `${SH}/07-keyboard-hold-midfill.png`, clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 } });
await page.waitForTimeout(700);
await page.keyboard.up('Enter');
await page.waitForTimeout(2500);
console.log('STAMP:', t(await ask.locator('[data-testid="approval-stamp"]').first().textContent().catch(() => '(absent)')));
await ask.screenshot({ path: `${SH}/07b-keyboard-approved.png` });
await browser.close();
