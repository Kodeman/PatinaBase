import { open, signIn, openHouse, t, askBy, holdPress } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);

const ask = askBy(page, 'Do the library elevations read right to you?');
await ask.scrollIntoViewIfNeeded();
const acts = ask.locator('[data-testid="approval-acts"]');
const g = async (id) => t(await ask.locator(`[data-testid="${id}"]`).first().textContent().catch(() => '(absent)'));

// --- HOLD is hold-only -------------------------------------------------
await acts.getByRole('button', { name: /^HOLD$/i }).click();
await page.waitForTimeout(300);
console.log('HOLD consequence :', await g('approval-consequence'));
console.log('HOLD signature ct:', await ask.locator('[data-testid="approval-signature"]').count());
console.log('HOLD note ct     :', await ask.locator('[data-testid="approval-change-note"]').count());
console.log('HOLD submit dis  :', await acts.getByRole('button', { name: /submit response/i }).first().isDisabled());
await ask.screenshot({ path: `${SH}/04-hold-chosen.png` });
await acts.getByRole('button', { name: /choose another outcome/i }).click();
await page.waitForTimeout(300);

// --- APPROVE ------------------------------------------------------------
await acts.getByRole('button', { name: /^APPROVE$/i }).click();
await page.waitForTimeout(400);
console.log('APPROVE conseq   :', await g('approval-consequence'));
const sig = ask.locator('[data-testid="approval-signature"]').first();
console.log('SIG present      :', await sig.count());
console.log('SIG date         :', t(await ask.locator('[data-testid="approval-signature-date"]').first().textContent().catch(() => '(absent)')));
console.log('SIG notice       :', t(await ask.locator('[data-testid="approval-signature-notice"]').first().textContent().catch(() => '(absent)')));
const submit = acts.getByRole('button', { name: /submit response/i }).first();
console.log('SUBMIT dis (no name):', await submit.isDisabled());
await ask.screenshot({ path: `${SH}/05-approve-signature-empty.png` });

await sig.fill('Client User');
await page.waitForTimeout(200);
console.log('SUBMIT dis (named)  :', await submit.isDisabled());
await ask.screenshot({ path: `${SH}/05b-approve-signature-filled.png` });

// early release cancels
await holdPress(page, submit, 300);
await page.waitForTimeout(900);
console.log('after 300ms release — stamp ct:', await ask.locator('[data-testid="approval-stamp"]').count());
await ask.screenshot({ path: `${SH}/05c-approve-early-release-cancelled.png` });

// mid-hold fill visible?
const b = await submit.boundingBox();
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await page.mouse.down();
await page.waitForTimeout(450);
await submit.screenshot({ path: `${SH}/05d-approve-mid-hold-fill.png` });
console.log('mid-hold data-hold-state:', await submit.getAttribute('data-hold-state'));
await page.waitForTimeout(900);
await page.mouse.up();
await page.waitForTimeout(2800);

console.log('STAMP            :', t(await ask.locator('[data-testid="approval-stamp"]').first().textContent().catch(() => '(absent)')));
const stampEl = ask.locator('[data-testid="approval-stamp"]').first();
if (await stampEl.count()) {
  const s = await stampEl.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, background: cs.backgroundColor, boxShadow: cs.boxShadow, borderColor: cs.borderColor, transform: cs.transform };
  });
  console.log('STAMP css        :', JSON.stringify(s));
}
console.log('REVIEW STANDING  :', await g('approval-review-count'));
console.log('IMMUTABILITY NOW :', await g('immutability-sentence'));
console.log('ACTS NOW ct      :', await ask.locator('[data-testid="approval-acts"]').count());
await ask.screenshot({ path: `${SH}/06-approved-stamp.png` });
await browser.close();
