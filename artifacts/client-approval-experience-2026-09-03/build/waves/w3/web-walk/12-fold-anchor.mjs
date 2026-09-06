import { open, signIn, openHouse, shot, t, IDS, BASE } from './lib.mjs';
const BEYOND = '8ed2b4e7-4554-4081-85dd-ccd44b84338a'; // 4th record, behind the fold
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);

async function probe(hash, label) {
  await openHouse(page, hash);
  await page.waitForTimeout(4000);
  const r = await page.evaluate((id) => {
    const sec = document.querySelector('[data-testid="approval-records"]');
    const el = document.getElementById(`approval-${id}`);
    const shown = sec ? sec.querySelectorAll('[data-testid="doorstep-approval-receipt"]').length : 0;
    const fold = sec ? /Read the earlier approvals/i.test(sec.innerText) : false;
    const rect = el ? el.getBoundingClientRect() : null;
    return {
      recordsShown: shown, foldActStillThere: fold,
      elementPresent: !!el,
      elTopViewport: rect ? Math.round(rect.top) : null,
      scrollY: Math.round(window.scrollY),
      inViewport: rect ? rect.top > -50 && rect.top < window.innerHeight : false,
      hash: location.hash,
    };
  }, hash.replace('#approval-',''));
  console.log(`\n[${label}] ${hash}`);
  console.log(' ', JSON.stringify(r));
  return r;
}

await probe(`#approval-${BEYOND}`, 'record BEYOND the fold');
await shot(page, '14-fold-opened-by-address', false);
await probe(`#approval-${IDS.g3approved}`, 'record INSIDE the fold');
await probe('#approval-00000000-0000-0000-0000-000000000000', 'address naming nothing here');
const r = await probe(`#approval-${IDS.successor}`, 'the successor, an OPEN ask');
const succ = page.locator(`#approval-${IDS.successor}`);
console.log('  continuation on arrival:', t(await succ.locator('[data-testid="approval-continuation"]').first().innerText()));
console.log('  changed block on arrival:', t(await succ.locator('[data-testid="approval-changed-since"]').first().innerText()));
await shot(page, '15-successor-by-address', false);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(800);
await shot(page, '15b-successor-390', false);
await browser.close();
