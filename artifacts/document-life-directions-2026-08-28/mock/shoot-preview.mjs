// Screenshot mock/preview.html, one full-extent PNG per lane.
//
//   bash mock/build-preview.sh                          # writes mock/preview.html
//   cd /Users/kody/Code/patina-merged/apps/designer-portal
//   node /Users/kody/Code/patina-merged/artifacts/document-life-directions-2026-08-28/mock/shoot-preview.mjs
//
// Run from apps/designer-portal so `@playwright/test` resolves from its own
// node_modules -- this program carries none of its own. Needs the command
// sandbox off (headless Chromium cannot claim its mach port inside it).
// Writes mock/preview-{today,a,b,c}.png, one per lane <section id="lane-x">
// (an element screenshot, which captures the section's full height even past
// the viewport -- the "full-page per lane" this script produces).

import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW = path.join(HERE, 'preview.html');
const LANES = ['today', 'a', 'b', 'c'];

(async () => {
  if (!fs.existsSync(PREVIEW)) {
    console.error(`missing ${PREVIEW} -- run: bash mock/build-preview.sh`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto('file://' + PREVIEW, { waitUntil: 'load' });
  await page.waitForTimeout(300);

  let missing = 0;
  for (const lane of LANES) {
    const el = await page.$('#lane-' + lane);
    if (!el) {
      console.warn(`missing #lane-${lane} in preview.html`);
      missing += 1;
      continue;
    }
    const out = path.join(HERE, `preview-${lane}.png`);
    await el.screenshot({ path: out });
    console.log('wrote ' + out);
  }

  await browser.close();
  if (missing === LANES.length) {
    console.error('no lanes found -- is preview.html built from mock/build-preview.sh?');
    process.exit(1);
  }
})().catch((e) => {
  console.error('shoot-preview failed', e);
  process.exit(1);
});
