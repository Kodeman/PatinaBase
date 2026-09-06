import { open, signIn, openHouse, IDS } from './lib-r2.mjs';
function ratio(fg, bg) {
  const lum = (c) => { const [r,g,b] = c.match(/\d+/g).slice(0,3).map(v=>{const s=Number(v)/255;return s<=0.03928?s/12.92:((s+0.055)/1.055)**2.4;}); return 0.2126*r+0.7152*g+0.0722*b; };
  const a = lum(fg), b = lum(bg); return ((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toFixed(2);
}
const { browser, page } = await open({ width: 1280, height: 1400 });
await signIn(page);
await openHouse(page);
await page.waitForTimeout(4000);
const ask = page.locator(`#approval-${IDS.successor}`);
await ask.scrollIntoViewIfNeeded();
const rows = await ask.evaluate((el) => {
  const bg = getComputedStyle(document.body).backgroundColor;
  const pick = (sel, tag) => [...el.querySelectorAll(sel)].map((e) => {
    const c = getComputedStyle(e);
    return { tag, text: e.innerText.replace(/\s+/g,' ').trim().slice(0,40), color: c.color, size: c.fontSize, weight: c.fontWeight, bg };
  });
  return [
    ...pick('[data-testid="approval-snooze"] button', 'snooze act'),
    ...pick('[data-testid="approval-outcomes"] button', 'outcome act'),
    ...pick('[data-testid="approval-snooze-said"]', 'said line'),
    ...pick('[data-testid="approval-deltas"]', 'delta rail'),
  ];
});
for (const r of rows) console.log(`${r.tag.padEnd(12)} "${r.text}" ${r.color} @${r.size}/${r.weight} → ${ratio(r.color, r.bg)}:1`);
await browser.close();
