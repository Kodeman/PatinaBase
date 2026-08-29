/* MB's own build check -- not the C.8 probe (that is MR's, in a different
   context). This exists so the file MB hands over is known to boot, publish its
   state contract and hold its numbers. */
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL = pathToFileURL(join(HERE, 'index.html')).href;

const out = [];
const say = (k, v) => { out.push(k + ': ' + v); console.log(k + ': ' + v); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1560, height: 1000 } });
const errors = [], external = [];
page.on('pageerror', e => errors.push(String(e.message)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) external.push(r.url()); });

await page.goto(URL);
await page.waitForFunction(() => window.__mockReady === true, null, { timeout: 8000 }).catch(() => {});
say('mockReady', await page.evaluate(() => window.__mockReady === true));
say('mockError', await page.evaluate(() => window.__mockError || 'none'));
say('externalRequests', external.length + (external.length ? ' ' + external.slice(0, 5).join(',') : ''));
say('pageErrors', errors.length + (errors.length ? ' :: ' + errors.slice(0, 5).join(' | ') : ''));

await page.evaluate(() => window.__lensSettled());

say('fonts', await page.evaluate(() =>
  ['16px "Playfair Display"', '16px Inter', '16px "DM Mono"'].map(f => f + '=' + document.fonts.check(f)).join(' ')));

/* SC1 / SC3 / SC11 / SC12 at scroll 0, 400, 1200 */
for (const top of [0, 400, 1200]) {
  const r = await page.evaluate(async (t) => {
    const f = document.getElementById('frame-1440');
    f.scrollTo({ top: t, behavior: 'auto' });
    await window.__lensSettled();
    const topIn = (frame, el) => { let y = 0, n = el; while (n && n !== frame) { y += n.offsetTop; n = n.offsetParent; } return y; };
    const head = document.getElementById('head-approvals-1440');
    const lens = document.getElementById('lens-1440');
    const map = [...f.querySelectorAll('.region')].map(x => x.getAttribute('data-region') + '=' + x.getAttribute('data-density')).join(' ');
    return {
      sc1: topIn(f, head),
      lensHeight: getComputedStyle(lens).getPropertyValue('--lens-height').trim(),
      lensOpen: lens.getAttribute('data-lens-open'),
      bandH: lens.getBoundingClientRect().height,
      state: f.getAttribute('data-lens-state'),
      index: document.getElementById('rail-1440').getAttribute('data-reading-index'),
      map
    };
  }, top);
  say('scroll' + top, JSON.stringify(r));
}

/* shadow census */
say('shadows', await page.evaluate(() => {
  const bad = [], sites = {};
  document.querySelectorAll('*').forEach(el => {
    const cs = getComputedStyle(el);
    if (cs.boxShadow && cs.boxShadow !== 'none') {
      const key = el.className && el.className.baseVal === undefined ? String(el.className).split(' ')[0] : 'svg';
      sites[key] = (sites[key] || 0) + 1;
      if (cs.boxShadow !== 'rgba(44, 41, 38, 0.08) 0px 1px 2px 0px') bad.push(key + '=' + cs.boxShadow);
    }
    if (cs.filter && cs.filter.indexOf('drop-shadow') >= 0) bad.push('dropshadow:' + key);
  });
  return JSON.stringify({ sites, wrongValue: bad });
}));

/* overflow */
say('overflow', await page.evaluate(() => {
  const res = {};
  ['frame-1440', 'frame-1280', 'frame-390'].forEach(id => {
    const f = document.getElementById(id);
    let worst = 0, who = '';
    f.querySelectorAll('*').forEach(el => {
      const d = el.scrollWidth - el.clientWidth;
      if (d > worst) { worst = d; who = el.className || el.tagName; }
    });
    res[id] = { frame: f.scrollWidth - f.clientWidth, worstChild: worst, who: String(who).slice(0, 40) };
  });
  return JSON.stringify(res);
}));

/* reduced-motion parity: media query vs the dev-bar toggle */
async function stillCount() {
  return page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('#stage *').forEach(el => {
      const cs = getComputedStyle(el);
      const d = (cs.transitionDuration + ',' + cs.animationDuration).split(',').map(s => parseFloat(s) || 0);
      if (d.some(x => x > 0)) n++;
    });
    return n;
  });
}
await page.evaluate(() => document.querySelector('.devbtn[data-go="reduced"]').click());
say('animatingAfterToggle', await stillCount());
await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
await page.emulateMedia({ reducedMotion: 'reduce' });
say('animatingAfterMediaQuery', await stillCount());
await page.emulateMedia({ reducedMotion: 'no-preference' });
await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());

/* dev-bar reversibility */
const snap = () => page.evaluate(() => JSON.stringify(['1440', '1280', '390'].map(k => {
  const f = document.getElementById('frame-' + k);
  return [k, f.scrollTop, f.getAttribute('data-lens-state'), f.getAttribute('data-reading-index'),
    document.getElementById('lens-' + k).getAttribute('data-lens-open'),
    [...f.querySelectorAll('.region')].map(r => r.getAttribute('data-density')).join(''),
    document.getElementById('stage').getAttribute('data-motion')];
})));
const rest0 = await snap();
for (const go of ['condensed', 'ffe', 'w1280', 'w390', 'reduced', 'slow']) {
  await page.evaluate(g => document.querySelector('.devbtn[data-go="' + g + '"]').click(), go);
  await page.waitForTimeout(900);
  const mid = await snap();
  await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__lensSettled());
  const back = await snap();
  say('reversible:' + go, (back === rest0) + '  entered=' + mid.slice(0, 90));
}

/* the navigator lands where it says */
say('jump', await page.evaluate(async () => {
  const f = document.getElementById('frame-1440');
  const res = [];
  for (const id of ['schedule', 'ffe', 'money', 'care', 'record', 'approvals']) {
    f.querySelector('.seg[data-seg="' + id + '"]').click();
    await new Promise(r => setTimeout(r, 1600));
    await window.__lensSettled();
    const topIn = (fr, el) => { let y = 0, n = el; while (n && n !== fr) { y += n.offsetTop; n = n.offsetParent; } return y; };
    const head = document.getElementById('head-' + id + '-1440');
    res.push(id + ':y=' + Math.round(topIn(f, head) - f.scrollTop) + ',idx=' +
      document.getElementById('rail-1440').getAttribute('data-reading-index'));
  }
  return res.join(' ');
}));

/* oscillation: 20-step slow scroll, count density changes per region */
await page.evaluate(() => document.querySelector('.devbtn[data-go="rest"]').click());
say('oscillation', await page.evaluate(async () => {
  const f = document.getElementById('frame-1440');
  const regions = [...f.querySelectorAll('.region')];
  const changes = {};
  let prev = {};
  const step = Math.floor((f.scrollHeight - f.clientHeight) / 20);
  for (let i = 0; i <= 20; i++) {
    f.scrollTo({ top: i * step, behavior: 'auto' });
    await window.__lensSettled();
    regions.forEach(r => {
      const id = r.getAttribute('data-region'), d = r.getAttribute('data-density');
      if (prev[id] && prev[id] !== d) changes[id] = (changes[id] || 0) + 1;
      prev[id] = d;
    });
  }
  return JSON.stringify(changes);
}));

/* CLS over a scripted scroll */
say('cls', await page.evaluate(async () => {
  let cls = 0;
  const po = new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) cls += e.value; }));
  po.observe({ type: 'layout-shift', buffered: false });
  const f = document.getElementById('frame-1440');
  const step = Math.floor((f.scrollHeight - f.clientHeight) / 30);
  for (let i = 0; i <= 30; i++) { f.scrollTo({ top: i * step, behavior: 'auto' }); await window.__lensSettled(); }
  await new Promise(r => setTimeout(r, 200));
  po.disconnect();
  return cls;
}));

/* focusables without an accessible name */
say('unnamedFocusables', await page.evaluate(() => {
  const sel = 'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';
  const bad = [];
  document.querySelectorAll(sel).forEach(el => {
    const n = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim();
    if (!n) bad.push(el.className || el.tagName);
  });
  return bad.length + (bad.length ? ' :: ' + bad.slice(0, 6).join(',') : '');
}));

say('counts', await page.evaluate(() => JSON.stringify({
  ffeRows1440: document.querySelectorAll('#frame-1440 .ffe-row').length,
  rooms1440: document.querySelectorAll('#frame-1440 .room-head').length,
  crops: document.querySelectorAll('.thumb.is-catalog').length,
  paperHeight1440: document.getElementById('frame-1440').scrollHeight,
  frames: document.querySelectorAll('.frame').length
})));

await browser.close();
