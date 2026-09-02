const { chromium } = require('/Users/kody/Code/patina-merged/apps/designer-portal/node_modules/@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = '/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25';
const SHELL = path.join(BASE, 'mock/deck-parts/qa-shell.html');
const QADIR = path.join(BASE, 'mock/deck-qa');
const URL = 'file://' + SHELL;

const SECTIONS = [
  'cover', 'ask', 'reading', 'voices', 'stays-true', 'planks',
  'direction-a', 'direction-b', 'compare', 'recommendation', 'questions', 'colophon'
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const THEMES = ['light', 'dark'];

async function main() {
  const browser = await chromium.launch();
  const results = {
    requests: new Set(),
    blockedRequests: [],
    consoleErrors: [],
    pageErrors: [],
    scrollWidthChecks: [],
    boxShadowCounts: {},
    contrastSamples: {},
    fontChecks: {},
    themeInvertChecks: {},
    indexClickTest: null,
    fileSizeBytes: fs.statSync(path.join(BASE, 'presentation.html')).size,
    titleCheck: null,
    screenshots: [],
  };

  // title check: first 8KB of presentation.html
  const first8k = fs.readFileSync(path.join(BASE, 'presentation.html'), { encoding: 'utf8' }).slice(0, 8192);
  results.titleCheck = /<title>[^<]*<\/title>/.test(first8k);

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });
      const page = await context.newPage();

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          results.consoleErrors.push(`[${vp.name}/${theme}] ${msg.text()}`);
        }
      });
      page.on('pageerror', (err) => {
        results.pageErrors.push(`[${vp.name}/${theme}] ${err.message}`);
      });
      page.on('request', (req) => {
        const u = req.url();
        results.requests.add(u);
        const ok = u.startsWith('file://') ||
          u.startsWith('https://fonts.googleapis.com') ||
          u.startsWith('https://fonts.gstatic.com') ||
          u.startsWith('data:');
        if (!ok) {
          results.blockedRequests.push(`[${vp.name}/${theme}] ${u}`);
        }
      });

      await page.goto(URL, { waitUntil: 'networkidle' });
      // theme override via data-theme attr as emulateMedia handles colorScheme but page has its own toggle logic reading prefers-color-scheme when mode=system (default) -- emulateMedia should suffice since root has no data-theme attr by default
      await page.waitForTimeout(300);

      // scroll width check
      const dims = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      results.scrollWidthChecks.push({
        viewport: vp.name, theme,
        scrollWidth: dims.scrollWidth, innerWidth: dims.innerWidth,
        ok: dims.scrollWidth <= dims.innerWidth,
      });

      // box-shadow count
      const shadowCount = await page.evaluate(() => {
        const all = document.querySelectorAll('*');
        let n = 0;
        const examples = [];
        all.forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.boxShadow && cs.boxShadow !== 'none') {
            n += 1;
            if (examples.length < 5) {
              examples.push(el.tagName + (el.className ? '.' + String(el.className).split(' ').join('.') : ''));
            }
          }
        });
        return { n, examples };
      });
      results.boxShadowCounts[`${vp.name}/${theme}`] = shadowCount;

      // font check: sample computed fontFamily on headings and labels
      const fonts = await page.evaluate(() => {
        function fam(sel) {
          const el = document.querySelector(sel);
          if (!el) return null;
          return getComputedStyle(el).fontFamily;
        }
        return {
          coverHeading: fam('#cover-h'),
          askHeading: fam('#ask-h'),
          body: fam('main'),
        };
      });
      results.fontChecks[`${vp.name}/${theme}`] = fonts;

      // contrast samples: pick 10 text nodes, compute contrast of color vs background
      const contrast = await page.evaluate(() => {
        function parseColor(str) {
          const m = str.match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
          return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
        }
        function relLum(c) {
          function chan(v) {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
          }
          return 0.2126 * chan(c.r) + 0.7152 * chan(c.g) + 0.0722 * chan(c.b);
        }
        function contrastRatio(c1, c2) {
          const l1 = relLum(c1);
          const l2 = relLum(c2);
          const lighter = Math.max(l1, l2);
          const darker = Math.min(l1, l2);
          return (lighter + 0.05) / (darker + 0.05);
        }
        function effectiveBg(el) {
          let node = el;
          while (node) {
            const cs = getComputedStyle(node);
            const bg = parseColor(cs.backgroundColor);
            if (bg && bg.a > 0.05) return bg;
            node = node.parentElement;
          }
          return { r: 255, g: 255, b: 255, a: 1 };
        }
        // walk text nodes
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const rect = parent.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        });
        const samples = [];
        let node;
        let count = 0;
        const seen = new Set();
        while ((node = walker.nextNode()) && samples.length < 10) {
          count += 1;
          if (count % 37 !== 1) continue; // spread sampling across doc
          const parent = node.parentElement;
          const key = parent.tagName + parent.className;
          if (seen.has(key)) continue;
          seen.add(key);
          const cs = getComputedStyle(parent);
          const fg = parseColor(cs.color);
          if (!fg) continue;
          const bg = effectiveBg(parent);
          const ratio = contrastRatio(fg, bg);
          samples.push({
            text: node.textContent.trim().slice(0, 40),
            tag: parent.tagName,
            className: String(parent.className).slice(0, 60),
            fg: cs.color, bg: `rgb(${bg.r},${bg.g},${bg.b})`,
            ratio: Math.round(ratio * 100) / 100,
          });
        }
        return samples;
      });
      results.contrastSamples[`${vp.name}/${theme}`] = contrast;

      // dark mode invert check: sample body background
      const bg = await page.evaluate(() => {
        const el = document.querySelector('main') || document.body;
        return getComputedStyle(document.body).backgroundColor;
      });
      results.themeInvertChecks[`${vp.name}/${theme}`] = bg;

      // screenshots: full page
      const fpName = `full-${vp.name}-${theme}.png`;
      await page.screenshot({ path: path.join(QADIR, fpName), fullPage: true });
      results.screenshots.push(fpName);

      // per-section screenshots (only need once per vp/theme combo but do all per instructions)
      for (const secId of SECTIONS) {
        const el = await page.$(`#${secId}`);
        if (!el) {
          results.pageErrors.push(`[${vp.name}/${theme}] missing section #${secId}`);
          continue;
        }
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(80);
        const shotName = `sec-${secId}-${vp.name}-${theme}.png`;
        await el.screenshot({ path: path.join(QADIR, shotName) });
        results.screenshots.push(shotName);
      }

      // index click test only once (desktop/light)
      if (vp.name === 'desktop' && theme === 'light') {
        const clickTargets = ['direction-b', 'compare', 'colophon'];
        const clickResults = [];
        for (const target of clickTargets) {
          const link = await page.$(`#dk-spine-list a[href="#${target}"]`);
          if (!link) {
            clickResults.push({ target, ok: false, reason: 'link not found' });
            continue;
          }
          await link.click();
          await page.waitForTimeout(400);
          const inView = await page.evaluate((id) => {
            const el = document.getElementById(id);
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.top < window.innerHeight * 0.6 && r.bottom > 0;
          }, target);
          clickResults.push({ target, ok: inView });
        }
        results.indexClickTest = clickResults;
      }

      await context.close();
    }
  }

  await browser.close();

  results.requests = Array.from(results.requests);
  fs.writeFileSync(path.join(QADIR, 'qa-results.json'), JSON.stringify(results, null, 2));
  console.log('DONE');
  console.log('screenshots:', results.screenshots.length);
  console.log('blockedRequests:', results.blockedRequests.length);
  console.log('consoleErrors:', results.consoleErrors.length);
  console.log('pageErrors:', results.pageErrors.length);
}

main().catch((e) => {
  console.error('QA SCRIPT FAILED', e);
  process.exit(1);
});
