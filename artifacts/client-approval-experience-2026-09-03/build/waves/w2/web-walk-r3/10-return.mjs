import { open, signIn, openHouse, shot, t, askBy, holdPress } from './lib.mjs';

const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);

const draft = askBy(page, 'household confirm it reviewed');
await draft.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
await draft.screenshot({ path: '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3/10d-draft-conditional.png' });
const aw = askBy(page, 'Awaiting studio');
await aw.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
await aw.screenshot({ path: '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3/10e-awaiting-studio.png' });

const ask = askBy(page, 'stair rail profile');
await ask.scrollIntoViewIfNeeded();
const acts = ask.locator('[data-testid="approval-acts"]');
await acts.locator('button').filter({ hasText: 'RETURN' }).first().click();
await page.waitForTimeout(400);
await ask.screenshot({ path: '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3/10-return-chosen.png' });

const g = async (id) => t(await ask.locator(`[data-testid="${id}"]`).first().textContent().catch(() => '(absent)'));
console.log('CONSEQUENCE   :', await g('approval-consequence'));
console.log('NOTE LABEL    :', t(await ask.locator('label[for^="approval-change-note"]').first().textContent()));
console.log('NOTE HELP     :', await g('approval-change-note-help'));
console.log('SIGNATURE?    :', await ask.locator('[data-testid="approval-signature"]').count());
for (const sel of ['label[for^="approval-change-note"]', '[data-testid="approval-change-note-help"]', '[data-testid="approval-consequence"]']) {
  console.log('  colour', sel, '=', await ask.locator(sel).first().evaluate((el) => getComputedStyle(el).color));
}
const submit = acts.locator('button').filter({ hasText: /SUBMIT/i }).first();
console.log('SUBMIT text   :', t(await submit.innerText()));
console.log('SUBMIT disabled (empty):', await submit.isDisabled());
await ask.locator('[data-testid="approval-change-note"]').fill('Please take the rail back to oak and show me the newel detail.');
await page.waitForTimeout(200);
console.log('SUBMIT disabled (filled):', await submit.isDisabled());
await ask.screenshot({ path: '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3/10b-return-note-filled.png' });

await holdPress(page, submit, 250);
await page.waitForTimeout(800);
console.log('after 250ms  — stamp ct:', await ask.locator('[data-testid="approval-stamp"]').count());

await holdPress(page, submit, 1400);
await page.waitForTimeout(2500);
const stamp = ask.locator('[data-testid="approval-stamp"]').first();
console.log('after 1400ms — stamp   :', t(await stamp.textContent().catch(() => '(absent)')));
console.log('stamp css:', JSON.stringify(await stamp.evaluate((el) => { const cs = getComputedStyle(el); return { color: cs.color, bg: cs.backgroundColor, shadow: cs.boxShadow, transform: cs.transform }; })));
console.log('immut after answer:', await ask.locator('[data-testid="immutability-sentence"]').count());
console.log('acts  after answer:', await ask.locator('[data-testid="approval-acts"] button').count());
await ask.screenshot({ path: '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3/10c-return-submitted.png' });
console.log('ASK TEXT AFTER:', (await ask.innerText()).replace(/\s+/g, ' ').slice(0, 800));
await browser.close();
