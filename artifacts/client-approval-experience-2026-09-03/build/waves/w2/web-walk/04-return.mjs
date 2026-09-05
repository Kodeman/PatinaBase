import { open, signIn, openHouse, t, askBy, holdPress } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);

const ask = askBy(page, 'Approve the plaster finish as sampled?');
await ask.scrollIntoViewIfNeeded();
const acts = ask.locator('[data-testid="approval-acts"]');
await acts.getByRole('button', { name: /^RETURN$/i }).click();
await page.waitForTimeout(400);
await ask.screenshot({ path: `${SH}/03-return-chosen.png` });

const g = async (id) => t(await ask.locator(`[data-testid="${id}"]`).first().textContent().catch(() => '(absent)'));
console.log('CONSEQUENCE   :', await g('approval-consequence'));
const noteLabel = t(await ask.locator('label[for^="approval-change-note"]').first().textContent());
console.log('NOTE LABEL    :', noteLabel);
console.log('NOTE HELP     :', await g('approval-change-note-help'));
console.log('SIGNATURE?    :', await ask.locator('[data-testid="approval-signature"]').count());

// colours: label + help must not be red
for (const sel of ['label[for^="approval-change-note"]', '[data-testid="approval-change-note-help"]', '[data-testid="approval-consequence"]']) {
  const c = await ask.locator(sel).first().evaluate((el) => getComputedStyle(el).color);
  console.log('  colour', sel, '=', c);
}

const submit = acts.getByRole('button', { name: /submit response/i }).first();
console.log('SUBMIT disabled (empty note):', await submit.isDisabled());

await ask.locator('[data-testid="approval-change-note"]').fill('The plaster reads pinker than the sample under the north light. Please re-sample.');
await page.waitForTimeout(200);
console.log('SUBMIT disabled (with note) :', await submit.isDisabled());
await ask.screenshot({ path: `${SH}/03b-return-note-filled.png` });

// short hold must NOT submit
await holdPress(page, submit, 250);
await page.waitForTimeout(800);
console.log('after 250ms hold — notice:', await g('approval-notice'), '| stamp:', await ask.locator('[data-testid="approval-stamp"]').count());

// full hold submits
await holdPress(page, submit, 1400);
await page.waitForTimeout(2500);
console.log('after 1400ms hold — stamp :', t(await ask.locator('[data-testid="approval-stamp"]').first().textContent().catch(() => '(absent)')));
console.log('after 1400ms hold — notice:', await g('approval-notice'));
console.log('ASK TEXT AFTER:', (await ask.innerText()).replace(/\s+/g, ' ').slice(0, 700));
await ask.screenshot({ path: `${SH}/03c-return-submitted.png` });
await browser.close();
