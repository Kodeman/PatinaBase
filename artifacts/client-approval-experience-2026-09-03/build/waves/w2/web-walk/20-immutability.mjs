import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r1';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);
await openHouse(page);
console.log('state'.padEnd(34), '| stamp'.padEnd(12), '| immutability sentence');
for (const a of await page.locator('[data-testid="doorstep-approval"]').all()) {
  const q = t(await a.locator('[data-testid="approval-question"]').first().textContent().catch(() => ''));
  const eyebrow = t(await a.locator('p').first().textContent().catch(() => ''));
  const stamp = t(await a.locator('[data-testid="approval-stamp"]').first().textContent().catch(() => '—')).split(' ')[0];
  const imm = t(await a.locator('[data-testid="immutability-sentence"]').first().textContent().catch(() => '(absent)'));
  const acts = await a.locator('[data-testid="approval-acts"]').count();
  console.log(String(eyebrow).slice(0, 32).padEnd(34), '|', String(stamp).slice(0, 10).padEnd(10), '| acts=' + acts + ' | ' + imm);
}
// the two states that matter, shot
for (const [q, name] of [['Does the household confirm it reviewed the issued plan set?', '21-draft-immutability'],
                         ['Do the library elevations read right to you?', '22-answered-immutability']]) {
  const a = askBy(page, q);
  if (await a.count()) { await a.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await a.screenshot({ path: `${SH}/${name}.png` }); }
}
await browser.close();
