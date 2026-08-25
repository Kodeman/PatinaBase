// Renders each Direction B screen frame to a PNG.
// Run from apps/designer-portal so `@playwright/test` resolves:
//   cd apps/designer-portal
//   node --input-type=module -e "$(cat ../../artifacts/document-wayfinding-directions-2026-08-25/mock/b/shoot.mjs)"
import { chromium } from '@playwright/test';
import path from 'node:path';

const DIR = '/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/mock/b';
const url = 'file://' + path.join(DIR, '..', 'direction-b.html');

const screens = [
  { id: 'M1', w: 1440, h: 1300 },
  { id: 'M2', w: 1440, h: 1300, dark: true },
  { id: 'M3', w: 1280, h: 1100 },
  { id: 'M4', w: 390, h: 1400 },
  { id: 'M5', w: 1440, h: 1300 },
];

const browser = await chromium.launch();

for (const s of screens) {
  const page = await browser.newPage({ viewport: { width: s.w, height: Math.min(s.h + 160, 2000) } });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const el = await page.locator(`[data-screen="${s.id}"]`);
  const out = path.join(DIR, `${s.id}.png`);
  await el.screenshot({ path: out });
  console.log('wrote', out);

  // overflow probe: report any element whose box escapes its frame
  const probe = await page.evaluate((id) => {
    const frame = document.querySelector(`[data-screen="${id}"] .b-inner`);
    const fr = frame.getBoundingClientRect();
    const bad = [];
    for (const el of frame.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > fr.right + 0.6 || r.left < fr.left - 0.6) {
        bad.push({ cls: el.className.toString().slice(0, 48), tag: el.tagName, right: Math.round(r.right - fr.right), left: Math.round(fr.left - r.left) });
      }
    }
    const inner = frame.firstElementChild;
    return { horizontal: bad.slice(0, 12), contentHeight: Math.round(inner.scrollHeight), frameHeight: Math.round(fr.height) };
  }, s.id);
  console.log(s.id, 'contentH', probe.contentHeight, 'frameH', probe.frameHeight, 'hoverflow', JSON.stringify(probe.horizontal));

  if (s.dark) {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.fonts.ready);
    const outd = path.join(DIR, `${s.id}-dark.png`);
    await el.screenshot({ path: outd });
    console.log('wrote', outd);
  }
  await page.close();
}

// shadow audit across the whole deck
const audit = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await audit.goto(url, { waitUntil: 'load' });
const shadows = await audit.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    if (cs.boxShadow && cs.boxShadow !== 'none') out.push('box-shadow:' + el.className);
    if (cs.filter && cs.filter !== 'none') out.push('filter:' + el.className);
    if (cs.textShadow && cs.textShadow !== 'none') out.push('text-shadow:' + el.className);
  }
  return out.slice(0, 20);
});
console.log('SHADOWS', JSON.stringify(shadows));
await audit.close();

await browser.close();
