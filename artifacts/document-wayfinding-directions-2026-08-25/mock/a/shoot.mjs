// Renders each Direction A screen from mock/direction-a.html.
// Run from apps/designer-portal so the workspace @playwright/test resolves:
//   cd apps/designer-portal
//   node --input-type=module -e "$(cat <this file>)"
import { chromium } from '@playwright/test';
import path from 'node:path';

const DIR = '/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/mock';
const url = 'file://' + path.join(DIR, 'direction-a.html');

const SCREENS = [
  { id: 'M1', width: 1440 },
  { id: 'M2', width: 1440 },
  { id: 'M3', width: 1280 },
  { id: 'M4', width: 390 },
  { id: 'M5', width: 1440 },
];

const browser = await chromium.launch();

for (const { id, width } of SCREENS) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: 'body{margin:0}.a-sheetstack{padding:0;gap:0}.a-sheetstack>header{display:none}.mock-frame{border:none;border-radius:0;display:block}' });
  await page.evaluate(() => document.fonts.ready);
  const el = await page.$(`[data-screen="${id}"]`);
  await el.screenshot({ path: path.join(DIR, 'a', `${id}.png`) });
  console.log('wrote', `${id}.png`);
  if (id === 'M2') {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.evaluate(() => document.fonts.ready);
    await el.screenshot({ path: path.join(DIR, 'a', 'M2-dark.png') });
    console.log('wrote M2-dark.png');
  }
  await page.close();
}

await browser.close();
