// Render check for the hour-tracking deck. Read-only; writes only into review/shots/.
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');

const SRC = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/deck/src/index.html';
const OUT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';

const body = fs.readFileSync(SRC, 'utf8');
// Mirror the Artifact publish wrapper: charset + viewport meta, small reset, zero body margin.
const wrapped = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>:root{color-scheme:light}body{margin:0;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fbfaf8}img{max-width:100%}[hidden]{display:none!important}</style>
</head><body style="margin:0">${body}</body></html>`;
const wrappedPath = path.join(OUT, '_wrapped.html');
fs.writeFileSync(wrappedPath, wrapped);
const url = 'file://' + wrappedPath;

const cases = [
  { name: '1440-light', w: 1440, h: 900, scheme: 'light' },
  { name: '1440-dark',  w: 1440, h: 900, scheme: 'dark'  },
  { name: '390-light',  w: 390,  h: 844, scheme: 'light' },
  { name: '390-dark',   w: 390,  h: 844, scheme: 'dark'  },
];

(async () => {
  const browser = await chromium.launch();
  const report = [];
  for (const c of cases) {
    const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, colorScheme: c.scheme, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(600);

    const metrics = await page.evaluate(() => {
      const de = document.documentElement;
      const vw = window.innerWidth;
      // real overflow: any element whose painted box crosses the viewport edge,
      // found despite body{overflow-x:hidden} which hides documentElement.scrollWidth growth
      const over = [];
      document.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return;
        if (r.right > vw + 1 || r.left < -1) {
          over.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.getAttribute('class') || '').slice(0, 60),
            left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width)
          });
        }
      });
      // scrollers that actually clip
      const clipped = [];
      document.querySelectorAll('.scroller').forEach((el, i) => {
        if (el.scrollWidth > el.clientWidth + 1) {
          clipped.push({ i, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, tabindex: el.getAttribute('tabindex') });
        }
      });
      const bodyCS = getComputedStyle(document.body);
      const idx = document.getElementById('idx');
      return {
        vw,
        docScrollWidth: de.scrollWidth,
        docClientWidth: de.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        bodyBg: bodyCS.backgroundColor,
        bodyColor: bodyCS.color,
        bodyFont: bodyCS.fontFamily,
        bodyPadL: bodyCS.paddingLeft,
        bodyOverflowX: bodyCS.overflowX,
        docHeight: de.scrollHeight,
        slides: document.querySelectorAll('.slide').length,
        overflowing: over.slice(0, 25),
        overflowCount: over.length,
        clippedScrollers: clipped,
        idxRight: idx ? Math.round(idx.getBoundingClientRect().right) : null,
        idxPointer: idx ? getComputedStyle(idx).pointerEvents : null,
        focusables: document.querySelectorAll('a[href],button,[tabindex]:not([tabindex="-1"]),input,select,textarea').length,
      };
    });

    // keyboard check: ArrowDown / j should move the index readout
    const before = await page.evaluate(() => ({ y: window.scrollY, n: document.getElementById('idxn').textContent }));
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => ({ y: window.scrollY, n: document.getElementById('idxn').textContent }));
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(900);
    const back = await page.evaluate(() => ({ y: window.scrollY, n: document.getElementById('idxn').textContent }));
    // Tab from top: first focus target
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.keyboard.press('Tab');
    const firstFocus = await page.evaluate(() => {
      const a = document.activeElement;
      return a ? a.tagName.toLowerCase() + '.' + (a.getAttribute('class') || '') + ' -> ' + (a.getAttribute('href') || '') : 'none';
    });

    await page.screenshot({ path: path.join(OUT, `deck-${c.name}-top.png`) });
    await page.evaluate(() => document.getElementById('sheet-3').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `deck-${c.name}-sheet3.png`) });
    await page.evaluate(() => document.getElementById('sheet-14').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `deck-${c.name}-sheet14.png`) });
    if (c.w === 1440) {
      await page.screenshot({ path: path.join(OUT, `deck-${c.name}-full.png`), fullPage: true });
    }

    report.push({ case: c.name, metrics, keyboard: { before, after, back, firstFocus }, errs });
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'render-report.json'), JSON.stringify(report, null, 2));

  for (const r of report) {
    const m = r.metrics;
    console.log('=== ' + r.case + ' ===');
    console.log(`  innerWidth=${m.vw} doc.scrollWidth=${m.docScrollWidth} body.scrollWidth=${m.bodyScrollWidth} overflow-x=${m.bodyOverflowX}`);
    console.log(`  ASSERT doc.scrollWidth <= innerWidth : ${m.docScrollWidth <= m.vw ? 'PASS' : 'FAIL'}`);
    console.log(`  elements crossing the viewport edge: ${m.overflowCount}`);
    m.overflowing.forEach(o => console.log(`    ${o.tag}.${o.cls} left=${o.left} right=${o.right} w=${o.w}`));
    console.log(`  clipped .scroller containers: ${JSON.stringify(m.clippedScrollers)}`);
    console.log(`  body bg=${m.bodyBg} color=${m.bodyColor} padL=${m.bodyPadL}`);
    console.log(`  body font=${m.bodyFont}`);
    console.log(`  docHeight=${m.docHeight} slides=${m.slides} focusables=${m.focusables} idxRight=${m.idxRight} idxPointerEvents=${m.idxPointer}`);
    console.log(`  keyboard: ${JSON.stringify(r.keyboard)}`);
    console.log(`  errors: ${JSON.stringify(r.errs)}`);
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
