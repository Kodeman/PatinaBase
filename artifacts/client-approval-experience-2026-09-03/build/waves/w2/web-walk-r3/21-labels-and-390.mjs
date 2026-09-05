import { open, signIn, openHouse, t, askBy } from './lib.mjs';
const SH = '/Users/kody/Code/patina-merged/artifacts/client-approval-experience-2026-09-03/build/waves/w2/web-walk-shots-r3';
{
  const { browser, page } = await open({ width: 1280, height: 1100 });
  await signIn(page); await openHouse(page);
  const c = await page.evaluate(() => {
    const out = {};
    for (const s of document.querySelectorAll('[data-testid="approval-discussion"]')) {
      const l = s.getAttribute('aria-label');
      out[l] = (out[l] || 0) + 1;
    }
    return out;
  });
  console.log('discussion landmark label census (1280):');
  for (const [k, v] of Object.entries(c)) console.log(`  ${String(v).padStart(2)}x  "${k}"`);
  console.log('  total landmarks:', Object.values(c).reduce((a, b) => a + b, 0), '| distinct names:', Object.keys(c).length);
  await browser.close();
}
{
  const { browser, page } = await open({ width: 390, height: 844 });
  await signIn(page); await openHouse(page);
  await page.screenshot({ path: `${SH}/21-doorstep-390.png`, fullPage: true });
  const ask = askBy(page, 'mudroom bench depth');
  await ask.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
  await page.screenshot({ path: `${SH}/22-ask-390.png` });
  const acts = ask.locator('[data-testid="approval-acts"]');
  console.log('\n--- three doors at 390, before choosing ---');
  for (const b of await acts.locator('button').all()) {
    const bb = await b.boundingBox();
    console.log('  ', JSON.stringify(t(await b.innerText())).padEnd(12), 'y=', bb && Math.round(bb.y), 'inViewport=', bb ? bb.y >= 0 && bb.y + bb.height <= 844 : null);
  }
  await acts.locator('button').filter({ hasText: 'APPROVE' }).first().click();
  await page.waitForTimeout(500);
  await ask.locator('[data-testid="approval-signature"]').first().fill('Client User');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SH}/23-approve-armed-390.png` });
  const hold = await page.evaluate(() => {
    const h = document.querySelector('[data-hold-dock]');
    if (!h) return null; const b = h.getBoundingClientRect(); const cs = getComputedStyle(h);
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), position: cs.position, bottomCss: cs.bottom };
  });
  console.log('approval hold dock at 390:', JSON.stringify(hold));
  await browser.close();
}
