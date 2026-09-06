import { open, signIn, shot, t, BASE, IDS, SOLO } from './lib.mjs';

// ---- A. the second seeded homeowner
{
  const { browser, page } = await open({ width: 1280, height: 1100 });
  await signIn(page, SOLO);
  console.log('solo signed in at', page.url());
  for (const [label, url] of [
    ['decision', `${BASE}/decisions/${IDS.predecessor}/record`],
    ['proposal', `${BASE}/proposals/${IDS.signedProposal}/record`],
  ]) {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    console.log(`\n[stranger ${label}] http=${resp && resp.status()} finalUrl=${page.url()}`);
    console.log('  text:', t(await page.evaluate(() => document.body.innerText)).slice(0, 400));
    console.log('  stamps:', await page.locator('[data-stamp-state]').count());
    await shot(page, `03-stranger-${label}`, true);
  }
  await browser.close();
}

// ---- B. print media emulation, as the owner
{
  const { browser, page } = await open({ width: 1280, height: 1400 });
  await signIn(page);
  for (const [label, url] of [
    ['decision', `${BASE}/decisions/${IDS.predecessor}/record`],
    ['proposal', `${BASE}/proposals/${IDS.signedProposal}/record`],
  ]) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    await page.emulateMedia({ media: 'print' });
    await page.waitForTimeout(500);
    const probe = await page.evaluate(() => {
      const st = document.querySelector('[data-stamp-state]');
      const sheet = document.querySelector('[data-testid="record-sheet"]') || st?.closest('article,section,div');
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const s = cs(st);
      const b = cs(document.body);
      const h = cs(document.documentElement);
      const sh = cs(sheet);
      // any element with a non-none box-shadow?
      const shadows = [...document.querySelectorAll('*')]
        .filter((e) => getComputedStyle(e).boxShadow !== 'none')
        .slice(0, 6)
        .map((e) => e.tagName + '.' + (e.className || '').toString().slice(0, 40));
      return {
        stampTransform: s?.transform, stampBg: s?.backgroundColor, stampShadow: s?.boxShadow,
        stampColor: s?.color,
        bodyBg: b?.backgroundColor, htmlBg: h?.backgroundColor,
        sheetBg: sh?.backgroundColor,
        shadowElements: shadows,
      };
    });
    console.log(`\n[print ${label}]`, JSON.stringify(probe, null, 1));
    await shot(page, `04-print-${label}`, true);
    await page.emulateMedia({ media: 'screen' });
  }
  await browser.close();
}
