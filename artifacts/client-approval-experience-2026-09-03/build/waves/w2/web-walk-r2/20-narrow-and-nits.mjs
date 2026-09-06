import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r2';
const { browser, page } = await open({ width: 390, height: 844 });
await signIn(page);
await openHouse(page);
const ask = askBy(page, 'study bookcase depth');
await ask.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
await ask.screenshot({ path: `${SH}/20-ask-390.png` });
await page.screenshot({ path: `${SH}/20b-doorstep-390-viewport.png` });
console.log('ledger @390 :', t(await ask.locator('[data-testid="approval-impact-ledger"]').first().innerText().catch(() => '(absent)')));
console.log('budget @390 :', await ask.locator('[data-testid="approval-budget"]').count());
const acts = ask.locator('[data-testid="approval-acts"] button');
for (let i = 0; i < await acts.count(); i++) {
  const b = acts.nth(i); const bb = await b.boundingBox();
  console.log(`  door "${t(await b.innerText())}" y=${bb && Math.round(bb.y)} inView=${bb ? bb.y >= 0 && bb.y + bb.height <= 844 : null}`);
}
// n1: the counting register — G6 lapsed row spells to twenty then prints figures
for (const q of ['response window has lapsed', 'household confirm it reviewed']) {
  const a = askBy(page, q);
  if (await a.count()) {
    await a.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
    console.log(`\n[${q}]`);
    console.log('  weighing:', t(await a.locator('[data-testid="approval-impact-sentence"]').first().innerText().catch(() => '(absent)')));
    console.log('  ledger  :', t(await a.locator('[data-testid="approval-impact-ledger"]').first().innerText().catch(() => '(absent)')));
    console.log('  budget  :', await a.locator('[data-testid="approval-budget"]').count());
  }
}
await browser.close();
