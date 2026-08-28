// Rendered QA for The Life Review deck.
//   node mock/deck-parts/qa-run.cjs
//
// Opens presentation.html the way a reader does (file:// straight at the deck)
// at 1440x900 and 390x844, in light and dark, and again with the deck's own
// toggle stamping data-theme on <html>.  Records, per pass:
//   - document.body / documentElement scrollWidth vs the viewport (no sideways scroll)
//   - console errors, page errors, failed and non-font external requests
//   - the font families the page actually loaded (document.fonts)
//   - every element whose box crosses the viewport edge
//   - every .dk-mock whose scaled viewport escapes its parent's width (no phone
//     frame in this kit — the mocks are desk/document screens, not a device)
//   - a computed-style sweep of every element's boxShadow (expect all 'none' — D4)
//   - text contrast samples on both registers (.reg-paper / .reg-dark)
//   - the sticky index: row count vs section count, stickiness, aria-current
//   - eyebrow (.hour) presence per section, and images that did not inline
// Captures every section to mock/deck-qa/<section>-<viewport>-<theme>.png and
// writes mock/deck-qa/qa-results.json.

const { chromium } = require('/Users/kody/Code/patina-merged/apps/designer-portal/node_modules/@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = '/Users/kody/Code/patina-merged/artifacts/document-life-directions-2026-08-28';
const DECK = path.join(ROOT, 'presentation.html');
const QADIR = path.join(ROOT, 'mock/deck-qa');
const SHELL = path.join(ROOT, 'mock/deck-parts/.qa-shell.html');
const URL = 'file://' + DECK;

const SECTIONS = [
  'cover', 'ask', 'today', 'found', 'planks',
  'direction-a', 'direction-b', 'direction-c', 'strip', 'mobile', 'compare',
  'recommendation', 'questions', 'colophon',
];

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
];

const THEMES = ['light', 'dark'];

const allowed = (u) =>
  u.startsWith('file://') ||
  u.startsWith('data:') ||
  u.startsWith('blob:') ||
  u.startsWith('https://fonts.googleapis.com') ||
  u.startsWith('https://fonts.gstatic.com');

// ---------------------------------------------------------------- in-page probes

const PROBE = function () {
  function parseColor(str) {
    const m = String(str).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function mix(fg, bg) {
    // composite a translucent foreground over its ground
    const a = fg.a === undefined ? 1 : fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
      a: 1,
    };
  }
  function relLum(c) {
    const ch = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function ratio(a, b) {
    const l1 = relLum(a);
    const l2 = relLum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function groundOf(el) {
    let node = el;
    while (node) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0.5) return c;
      node = node.parentElement;
    }
    const b = parseColor(getComputedStyle(document.body).backgroundColor);
    return b && b.a > 0.5 ? b : { r: 255, g: 255, b: 255, a: 1 };
  }

  const vw = document.documentElement.clientWidth;

  // ---- overflow: any element crossing the viewport edge
  const overflowers = [];
  document.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed') return;
    if (r.right > vw + 1 || r.left < -1) {
      // ignore elements inside a scroll container that is itself in bounds
      let p = el.parentElement;
      let clipped = false;
      while (p) {
        const pcs = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(pcs.overflowX)) { clipped = true; break; }
        p = p.parentElement;
      }
      if (clipped) return;
      if (overflowers.length < 40) {
        overflowers.push({
          tag: el.tagName,
          cls: String(el.className || '').slice(0, 70),
          left: Math.round(r.left),
          right: Math.round(r.right),
          section: el.closest('section') ? el.closest('section').id : null,
        });
      }
    }
  });

  // ---- mocks: each .dk-mock-viewport's rendered width vs its parent's width
  // (this kit draws desk/document screens scaled to fit a deck column, not a
  // phone frame — there is no device chrome to check for overflow).
  const mocks = [];
  document.querySelectorAll('.dk-mock').forEach((m, i) => {
    const viewport = m.querySelector('.dk-mock-viewport');
    if (!viewport) return;
    const parent = m.parentElement;
    const vr = viewport.getBoundingClientRect();
    const pr = parent ? parent.getBoundingClientRect() : null;
    mocks.push({
      i,
      section: m.closest('section') ? m.closest('section').id : null,
      dataW: m.getAttribute('data-w'),
      dataH: m.getAttribute('data-h'),
      renderedW: Math.round(vr.width),
      renderedH: Math.round(vr.height),
      parentW: pr ? Math.round(pr.width) : null,
      fitsParent: pr ? vr.width <= pr.width + 1 : null,
      pastViewport: vr.right > vw + 1,
    });
  });

  // ---- D4 computed-style sweep: no element may compute a real box-shadow.
  // Comments and CSS source can mention "box-shadow" — this checks what the
  // browser actually painted, which is the only thing that matters for D4.
  const shadowed = [];
  document.querySelectorAll('*').forEach((el) => {
    const bs = getComputedStyle(el).boxShadow;
    if (bs && bs !== 'none') {
      if (shadowed.length < 40) {
        shadowed.push({
          tag: el.tagName,
          cls: String(el.className || '').slice(0, 70),
          boxShadow: bs.slice(0, 120),
          section: el.closest('section') ? el.closest('section').id : null,
        });
      }
    }
  });

  // ---- contrast: sample both registers
  function sampleRegister(regSel, label) {
    const out = [];
    const seen = new Set();
    const scope = document.querySelectorAll(regSel + ' .dk-h1, ' + regSel + ' .dk-h2, ' +
      regSel + ' .dk-h3, ' + regSel + ' .dk-h4, ' + regSel + ' .dk-lede, ' +
      regSel + ' .dk-p, ' + regSel + ' .dk-note, ' + regSel + ' .hour, ' +
      regSel + ' .dk-frame-cap, ' + regSel + ' .sheet-table td, ' +
      regSel + ' .sheet-table th, ' + regSel + ' .dk-ul li');
    scope.forEach((el) => {
      if (out.length >= 14) return;
      const key = el.className || el.tagName;
      if (seen.has(key)) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      seen.add(key);
      const cs = getComputedStyle(el);
      const fgRaw = parseColor(cs.color);
      if (!fgRaw) return;
      const bg = groundOf(el);
      const fg = mix(fgRaw, bg);
      out.push({
        register: label,
        cls: String(el.className || el.tagName).slice(0, 50),
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        color: cs.color,
        bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        ratio: Math.round(ratio(fg, bg) * 100) / 100,
        text: (el.textContent || '').trim().slice(0, 44),
      });
    });
    return out;
  }

  // ---- sections: eyebrow, index title
  const sectionInfo = [...document.querySelectorAll('#dk-main > section')].map((s) => ({
    id: s.id,
    indexTitle: s.getAttribute('data-index-title'),
    day: s.getAttribute('data-day'),
    register: /reg-dark/.test(s.className) ? 'dark' : (/reg-paper/.test(s.className) ? 'paper' : 'none'),
    hasEyebrow: !!s.querySelector('.hour'),
    eyebrow: s.querySelector('.hour') ? s.querySelector('.hour').textContent.trim().slice(0, 60) : null,
    heading: s.querySelector('.dk-h1, .dk-h2') ? s.querySelector('.dk-h1, .dk-h2').textContent.trim().slice(0, 60) : null,
    height: Math.round(s.getBoundingClientRect().height),
  }));

  // ---- images
  const images = [...document.querySelectorAll('img')].map((im) => ({
    section: im.closest('section') ? im.closest('section').id : null,
    inlined: /^data:/.test(im.getAttribute('src') || ''),
    src: (im.getAttribute('src') || '').slice(0, 60),
    complete: im.complete,
    naturalW: im.naturalWidth,
    naturalH: im.naturalHeight,
    alt: (im.getAttribute('alt') || '').slice(0, 40),
  }));

  const idx = document.querySelector('.dk-index');
  const idxcs = idx ? getComputedStyle(idx) : null;

  return {
    scrollWidthDoc: document.documentElement.scrollWidth,
    scrollWidthBody: document.body.scrollWidth,
    clientWidth: vw,
    innerWidth: window.innerWidth,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    bodyColor: getComputedStyle(document.body).color,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    dataTheme: document.documentElement.getAttribute('data-theme'),
    overflowers,
    mocks,
    shadowed,
    contrast: sampleRegister('.reg-paper', 'paper').concat(sampleRegister('.reg-dark', 'dark')),
    sections: sectionInfo,
    images,
    index: idx ? {
      position: idxcs.position,
      top: idxcs.top,
      zIndex: idxcs.zIndex,
      display: idxcs.display,
      rows: document.querySelectorAll('.dk-index-link').length,
      sectionsWithTitle: document.querySelectorAll('#dk-main > section[data-index-title]').length,
      current: (document.querySelector('.dk-index-link[aria-current="true"]') || {}).textContent || null,
    } : null,
    fonts: [...document.fonts].filter((f) => f.status === 'loaded')
      .map((f) => `${f.family} ${f.weight} ${f.style}`),
    fontsStatus: document.fonts.status,
    headingFamily: (() => {
      const h = document.querySelector('.dk-h1');
      return h ? getComputedStyle(h).fontFamily : null;
    })(),
    monoFamily: (() => {
      const h = document.querySelector('.hour');
      return h ? getComputedStyle(h).fontFamily : null;
    })(),
    bodyFamily: getComputedStyle(document.body).fontFamily,
  };
};

// ---------------------------------------------------------------- run

(async () => {
  fs.mkdirSync(QADIR, { recursive: true });

  const raw = fs.readFileSync(DECK, 'utf8');
  const results = {
    generatedAt: new Date().toISOString(),
    fileSizeBytes: fs.statSync(DECK).size,
    titleInFirst8k: (raw.slice(0, 8192).match(/<title>([^<]*)<\/title>/) || [null, null])[1],
    hasDoctype: /^\s*<!doctype/i.test(raw),
    hasHtmlTag: /<html[\s>]/i.test(raw),
    hasBodyTag: /<body[\s>]/i.test(raw),
    externalFontLinks: (raw.match(/https:\/\/fonts\.[a-z]+\.com[^"']*/g) || []).slice(0, 4),
    nonAllowedUrlsInSource: [...new Set((raw.match(/(https?:)?\/\/[a-z0-9.-]+/gi) || []))]
      .filter((u) => !/fonts\.(googleapis|gstatic)\.com|www\.w3\.org/.test(u)).slice(0, 20),
    passes: {},
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    externalRequests: [],
    allRequestHosts: [],
    toggleTest: null,
    stickyTest: null,
    shellParity: null,
    screenshots: [],
  };
  const hosts = new Set();

  let browser;
  try {
    browser = await chromium.launch();
  } catch (e) {
    console.error('LAUNCH FAILED: ' + e.message);
    process.exit(2);
  }

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const tag = `${vp.name}-${theme}`;
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();

      page.on('console', (m) => {
        if (m.type() === 'error') results.consoleErrors.push(`[${tag}] ${m.text()}`);
      });
      page.on('pageerror', (e) => results.pageErrors.push(`[${tag}] ${e.message}`));
      page.on('requestfailed', (r) => {
        results.failedRequests.push(`[${tag}] ${r.url().slice(0, 120)} — ${(r.failure() || {}).errorText}`);
      });
      page.on('request', (r) => {
        const u = r.url();
        try { hosts.add(new URL(u).host || u.slice(0, 12)); } catch (_) { hosts.add(u.slice(0, 12)); }
        if (!allowed(u)) results.externalRequests.push(`[${tag}] ${u.slice(0, 140)}`);
      });

      await page.goto(URL, { waitUntil: 'load' });
      // localStorage may carry a stamped theme from a previous pass; clear it so
      // this pass is a true prefers-color-scheme reading.
      await page.evaluate(() => {
        try { window.localStorage.removeItem('dk-document-life-theme'); } catch (e) {}
      });
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(700);

      results.passes[tag] = await page.evaluate(PROBE);

      // ---- sticky index behaviour (once per pass): scroll and re-measure
      await page.evaluate(() => window.scrollTo(0, 4000));
      await page.waitForTimeout(600);
      const sticky = await page.evaluate(() => {
        const idx = document.querySelector('.dk-index');
        if (!idx) return null;
        const r = idx.getBoundingClientRect();
        return {
          topAfterScroll: Math.round(r.top),
          height: Math.round(r.height),
          visible: r.top < 60 && r.bottom > 0,
          current: (document.querySelector('.dk-index-link[aria-current="true"]') || {}).textContent || null,
          progressWidth: (document.getElementById('dk-progress') || {}).style
            ? document.getElementById('dk-progress').style.width : null,
        };
      });
      results.passes[tag].stickyAfterScroll = sticky;
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      // ---- theme toggle stamping (desktop light pass only)
      if (vp.name === '1440' && theme === 'light') {
        const steps = [];
        for (let i = 0; i < 4; i += 1) {
          const state = await page.evaluate(() => ({
            attr: document.documentElement.getAttribute('data-theme'),
            label: (document.getElementById('dk-theme-toggle') || {}).textContent || null,
            bodyBg: getComputedStyle(document.body).backgroundColor,
          }));
          steps.push(state);
          const t = await page.$('#dk-theme-toggle');
          if (!t) break;
          await t.click();
          await page.waitForTimeout(220);
        }
        // capture the stamped-dark render for comparison
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        await page.waitForTimeout(250);
        const stampedDark = await page.evaluate(() => ({
          bodyBg: getComputedStyle(document.body).backgroundColor,
          h1: (() => {
            const h = document.querySelector('.dk-h1');
            return h ? getComputedStyle(h).color : null;
          })(),
        }));
        await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
        await page.waitForTimeout(200);
        results.toggleTest = { steps, stampedDark };
      }

      // ---- section screenshots
      // An element screenshot of a section that contains position:sticky
      // children bakes the pinned index bar and the pinned prose column into
      // the middle of the image — a capture artifact, not a layout defect.
      // Neutralise both for the shot; the sticky behaviour itself is measured
      // above by the scroll test, and the as-read viewport shots below.
      await page.addStyleTag({
        content: '.dk-index{visibility:hidden!important}' +
          '.dk-prose,.dk-sticky,[style*="position:sticky"]{position:static!important}' +
          '*{scroll-behavior:auto!important}',
      });
      await page.waitForTimeout(250);

      for (const id of SECTIONS) {
        const el = await page.$('#' + id);
        if (!el) {
          results.pageErrors.push(`[${tag}] missing section #${id}`);
          continue;
        }
        await el.scrollIntoViewIfNeeded();
        await page.waitForTimeout(140);
        const name = `${id}-${vp.name}-${theme}.png`;
        try {
          await el.screenshot({ path: path.join(QADIR, name) });
          results.screenshots.push(name);
        } catch (e) {
          results.pageErrors.push(`[${tag}] screenshot #${id} failed: ${e.message}`);
        }
      }

      // ---- as-read viewport shots: the sticky index restored, each section
      //      landed on the way the index's own anchor lands it, so we can see
      //      whether the 52 px bar ever covers a heading.
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(600);
      // Land each section the way a reader does — by clicking its index row —
      // rather than by scripting window.scrollTo, which races the deck's own
      // smooth scroll and reports a landing that never happens in the browser.
      const asReadChecks = [];
      for (const id of ['ask', 'today', 'direction-a', 'compare', 'recommendation']) {
        const link = await page.$(`.dk-index-link[href="#${id}"]`);
        if (link) {
          await link.click();
          await page.waitForTimeout(2200);
        }
        const landed = await page.evaluate((sid) => {
          const s = document.getElementById(sid);
          const head = s && (s.querySelector('.hour') || s.querySelector('.dk-h1, .dk-h2'));
          const idx = document.querySelector('.dk-index');
          if (!head) return null;
          const hr = head.getBoundingClientRect();
          const ir = idx ? idx.getBoundingClientRect() : { bottom: 0 };
          return {
            headTop: Math.round(hr.top),
            indexBottom: Math.round(ir.bottom),
            coveredByIndex: hr.top < ir.bottom - 1,
            inViewport: hr.top >= 0 && hr.top < window.innerHeight,
          };
        }, id);
        asReadChecks.push({ section: id, ...(landed || { error: 'no heading' }) });
        const name = `asread-${id}-${vp.name}-${theme}.png`;
        await page.screenshot({ path: path.join(QADIR, name) });
        results.screenshots.push(name);
      }
      results.passes[tag].asRead = asReadChecks;

      await ctx.close();
    }
  }

  // ---- artifact-skeleton parity: the deck is published wrapped in a
  //      <!doctype><head></head><body> shell with a minimal reset.
  {
    fs.writeFileSync(
      SHELL,
      '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<style>*,*::before,*::after{box-sizing:border-box}body{margin:0}</style>' +
        '</head><body>' + raw + '</body></html>',
      'utf8'
    );
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const parity = [];
    for (const w of [1680, 1440, 1200, 1024, 820, 600, 390]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto('file://' + SHELL, { waitUntil: 'load' });
      await page.waitForTimeout(450);
      const r = await page.evaluate(() => {
        // NOTE: body carries `overflow-x:hidden` by design (it is what keeps
        // a real overflow from showing a page scrollbar). That means a naive
        // "walk up and stop at the first overflow-x:auto/scroll/hidden
        // ancestor" check — as used elsewhere in this file — always finds
        // body itself and calls everything "clipped", hiding the real
        // offender. This scan stops the walk at body/html instead, so an
        // inner legitimate scroller (.dk-tablewrap, .dk-sheet, .dk-shotstrip,
        // .dk-index-scroll) still excludes its own overflowing content, but
        // body's own overflow-x:hidden no longer masks everything upstream
        // of it.
        function clippedByInnerScroller(el) {
          var p = el.parentElement;
          while (p && p !== document.body && p !== document.documentElement) {
            var cs = getComputedStyle(p);
            if (/(auto|scroll|hidden)/.test(cs.overflowX)) return true;
            p = p.parentElement;
          }
          return false;
        }
        var vw = document.documentElement.clientWidth;
        var culprits = [];
        document.querySelectorAll('body *').forEach(function (el) {
          var rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          var cs = getComputedStyle(el);
          if (cs.position === 'fixed') return;
          if (rect.right <= vw + 1 && rect.left >= -1) return;
          if (clippedByInnerScroller(el)) return;
          var section = el.closest('section');
          culprits.push({
            tag: el.tagName,
            cls: String(el.className || '').slice(0, 90),
            section: section ? section.id : null,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            overflowPast: Math.round(rect.right - vw),
            cssWidth: cs.width,
            cssMinWidth: cs.minWidth,
            display: cs.display,
          });
        });
        // Keep only the outermost offenders: drop an element if one of its
        // ancestors is already in the list (the ancestor is the real cause;
        // its overflowing descendants are just along for the ride).
        var all = [...document.querySelectorAll('body *')];
        var flagged = new Set(culprits.map(function (c, i) { return i; }));
        var top = culprits.filter(function (c, i) {
          var el = all.find(function (e) {
            return e.tagName === c.tag && String(e.className || '').slice(0, 90) === c.cls &&
              Math.round(e.getBoundingClientRect().right) === c.right &&
              Math.round(e.getBoundingClientRect().left) === c.left;
          });
          if (!el) return true;
          var p = el.parentElement;
          while (p && p !== document.body) {
            var pr = p.getBoundingClientRect();
            if (Math.round(pr.right) === c.right && Math.round(pr.left) === c.left) return false;
            p = p.parentElement;
          }
          return true;
        });
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: vw,
          mockOverflow: [...document.querySelectorAll('.dk-mock')].filter(function (m) {
            var viewport = m.querySelector('.dk-mock-viewport');
            var parent = m.parentElement;
            if (!viewport || !parent) return false;
            var a = viewport.getBoundingClientRect();
            var b = parent.getBoundingClientRect();
            return a.width > b.width + 1 || a.right > vw + 1;
          }).length,
          culprits: top.slice(0, 12),
        };
      });
      parity.push({ width: w, ...r, ok: r.scrollWidth <= r.clientWidth + 1 });
    }
    results.shellParity = parity;
    await ctx.close();
    fs.unlinkSync(SHELL);
  }

  await browser.close();

  results.allRequestHosts = [...hosts];
  fs.writeFileSync(path.join(QADIR, 'qa-results.json'), JSON.stringify(results, null, 2));

  // ---- console digest
  const line = (s) => console.log(s);
  line(`file ${(results.fileSizeBytes / 1048576).toFixed(2)} MB | title="${results.titleInFirst8k}" | shots ${results.screenshots.length}`);
  for (const [tag, p] of Object.entries(results.passes)) {
    line(`${tag}: scrollW ${p.scrollWidthDoc}/${p.clientWidth} bodyScrollW ${p.scrollWidthBody} | bodyBg ${p.bodyBg} | overflowers ${p.overflowers.length} | mocks ${p.mocks.length} (fitOverflow ${p.mocks.filter((m) => m.fitsParent === false).length}, pastVP ${p.mocks.filter((m) => m.pastViewport).length}) | shadowed ${p.shadowed.length} | idx rows ${p.index && p.index.rows}/${p.index && p.index.sectionsWithTitle} pos ${p.index && p.index.position} | fonts ${p.fonts.length}`);
    const low = p.contrast.filter((c) => c.ratio < 4.5);
    if (low.length) line(`  low-contrast(${low.length}): ` + low.map((c) => `${c.register}:${c.cls}@${c.ratio}`).join(', '));
    if (p.shadowed.length) line(`  D4 VIOLATION shadowed(${p.shadowed.length}): ` + p.shadowed.slice(0, 6).map((s) => `${s.section}:${s.tag}.${s.cls}`).join(', '));
    const noEye = p.sections.filter((s) => !s.hasEyebrow).map((s) => s.id);
    if (noEye.length) line(`  no .hour eyebrow: ${noEye.join(', ')}`);
    const badImg = p.images.filter((i) => !i.inlined || !i.naturalW);
    if (badImg.length) line(`  image trouble(${badImg.length}): ` + badImg.slice(0, 6).map((i) => `${i.section}:${i.src}`).join(', '));
    if (p.stickyAfterScroll) line(`  sticky@4000: top ${p.stickyAfterScroll.topAfterScroll} visible ${p.stickyAfterScroll.visible} current "${(p.stickyAfterScroll.current || '').trim()}" progress ${p.stickyAfterScroll.progressWidth}`);
  }
  line('toggle: ' + JSON.stringify(results.toggleTest && results.toggleTest.steps.map((s) => `${s.attr}/${(s.label || '').trim()}/${s.bodyBg}`)));
  line('shellParity: ' + results.shellParity.map((p) => `${p.width}:${p.ok ? 'ok' : p.scrollWidth + '>' + p.clientWidth}${p.mockOverflow ? ' mo' + p.mockOverflow : ''}`).join(' '));
  results.shellParity.forEach((p) => {
    if (p.ok || !p.culprits || !p.culprits.length) return;
    line(`  culprits@${p.width}: ` + p.culprits.map((c) =>
      `${c.tag}.${c.cls || '(no class)'}${c.section ? '#in:' + c.section : ''} right=${c.right} over=${c.overflowPast} w=${c.width} css-w=${c.cssWidth} css-min-w=${c.cssMinWidth}`
    ).join(' | '));
  });
  line(`consoleErrors ${results.consoleErrors.length} | pageErrors ${results.pageErrors.length} | failedRequests ${results.failedRequests.length} | externalRequests ${results.externalRequests.length}`);
  results.consoleErrors.slice(0, 10).forEach((e) => line('  console ' + e));
  results.pageErrors.slice(0, 10).forEach((e) => line('  pageerror ' + e));
  results.failedRequests.slice(0, 10).forEach((e) => line('  failed ' + e));
  results.externalRequests.slice(0, 10).forEach((e) => line('  external ' + e));
  line('hosts: ' + results.allRequestHosts.join(', '));
})().catch((e) => {
  console.error('QA SCRIPT FAILED', e);
  process.exit(1);
});
