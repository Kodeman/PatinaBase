import { open, signIn, shot, t, IDS, BASE, PROJECT, settle } from './lib-r2.mjs';

const BEYOND = '8ed2b4e7-4554-4081-85dd-ccd44b84338a';
const { browser, page } = await open({ width: 1280, height: 1100 });
await signIn(page);

// ── the successor, arrived at by address
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);
await page.goto(`${BASE}/projects/${PROJECT}#approval-${IDS.successor}`, { waitUntil: 'domcontentloaded' });
await settle(page);
await page.waitForTimeout(4500);

const ask = page.locator(`#approval-${IDS.successor}`);
await ask.scrollIntoViewIfNeeded();
console.log('===== the successor ask, in order');
console.log(t(await ask.innerText()));

const parts = await ask.evaluate((el) => {
  const get = (id) => {
    const n = el.querySelector(`[data-testid="${id}"]`);
    return n ? n.innerText.replace(/\s+/g, ' ').trim() : null;
  };
  return {
    continuation: get('approval-continuation'),
    changedSince: get('approval-changed-since'),
    revisions: get('approval-revisions'),
    revisionActs: [...el.querySelectorAll('[data-testid="approval-revisions"] a')].map((a) => ({
      text: a.innerText.trim(), href: a.getAttribute('href'),
    })),
    scrolledTo: Math.round(el.getBoundingClientRect().top),
  };
});
console.log('\n----- pieces');
console.log(JSON.stringify(parts, null, 1));
await shot(page, '15-successor-by-address', false);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(900);
await ask.scrollIntoViewIfNeeded();
await shot(page, '22-successor-390', false);
await page.setViewportSize({ width: 1280, height: 1100 });

// ── the fold opens itself
async function fresh(hash, label) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.goto(`${BASE}/projects/${PROJECT}${hash}`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.waitForTimeout(4500);
  const r = await page.evaluate((id) => {
    const sec = document.querySelector('[data-testid="approval-records"]');
    const el = id ? document.getElementById(`approval-${id}`) : null;
    const rect = el ? el.getBoundingClientRect() : null;
    return {
      recordsShown: sec ? sec.querySelectorAll('[data-testid="doorstep-approval-receipt"]').length : 0,
      foldAct: sec ? /Read the earlier approvals/i.test(sec.innerText) : false,
      elementPresent: !!el,
      elTop: rect ? Math.round(rect.top) : null,
      scrollY: Math.round(window.scrollY),
    };
  }, hash.replace('#approval-', ''));
  console.log(`[${label}] ${hash || '(none)'}\n   ${JSON.stringify(r)}`);
  return r;
}

console.log('\n===== the fold, four probes (full document load each time)');
await fresh(`#approval-${BEYOND}`, 'record BEYOND the fold');
await shot(page, '14-fold-opened-by-address', false);
await fresh(`#approval-${IDS.g3approved}`, 'record INSIDE the fold');
await fresh('#approval-00000000-0000-0000-0000-000000000000', 'address naming nothing');
await fresh('', 'no address at all');

await browser.close();
