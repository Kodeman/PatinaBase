// Reference capture of three third-party sites for internal design study only (SQ-1568).
// Not for redistribution. Run from any checkout: `node capture.mjs [site ...]`.
// Writes _renders/<site>-<viewport>-<offset>.jpg and measurements/<site>.json next to this file.
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDERS = join(HERE, '_renders');
const MEASURE = join(HERE, 'measurements');
const MAIN = '/Users/kody/Code/patina-merged/node_modules';
const MAX_BYTES = 400 * 1024;
const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// pnpm keeps packages under .pnpm/<name>@<version>; take the newest installed one.
function pnpmDir(name) {
  const hits = readdirSync(join(MAIN, '.pnpm')).filter((d) => d.startsWith(`${name}@`)).sort();
  if (!hits.length) throw new Error(`${name} not installed under ${MAIN}/.pnpm`);
  return join(MAIN, '.pnpm', hits.at(-1), 'node_modules', name);
}
const { chromium } = await import(join(pnpmDir('playwright'), 'index.mjs'));
const sharp = createRequire(join(pnpmDir('sharp'), 'package.json'))('sharp');

// Awwwards pages and the live sites behind their "Visit site" links. Awwwards answers headless
// Chromium and curl with 403, so the live URL and gallery asset were read from the page text
// (WebFetch, 2026-10-21) and are recorded here; the script still tries the page first.
const SITES = {
  fitosauna: {
    awwwards: 'https://www.awwwards.com/sites/fitosauna',
    live: 'https://fitosauna.com/',
    gallery: ['https://assets.awwwards.com/awards/submissions/2026/10/6abf44a6bff53321409410.jpg'],
  },
  'era-residence': {
    awwwards: 'https://www.awwwards.com/sites/era-residence',
    live: 'https://www.era-residence.com/',
    gallery: [],
  },
  stanzza: {
    awwwards: 'https://www.awwwards.com/sites/stanzza-design',
    live: 'https://stanzza.design/',
    gallery: ['https://assets.awwwards.com/awards/submissions/2026/09/6a993a7df0249631843461.jpg'],
  },
};

const VIEWPORTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, userAgent: UA_DESKTOP, offsets: [0, 1, 2, 3, 5], full: true },
  mobile: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_MOBILE, offsets: [0, 1, 2], full: false },
};

// First attempt honours reduced motion; the two retries drop it, wait longer, and switch browser build.
const ATTEMPTS = [
  { reducedMotion: 'reduce', channel: undefined, settle: 2500 },
  { reducedMotion: 'no-preference', channel: 'chromium', settle: 6000 },
  { reducedMotion: 'no-preference', channel: 'chrome', settle: 8000 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// JPEG q72, ≤1600px wide, ≤400 KB: shrink width by 15% until it fits.
async function saveJpeg(buffer, file) {
  const meta = await sharp(buffer, { limitInputPixels: false }).metadata();
  let width = Math.min(1600, meta.width);
  for (;;) {
    const out = await sharp(buffer, { limitInputPixels: false }).resize({ width, withoutEnlargement: true }).jpeg({ quality: 72, mozjpeg: true }).toBuffer();
    if (out.length <= MAX_BYTES || width < 200) {
      writeFileSync(file, out);
      const m = await sharp(out).metadata();
      return { file: file.slice(HERE.length + 1), bytes: out.length, width: m.width, height: m.height };
    }
    width = Math.floor(width * 0.85);
  }
}

async function settle(page, ms) {
  await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
  await sleep(ms);
}

// Wheel rather than scrollTo so smooth-scroll libraries (Lenis, GSAP ScrollTrigger) see real input.
async function wheelTo(page, targetY, vh) {
  for (let guard = 0; guard < 400; guard++) {
    const y = await page.evaluate(() => window.scrollY);
    if (Math.abs(y - targetY) < 100) break;
    await page.mouse.move(vh.width / 2, vh.height / 2);
    await page.mouse.wheel(0, y < targetY ? 200 : -200);
    await sleep(70);
    const after = await page.evaluate(() => window.scrollY);
    if (after === y) {
      await sleep(250);
      if ((await page.evaluate(() => window.scrollY)) === y) {
        await page.evaluate((t) => window.scrollTo(0, t), targetY);
        await sleep(300);
        break;
      }
    }
  }
  return page.evaluate(() => window.scrollY);
}

// Runs in the page: full-screen opaque fixed layer = preloader or gate still up.
function coverProbe() {
  const vw = innerWidth, vh = innerHeight;
  const covers = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.9) continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.9 || r.height < vh * 0.9) continue;
    // An off-canvas drawer (e.g. a closed mobile menu) is full-size but not what sits at the centre.
    const centre = document.elementFromPoint(vw / 2, vh / 2);
    if (!centre || !el.contains(centre)) continue;
    const bg = cs.backgroundColor;
    if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
    covers.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 80), z: cs.zIndex, bg });
  }
  return { covers: covers.slice(0, 5), textChars: (document.body?.innerText || '').length, title: document.title };
}

// Runs in the page: viewport-level composition at the current scroll offset.
function screenProbe() {
  const vw = innerWidth, vh = innerHeight;
  const isImage = (el) => {
    const t = el.tagName;
    if (t === 'IMG' || t === 'VIDEO' || t === 'CANVAS' || t === 'PICTURE' || t === 'image') return true;
    const bi = getComputedStyle(el).backgroundImage;
    return bi && bi !== 'none' && bi.includes('url(');
  };
  const visible = (el) => el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
  let hits = 0, total = 0;
  const cols = 48, rows = Math.round(48 * vh / vw);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    total++;
    const stack = document.elementsFromPoint((i + 0.5) * vw / cols, (j + 0.5) * vh / rows);
    if (stack.some((el) => isImage(el) && visible(el))) hits++;
  }
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = n.textContent.trim();
    if (s.length < 2) continue;
    const el = n.parentElement;
    if (!el || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw || r.width === 0) continue;
    const cs = getComputedStyle(el);
    texts.push({ text: s.slice(0, 60), x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), size: parseFloat(cs.fontSize), family: cs.fontFamily.split(',')[0].replace(/["']/g, ''), weight: cs.fontWeight, ls: cs.letterSpacing, tt: cs.textTransform, color: cs.color });
  }
  texts.sort((a, b) => a.y - b.y || a.x - b.x);
  const largest = [...texts].sort((a, b) => b.size - a.size).slice(0, 3);
  const navs = [...document.querySelectorAll('header, nav, [class*="header" i], [class*="nav" i]')].filter(visible).map((el) => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return { tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), position: cs.position, top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width), bg: cs.backgroundColor, links: el.querySelectorAll('a').length };
  }).filter((n) => n.h > 0 && n.h < 260 && n.w > vw * 0.5).slice(0, 4);
  return { scrollY: Math.round(scrollY), imageShare: Math.round((hits / total) * 100), firstWords: texts.slice(0, 6), largest, navs, textCount: texts.length };
}

// Runs in the page once at the top: page-wide typography, rhythm, grid, colour and motion inventory.
function pageProbe() {
  const vw = innerWidth, vh = innerHeight;
  const visible = (el) => el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : true;
  const rgbHex = (c) => { const m = c.match(/\d+(\.\d+)?/g); if (!m) return c; const [r, g, b, a] = m.map(Number); if (a === 0) return 'transparent'; return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''); };
  const docTop = (r) => Math.round(r.top + scrollY);
  // Typography: group text-bearing elements by computed style, weighted by characters.
  const styles = new Map(), colors = new Map(), lines = [], textBlocks = [];
  const lefts = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = n.textContent.replace(/\s+/g, ' ').trim();
    if (s.length < 2) continue;
    const el = n.parentElement;
    if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || !visible(el)) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const size = parseFloat(cs.fontSize);
    const key = `${size}|${cs.fontFamily.split(',')[0].replace(/["']/g, '')}|${cs.fontWeight}|${cs.letterSpacing}|${cs.textTransform}|${cs.lineHeight}`;
    const e = styles.get(key) || { chars: 0, n: 0, sample: s.slice(0, 50) };
    e.chars += s.length; e.n++; styles.set(key, e);
    const hex = rgbHex(cs.color); colors.set(hex, (colors.get(hex) || 0) + s.length);
    const words = s.split(' ').length;
    textBlocks.push({ top: docTop(r), words });
    if (r.left >= 0 && r.left < vw) lefts.set(Math.round(r.left), (lefts.get(Math.round(r.left)) || 0) + s.length);
    if (s.length > 140 && size <= 22) {
      const lh = parseFloat(cs.lineHeight) || size * 1.3;
      const nLines = Math.max(1, Math.round(r.height / lh));
      lines.push({ size, widthPx: Math.round(r.width), charsPerLine: Math.round(s.length / nLines), sample: s.slice(0, 40) });
    }
  }
  const type = [...styles.entries()].map(([k, v]) => { const [size, family, weight, ls, tt, lh] = k.split('|'); return { size: +size, family, weight, letterSpacing: ls, transform: tt, lineHeight: lh, ...v }; })
    .sort((a, b) => b.size - a.size).slice(0, 40);
  // Image blocks in document order, grouped into rows.
  const imgs = [];
  for (const el of document.querySelectorAll('img, video, canvas, picture, [style*="background-image"], div, section, figure, a, span')) {
    const t = el.tagName;
    const isMedia = t === 'IMG' || t === 'VIDEO' || t === 'CANVAS';
    const bi = isMedia ? '' : getComputedStyle(el).backgroundImage;
    if (!isMedia && !(bi && bi.includes('url('))) continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 120) continue;
    imgs.push({ tag: t.toLowerCase(), top: docTop(r), h: Math.round(r.height), w: Math.round(r.width), left: Math.round(r.left), ratio: +(r.width / r.height).toFixed(2), fullBleed: r.width >= vw * 0.95, link: !!el.closest('a'), fit: getComputedStyle(el).objectFit, src: (el.currentSrc || el.src || bi || '').slice(-60) });
  }
  imgs.sort((a, b) => a.top - b.top);
  const rows = [];
  for (const im of imgs) {
    const last = rows.at(-1);
    if (last && im.top < last.top + last.h * 0.5) { last.items.push(im); last.bottom = Math.max(last.bottom, im.top + im.h); }
    else rows.push({ top: im.top, h: im.h, bottom: im.top + im.h, items: [im] });
  }
  const sequence = [];
  let cursor = 0;
  for (const row of rows.filter((r) => r.top < vh * 5)) {
    const words = textBlocks.filter((t) => t.top >= cursor && t.top < row.top).reduce((a, t) => a + t.words, 0);
    if (words) sequence.push({ kind: 'text', words, from: cursor, to: row.top });
    sequence.push({ kind: 'image', top: row.top, h: row.h, n: row.items.length, ratios: row.items.map((i) => i.ratio), widths: row.items.map((i) => i.w), fullBleed: row.items.some((i) => i.fullBleed), links: row.items.filter((i) => i.link).length });
    cursor = Math.max(cursor, row.bottom);
  }
  const tail = textBlocks.filter((t) => t.top >= cursor && t.top < vh * 5).reduce((a, t) => a + t.words, 0);
  if (tail) sequence.push({ kind: 'text', words: tail, from: cursor, to: vh * 5 });
  // Grid: declared max-widths and the commonest text left edges (gutters).
  const maxWidths = new Map();
  for (const el of document.querySelectorAll('body *')) {
    const mw = getComputedStyle(el).maxWidth;
    if (mw !== 'none' && mw.endsWith('px') && parseFloat(mw) >= 300) maxWidths.set(mw, (maxWidths.get(mw) || 0) + 1);
  }
  // Text over imagery: sample text elements, look underneath for media and an intervening tint.
  const overImage = [];
  for (const el of [...document.querySelectorAll('h1, h2, h3, p, a, span')].filter(visible).slice(0, 600)) {
    const r = el.getBoundingClientRect();
    if (!el.textContent.trim() || r.width === 0 || r.top < 0 || r.top > vh) continue;
    const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const i = stack.findIndex((s) => ['IMG', 'VIDEO', 'CANVAS'].includes(s.tagName) || getComputedStyle(s).backgroundImage.includes('url('));
    if (i <= 0) continue;
    const between = stack.slice(0, i).map((s) => getComputedStyle(s)).find((cs) => cs.backgroundImage.includes('gradient') || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent'));
    overImage.push({ text: el.textContent.trim().slice(0, 40), size: parseFloat(getComputedStyle(el).fontSize), color: rgbHex(getComputedStyle(el).color), tint: between ? (between.backgroundImage.includes('gradient') ? between.backgroundImage.slice(0, 80) : between.backgroundColor) : 'none' });
    if (overImage.length >= 8) break;
  }
  // Interactive surfaces and libraries.
  const anim = document.getAnimations().slice(0, 30).map((a) => { const t = a.effect?.getTiming?.() || {}; return { name: a.animationName || a.transitionProperty || a.id || 'waapi', duration: t.duration, easing: t.easing, iterations: t.iterations, target: a.effect?.target ? `${a.effect.target.tagName.toLowerCase()}.${String(a.effect.target.className).slice(0, 30)}` : '' }; });
  const g = window.gsap, ST = window.ScrollTrigger || g?.core?.globals?.()?.ScrollTrigger;
  const triggers = ST?.getAll ? ST.getAll() : [];
  const sticky = [...document.querySelectorAll('body *')].filter((el) => getComputedStyle(el).position === 'sticky').slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
  const buttons = [...document.querySelectorAll('a, button')].filter(visible).map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0);
  return {
    vw, vh, docHeight: document.documentElement.scrollHeight,
    ground: { body: rgbHex(getComputedStyle(document.body).backgroundColor), html: rgbHex(getComputedStyle(document.documentElement).backgroundColor) },
    inkByChars: [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    type, lineLengths: lines.slice(0, 8),
    maxWidths: [...maxWidths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    textLeftEdges: [...lefts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    imageCount: imgs.length, imageRowsFirst5Screens: rows.filter((r) => r.top < vh * 5).length,
    ratios: [...new Set(imgs.map((i) => i.ratio))].slice(0, 30), fullBleedCount: imgs.filter((i) => i.fullBleed).length,
    imagesInLinks: imgs.filter((i) => i.link).length, sequence,
    overImage,
    motion: {
      runningAnimations: anim,
      libs: { gsap: !!g, gsapVersion: g?.version, scrollTrigger: !!ST, triggers: triggers.length, pinned: triggers.filter((t) => t.pin).length, scrubbed: triggers.filter((t) => t.vars?.scrub).length, lenis: !!(window.lenis || window.Lenis || document.documentElement.classList.contains('lenis')), locomotive: !!document.querySelector('[data-scroll-container]'), swiper: !!(window.Swiper || document.querySelector('.swiper, .swiper-container')), three: !!window.THREE, barba: !!window.barba, webflow: !!window.Webflow },
      speedAttrs: document.querySelectorAll('[data-speed], [data-scroll-speed], [data-lag]').length,
      htmlClass: document.documentElement.className.slice(0, 120),
    },
    sticky,
    smallestTargets: buttons.filter((r) => r.height < 44).length + ' of ' + buttons.length + ' links/buttons under 44px tall',
    scripts: [...document.scripts].map((s) => s.src).filter(Boolean).map((s) => s.replace(/\?.*$/, '').split('/').slice(-1)[0]).slice(0, 25),
    stylesheets: [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href),
    inlineCss: [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n'),
  };
}

// Node side: mine fetched CSS for motion, hover, breakpoints, clamp() and max-width values.
async function cssInventory(request, hrefs, inline) {
  let text = inline || '';
  for (const href of hrefs.slice(0, 8)) {
    try { const r = await request.get(href, { timeout: 15000 }); if (r.ok()) text += '\n' + await r.text(); } catch { /* recorded as missing below */ }
  }
  const count = (re) => { const m = new Map(); for (const x of text.matchAll(re)) m.set(x[1], (m.get(x[1]) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8); };
  return {
    cssBytes: text.length,
    transitionDurations: count(/transition[^;:]*:[^;]*?(\d*\.?\d+m?s)/g),
    easings: count(/(cubic-bezier\([^)]*\)|ease-in-out|ease-out|ease-in|linear)/g),
    animationDurations: count(/animation(?:-duration)?\s*:[^;]*?(\d*\.?\d+m?s)/g),
    keyframes: count(/@keyframes\s+([\w-]+)/g),
    hoverRules: (text.match(/:hover/g) || []).length,
    hoverTransforms: (text.match(/:hover[^{]*\{[^}]*(transform|scale)/g) || []).length,
    hoverOpacity: (text.match(/:hover[^{]*\{[^}]*opacity/g) || []).length,
    breakpoints: count(/@media[^{]*?(?:max|min)-width\s*:\s*(\d+(?:\.\d+)?(?:px|em|rem))/g),
    clampSizes: count(/font-size\s*:\s*(clamp\([^;}]*\)|\d*\.?\d+vw)/g),
    maxWidths: count(/max-width\s*:\s*(\d+(?:\.\d+)?(?:px|rem|em|vw))/g),
    reducedMotionQueries: (text.match(/prefers-reduced-motion/g) || []).length,
    scrollBehavior: count(/scroll-behavior\s*:\s*(\w+)/g),
    fontFaces: count(/font-family\s*:\s*["']?([^;"',}]+)/g),
  };
}

async function captureViewport(browser, attempt, key, site, vpName, vp) {
  const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.deviceScaleFactor, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch, userAgent: vp.userAgent, reducedMotion: attempt.reducedMotion, locale: 'en-US' });
  const page = await ctx.newPage();
  const out = { viewport: vpName, reducedMotion: attempt.reducedMotion, shots: [], screens: [] };
  try {
    const resp = await page.goto(site.live, { waitUntil: 'domcontentloaded', timeout: 60000 });
    out.status = resp?.status();
    await sleep(400);
    out.earlyCover = await page.evaluate(coverProbe);
    await settle(page, attempt.settle);
    const probe = await page.evaluate(coverProbe);
    out.lateCover = probe;
    if ((out.status ?? 0) >= 400 || /just a moment|attention required|access denied|forbidden/i.test(probe.title) || probe.textChars < 40) {
      out.blocked = `status ${out.status}, title "${probe.title}", ${probe.textChars} text chars`;
      return out;
    }
    if (probe.covers.length && attempt.reducedMotion === 'reduce') { out.preloaderStuck = probe.covers; return out; }
    // Dismiss the cookie notice so it does not sit over the composition or skew the type inventory.
    out.cookieDismissed = await page.evaluate(() => {
      // Some notices use a plain div as the button; take the innermost element whose whole text matches.
      const b = [...document.querySelectorAll('button, a, [role="button"], div, span')].reverse().find((el) => /^\s*(accept( all)?|agree|allow all|ok)\s*$/i.test(el.textContent) && el.getBoundingClientRect().width > 0);
      if (!b) return false;
      b.click();
      return b.textContent.trim();
    });
    await sleep(1200);
    // Slow pass to the bottom (capped) so lazy images and scroll reveals fire, then back to the top.
    const vh = vp.viewport.height;
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    out.loadPassBottom = await wheelTo(page, Math.min(docH, vh * 8), vp.viewport);
    await wheelTo(page, 0, vp.viewport);
    await settle(page, 800);
    out.page = await page.evaluate(pageProbe);
    out.page.css = await cssInventory(ctx.request, out.page.stylesheets, out.page.inlineCss);
    delete out.page.inlineCss;
    for (const off of vp.offsets) {
      const y = await wheelTo(page, off * vh, vp.viewport);
      await settle(page, 2500);
      const screen = await page.evaluate(screenProbe);
      out.screens.push({ offset: off, requestedY: off * vh, ...screen, actualY: y });
      const buf = await page.screenshot({ type: 'png' });
      out.shots.push(await saveJpeg(buf, join(RENDERS, `${key}-${vpName}-${off}.jpg`)));
    }
    if (vp.full) {
      await wheelTo(page, 0, vp.viewport);
      await settle(page, 1500);
      const buf = await page.screenshot({ type: 'png', fullPage: true, timeout: 90000 });
      out.shots.push(await saveJpeg(buf, join(RENDERS, `${key}-${vpName}-full.jpg`)));
    }
  } catch (err) {
    out.error = String(err.message || err).split('\n')[0];
  } finally {
    await ctx.close();
  }
  return out;
}

async function captureGallery(browser, key, site) {
  const rec = { awwwards: site.awwwards, files: [] };
  const ctx = await browser.newContext({ userAgent: UA_DESKTOP, viewport: { width: 1440, height: 900 } });
  try {
    const page = await ctx.newPage();
    const resp = await page.goto(site.awwwards, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => ({ status: () => `error ${e.message.split('\n')[0]}` }));
    rec.awwwardsStatus = resp.status();
    let urls = site.gallery;
    if (rec.awwwardsStatus === 200) {
      const found = await page.evaluate(() => [...document.querySelectorAll('img')].map((i) => i.currentSrc || i.src).filter((s) => /assets\.awwwards\.com\/awards\/(media\/cache\/[^/]+\/)?submissions\//.test(s)));
      urls = [...new Set([...found, ...urls])];
    }
    let i = 0;
    for (const url of urls.slice(0, 4)) {
      const r = await ctx.request.get(url, { timeout: 30000 });
      if (!r.ok()) { rec.files.push({ url, status: r.status() }); continue; }
      rec.files.push({ url, ...(await saveJpeg(await r.body(), join(RENDERS, `${key}-awwwards-gallery-${++i}.jpg`))) });
    }
  } finally {
    await ctx.close();
  }
  return rec;
}

async function captureSite(key) {
  const site = SITES[key];
  const result = { site: key, live: site.live, capturedAt: new Date().toISOString(), attempts: [], viewports: {} };
  // CAPTURE_VIEWPORTS=mobile re-runs one viewport and keeps the other's earlier record.
  const only = process.env.CAPTURE_VIEWPORTS?.split(',');
  if (only) {
    try {
      const prev = JSON.parse(readFileSync(join(MEASURE, `${key}.json`), 'utf8'));
      for (const [vpName, rec] of Object.entries(prev.viewports)) if (!only.includes(vpName)) result.viewports[vpName] = rec;
      result.attempts = prev.attempts.filter((a) => !only.includes(a.viewport));
    } catch { /* no earlier record */ }
  }
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    if (only && !only.includes(vpName)) continue;
    for (const [n, attempt] of ATTEMPTS.entries()) {
      const browser = await chromium.launch({ headless: true, channel: attempt.channel, args: ['--disable-blink-features=AutomationControlled'] });
      try {
        const r = await captureViewport(browser, attempt, key, site, vpName, vp);
        result.attempts.push({ viewport: vpName, attempt: n + 1, channel: attempt.channel || 'headless-shell', reducedMotion: attempt.reducedMotion, status: r.status, blocked: r.blocked, preloaderStuck: !!r.preloaderStuck, error: r.error, shots: r.shots.length });
        if (r.shots.length) { result.viewports[vpName] = r; break; }
        if (n === ATTEMPTS.length - 1) result.viewports[vpName] = r;
      } finally {
        await browser.close();
      }
    }
  }
  const browser = await chromium.launch({ headless: true });
  try { result.gallery = await captureGallery(browser, key, site); } finally { await browser.close(); }
  writeFileSync(join(MEASURE, `${key}.json`), JSON.stringify(result, null, 1));
  const shots = Object.values(result.viewports).flatMap((v) => v.shots || []).concat(result.gallery.files.filter((f) => f.bytes));
  console.log(`${key}: ${shots.length} files, ${shots.reduce((a, s) => a + s.bytes, 0)} bytes; attempts ${JSON.stringify(result.attempts)}`);
}

mkdirSync(RENDERS, { recursive: true });
mkdirSync(MEASURE, { recursive: true });
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SITES);
for (const key of wanted) {
  if (!SITES[key]) throw new Error(`unknown site ${key}; known: ${Object.keys(SITES).join(', ')}`);
  await captureSite(key);
}
