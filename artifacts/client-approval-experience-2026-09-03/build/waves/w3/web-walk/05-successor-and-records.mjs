import { open, signIn, openHouse, shot, t, IDS, BASE } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(2500);

const succ = page.locator(`#approval-${IDS.successor}`);
console.log('=== SUCCESSOR ASK ===');
console.log(t(await succ.innerText()));
console.log('\n--- continuation:', t(await page.locator('[data-testid="approval-continuation"]').first().innerText()));
console.log('--- changed-since block:');
console.log(t(await page.locator('[data-testid="approval-changed-since"]').first().innerText()));
console.log('--- revisions (forward acts):');
const rev = page.locator('[data-testid="approval-revisions"]');
if (await rev.count()) {
  console.log(t(await rev.first().innerText()));
  const links = await rev.first().locator('a,button').all();
  console.log('   count of acts in revisions:', links.length);
  for (const l of links) console.log('   act:', t(await l.innerText()), '->', await l.getAttribute('href'));
} else console.log('   (none)');

console.log('\n=== RECORDS ===');
const recs = await page.locator('[data-testid="doorstep-approval-receipt"]').all();
console.log('receipts shown:', recs.length);
for (const r of recs) {
  console.log(' -', t(await r.innerText()).slice(0, 320));
}
const foldBtn = page.getByRole('button', { name: /read the earlier approvals/i });
console.log('fold act present:', await foldBtn.count());

console.log('\n=== KEEP A COPY ===');
const keeps = await page.getByRole('link', { name: /keep a copy/i }).all();
const keepBtns = await page.getByRole('button', { name: /keep a copy/i }).all();
console.log('keep-a-copy links:', keeps.length, 'buttons:', keepBtns.length);
for (const k of keeps) console.log('  link ->', await k.getAttribute('href'), '| target:', await k.getAttribute('target'), '| rel:', await k.getAttribute('rel'));

await shot(page, '06-successor-ask', true);
await browser.close();
