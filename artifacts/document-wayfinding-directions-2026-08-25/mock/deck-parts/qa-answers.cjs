// Revision-3 QA: horizontal-scroll re-check at both widths and both themes,
// plus the index numbering and one screenshot of the new answers section.
//   node mock/deck-parts/qa-answers.cjs
const { chromium } = require('/Users/kody/Code/patina-merged/apps/designer-portal/node_modules/@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = '/Users/kody/Code/patina-merged/artifacts/document-wayfinding-directions-2026-08-25';
const SHELL = path.join(BASE, 'mock/deck-parts/qa-shell.html');
const QADIR = path.join(BASE, 'mock/deck-qa');
const URL = 'file://' + SHELL;

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];
const THEMES = ['light', 'dark'];

async function main() {
  const browser = await chromium.launch();
  const out = [];
  const errors = [];

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
      });
      const page = await context.newPage();
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${vp.name}/${theme}] console: ${m.text()}`); });
      page.on('pageerror', (e) => errors.push(`[${vp.name}/${theme}] pageerror: ${e.message}`));
      await page.goto(URL, { waitUntil: 'load' });
      await page.waitForTimeout(400);

      const dims = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));

      // Any element inside the new section wider than its own section box?
      const wide = await page.evaluate(() => {
        const sec = document.getElementById('answers');
        if (!sec) return ['SECTION MISSING'];
        const lim = sec.clientWidth + 1;
        const bad = [];
        sec.querySelectorAll('*').forEach((el) => {
          if (el.scrollWidth > lim && !el.closest('.dk-scroll')) {
            bad.push(el.tagName + '.' + (el.className || '') + ' @' + el.scrollWidth);
          }
        });
        return bad.slice(0, 8);
      });

      out.push({
        vp: vp.name, theme,
        scrollWidth: dims.scrollWidth, innerWidth: dims.innerWidth,
        horizontalScroll: dims.scrollWidth > dims.innerWidth,
        overflowInAnswers: wide,
      });

      if (vp.name === 'desktop' && theme === 'light') {
        // index numbering, as generated
        const index = await page.evaluate(() =>
          Array.prototype.map.call(
            document.querySelectorAll('#dk-inline-index li a'),
            (a) => a.textContent.trim()
          )
        );
        const spine = await page.evaluate(() =>
          Array.prototype.map.call(
            document.querySelectorAll('#dk-spine-list li a'),
            (a) => a.textContent.trim()
          )
        );
        const eyebrow = await page.evaluate(() => {
          const s = document.getElementById('answers');
          return s ? s.querySelector('[data-eyebrow]').textContent.trim() : null;
        });
        const fonts = await page.evaluate(() => {
          const s = document.getElementById('answers');
          const g = (sel) => {
            const el = s.querySelector(sel);
            if (!el) return null;
            const cs = getComputedStyle(el);
            return cs.fontFamily.split(',')[0].replace(/["']/g, '') + ' / ' + cs.fontSize;
          };
          return { eyebrow: g('[data-eyebrow]'), h2: g('h2'), h4: g('.dk-q h4'), body: g('.dk-q p'), ask: g('.dk-ask') };
        });
        const shadows = await page.evaluate(() => {
          const s = document.getElementById('answers');
          let n = 0;
          s.querySelectorAll('*').forEach((el) => {
            const cs = getComputedStyle(el);
            if (cs.boxShadow && cs.boxShadow !== 'none') n += 1;
          });
          return n;
        });
        fs.writeFileSync(
          path.join(QADIR, 'answers-index.json'),
          JSON.stringify({ index, spine, eyebrow, fonts, shadowsInAnswers: shadows }, null, 2)
        );

        await page.locator('#answers').screenshot({
          path: path.join(QADIR, 'sec-answers-desktop-light.png'),
        });
      }

      await context.close();
    }
  }

  await browser.close();
  console.log(JSON.stringify({ scroll: out, errors }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
