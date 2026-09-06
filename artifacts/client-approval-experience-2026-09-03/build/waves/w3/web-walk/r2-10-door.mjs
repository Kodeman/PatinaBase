import { open, signIn, shot, t, BASE, PROJECT, IDS, settle } from './lib-r2.mjs';
const { browser, page } = await open({ width: 1280, height: 1200 });
await signIn(page);
for (const q of [`?proposal=${IDS.signedProposal}#door`, '#door', '']) {
  await page.goto(`${BASE}/${q}`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => ({
    doorGate: document.querySelectorAll('[data-testid="door-gate"]').length,
    doorReceipt: document.querySelectorAll('[data-testid="door-receipt"]').length,
    doorKeep: document.querySelectorAll('[data-testid="door-keep-a-copy"]').length,
    anyKeep: [...document.querySelectorAll('a')].filter((a) => /keep a copy/i.test(a.innerText))
      .map((a) => a.getAttribute('href')),
  }));
  console.log(`[${q || '(bare)'}]`, JSON.stringify(r));
}
await shot(page, '07-door-probe', false);
// records fold at 390
await page.goto(`${BASE}/projects/${PROJECT}`, { waitUntil: 'domcontentloaded' });
await settle(page);
await page.waitForTimeout(3000);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(900);
await page.locator('[data-testid="approval-records"]').scrollIntoViewIfNeeded();
await shot(page, '24-records-390', false);
await browser.close();
