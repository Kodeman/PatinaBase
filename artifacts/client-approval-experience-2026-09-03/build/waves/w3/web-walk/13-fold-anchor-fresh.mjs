import { open, signIn, shot, t, IDS, BASE, PROJECT, settle } from './lib.mjs';
const BEYOND = '8ed2b4e7-4554-4081-85dd-ccd44b84338a';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);

async function fresh(hash, label) {
  // full document load every time: fragment-only goto is same-document in Chromium
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.goto(`${BASE}/projects/${PROJECT}${hash}`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.waitForTimeout(4000);
  const r = await page.evaluate((id) => {
    const sec = document.querySelector('[data-testid="approval-records"]');
    const el = document.getElementById(`approval-${id}`);
    const rect = el ? el.getBoundingClientRect() : null;
    return {
      recordsShown: sec ? sec.querySelectorAll('[data-testid="doorstep-approval-receipt"]').length : 0,
      foldAct: sec ? /Read the earlier approvals/i.test(sec.innerText) : false,
      elementPresent: !!el,
      elTop: rect ? Math.round(rect.top) : null,
      scrollY: Math.round(window.scrollY),
    };
  }, hash.replace('#approval-', ''));
  console.log(`[${label}] ${hash}\n   ${JSON.stringify(r)}`);
  return r;
}

await fresh(`#approval-${BEYOND}`, 'record BEYOND the fold');
await shot(page, '14-fold-opened-by-address', false);
await fresh(`#approval-${IDS.g3approved}`, 'record INSIDE the fold');
await fresh('#approval-00000000-0000-0000-0000-000000000000', 'address naming nothing');
await fresh('', 'no address at all');
await browser.close();
