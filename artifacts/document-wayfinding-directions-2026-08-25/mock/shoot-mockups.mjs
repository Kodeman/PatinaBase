// Renders mock/mockups.html full-page at 1600 wide.
// Run from apps/designer-portal so the workspace @playwright/test resolves:
//   cd apps/designer-portal
//   node --input-type=module -e "$(cat ../../artifacts/document-wayfinding-directions-2026-08-25/mock/shoot-mockups.mjs)"
import { chromium } from '@playwright/test';
import path from 'node:path';

const DIR = '/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/mock';
const url = 'file://' + path.join(DIR, 'mockups.html');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
await page.emulateMedia({ colorScheme: 'light' });
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(DIR, 'mockups.png'), fullPage: true });
console.log('wrote mockups.png');
await browser.close();
