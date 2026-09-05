import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
const { browser, page } = await open({ width: 390, height: 844 });
await signIn(page);
await openHouse(page);
const ask = askBy(page, 'Do the library elevations read right to you?');
await ask.scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await ask.screenshot({ path: `${SH}/02-ask-g9-390.png` });
await page.screenshot({ path: `${SH}/02b-doorstep-390-viewport.png` });

const g = async (id) => t(await ask.locator(`[data-testid="${id}"]`).first().textContent().catch(() => '(absent)'));
console.log('390 BUDGET      :', await g('approval-budget'));
console.log('390 BUDGET DET  :', await g('approval-budget-details'));
console.log('390 BUDGET UNAV :', await g('approval-budget-unavailable'));
console.log('390 IMPACT      :', await g('approval-impact-sentence'));
console.log('390 LEDGER      :', await g('approval-impact-ledger'));

// doors reachable without scrolling? measure against viewport at the ask's top
const acts = ask.locator('[data-testid="approval-acts"]');
await ask.evaluate((el) => el.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(300);
for (const b of await acts.locator('button').all()) {
  const bb = await b.boundingBox();
  console.log('  door', JSON.stringify(t(await b.innerText())), 'y=', bb && Math.round(bb.y), 'inViewport=', bb ? bb.y >= 0 && bb.y + bb.height <= 844 : null);
}
await page.screenshot({ path: `${SH}/02c-ask-390-from-top.png` });
await browser.close();
