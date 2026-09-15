const { createRequire } = require('module');
const req = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = req('@playwright/test');
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const URL = 'file://' + path.join(DIR, '_r3wrapped.html');
const WIDTHS = [390, 430, 768, 820, 860, 861, 900, 901, 960, 1024, 1100, 1180, 1200, 1280, 1440, 1600, 1920];

function lum(hex) {
  const m = hex.replace('#','');
  const v = [0,2,4].map(i => parseInt(m.substr(i,2),16)/255)
    .map(c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
  return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2];
}
function ratio(a,b){ const la=lum(a), lb=lum(b); const hi=Math.max(la,lb), lo=Math.min(la,lb); return (hi+0.05)/(lo+0.05); }

(async () => {
  const out = { widths: {}, contrast: {}, meta: {} };
  // pure-math contrast from token values
  const light = { paper:'#FAF7F2', paperDoc:'#FCFAF6', ink:'#2C2926', muted:'#4E4339', subtle:'#5A4E43', faint:'#65594E', oak:'#8B7355', clay:'#7C5E30', terr:'#9C5340', sage:'#5F6B57', golden:'#79651E' };
  const dark  = { paper:'#2A2622', paperDoc:'#26221E', ink:'#F2EDE6', muted:'#D6CEC4', subtle:'#C7BEB3', faint:'#B8AEA2', oak:'#B39572', clay:'#D8B98A', terr:'#E2A895', sage:'#AFC0A6', golden:'#E0C963' };
  for (const [name, p] of [['light', light], ['dark', dark]]) {
    out.contrast[name] = {};
    for (const k of ['ink','muted','subtle','faint','oak','clay','terr','sage','golden']) {
      out.contrast[name][k + '_on_paper'] = +ratio(p[k], p.paper).toFixed(2);
      out.contrast[name][k + '_on_paperDoc'] = +ratio(p[k], p.paperDoc).toFixed(2);
    }
  }

  const browser = await chromium.launch();
  for (const scheme of ['light','dark']) {
    const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto(URL, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);

    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
      await page.waitForTimeout(180);
      const d = await page.evaluate(() => {
        const docW = document.documentElement.scrollWidth;
        const innerW = window.innerWidth;
        const scrollers = Array.prototype.slice.call(document.querySelectorAll('.scroller')).map((el, i) => {
          const tbl = el.querySelector('table');
          const head = tbl && tbl.closest('.main') ? (tbl.closest('.main').querySelector('h2,h3') || {}).textContent : '';
          return {
            i, over: el.scrollWidth - el.clientWidth,
            clientW: el.clientWidth, scrollW: el.scrollWidth,
            tab: el.getAttribute('tabindex'), role: el.getAttribute('role'), label: el.getAttribute('aria-label'),
            overflowX: getComputedStyle(el).overflowX, overflowY: getComputedStyle(el).overflowY,
            sheet: (el.closest('section') || {}).id || '',
            cls: tbl ? tbl.className : '',
            h: (head || '').slice(0, 40)
          };
        });
        const mainW = (() => { const m = document.querySelector('#sheet-3 .main'); return m ? Math.round(m.getBoundingClientRect().width) : null; })();
        const bodyPad = getComputedStyle(document.body).paddingLeft;
        // painted-box overflow: elements whose right edge passes the viewport, ignoring clipped ancestors
        const over = [];
        const all = document.querySelectorAll('body *');
        for (const el of all) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.right <= innerW + 0.5 && r.left >= -0.5) continue;
          // skip if an ancestor clips
          let p = el.parentElement, clipped = false;
          while (p) {
            const cs = getComputedStyle(p);
            if (cs.overflowX !== 'visible' || cs.clipPath !== 'none') { clipped = true; break; }
            p = p.parentElement;
          }
          if (clipped) continue;
          over.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0,40), left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent||'').trim().slice(0,40) });
        }
        return { docW, innerW, scrollers, mainW, bodyPad, overflowers: over.slice(0, 12), overflowerCount: over.length };
      });
      out.widths[scheme + '@' + w] = d;
    }

    // back to 1440 for detail probes
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(200);

    if (scheme === 'light') {
      out.meta.fonts = await page.evaluate(() => {
        const pick = (sel, prop) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; };
        const strong = document.querySelector('strong');
        const em = document.querySelector('em');
        return {
          h1: pick('h1', 'fontFamily'), body: pick('.t-body', 'fontFamily'), meta: pick('.t-head', 'fontFamily'),
          strongWeight: strong ? getComputedStyle(strong).fontWeight : null,
          strongFamily: strong ? getComputedStyle(strong).fontFamily : null,
          emStyle: em ? getComputedStyle(em).fontStyle : null,
          emWeight: em ? getComputedStyle(em).fontWeight : null,
          strongCount: document.querySelectorAll('strong').length,
          emCount: document.querySelectorAll('em').length,
          loaded: Array.from(document.fonts).map(f => f.family + ' ' + f.weight + ' ' + f.style + ' ' + f.status).filter((v,i,a)=>a.indexOf(v)===i)
        };
      });
      out.meta.structure = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table'));
        const labelled = tables.map(t => {
          const id = t.getAttribute('aria-labelledby');
          return { id, resolves: id ? !!document.getElementById(id) : false, inScroller: !!t.closest('.scroller') };
        });
        const tds = Array.from(document.querySelectorAll('tbody td, tfoot td'));
        const missing = tds.filter(td => !td.hasAttribute('data-label')).length;
        const thInBody = document.querySelectorAll('tbody th').length;
        const hs = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => h.tagName);
        return { tables: tables.length, labelled, tdCount: tds.length, missingDataLabel: missing, thInBody, headings: hs,
          sections: document.querySelectorAll('section.slide').length,
          scrollers: document.querySelectorAll('.scroller').length,
          roleImg: document.querySelectorAll('[role=img]').length,
          roleImgNoLabel: Array.from(document.querySelectorAll('[role=img]')).filter(e=>!e.getAttribute('aria-label')).length };
      });
      // keyboard: tab order
      out.meta.tabSequence = await page.evaluate(async () => {
        const seq = [];
        document.body.focus();
        return seq;
      });
      // measured smooth-scroll paging from mid-slide
      out.meta.paging = [];
      for (const [sheetId, frac] of [['sheet-14', 0.5], ['sheet-14', 0.8], ['sheet-12', 0.7], ['sheet-3', 0.6], ['sheet-10', 0.9]]) {
        const res = await page.evaluate(async ({ sheetId, frac }) => {
          const s = document.getElementById(sheetId);
          const top = s.offsetTop + (s.offsetHeight - window.innerHeight) * frac;
          window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
          await new Promise(r => setTimeout(r, 60));
          const before = (function(){ // replicate currentIndex
            const slides = Array.from(document.querySelectorAll('.slide'));
            const th = window.innerHeight * 0.33; let idx = 0;
            for (let i=0;i<slides.length;i++){ if (slides[i].getBoundingClientRect().top <= th) idx=i; else break; }
            return slides[idx].id;
          })();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
          await new Promise(r => setTimeout(r, 900));
          const afterR = document.elementFromPoint(10, 10);
          const landedR = (function(){ const slides = Array.from(document.querySelectorAll('.slide'));
            let best = null, bd = Infinity;
            for (const sl of slides) { const d = Math.abs(sl.getBoundingClientRect().top); if (d < bd) { bd = d; best = sl; } }
            return best.id + ' (off ' + Math.round(bd) + 'px)'; })();
          // now go back
          window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
          await new Promise(r => setTimeout(r, 60));
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
          await new Promise(r => setTimeout(r, 900));
          const landedL = (function(){ const slides = Array.from(document.querySelectorAll('.slide'));
            let best = null, bd = Infinity;
            for (const sl of slides) { const d = Math.abs(sl.getBoundingClientRect().top); if (d < bd) { bd = d; best = sl; } }
            return best.id + ' (off ' + Math.round(bd) + 'px)'; })();
          return { sheetId, frac, currentIndexSays: before, arrowRightLands: landedR, arrowLeftLands: landedL };
        }, { sheetId, frac });
        out.meta.paging.push(res);
      }
      out.meta.errors = errs;
    }

    // screenshots
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => window.scrollTo(0,0));
    await page.waitForTimeout(150);
    for (const id of ['sheet-1','sheet-3','sheet-6','sheet-10','sheet-14','sheet-15']) {
      await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block:'start', behavior:'instant' }), id);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(DIR, `r4-1440-${scheme}-${id}.png`) });
    }
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    for (const id of ['sheet-3','sheet-14']) {
      await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block:'start', behavior:'instant' }), id);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(DIR, `r4-1024-${scheme}-${id}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(250);
    for (const id of ['sheet-1','sheet-3','sheet-14']) {
      await page.evaluate((i) => document.getElementById(i).scrollIntoView({ block:'start', behavior:'instant' }), id);
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(DIR, `r4-390-${scheme}-${id}.png`) });
    }
    await ctx.close();
  }

  // reduced motion + data-theme overrides
  for (const [tag, opts, attr] of [
    ['reduce', { colorScheme: 'light', reducedMotion: 'reduce' }, null],
    ['osdark-themelight', { colorScheme: 'dark' }, 'light'],
    ['oslight-themedark', { colorScheme: 'light' }, 'dark'],
  ]) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, opts));
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    if (attr) await page.evaluate(a => document.documentElement.setAttribute('data-theme', a), attr);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    out.meta[tag] = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
        paper: cs.getPropertyValue('--paper').trim(),
        ink: cs.getPropertyValue('--ink').trim(),
        colorScheme: cs.colorScheme,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyColor: getComputedStyle(document.body).color,
      };
    });
    await page.screenshot({ path: path.join(DIR, `r4-1440-${tag}.png`) });
    await ctx.close();
  }

  // print emulation
  {
    const ctx = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: 'load' });
    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    await page.waitForTimeout(250);
    out.meta.printDark = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      const t = document.querySelector('table.sheet');
      return { paper: cs.getPropertyValue('--paper').trim(), bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyColor: getComputedStyle(document.body).color, tableDisplay: getComputedStyle(t).display,
        theadPos: getComputedStyle(document.querySelector('table.sheet thead')).position };
    });
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(DIR, 'r4-report.json'), JSON.stringify(out, null, 1));
  console.log('contrast', JSON.stringify(out.contrast, null, 1));
  console.log('OK — report written');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
