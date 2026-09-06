import { open, signIn, openHouse, shot, fullShot, t, askBy } from './lib.mjs';

const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
await fullShot(page, '00-doorstep-1280');

const SEL = {
  plate: '[data-testid="approval-plate"]',
  eyebrow: '[data-testid="approval-eyebrow"]',
  edition: '[data-testid="approval-edition-line"]',
  mark: '[data-testid="approval-makers-mark"]',
  question: '[data-testid="approval-question"]',
  why: '[data-testid="approval-why"]',
  attribution: '[data-testid="approval-attribution"]',
  immut: '[data-testid="immutability-sentence"]',
  weigh: '[data-testid="approval-impact-sentence"]',
  ledger: '[data-testid="approval-impact-ledger"]',
  standing: '[data-testid="approval-who-answers"]',
  budget: '[data-testid="approval-budget"]',
};

const ask = askBy(page, 'library elevations');
await ask.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await shot(page, '01-ask-r3a-1280');

console.log('== R3A pieces');
for (const [k, sel] of Object.entries(SEL)) {
  const loc = ask.locator(sel);
  const c = await loc.count();
  console.log(`  ${k.padEnd(12)} ${c ? t(await loc.first().innerText()) : `<absent:${c}>`}`);
}

// W2-04/W2-n5: the maker's mark must be gone from EVERY plate on the doorstep.
const marks = await page.locator('[data-testid="approval-makers-mark"]').count();
const plates = await page.locator('[data-testid="approval-plate"]').count();
console.log(`\nplates=${plates}  makers-mark nodes=${marks}`);
// and no bare twelve-hex string anywhere in the plates
const hexy = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid="approval-plate"]')]
    .flatMap((p) => [...p.querySelectorAll('*')].map((n) => n.textContent || ''))
    .filter((s) => /^[0-9A-F]{12}$/.test(s.trim())),
);
console.log('twelve-char checksum strings inside plates:', hexy.length, hexy.slice(0, 4));

// the ask's own testid inventory, so nothing is missed by a wrong guess
const ids = await ask.evaluate((el) =>
  [...el.querySelectorAll('[data-testid]')].map((n) => n.dataset.testid));
console.log('testids in the ask:', [...new Set(ids)].join(' '));

const acts = ask.locator('[data-testid="approval-acts"] button');
const n = await acts.count();
console.log(`\nDoors: ${n}`);
for (let i = 0; i < n; i++) {
  const b = acts.nth(i);
  const box = await b.boundingBox();
  console.log(`  "${t(await b.innerText())}" class=${await b.getAttribute('class')} box=${box && `${Math.round(box.width)}x${Math.round(box.height)}@${Math.round(box.x)},${Math.round(box.y)}`}`);
}

const zero = askBy(page, 'stair rail profile');
await zero.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
console.log('\nR3RET (0/0/0):');
console.log('  weighing:', t(await zero.locator('[data-testid="approval-impact-sentence"]').first().innerText()));
console.log('  ledger count:', await zero.locator('[data-testid="approval-impact-ledger"]').count());
await shot(page, '01b-ask-zero-delta');

// discussion landmark names (W2-05)
const landmarks = await page.evaluate(() =>
  [...document.querySelectorAll('[data-testid="approval-discussion"]')].map((s) => ({
    label: s.getAttribute('aria-label'),
    labelledby: s.getAttribute('aria-labelledby'),
  })));
console.log(`\ndiscussion landmarks: ${landmarks.length}`);
console.log('  unique aria-labels:', new Set(landmarks.map((l) => l.label)).size);
for (const l of landmarks.slice(0, 15)) console.log('   ', JSON.stringify(l));

await browser.close();
