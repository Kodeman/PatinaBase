import { open, signIn, openHouse, shot, t, askBy, css } from './lib.mjs';

const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);

const ask = askBy(page, 'Do the library elevations read right to you?');
await ask.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await ask.screenshot({ path: '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1/01-ask-g9-1280.png' });

const g = async (id, root = ask) => t(await root.locator(`[data-testid="${id}"]`).first().textContent().catch(() => '(absent)'));

console.log('PLATE        :', await g('approval-plate-title'));
console.log('MAKERS MARK  :', await g('approval-makers-mark'));
console.log('QUESTION     :', await g('approval-question'));
console.log('WHY          :', await g('approval-why'));
console.log('ATTRIBUTION  :', await g('approval-attribution'));
console.log('IMMUTABILITY :', await g('immutability-sentence'));
console.log('RATIONALE    :', await g('approval-rationale'));
console.log('IMPACT SENT  :', await g('approval-impact-sentence'));
console.log('IMPACT LEDGER:', await g('approval-impact-ledger'));
console.log('REVIEW COUNT :', await g('approval-review-count'));
console.log('WHO ANSWERS  :', await g('approval-who-answers'));
console.log('ANSWERED-BY  :', await g('approval-answered-by-another'));

// the three doors
const acts = ask.locator('[data-testid="approval-acts"]');
const doors = acts.locator('button').filter({ hasNot: page.locator('x') });
const names = [];
for (const b of await acts.locator('button').all()) names.push(t(await b.innerText()));
console.log('DOORS        :', JSON.stringify(names));

// equal? measure boxes + variant classes
const boxes = [];
for (const b of await acts.locator('button').all()) {
  const bb = await b.boundingBox();
  const cls = await b.getAttribute('class');
  boxes.push({ label: t(await b.innerText()), w: bb && Math.round(bb.width), h: bb && Math.round(bb.height), variant: (cls || '').match(/da-(primary|secondary|tertiary|quiet)/)?.[0] ?? '(none)' });
}
console.log('DOOR BOXES   :', JSON.stringify(boxes));

// zero-delta ask
const zero = askBy(page, 'Approve the issued Design Development plan set?');
console.log('ZERO IMPACT  :', t(await zero.locator('[data-testid="approval-impact-sentence"]').first().textContent().catch(() => '(absent)')));
console.log('ZERO LEDGER  :', t(await zero.locator('[data-testid="approval-impact-ledger"]').first().textContent().catch(() => '(absent)')));

// draft ask (G1) — review leg
const draft = askBy(page, 'Does the household confirm it reviewed the issued plan set?');
console.log('DRAFT IMMUT  :', t(await draft.locator('[data-testid="immutability-sentence"]').first().textContent().catch(() => '(absent)')));
console.log('DRAFT ACTS   :', t(await draft.locator('[data-testid="approval-acts"]').first().textContent().catch(() => '(absent)')));

// ready-to-publish (G7)
const g7 = askBy(page, 'Approve the issued plan set? Awaiting studio publication.');
console.log('G7 IMMUT     :', t(await g7.locator('[data-testid="immutability-sentence"]').first().textContent().catch(() => '(absent)')));
console.log('G7 NOTICE    :', t(await g7.locator('[data-testid="approval-notice"]').first().textContent().catch(() => '(absent)')));

await browser.close();
