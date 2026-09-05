import { open, signIn, openHouse, shot, t, askBy } from './lib.mjs';

const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);

const SEL = {
  plate: '[data-testid="approval-plate"]',
  mark: '[data-testid="approval-makers-mark"]',
  question: '[data-testid="approval-question"]',
  why: '[data-testid="approval-why"]',
  attribution: '[data-testid="approval-attribution"]',
  immut: '[data-testid="immutability-sentence"]',
  rationale: '[data-testid="approval-rationale"]',
  impactSentence: '[data-testid="approval-impact-sentence"]',
  ledger: '[data-testid="approval-impact-ledger"]',
  reviewCount: '[data-testid="approval-review-count"]',
  whoAnswers: '[data-testid="approval-who-answers"]',
  budget: '[data-testid="approval-budget"]',
};

async function dump(label, q) {
  const ask = askBy(page, q);
  await ask.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  console.log(`\n== ${label}`);
  for (const [k, sel] of Object.entries(SEL)) {
    const loc = ask.locator(sel);
    const c = await loc.count();
    console.log(`  ${k.padEnd(15)} ${c ? t(await loc.first().innerText()) : '<absent>'}`);
  }
  return ask;
}

const a = await dump('R2A · 125000/3/7', 'library elevations');
await shot(page, '01-ask-r2a-1280');
const z = await dump('R2RET · 0/0/0', 'stair rail turn');
await shot(page, '01b-ask-zero-delta');

// pull-quote: is the question drawn as a quote?
const qStyle = await a.locator(SEL.question).first().evaluate((el) => {
  const cs = getComputedStyle(el);
  return { tag: el.tagName, font: cs.fontFamily.split(',')[0], size: cs.fontSize, style: cs.fontStyle, color: cs.color, cls: el.className };
});
console.log('\nquestion style:', JSON.stringify(qStyle));
const attr = await a.locator(SEL.attribution).first().evaluate((el) => {
  const cs = getComputedStyle(el);
  return { text: el.textContent, color: cs.color, size: cs.fontSize };
});
console.log('attribution:', JSON.stringify(attr));

await browser.close();
