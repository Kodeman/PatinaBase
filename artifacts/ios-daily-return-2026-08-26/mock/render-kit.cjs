// Render the Patina iOS mock kit demo to PNGs for calibration against the
// 2026-08-26 simulator walk in shots/.
//   node render-kit.cjs
// Playwright is borrowed from the designer-portal workspace by absolute path
// (same pattern as document-wayfinding-directions-2026-08-25/mock/deck-parts/qa-run.cjs).
const { chromium } = require('/Users/kody/Code/patina-merged/apps/designer-portal/node_modules/@playwright/test');
const path = require('path');
const fs = require('fs');

const MOCK = '/Users/kody/Code/patina-merged/artifacts/ios-daily-return-2026-08-26/mock';
const URL = 'file://' + path.join(MOCK, 'kit-demo.html');

const OUT = {
  light: path.join(MOCK, 'kit-demo-light.png'),
  dark: path.join(MOCK, 'kit-demo-dark.png'),
  today: path.join(MOCK, 'cal-today.png'),
  browse: path.join(MOCK, 'cal-browse.png'),
};

const report = {
  url: URL,
  consoleErrors: [],
  pageErrors: [],
  requestFailures: [],
  fontRequests: [],
  fontsLoaded: null,
  written: [],
};

function wire(page, tag) {
  page.on('console', (m) => {
    if (m.type() === 'error') report.consoleErrors.push(`[${tag}] ${m.text()}`);
  });
  page.on('pageerror', (e) => report.pageErrors.push(`[${tag}] ${e.message}`));
  page.on('requestfailed', (r) => {
    report.requestFailures.push(`[${tag}] ${r.url()} — ${(r.failure() || {}).errorText}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) {
      report.fontRequests.push(`[${tag}] ${r.status()} ${u}`);
    }
  });
}

async function settle(page) {
  await page.evaluate(() => document.fonts.ready);
  // let webfont swap + lazy image decode land before the shutter
  await page.evaluate(() => Promise.all(
    Array.from(document.images)
      .filter((i) => !i.complete)
      .map((i) => new Promise((res) => { i.onload = i.onerror = res; })),
  ));
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch();

  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1000 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
    });
    const page = await context.newPage();
    wire(page, scheme);
    await page.goto(URL, { waitUntil: 'load' });
    await settle(page);

    if (scheme === 'light') {
      report.fontsLoaded = await page.evaluate(() => {
        const fams = new Set();
        document.fonts.forEach((f) => { if (f.status === 'loaded') fams.add(`${f.family} ${f.weight}`); });
        return Array.from(fams).sort();
      });
    }

    await page.screenshot({ path: OUT[scheme], fullPage: true });
    report.written.push(OUT[scheme]);

    // element shots of the two calibration replicas (light frames only)
    if (scheme === 'light') {
      for (const [key, sel] of [['today', '#cal-today'], ['browse', '#cal-browse']]) {
        const el = await page.$(sel);
        if (!el) {
          report.pageErrors.push(`[light] missing ${sel}`);
          continue;
        }
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(150);
        await el.screenshot({ path: OUT[key] });
        report.written.push(OUT[key]);
      }
    }

    await context.close();
  }

  await browser.close();

  fs.writeFileSync(path.join(MOCK, 'render-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error('RENDER FAILED', e);
  process.exit(1);
});
