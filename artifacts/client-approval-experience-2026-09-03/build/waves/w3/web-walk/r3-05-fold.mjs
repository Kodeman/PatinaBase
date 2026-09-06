import { open, signIn, openHouse, shot, t, IDS } from './lib-r3.mjs';

/* The fold, and whether every forward act it draws lands on a card that is
   actually on the page. */

const { browser, page } = await open({ height: 1400 });
await signIn(page);

async function probe(hash, label) {
  await openHouse(page, hash);
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => {
    const ids = new Set(Array.from(document.querySelectorAll('[id]')).map((el) => el.id));
    const records = Array.from(document.querySelectorAll('[id^="approval-record-"]')).map((el) => el.id);
    const fwd = Array.from(document.querySelectorAll('[data-testid="approval-receipt-forward"]')).map((a) => {
      const target = (a.getAttribute('href') || '').replace('#', '');
      return { label: a.textContent.trim(), target, landsOnCard: ids.has(target) };
    });
    const foldAct = Array.from(document.querySelectorAll('button,a')).filter((el) =>
      /earlier|all \w+ record|show/i.test(el.textContent),
    ).map((el) => el.textContent.replace(/\s+/g, ' ').trim());
    return { recordCount: records.length, records, fwd, foldAct, scrollY: Math.round(window.scrollY) };
  });
  console.log(`\n== ${label} (${hash || 'no address'}) ==`);
  console.log('  records drawn:', state.recordCount, JSON.stringify(state.records, null, 1));
  console.log('  fold acts:', JSON.stringify(state.foldAct));
  console.log('  forward acts:', JSON.stringify(state.fwd, null, 1));
  console.log('  scrollY:', state.scrollY);
  return state;
}

await probe('', 'no address');
await probe(`#approval-${IDS.g8returned}`, 'a record behind the fold');
await shot(page, '14-fold-opened-by-address');
await probe('#approval-00000000-0000-0000-0000-000000000000', 'an address that names nothing');

await browser.close();
