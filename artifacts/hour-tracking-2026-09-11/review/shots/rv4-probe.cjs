const { createRequire } = require('module');
const wsRequire = createRequire('/Users/kody/Code/patina-merged/apps/designer-portal/package.json');
const { chromium } = wsRequire('@playwright/test');
const OUT = '/Users/kody/Code/patina-merged/artifacts/hour-tracking-2026-09-11/review/shots';
const URLS = {
  min:  'file://' + OUT + '/_rv4wrapped.html',
  reset:'file://' + OUT + '/_rv4wrapped-reset.html',
};
const report = { overflow: {}, tokens: {}, fonts: {}, motion: {}, keyboard: {}, scrollers: {}, misc: {} };

async function overflowProbe(page) {
  return page.evaluate(() => {
    const iw = window.innerWidth;
    const out = [];
    const all = document.querySelectorAll('*');
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed') continue;
      if (r.right > iw + 0.5 || r.left < -0.5) {
        // ignore clipped visually-hidden
        if (cs.clipPath && cs.clipPath.includes('inset(50%)')) continue;
        out.push({ tag: el.tagName, cls: el.className && String(el.className).slice(0,60),
                   left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
      }
    }
    return { innerWidth: iw, docScrollWidth: document.documentElement.scrollWidth,
             bodyScrollWidth: document.body.scrollWidth, offenders: out.slice(0, 30), offenderCount: out.length };
  });
}

(async () => {
  const browser = await chromium.launch();

  // ---- A. overflow + shots at the two required sizes, both schemes
  for (const [wname, url] of Object.entries(URLS)) {
    for (const c of [
      { n: '1440-light', w: 1440, h: 900, s: 'light' },
      { n: '1440-dark',  w: 1440, h: 900, s: 'dark'  },
      { n: '390-light',  w: 390,  h: 844, s: 'light' },
      { n: '390-dark',   w: 390,  h: 844, s: 'dark'  },
      { n: '1024-light', w: 1024, h: 768, s: 'light' },
      { n: '960-light',  w: 960,  h: 900, s: 'light' },
      { n: '861-light',  w: 861,  h: 900, s: 'light' },
      { n: '700-light',  w: 700,  h: 900, s: 'light' },
      { n: '320-light',  w: 320,  h: 800, s: 'light' },
    ]) {
      const ctx = await browser.newContext({ viewport: { width: c.w, height: c.h }, colorScheme: c.s });
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(400);
      await page.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
      report.overflow[wname + '/' + c.n] = await overflowProbe(page);
      if (wname === 'min') {
        for (const id of ['sheet-1','sheet-3','sheet-6','sheet-10','sheet-14','sheet-15','sheet-16']) {
          if (c.w !== 1440 && c.w !== 390) continue;
          await page.evaluate(i => { const e = document.getElementById(i); window.scrollTo(0, e.offsetTop); }, id);
          await page.waitForTimeout(150);
          await page.screenshot({ path: `${OUT}/rv4-${c.n}-${id}.png` });
        }
      }
      await ctx.close();
    }
  }

  // ---- B. tokens / computed styles, both schemes and both explicit themes
  for (const scheme of ['light','dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.goto(URLS.min); await page.waitForTimeout(300);
    const read = () => page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      const rs = getComputedStyle(document.documentElement);
      const names = ['--paper','--paper-doc','--ink','--ink-muted','--ink-subtle','--ink-faint','--oak','--hairline','--hairline-strong','--clay-ink','--sage-ink','--terracotta-ink'];
      const toks = {}; names.forEach(n => toks[n] = rs.getPropertyValue(n).trim());
      return { bodyBg: cs.backgroundColor, bodyColor: cs.color, paddingInline: cs.paddingLeft + '/' + cs.paddingRight,
               colorScheme: rs.colorScheme, fontFamily: cs.fontFamily, fontSize: cs.fontSize, toks };
    });
    report.tokens[scheme + '/auto'] = await read();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme','dark'));
    report.tokens[scheme + '/theme-dark'] = await read();
    await page.evaluate(() => document.documentElement.setAttribute('data-theme','light'));
    report.tokens[scheme + '/theme-light'] = await read();
    await page.screenshot({ path: `${OUT}/rv4-1440-os${scheme}-themelight.png` });
    await ctx.close();
  }

  // ---- C. fonts actually loaded?
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const reqs = [];
    page.on('requestfailed', r => reqs.push({ url: r.url(), err: r.failure() && r.failure().errorText }));
    page.on('response', r => { if (/fonts\.(googleapis|gstatic)/.test(r.url())) reqs.push({ url: r.url(), status: r.status() }); });
    await page.goto(URLS.min); await page.waitForTimeout(2500);
    report.fonts.network = reqs.slice(0, 12);
    report.fonts.check = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        playfair500: document.fonts.check('500 26px "Playfair Display"'),
        inter400: document.fonts.check('400 16px Inter'),
        inter600: document.fonts.check('600 14px Inter'),
        dmmono500: document.fonts.check('500 11px "DM Mono"'),
        faces: [...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.style + ' ' + f.status),
        h1Resolved: getComputedStyle(document.getElementById('h1')).fontFamily,
      };
    });
    await ctx.close();
  }

  // ---- D. reduced motion
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto(URLS.min); await page.waitForTimeout(300);
    report.motion.reduce = await page.evaluate(() => ({
      htmlScrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      anyAnimation: [...document.querySelectorAll('*')].some(e => getComputedStyle(e).animationName !== 'none'),
      anyTransitionOver0: [...document.querySelectorAll('*')].filter(e => parseFloat(getComputedStyle(e).transitionDuration) > 0.001).length,
    }));
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(URLS.min); await page.waitForTimeout(300);
    report.motion.normal = await page.evaluate(() => ({
      htmlScrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      anyAnimation: [...document.querySelectorAll('*')].some(e => getComputedStyle(e).animationName !== 'none'),
    }));
    await ctx.close();
  }

  require('fs').writeFileSync(OUT + '/rv4-report.json', JSON.stringify(report, null, 1));
  console.log(JSON.stringify({ overflow: report.overflow, tokens: report.tokens, fonts: report.fonts, motion: report.motion }, null, 1));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
