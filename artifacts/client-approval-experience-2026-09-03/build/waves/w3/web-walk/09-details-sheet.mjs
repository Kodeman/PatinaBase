import { open, signIn, openHouse, shot, t, IDS, BASE } from './lib.mjs';
const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(2000);
await page.locator('[data-testid="mat-details"]').getByText(/YOUR DETAILS/i).first().click();
await page.waitForTimeout(3000);
const info = await page.evaluate(() => {
  const radio = document.querySelector('input[value="weekly_sunday"]');
  if (!radio) return { found: false, body: document.body.innerText.slice(0,300) };
  const panel = radio.closest('section, [role="dialog"], form') || radio.parentElement.parentElement.parentElement;
  const dlg = radio.closest('[role="dialog"]');
  return {
    found: true,
    role: dlg ? 'dialog' : (panel.tagName + ' ' + (panel.getAttribute('data-testid')||'')),
    visible: !!radio.getClientRects().length,
    panel: (panel.innerText||'').replace(/\s+/g,' ').trim().slice(0,3000),
    full: (dlg ? dlg.innerText : document.body.innerText).replace(/\s+/g,' ').trim().slice(0,4000),
  };
});
console.log(JSON.stringify(info, null, 1));
await shot(page, '08-details-sheet-cadence', false);
await page.locator('input[value="weekly_sunday"]').first().scrollIntoViewIfNeeded().catch(()=>{});
await page.waitForTimeout(400);
await shot(page, '08b-details-cadence-closeup', false);
await browser.close();
