import { open, signIn, openHouse, t, IDS } from './lib-r2.mjs';
const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(4000);
const pd = page.locator(`#approval-${IDS.g6overdue}`);
await pd.scrollIntoViewIfNeeded();
const h2 = await pd.evaluate((el) => {
  const h = el.querySelector('h2');
  return [...h.childNodes].map((n) => {
    if (n.nodeType === 3) return { kind: 'text', text: n.textContent.trim() };
    const c = getComputedStyle(n);
    return {
      kind: n.tagName, cls: (n.className || '').toString().slice(0, 80),
      text: n.textContent.trim(),
      position: c.position, w: c.width, h: c.height, clip: c.clip, clipPath: c.clipPath,
      visible: !!n.getClientRects().length && c.width !== '1px',
    };
  });
});
console.log('h2 children:', JSON.stringify(h2, null, 1));
await browser.close();
