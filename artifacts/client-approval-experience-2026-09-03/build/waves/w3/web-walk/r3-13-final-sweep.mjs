import { open, signIn, openHouse, shot, t, BASE, IDS, axe } from './lib-r3.mjs';

/* A closing pass over the whole doorstep after every act this walk performed,
   plus the vocabulary sweep on the record sheets. */

const { browser, page } = await open({ height: 1400 });
await signIn(page);
await openHouse(page, `#approval-${IDS.g8returned}`); // opens the records fold
await page.waitForTimeout(2000);
await shot(page, '36-doorstep-1280', true);

const a = await axe(page);
console.log('== axe · doorstep, fold open, after every act ==');
for (const v of a.violations) console.log(`  [${v.impact}] ${v.id} ${v.nodes.length} — ${v.help}`);
console.log('  violation types:', a.violations.length);

const text = await page.evaluate(() => document.body.innerText);
const words = ['gate', 'task', 'overdue', 'dashboard', 'Declined', 'confetti', 'badge',
  'undone', 'reopened', 'reversed', 'void', 'right_away', 'weekly_sunday', 'click_through',
  'electronic_signature', 'portal_clickthrough', 'Re-engagement'];
console.log('  vocabulary:', JSON.stringify(Object.fromEntries(
  words.map((w) => [w, (text.match(new RegExp(w, 'g')) || []).length]))));
console.log('  emoji:', (text.match(/\p{Extended_Pictographic}/gu) || []).length);

/* the record sheets */
for (const [url, label] of [
  [`${BASE}/decisions/${IDS.fifth}/record`, 'decision record'],
  [`${BASE}/proposals/${IDS.signedProposal}/record`, 'proposal record'],
]) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('record-signature').waitFor({ state: 'visible', timeout: 60000 });
  const rt = await page.evaluate(() => document.body.innerText);
  console.log(`\n== ${label} vocabulary ==`);
  console.log('  ', JSON.stringify(Object.fromEntries(
    words.map((w) => [w, (rt.match(new RegExp(w, 'g')) || []).length])).valueOf?.() ?? {},
  ));
  console.log('  hits:', JSON.stringify(words.filter((w) => new RegExp(w).test(rt))));
  console.log('  emoji:', (rt.match(/\p{Extended_Pictographic}/gu) || []).length);
  console.log('  mark length:', (rt.match(/Mark ([0-9a-z]+)/i) || [])[1]?.length ?? null);
}

await browser.close();
