// Round-5 adversarial re-review render check.
// Derived from r5-check.cjs. Rebuilds the publish wrapper from the CURRENT deck
// source (so the measurement cannot be taken against a stale snapshot), in two
// variants: bare shell, and shell + the documented head reset.
const { createRequire } = require('module');
const fs = require('fs');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');

const ROOT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11';
const OUT = ROOT + '/review/shots';
const src = fs.readFileSync(ROOT + '/deck/src/index.html', 'utf8');

const SHELL_PRE = '<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"></head><body style="margin:0">';
const RESET = `<style>:root{color-scheme:light}body{margin:0;font:14px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style>`;
const RESET_PRE = '<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">' + RESET + '</head><body style="margin:0">';

fs.writeFileSync(OUT + '/_r5bwrapped.html', SHELL_PRE + src + '</body></html>');
fs.writeFileSync(OUT + '/_r5bwrapped-reset.html', RESET_PRE + src + '</body></html>');

const URLS = {
  plain: 'file://' + OUT + '/_r5bwrapped.html',
  reset: 'file://' + OUT + '/_r5bwrapped-reset.html',
};

const OVERFLOW_PROBE = `(() => {
  const iw = window.innerWidth;
  const offenders = [];
  const slideBoxes = [];
  document.querySelectorAll('.slide').forEach(s => {
    const r = s.getBoundingClientRect();
    slideBoxes.push({ id: s.id, left: +r.left.toFixed(2), right: +r.right.toFixed(2), width: +r.width.toFixed(2) });
  });
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    if (r.width <= 1.5 && r.height <= 1.5) return;          // clipped visually-hidden
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    if (r.right > iw + 0.5 || r.left < -0.5) {
      const inScroller = !!(el.closest && el.closest('.scroller'));
      offenders.push({
        tag: el.tagName, cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '',
        left: +r.left.toFixed(2), right: +r.right.toFixed(2), inScroller,
        text: (el.textContent || '').trim().slice(0, 60)
      });
    }
  });
  return { iw, docSW: document.documentElement.scrollWidth, bodySW: document.body.scrollWidth,
           scrollX: window.scrollX, offenders, slideBoxes };
})()`;

const SCROLLER_PROBE = `(() => [...document.querySelectorAll('.scroller')].map(e => {
  const t = e.querySelector('table');
  const sec = e.closest('section');
  return { sheet: sec ? sec.id : null, table: t ? t.className : null,
           scrollWidth: e.scrollWidth, clientWidth: e.clientWidth, delta: e.scrollWidth - e.clientWidth };
}).filter(x => x.delta > 3))()`;

async function settle(page) {
  await page.waitForTimeout(500);
  try { await page.evaluate(() => document.fonts.ready); } catch (e) {}
  await page.waitForTimeout(300);
  // force a full pass over every slide so lazy layout is resolved, then return
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
}

(async () => {
  const browser = await chromium.launch();
  const out = { assertions: [], fonts: null, notes: [] };

  for (const variant of ['plain', 'reset']) {
    // ---------- A1/A2 @ 390x844 ----------
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URLS[variant]);
    await settle(page);

    if (variant === 'plain') {
      out.fonts = await page.evaluate(() => {
        const seen = [];
        document.fonts.forEach(f => seen.push(f.family + ' ' + f.weight + ' ' + f.style + ' = ' + f.status));
        return seen;
      });
    }

    const a1 = await page.evaluate(OVERFLOW_PROBE);
    out.assertions.push({
      id: 'A1', variant, viewport: '390x844',
      expr: 'document.documentElement.scrollWidth <= window.innerWidth',
      scrollWidth: a1.docSW, innerWidth: a1.iw, pass: a1.docSW <= a1.iw
    });
    out.assertions.push({
      id: 'A2', variant, viewport: '390x844',
      expr: 'every .slide box within [0, innerWidth]',
      offending: a1.slideBoxes.filter(s => s.left < -0.5 || s.right > a1.iw + 0.5),
      slideCount: a1.slideBoxes.length,
      pass: a1.slideBoxes.every(s => s.left >= -0.5 && s.right <= a1.iw + 0.5)
    });
    out.assertions.push({
      id: 'A3', variant, viewport: '390x844',
      expr: 'no element with getBoundingClientRect().right > 390 outside a .scroller',
      offendersOutsideScroller: a1.offenders.filter(o => !o.inScroller),
      offendersInsideScroller: a1.offenders.filter(o => o.inScroller).length,
      pass: a1.offenders.filter(o => !o.inScroller).length === 0
    });

    // sheet-02 .mq specifically (round 4's blocker)
    await page.evaluate(() => document.getElementById('sheet-2').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    out.assertions.push({
      id: 'A4', variant, viewport: '390x844',
      expr: 'sheet 02 .mq fully inside the viewport, no clipping in either axis',
      ...(await page.evaluate(() => {
        const el = document.querySelector('#sheet-2 .mq'); const r = el.getBoundingClientRect();
        return { text: el.textContent.trim(), left: +r.left.toFixed(2), right: +r.right.toFixed(2),
                 iw: window.innerWidth, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
                 clientHeight: el.clientHeight, scrollHeight: el.scrollHeight, scrollX: window.scrollX,
                 textAlign: getComputedStyle(el).textAlign, whiteSpace: getComputedStyle(el).whiteSpace };
      }))
    });
    const last = out.assertions[out.assertions.length - 1];
    last.pass = last.left >= 0 && last.right <= last.iw && last.scrollWidth <= last.clientWidth && last.scrollHeight <= last.clientHeight;

    // T4-4: displacement after scrollIntoView on the once-overwide node
    out['displacement_' + variant] = await page.evaluate(() => {
      document.querySelector('#sheet-2 .mq').scrollIntoView({ block: 'center' });
      return { scrollX: window.scrollX, docSW: document.documentElement.scrollWidth };
    });

    if (variant === 'plain') {
      // keyboard: measured, not inferred
      out.keyboard = await (async () => {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
        const tops = await page.evaluate(() => [...document.querySelectorAll('.slide')].map(s => Math.round(s.getBoundingClientRect().top + window.scrollY)));
        const seq = [];
        for (const k of ['ArrowRight', 'ArrowRight', 'j', 'ArrowLeft', 'k', 'End', 'Home']) {
          await page.keyboard.press(k); await page.waitForTimeout(450);
          seq.push([k, await page.evaluate(() => Math.round(window.scrollY))]);
        }
        // modifier guard
        await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(350);
        const afterShift = await page.evaluate(() => Math.round(window.scrollY));
        return { tops: tops.slice(0, 8), seq, afterShiftArrowRight: afterShift };
      })();
    }
    await ctx.close();
  }

  // ---------- scroller overflow @ 1440 and 1024 ----------
  for (const [w, h] of [[1440, 900], [1024, 768]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await ctx.newPage();
    await page.goto(URLS.plain);
    await settle(page);
    const over = await page.evaluate(SCROLLER_PROBE);
    const doc = await page.evaluate(() => ({ docSW: document.documentElement.scrollWidth, iw: window.innerWidth }));
    out.assertions.push({
      id: 'A5-' + w, viewport: w + 'x' + h,
      expr: 'no .scroller with scrollWidth > clientWidth + 3',
      overflowing: over, docSW: doc.docSW, innerWidth: doc.iw,
      pass: over.length === 0
    });
    out['gutter_position_' + w] = await page.evaluate(() => getComputedStyle(document.querySelector('#sheet-2 .gutter')).position);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 900, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(URLS.plain); await settle(page);
    out.gutter_position_900 = await page.evaluate(() => getComputedStyle(document.querySelector('#sheet-2 .gutter')).position);
    // T4-3 hit test: what is under the gutter's centre on a tall sheet at 900?
    await page.evaluate(() => document.getElementById('sheet-14').scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(250);
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(250);
    out.gutter_hittest_900 = await page.evaluate(() => {
      const g = document.querySelector('#sheet-14 .gutter'); const r = g.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return 'gutter scrolled out of view (static) — no overlap possible';
      return document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).slice(0, 5).map(e => e.tagName + '.' + (e.className || ''));
    });
    await page.screenshot({ path: OUT + '/r5b-900-gutter.png' });
    await ctx.close();
  }

  // ---------- dark screenshots, sheets 1/3/10/14 at 1440 and 390 ----------
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.goto(URLS.plain); await settle(page);
    if (w === 1440) {
      out.dark_tokens = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement);
        return ['--paper', '--ink', '--ink-muted', '--ink-subtle', '--ink-faint'].reduce((a, k) => (a[k] = cs.getPropertyValue(k).trim(), a), {});
      });
    }
    for (const n of [1, 3, 10, 14]) {
      const box = await page.evaluate((id) => {
        const el = document.getElementById(id);
        el.scrollIntoView({ block: 'start' });
        const r = el.getBoundingClientRect();
        return { y: Math.max(0, Math.round(r.top + window.scrollY)), height: Math.round(r.height) };
      }, 'sheet-' + n);
      await page.waitForTimeout(250);
      await page.screenshot({
        path: `${OUT}/r5b-${w}-dark-sheet${String(n).padStart(2, '0')}.png`,
        clip: { x: 0, y: box.y, width: w, height: Math.min(box.height, w === 1440 ? 1150 : 2000) },
        fullPage: true
      });
    }
    await ctx.close();
  }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
