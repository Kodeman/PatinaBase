import { open, signIn, openHouse, shot, fullShot, t, askBy, css } from './lib.mjs';

const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
await fullShot(page, '00-doorstep-1280');

const ask = askBy(page, 'library elevations');
await ask.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await shot(page, '01-ask-r2a-1280');

const rows = {};
for (const [k, sel] of Object.entries({
  plate: '[data-testid="approval-plate"]',
  eyebrow: '[data-testid="approval-eyebrow"]',
  edition: '[data-testid="approval-edition-line"]',
  mark: '[data-testid="approval-makers-mark"]',
  question: '[data-testid="approval-question"]',
  why: '[data-testid="approval-why"]',
  attribution: '[data-testid="approval-attribution"]',
  immut: '[data-testid="immutability-sentence"]',
  weigh: '[data-testid="approval-weighing"]',
  ledger: '[data-testid="approval-impact-ledger"]',
  standing: '[data-testid="approval-standing"]',
  budget: '[data-testid="approval-budget"]',
})) {
  const loc = ask.locator(sel);
  rows[k] = (await loc.count()) ? t(await loc.first().innerText()) : `<absent:${await loc.count()}>`;
}
console.log('R2A pieces:');
for (const [k, v] of Object.entries(rows)) console.log(`  ${k.padEnd(12)} ${v}`);

// every testid inside the ask, so nothing is missed by a wrong guess
const ids = await ask.evaluate((el) =>
  [...el.querySelectorAll('[data-testid]')].map((n) => n.getAttribute('testid') || n.dataset.testid),
);
console.log('  testids:', [...new Set(ids)].join(' '));

// the doors
const acts = ask.locator('[data-testid="approval-acts"] button');
const n = await acts.count();
console.log(`\nDoors: ${n}`);
for (let i = 0; i < n; i++) {
  const b = acts.nth(i);
  const box = await b.boundingBox();
  console.log(`  "${t(await b.innerText())}" class=${await b.getAttribute('class')} box=${box && `${Math.round(box.width)}x${Math.round(box.height)}@${Math.round(box.x)},${Math.round(box.y)}`}`);
}

// zero-delta approval (R2RET)
const zero = askBy(page, 'stair rail turn');
await zero.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
console.log('\nR2RET (0/0/0):');
console.log('  weighing:', t(await zero.locator('[data-testid="approval-weighing"]').first().innerText()));
console.log('  ledger count:', await zero.locator('[data-testid="approval-impact-ledger"]').count());
await shot(page, '01b-ask-zero-delta');

await browser.close();
