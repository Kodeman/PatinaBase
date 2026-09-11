/* Round-2 render check for the hour-tracking deck.
   Run: cd apps/designer-portal && node <this file>
   Playwright resolves from that workspace's node_modules. */
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');

const DIR = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const SRC = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/deck/src/index.html';
const WRAP = path.join(DIR, '_r2wrapped.html');

const body = fs.readFileSync(SRC, 'utf8');
fs.writeFileSync(WRAP, `<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><style>:root{color-scheme:light dark}body{margin:0;font:14px system-ui;background:#faf7f2}img{max-width:100%}[hidden]{display:none!important}</style></head><body style="margin:0">\n${body}\n</body></html>`);

const URL = 'file://' + WRAP;
const out = { cases: [], checks: {} };

async function measure(page, label) {
  return await page.evaluate((label) => {
    const iw = window.innerWidth;
    const de = document.documentElement;
    // element-box probe: any painted box crossing the right edge
    const bad = [];
    document.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      if (cs.clipPath && cs.clipPath !== 'none') return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      if (r.right > iw + 0.5) {
        bad.push({ sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''), right: Math.round(r.right), w: Math.round(r.width) });
      }
    });
    // per-scroller clip
    const scrollers = Array.prototype.map.call(document.querySelectorAll('.scroller'), (s, i) => {
      const t = s.querySelector('table');
      return {
        i: i + 1,
        cls: t ? t.className : '',
        clientW: s.clientWidth,
        scrollW: s.scrollWidth,
        clipped: s.scrollWidth - s.clientWidth,
        overflowX: getComputedStyle(s).overflowX,
        tabindex: s.getAttribute('tabindex'),
        ariaLabel: s.getAttribute('aria-label'),
        role: s.getAttribute('role'),
      };
    });
    const main = document.querySelector('.main');
    const slideHeights = Array.prototype.map.call(document.querySelectorAll('.slide'), (s) => Math.round(s.getBoundingClientRect().height));
    const bodyCS = getComputedStyle(document.body);
    return {
      label, iw,
      scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
      scrollWidthAssertion: de.scrollWidth <= iw,
      bodyPadL: bodyCS.paddingLeft, bodyPadR: bodyCS.paddingRight, bodyBg: bodyCS.backgroundColor, bodyColor: bodyCS.color,
      mainW: main ? Math.round(main.getBoundingClientRect().width) : null,
      overflowingBoxes: bad.slice(0, 12), overflowCount: bad.length,
      scrollers, slideHeights,
      idxDisplay: getComputedStyle(document.getElementById('idx')).display,
    };
  }, label);
}

(async () => {
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(600);

    for (const w of [390, 768, 1024, 1200, 1201, 1280, 1440, 1600]) {
      await page.setViewportSize({ width: w, height: w === 390 ? 844 : 900 });
      await page.waitForTimeout(250);
      const m = await measure(page, `${w}-${scheme}`);
      m.consoleErrors = errs.slice();
      out.cases.push(m);
    }

    // screenshots at the two required sizes
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(250);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(DIR, `r2-${w}-${scheme}-top.png`) });
      for (const s of [3, 6, 14]) {
        await page.evaluate((n) => { document.getElementById('sheet-' + n).scrollIntoView({ behavior: 'auto', block: 'start' }); }, s);
        await page.waitForTimeout(200);
        await page.screenshot({ path: path.join(DIR, `r2-${w}-${scheme}-sheet${s}.png`) });
      }
      if (w === 1440) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(DIR, `r2-1440-${scheme}-full.png`), fullPage: true });
      }
    }
    await ctx.close();
  }

  // ---------- behavioural probes, light @1440 ----------
  const ctx = await browser.newContext({ colorScheme: 'light', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  // A. counter vs actual top slide, pressing ArrowRight
  const counter = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(900);
    const r = await page.evaluate(() => {
      const shown = document.getElementById('idxn').textContent;
      // actual = the slide occupying the viewport top band
      let actual = null;
      document.querySelectorAll('.slide').forEach((s) => {
        const r = s.getBoundingClientRect();
        if (r.top <= 2 && r.bottom > 2) actual = s.id;
      });
      return { shown, actual, y: Math.round(window.scrollY) };
    });
    counter.push(r);
  }
  out.checks.counterAfterArrowRight = counter;

  // B. deep-scroll inside a tall slide: does the counter lie and does "next" skip?
  out.checks.tallSlide = await page.evaluate(async () => {
    const s14 = document.getElementById('sheet-14');
    const h = s14.getBoundingClientRect().height;
    const top = s14.offsetTop;
    const res = [];
    for (const frac of [0.1, 0.4, 0.6, 0.85]) {
      window.scrollTo(0, Math.round(top + h * frac));
      await new Promise((r) => setTimeout(r, 120));
      // replicate nearest()
      let best = 0, bestD = Infinity, idx = 0;
      document.querySelectorAll('.slide').forEach((s, i) => {
        const d = Math.abs(s.getBoundingClientRect().top);
        if (d < bestD) { bestD = d; best = i; }
      });
      let visibleTop = null;
      document.querySelectorAll('.slide').forEach((s) => {
        const r = s.getBoundingClientRect();
        if (r.top <= 2 && r.bottom > 2) visibleTop = s.id;
      });
      res.push({ frac, slideHeight: Math.round(h), nearestIndexPlus1: best + 1, viewportTopSlide: visibleTop, labelShown: document.getElementById('idxn').textContent });
    }
    window.scrollTo(0, 0);
    return res;
  });

  // C. arrow keys inside a focused .scroller at 1440 (where clipping remains)
  out.checks.scrollerKeyboard = await page.evaluate(() => {
    const sc = Array.prototype.find.call(document.querySelectorAll('.scroller'), (s) => s.scrollWidth - s.clientWidth > 0);
    if (!sc) return { found: false };
    sc.focus();
    const focused = document.activeElement === sc;
    return { found: true, focused, clip: sc.scrollWidth - sc.clientWidth, table: sc.querySelector('table').className };
  });
  if (out.checks.scrollerKeyboard.found) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(300);
    out.checks.scrollerKeyboard.scrollLeftAfterArrowRight = await page.evaluate(() => {
      const sc = Array.prototype.find.call(document.querySelectorAll('.scroller'), (s) => s.scrollWidth - s.clientWidth > 0);
      return sc ? Math.round(sc.scrollLeft) : null;
    });
  }

  // D. vertical scroll with ArrowDown inside a tall slide
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const y0 = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400);
  const y1 = await page.evaluate(() => window.scrollY);
  out.checks.arrowDownScrolls = { y0, y1, moved: y1 - y0 };

  // E. tab order: how many focusable stops, and how many are dead scrollers
  out.checks.tabStops = await page.evaluate(() => {
    const all = Array.prototype.slice.call(document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]'));
    return all.map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: typeof el.className === 'string' ? el.className : '',
      ti: el.getAttribute('tabindex'),
      scrollable: el.scrollWidth - el.clientWidth > 0,
      name: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 40),
      role: el.getAttribute('role'),
    }));
  });

  // F. skip link focus behaviour
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.keyboard.press('Tab');
  out.checks.firstTabStop = await page.evaluate(() => {
    const a = document.activeElement;
    return { tag: a.tagName, cls: a.className, text: (a.textContent || '').trim() };
  });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  out.checks.afterSkipActivate = await page.evaluate(() => ({ active: document.activeElement.id || document.activeElement.tagName, y: Math.round(window.scrollY) }));

  // G. computed contrast of body ink on paper, both themes, read from the DOM
  out.checks.computed = {};
  for (const scheme of ['light', 'dark']) {
    const c2 = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 900 } });
    const p2 = await c2.newPage();
    await p2.goto(URL, { waitUntil: 'load' });
    await p2.waitForTimeout(300);
    out.checks.computed[scheme] = await p2.evaluate(() => {
      const g = (el, prop) => getComputedStyle(el)[prop];
      const td = document.querySelector('table.sheet td.lead');
      const idCell = document.querySelector('table.sheet td.id');
      const annK = document.querySelector('.ann .k');
      const vk = document.querySelector('.verdicts .k');
      const src = document.querySelector('table.sheet td.src');
      return {
        bodyBg: g(document.body, 'backgroundColor'), bodyColor: g(document.body, 'color'),
        tdColor: td ? g(td, 'color') : null, tdSize: td ? g(td, 'fontSize') : null,
        idColor: idCell ? g(idCell, 'color') : null, idSize: idCell ? g(idCell, 'fontSize') : null,
        annKColor: annK ? g(annK, 'color') : null, annKSize: annK ? g(annK, 'fontSize') : null,
        verdictKColor: vk ? g(vk, 'color') : null, verdictKSize: vk ? g(vk, 'fontSize') : null,
        srcColor: src ? g(src, 'color') : null, srcSize: src ? g(src, 'fontSize') : null,
        idxBg: g(document.getElementById('idx'), 'backgroundColor'),
        fonts: { d1: g(document.querySelector('.t-d1'), 'fontFamily'), body: g(document.body, 'fontFamily'), meta: g(document.querySelector('.t-meta'), 'fontFamily') },
      };
    });
    await c2.close();
  }

  // H. reduced motion honoured
  const c3 = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const p3 = await c3.newPage();
  await p3.goto(URL, { waitUntil: 'load' });
  await p3.waitForTimeout(300);
  out.checks.reducedMotion = await p3.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
  await c3.close();

  // I. explicit data-theme override both ways
  out.checks.themeOverride = {};
  for (const [osScheme, attr] of [['dark', 'light'], ['light', 'dark']]) {
    const c4 = await browser.newContext({ colorScheme: osScheme, viewport: { width: 1440, height: 900 } });
    const p4 = await c4.newPage();
    await p4.goto(URL, { waitUntil: 'load' });
    await p4.evaluate((a) => document.documentElement.setAttribute('data-theme', a), attr);
    await p4.waitForTimeout(200);
    out.checks.themeOverride[`os-${osScheme}+attr-${attr}`] = await p4.evaluate(() => ({
      bg: getComputedStyle(document.body).backgroundColor,
      color: getComputedStyle(document.body).color,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    }));
    await c4.close();
  }

  await ctx.close();
  await browser.close();
  fs.writeFileSync(path.join(DIR, 'r2-report.json'), JSON.stringify(out, null, 2));
  console.log('written', path.join(DIR, 'r2-report.json'));
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
