import { open, signIn, openHouse, shot, t, IDS } from './lib-r3.mjs';

/* `W3W-R1-06`. The act along the thread lives in two places: `approval-
   revisions` on a LIVE ask, and `approval-receipt-forward` on a settled
   record row. Count both, on every card the doorstep draws, with the records
   fold OPEN. */

const { browser, page } = await open({ height: 1400 });
await signIn(page);

/* addressing a RECORD opens the fold (r1 §2) */
await openHouse(page, `#approval-${IDS.predecessor}`);
await page.waitForTimeout(1500);

const acts = await page.evaluate(() => {
  const rows = [];
  for (const el of document.querySelectorAll('[id^="approval-"]')) {
    if (!/^approval-(record-)?[0-9a-f]{8}-/.test(el.id)) continue;
    const rev = el.querySelector('[data-testid="approval-revisions"]');
    const fwd = el.querySelector('[data-testid="approval-receipt-forward"]');
    rows.push({
      id: el.id,
      revisions: rev
        ? Array.from(rev.querySelectorAll('a')).map((a) => `${a.textContent.trim()} → ${a.getAttribute('href')}`)
        : null,
      receiptForward: fwd ? `${fwd.textContent.trim()} → ${fwd.getAttribute('href')}` : null,
    });
  }
  return rows;
});
console.log('== every card, both act sites, fold OPEN ==');
for (const r of acts) console.log(' ', r.id, '\n     revisions:', JSON.stringify(r.revisions), '\n     receiptForward:', r.receiptForward);

const backward = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a')).filter((a) => /previous edition/i.test(a.textContent)).length,
);
const forward = await page.evaluate(() =>
  Array.from(document.querySelectorAll('a')).filter((a) => /revised edition/i.test(a.textContent)).length,
);
console.log('\n  "Review previous edition" anchors on the whole page:', backward);
console.log('  "Review revised edition" anchors on the whole page:', forward);

/* ink on the forward act — `W3W-R1-01` stayed closed? */
const ink = await page.evaluate(() => {
  const a = Array.from(document.querySelectorAll('a')).find((x) => /revised edition/i.test(x.textContent));
  if (!a) return null;
  const cs = getComputedStyle(a);
  return { color: cs.color, size: cs.fontSize, className: a.className };
});
console.log('  forward act ink:', JSON.stringify(ink));

await shot(page, '13-fold-open-forward-act', true);
await browser.close();
