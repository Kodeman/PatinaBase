import { launch, shot, dismissOverlays, DESIGNER, HERE } from './lib.mjs';

const { browser, ctx } = await launch({ state: `${HERE}/designer-state.json` });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await page.goto(`${DESIGNER}/desk?account=studio`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(10000);
await dismissOverlays(page);
await page.waitForTimeout(1500);

const dlg = page.locator('[role="dialog"]').last();
// scroll the Licensing card into view
await dlg.getByText('LICENSING', { exact: false }).first().scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await shot(page, '07a-licensing-card');

// dump the card's html to learn the controls
const html = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll('div'));
  const card = all.find((d) => d.innerText?.trim().startsWith('LICENSING') && d.innerText.includes('SAVE ATTESTATION'));
  return card ? card.outerHTML.slice(0, 7000) : 'NOT FOUND';
});
console.log(html);
await browser.close();
