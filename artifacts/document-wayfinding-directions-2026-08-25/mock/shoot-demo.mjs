// One-off verification script for the mock kit demo. Node's ESM resolver
// walks up from the IMPORTING FILE's own path looking for node_modules, and
// this file lives outside apps/designer-portal, so a plain `node
// shoot-demo.mjs` cannot see the workspace's @playwright/test install. Run
// it via `node --input-type=module -e` instead, with cwd = designer-portal
// (that makes the eval context's resolution base the cwd):
//
//   cd apps/designer-portal
//   node --input-type=module -e "$(cat ../../artifacts/document-wayfinding-directions-2026-08-25/mock/shoot-demo.mjs)"
//
// (Also needs the sandbox disabled for the Chromium subprocess launch in
// this environment — a plain sandboxed run fails with
// "Permission denied" on the mach port rendezvous check.)
import { chromium } from '@playwright/test';
import path from 'node:path';

// Hardcoded rather than derived from import.meta.url: this file is executed
// via `node --input-type=module -e "$(cat shoot-demo.mjs)"` from
// apps/designer-portal (see header comment) so it resolves the workspace's
// @playwright/test install — under that invocation import.meta.url points
// at the eval context, not this file's real path.
const __dirname = '/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25/mock';
const demoPath = path.join(__dirname, 'kit-demo.html');
const url = 'file://' + demoPath;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });

for (const scheme of ['light', 'dark']) {
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto(url, { waitUntil: 'networkidle' });
  // Give web fonts a moment to finish swapping in.
  await page.evaluate(() => document.fonts.ready);
  const out = path.join(__dirname, `kit-demo-${scheme}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log('wrote', out);
}

await browser.close();
