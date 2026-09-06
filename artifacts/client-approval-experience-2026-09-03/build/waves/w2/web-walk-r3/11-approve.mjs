import { open, signIn, openHouse, t, askBy, holdPress } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
const ask = askBy(page, 'library elevations');
await ask.scrollIntoViewIfNeeded();
const acts = ask.locator('[data-testid="approval-acts"]');
await acts.locator('button').filter({ hasText: 'APPROVE' }).first().click();
await page.waitForTimeout(400);
const g = async (id) => t(await ask.locator(`[data-testid="${id}"]`).first().textContent().catch(() => '(absent)'));
console.log('CONSEQUENCE :', await g('approval-consequence'));
console.log('SIG LABEL   :', t(await ask.locator('label[for^="approval-signature"]').first().textContent()));
console.log('SIG DATE    :', await g('approval-signature-date'));
console.log('SIG NOTICE  :', await g('approval-signature-notice'));
console.log('sig inputs  :', await ask.locator('[data-testid="approval-signature"]').count());
await ask.screenshot({ path: `${SH}/11-approve-signature-empty.png` });
const submit = acts.locator('button').filter({ hasText: /SUBMIT/i }).first();
console.log('submit disabled (no name):', await submit.isDisabled());
await ask.locator('[data-testid="approval-signature"]').first().fill('Client User');
await page.waitForTimeout(250);
console.log('submit disabled (named)  :', await submit.isDisabled());
await ask.screenshot({ path: `${SH}/11b-approve-signature-filled.png` });

// early release cancels
await holdPress(page, submit, 300);
await page.waitForTimeout(900);
console.log('after 300ms hold — stamp ct:', await ask.locator('[data-testid="approval-stamp"]').count());
await ask.screenshot({ path: `${SH}/11c-early-release-cancelled.png` });

// mid-hold sample: pointer path label ink vs pool ink
const box = await submit.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.waitForTimeout(450);
const mid = await submit.evaluate((el) => {
  const pool = el.querySelector('.da-pool');
  const label = el.querySelector('.da-label') || el;
  return {
    state: el.getAttribute('data-hold-state'),
    active: el.matches(':active'),
    wordInk: getComputedStyle(label).color,
    btnInk: getComputedStyle(el).color,
    poolBg: pool && getComputedStyle(pool).backgroundColor,
    clip: pool && getComputedStyle(pool).clipPath,
  };
});
console.log('POINTER mid-hold:', JSON.stringify(mid));
await page.screenshot({ path: `${SH}/11d-pointer-midhold.png`, clip: { x: box.x - 8, y: box.y - 8, width: box.width + 16, height: box.height + 16 } });
await page.waitForTimeout(700);
await page.mouse.up();
await page.waitForTimeout(2500);
const stamp = ask.locator('[data-testid="approval-stamp"]').first();
console.log('STAMP:', t(await stamp.textContent().catch(() => '(absent)')));
console.log('stamp css:', JSON.stringify(await stamp.evaluate((el) => { const cs = getComputedStyle(el); return { color: cs.color, bg: cs.backgroundColor, shadow: cs.boxShadow, transform: cs.transform }; })));
const word = ask.locator('[data-testid="approval-stamp"] *').filter({ hasText: /^APPROVED$/ }).last();
if (await word.count()) console.log('word ink:', await word.first().evaluate((el) => getComputedStyle(el).color), 'bg:', await word.first().evaluate((el) => getComputedStyle(el).backgroundColor));
console.log('who answers now:', await g('approval-who-answers'));
console.log('immut after   :', await ask.locator('[data-testid="immutability-sentence"]').count());
await ask.screenshot({ path: `${SH}/11e-approved-stamp.png` });
await browser.close();
