// Cinematic arrival, real-Chromium lane (SQ-343). The vm oracle (cinematic-oracle.mjs) cannot see CSS, hit testing,
// touch or layout shift; this lane runs the arrival in headless Chromium against the SQ-333 "ARRIVAL v3 MERGED CONTRACT"
// (O1 input, O2 cold load, O5 hold and reduced motion, O6 screen reader) and the SQ-340 findings F1-F11, F19.
// Pages: cinematic/index.html and every cinematic/document*.html, at 1440x900 and 390x844 (isMobile, hasTouch).
// Usage: node artifacts/designer-portal-motion-2026-09-25/design/verify/cinematic-browser.mjs [--self-test]
//   --self-test runs B1, B2 and B7 on index.html and document.html at 1440 only.
// Prints one PASS/FAIL line per check and case, then `PASS n/n` or `FAIL k/n` (k of n failed).
// Needs playwright-core (resolved from apps/designer-portal) and network access to Google Fonts. Chromium cannot launch
// inside the macOS command sandbox, so run it with the sandbox disabled. Exit 1 on any failure.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DESIGN = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CINE = path.join(DESIGN, 'cinematic');
const ALL = ['index.html', ...fs.readdirSync(CINE).filter((f) => /^document.*\.html$/.test(f)).sort()];
const SELF = process.argv.includes('--self-test');
const PAGES = SELF ? ['index.html', 'document.html'] : ALL;
const DESK = { w: 1440, h: 900, touch: false }, PHONE = { w: 390, h: 844, touch: true };
const VPS = SELF ? [DESK] : [DESK, PHONE];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vpName = (v) => `${v.w}x${v.h}`;

// ---------- playwright-core: from apps/designer-portal in this checkout, else in the main checkout (worktrees) ----------
function playwright() {
  const roots = [path.resolve(DESIGN, '../../..')];
  try {
    const common = execFileSync('git', ['-C', DESIGN, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
    roots.push(path.dirname(common));
  } catch {}
  for (const root of roots) {
    const req = createRequire(path.join(root, 'apps/designer-portal/package.json'));
    for (const via of ['playwright-core', '@playwright/test', 'playwright']) {
      try { const from = req.resolve(via); return createRequire(from)(createRequire(from).resolve('playwright-core')); } catch {}
    }
  }
  throw new Error('playwright-core not found from apps/designer-portal (run pnpm install)');
}

// ---------- static server for design/ ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
function serve() {
  const server = http.createServer((req, res) => {
    const f = path.join(DESIGN, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!f.startsWith(DESIGN + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, b) => {
      if (e) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(b);
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

// ---------- results ----------
const results = [];
function report(id, what, pass, detail) {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${what}${detail ? ' · ' + detail : ''}`);
}
async function run(id, what, fn) {
  try { const [pass, detail] = await fn(); report(id, what, pass, detail); }
  catch (e) { report(id, what, false, 'error: ' + String(e && e.message || e).split('\n')[0]); }
}

// ---------- browser plumbing ----------
let browser, BASE;
const fontCache = new Map(); // one network fetch per font URL: later contexts stay cold in the page, but not at Google's mercy
async function context(vp, o = {}) {
  const c = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.touch, hasTouch: vp.touch, reducedMotion: o.rm ? 'reduce' : 'no-preference' });
  await c.route(/fonts\.(googleapis|gstatic)\.com/, async (route) => {
    const u = route.request().url();
    if (o.blockFonts) return route.abort(); // the stylesheet and the font files both fail (ERR_FAILED)
    let hit = fontCache.get(u);
    if (!hit) { const r = await route.fetch(); hit = { status: r.status(), headers: r.headers(), body: await r.body() }; if (r.ok()) fontCache.set(u, hit); }
    return route.fulfill(hit);
  });
  if (o.css404) await c.route(/\/cinematic\/arrival\.css(\?|$)/, (r) => r.fulfill({ status: 404, body: 'not found' }));
  if (o.jsHang) await c.route(/\/cinematic\/arrival\.js(\?|$)/, () => {}); // never answered: the parser-blocking script hangs
  // phase trajectory from the first script on, for cold loads
  await c.addInitScript(() => {
    window.__tl = []; let prev;
    setInterval(() => { const a = window.K && window.K.arrival; const ph = a ? a.phase() : 'noK'; if (ph !== prev) { window.__tl.push([Math.round(performance.now()), ph, a ? a.advances() : 0]); prev = ph; } }, 4);
  });
  const p = await c.newPage();
  p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message.split('\n')[0]));
  return p;
}
const done = (p) => p.context().close().catch(() => {});
const cold = async (file, vp, o) => { const p = await context(vp, o); await p.goto(BASE + file, { waitUntil: 'commit' }); return p; };
async function resting(file, vp, o) { // the ordinary page, fonts ready, for replays
  const p = await context(vp, o); await p.goto(BASE + file + '?arrive=0'); await p.evaluate(() => document.fonts.ready); await sleep(150); return p;
}
const waitPhase = (p, ph, timeout = 8000) => p.waitForFunction((ph) => window.K && window.K.arrival && window.K.arrival.phase() === ph, ph, { timeout, polling: 16 });
async function toHold(p) {
  const ok = await p.evaluate(() => { window.scrollTo(0, 0); return window.K.arrival.replay(); });
  if (!ok) throw new Error('replay did not start');
  await waitPhase(p, 'hold');
  return p.evaluate(() => performance.now());
}
const hasAct = (f) => /data-part="(?:[^"]*\s)?act(?:\s[^"]*)?"/.test(fs.readFileSync(path.join(CINE, f), 'utf8'));
// in-page helpers, installed on demand
function helpers() {
  const CTRL = 'a[href],button,input,textarea,select,summary,label,[role="button"],[tabindex]:not([tabindex="-1"]),[data-open-record],[data-sheet-open],[data-detail]';
  const part = (n) => [...document.querySelectorAll(`[data-part~="${n}"]`)].find((e) => e.getClientRects().length > 0) || null;
  const label = (e) => e ? (e.tagName + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '') + ':' + (e.textContent || '').trim().slice(0, 20)) : 'null';
  const harness = (e) => !!(e && e.closest('[data-arr],.mc,.fixture-foot,[data-arr-replay]'));
  const center = (e) => { const r = e.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; };
  const opacity = (e) => { let o = 1; for (let x = e; x && x.nodeType === 1; x = x.parentElement) o *= +getComputedStyle(x).opacity; return o; };
  const shown = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(e).visibility === 'visible' && opacity(e) > 0.01; };
  // activations: a click that reaches a control (the innermost one) after the engine's capture handlers
  window.__hits = { act: 0, other: [] };
  const act = part('act');
  document.querySelectorAll(CTRL).forEach((el) => {
    if (harness(el) || el.__hit) return; el.__hit = true;
    el.addEventListener('click', (e) => {
      if (e.target.closest(CTRL) !== el) return;
      if (act && (el === act || act.contains(el))) window.__hits.act++; else window.__hits.other.push(label(el));
      if (el.closest('a[href]')) e.preventDefault(); // keep the page to count on
    });
  });
  addEventListener('keydown', () => { if (window.__t3 == null) window.__t3 = performance.now(); }, true);
  window.__h = { CTRL, part, label, harness, center, opacity, shown };
}
const install = (p) => p.evaluate(helpers);
const hits = (p) => p.evaluate(() => ({ ...window.__hits, adv: window.K.arrival.advances(), fin: (window.K.arrival.schedule() || {}).finished, ph: window.K.arrival.phase() }));
const restAfter = (p, ms = 6000) => waitPhase(p, null, ms);

// ---------- B1: a cold load reaches the hold with no advance before it (F1) ----------
async function b1(file, vp, runs = 3) {
  const out = [];
  for (let i = 0; i < runs; i++) {
    const p = await cold(file, vp);
    try {
      await p.waitForFunction(() => window.__tl.some((x) => x[1] === 'hold' || x[1] === 'assemble'), null, { timeout: 7000, polling: 16 }).catch(() => {});
      await sleep(400); // still holding a beat later: a late layout shift is not input either
      const tl = await p.evaluate(() => window.__tl);
      const h = tl.findIndex((x) => x[1] === 'hold'), a = tl.findIndex((x) => x[1] === 'assemble');
      const last = tl[tl.length - 1];
      const ok = h >= 0 && a < 0 && tl[h][2] === 0 && last[1] === 'hold' && last[2] === 0;
      out.push(ok ? 'hold' : (h < 0 ? (a < 0 ? 'no arrival' : 'advanced before hold') : 'advanced in hold') + ' [' + tl.map((x) => x[0] + ':' + x[1]).join(' ') + ']');
    } finally { await done(p); }
  }
  return [out.every((x) => x === 'hold'), out.filter((x) => x !== 'hold').length ? out.join(' | ') : runs + '/' + runs + ' runs hold'];
}

// ---------- B2: a click at the act's rendered centre early in Act 3 activates it once, nothing else (F2) ----------
async function b2(file, vp, off) {
  const p = await resting(file, vp);
  try {
    await install(p); await toHold(p); await sleep(150);
    await p.evaluate(() => { window.__t3 = null; });
    await p.keyboard.press('a');
    const pt = await p.evaluate(async (off) => {
      while (performance.now() < window.__t3 + off) await new Promise((r) => setTimeout(r, 1));
      const { part, center, label } = window.__h, c = center(part('act'));
      return { ...c, at: Math.round(performance.now() - window.__t3), under: label(document.elementFromPoint(c.x, c.y)) };
    }, off);
    await p.mouse.click(pt.x, pt.y);
    await restAfter(p).catch(() => {}); await sleep(200);
    const h = await hits(p);
    return [h.act === 1 && h.other.length === 0, `+${pt.at}ms under=${pt.under} act=${h.act} other=[${h.other.join(',')}]`];
  } finally { await done(p); }
}

// ---------- B3: a double-click in the hold advances once and rests, not cut (F3) ----------
async function b3(file, vp) {
  const p = await resting(file, vp);
  try {
    await install(p); await toHold(p); await sleep(150);
    const t = await p.evaluate(() => {
      const { CTRL } = window.__h;
      for (const e of document.querySelectorAll('main p, main h1, main h2, main span, main li')) {
        if (e.closest(CTRL) || e.closest('[data-arr],[data-part~="act"],[data-part~="act2"]') || e.textContent.trim().length < 8) continue;
        const rg = document.createRange(); rg.selectNodeContents(e);
        const r = [...rg.getClientRects()].find((r) => r.width > 40 && r.top > 60 && r.bottom < innerHeight - 60);
        if (r) return { x: r.left + 12, y: (r.top + r.bottom) / 2, t: e.textContent.trim().slice(0, 18) };
      }
      return { x: 24, y: innerHeight - 40, t: '(blank)' };
    });
    await p.mouse.dblclick(t.x, t.y);
    await restAfter(p).catch(() => {}); await sleep(100);
    const h = await hits(p);
    return [h.ph === null && h.adv === 1 && h.fin === 'rest' && h.act === 0 && h.other.length === 0, `on "${t.t}" adv=${h.adv} finished=${h.fin} phase=${h.ph}`];
  } finally { await done(p); }
}

// ---------- touch and pointer on the act in the hold ----------
async function touchTap(p, pt) {
  const c = await p.context().newCDPSession(p);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] });
  await sleep(50);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
// B4: a touch tap on the act activates it with no advance (F4)
async function b4(file, vp) {
  const p = await resting(file, vp);
  try {
    await install(p); await toHold(p); await sleep(150);
    await touchTap(p, await p.evaluate(() => window.__h.center(window.__h.part('act'))));
    await sleep(700);
    const h = await hits(p);
    return [h.act === 1 && h.other.length === 0 && h.adv === 0, `act=${h.act} other=[${h.other.join(',')}] adv=${h.adv}`];
  } finally { await done(p); }
}
// B5: a drag that starts on the act and releases off it advances, and does not activate (F5)
async function b5(file, vp) {
  const p = await resting(file, vp);
  try {
    await install(p); await toHold(p); await sleep(150);
    const a = await p.evaluate(() => window.__h.center(window.__h.part('act')));
    const dy = a.y > vp.h / 2 ? -160 : 160, dx = a.x > vp.w / 2 ? -60 : 60;
    await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + dx, a.y + dy, { steps: 8 }); await p.mouse.up();
    await sleep(300);
    const h = await hits(p);
    return [h.adv === 1 && h.act === 0 && h.other.length === 0, `adv=${h.adv} act=${h.act} phase=${h.ph}`];
  } finally { await done(p); }
}

// ---------- B6: Tab in Act 3 rests with focus on the act or the landing target (F10) ----------
async function b6(file, vp) {
  const p = await resting(file, vp);
  try {
    await install(p); await toHold(p); await sleep(150);
    await p.keyboard.press('a'); await sleep(300);
    await p.keyboard.press('Tab');
    await restAfter(p).catch(() => {}); await sleep(100);
    const r = await p.evaluate(() => {
      const { part, label } = window.__h, f = document.activeElement, ok = ['act', 'head'].map(part).filter(Boolean);
      return { ph: window.K.arrival.phase(), ok: ok.some((t) => t === f || t.contains(f)), f: label(f) };
    });
    return [r.ph === null && r.ok, `focus=${r.f} phase=${r.ph}`];
  } finally { await done(p); }
}

// ---------- failure modes on a cold load: the ordinary page (F6-F8) ----------
const ordinary = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(e).visibility === 'visible'; };
  const b = document.body;
  return {
    body: b ? getComputedStyle(b).opacity : 'none',
    running: !!(window.K && window.K.arrival && window.K.arrival.running()),
    card: [...document.querySelectorAll('.arr-card > *')].filter(vis).length,
    vh: [...document.querySelectorAll('.arr-vh')].filter((e) => e.textContent.trim() && vis(e)).map((e) => e.textContent.trim().slice(0, 24)),
    played: window.__tl.some((x) => /^(compose|hold|assemble)$/.test(x[1])),
  };
};
// B7: arrival.css 404 shows the ordinary page (F6)
async function b7(file, vp) {
  const p = await cold(file, vp, { css404: true });
  try {
    await sleep(2500);
    const o = await p.evaluate(ordinary);
    return [o.body === '1' && !o.running && o.card === 0 && o.vh.length === 0, `running=${o.running} visible card parts=${o.card} visible hidden text=${JSON.stringify(o.vh)} body opacity=${o.body}`];
  } finally { await done(p); }
}
// B8: a hung arrival.js leaves the body visible within 2s (F7)
async function b8(file, vp) {
  const p = await cold(file, vp, { jsHang: true });
  try {
    const t0 = Date.now(); let s;
    while (Date.now() - t0 < 2000) {
      s = await p.evaluate(() => {
        const b = document.body, h = [...document.querySelectorAll('[data-part~="headline"]')].find((e) => e.getClientRects().length);
        return { body: !!b, op: b ? getComputedStyle(b).opacity : null, headline: !!h };
      }).catch((e) => ({ err: e.message.split('\n')[0] }));
      if (s.body && s.op === '1' && s.headline) return [true, `visible at ${Date.now() - t0}ms`];
      await sleep(100);
    }
    return [false, `not visible by 2000ms: ${JSON.stringify(s)}`];
  } finally { await p.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {}); await done(p); }
}
// B9: with the font requests blocked, the ordinary page shows and no arrival plays in fallback faces (F8)
async function b9(file, vp) {
  const p = await cold(file, vp, { blockFonts: true });
  try {
    await sleep(3000);
    const o = await p.evaluate(ordinary);
    return [o.body === '1' && !o.played && !o.running, `arrival played=${o.played} running=${o.running} body opacity=${o.body}`];
  } finally { await done(p); }
}

// ---------- the hold, then rest: B10 guard, B13 stillness, B12 screen reader at rest ----------
async function holdAndRest(file, vp) {
  const p = await resting(file, vp);
  try {
    await install(p); const holdAt = await toHold(p); await sleep(250);
    // B10 (F19 noPtrNone): card points outside the act never hit a page control
    await run('B10', `${file} ${vpName(vp)} pointer guard`, async () => {
      const r = await p.evaluate(() => {
        const { CTRL, part, label, harness, shown } = window.__h;
        const avoid = [part('act'), part('act2'), document.querySelector('.arr-skip')].filter(Boolean).map((e) => { const r = e.getBoundingClientRect(); return [r.left - 6, r.top - 6, r.right + 6, r.bottom + 6]; });
        const els = [...document.querySelectorAll('.arr-card > *'), part('headline')].filter((e) => e && shown(e));
        const per = els.map((e) => { const r = e.getBoundingClientRect(); return [.5, .2, .8].map((fx) => ({ x: r.left + r.width * fx, y: (r.top + r.bottom) / 2 })); });
        const pts = [];
        for (let k = 0; k < 3 && pts.length < 5; k++) for (const list of per) {
          const q = list[k];
          if (pts.length < 5 && q.x > 2 && q.y > 2 && q.x < innerWidth - 2 && q.y < innerHeight - 2 && !avoid.some((a) => q.x >= a[0] && q.x <= a[2] && q.y >= a[1] && q.y <= a[3])) pts.push(q);
        }
        const bad = pts.map((q) => { const e = document.elementFromPoint(q.x, q.y), c = e && e.closest(CTRL); return c && !harness(c) ? label(c) : null; }).filter(Boolean);
        return { n: pts.length, bad };
      });
      return [r.n === 5 && r.bad.length === 0, `${r.n} points, controls hit=[${r.bad.join(',')}]`];
    });
    // B13 (F19 lineMoves): after the cue's fade, only the hairline animates
    await run('B13', `${file} ${vpName(vp)} hold stillness`, async () => {
      const r = await p.evaluate(async (holdAt) => {
        const K = window.K, S = K.arrival.S;
        while (performance.now() < holdAt + (S.cue + S.cueIn) * K.slow + 250) await new Promise((res) => setTimeout(res, 10));
        const run = document.getAnimations().filter((a) => a.playState === 'running');
        return { ph: K.arrival.phase(), moving: run.filter((a) => !(a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('arr-line'))).map((a) => window.__h.label(a.effect && a.effect.target)), line: run.length };
      }, holdAt);
      return [r.ph === 'hold' && r.moving.length === 0, `running=${r.line} others=[${r.moving.join(',')}]`];
    });
    // B12 (F11): at rest the live status is empty and no hint remains, visibly or to assistive tech
    await run('B12', `${file} ${vpName(vp)} quiet at rest`, async () => {
      await p.keyboard.press('a'); await restAfter(p); await sleep(150);
      const r = await p.evaluate(() => {
        const { shown } = window.__h;
        const status = [...document.querySelectorAll('[role="status"],[aria-live]')].filter((e) => e.hasAttribute('data-arr') || e.classList.contains('arr-vh')).map((e) => e.textContent.trim()).filter(Boolean);
        const hint = document.getElementById('arr-hint');
        const left = [...document.querySelectorAll('[data-arr]')].filter((e) => !e.closest('.fixture-foot,.mc') && e.getAttribute('role') !== 'status' && e.textContent.trim() && shown(e) && !e.classList.contains('arr-vh')).map((e) => e.textContent.trim().slice(0, 20));
        return { status, hint: hint ? hint.textContent.trim().slice(0, 30) : null, left };
      });
      const aria = (await p.locator('body').ariaSnapshot()).split('\n').filter((l) => /any key|Skip arrival/i.test(l)).map((l) => l.trim().slice(0, 50));
      return [!r.status.length && !r.hint && !r.left.length && !aria.length, `status=${JSON.stringify(r.status)} hint=${JSON.stringify(r.hint)} visible=${JSON.stringify(r.left)} a11y=${JSON.stringify(aria)}`];
    });
  } finally { await done(p); }
}

// ---------- B11: reduced motion: Skip in the viewport and every card line visible in the hold (F19 skipHiddenRM) ----------
async function b11(file, vp) {
  const p = await resting(file, vp, { rm: true });
  try {
    await install(p); await toHold(p); await sleep(300);
    const r = await p.evaluate(() => {
      const { part, shown, opacity } = window.__h;
      const inView = (e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; };
      const s = document.querySelector('.arr-skip');
      const lines = ['name', 'stage', 'job', 'headline', 'f1', 'f2', 'f3', 'act', 'act2'].map((n) => [n, part(n)]).filter((x) => x[1]);
      const hidden = lines.filter(([, e]) => { const r = e.getBoundingClientRect(); return !(shown(e) && opacity(e) > 0.99 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth); }).map(([n]) => n);
      return { rm: window.K.arrival.schedule().rm, skip: !!s && shown(s) && inView(s), n: lines.length, hidden };
    });
    return [r.rm && r.skip && r.hidden.length === 0, `rm=${r.rm} skip in view=${r.skip} lines=${r.n} not visible=[${r.hidden.join(',')}]`];
  } finally { await done(p); }
}

// ---------- main ----------
const pw = playwright();
const server = await serve();
BASE = `http://127.0.0.1:${server.address().port}/cinematic/`;
try {
  browser = await pw.chromium.launch({ headless: true });
  for (const vp of VPS) for (const f of PAGES) await run('B1', `${f} ${vpName(vp)} cold load reaches the hold`, () => b1(f, vp));
  if (!SELF) for (const w of [700, 1024]) {
    const f = ALL.find((x) => /delgado/.test(x));
    if (f) await run('B1', `${f} ${w}x900 cold load reaches the hold`, () => b1(f, { w, h: 900, touch: false }));
  }
  for (const vp of VPS) for (const f of PAGES) {
    if (!hasAct(f)) continue;
    for (const off of [100, 400, 800]) await run('B2', `${f} ${vpName(vp)} act click at +${off}ms into Act 3`, () => b2(f, vp, off));
  }
  for (const vp of VPS) for (const f of PAGES) await run('B7', `${f} ${vpName(vp)} arrival.css 404 is the ordinary page`, () => b7(f, vp));
  if (!SELF) {
    for (const vp of VPS) for (const f of PAGES) await run('B3', `${f} ${vpName(vp)} double-click in the hold`, () => b3(f, vp));
    for (const f of PAGES) {
      if (hasAct(f)) await run('B4', `${f} ${vpName(PHONE)} touch tap on the act`, () => b4(f, PHONE));
    }
    for (const vp of VPS) await run('B5', `index.html ${vpName(vp)} drag off the Desk act`, () => b5('index.html', vp));
    for (const vp of VPS) for (const f of PAGES) await run('B6', `${f} ${vpName(vp)} Tab in Act 3`, () => b6(f, vp));
    for (const vp of VPS) for (const f of PAGES) await run('B8', `${f} ${vpName(vp)} hung arrival.js`, () => b8(f, vp));
    for (const vp of VPS) for (const f of PAGES) await run('B9', `${f} ${vpName(vp)} font files blocked`, () => b9(f, vp));
    for (const vp of VPS) for (const f of PAGES) await holdAndRest(f, vp).catch((e) => report('B10-13', `${f} ${vpName(vp)}`, false, 'error: ' + e.message.split('\n')[0]));
    for (const vp of VPS) for (const f of PAGES) await run('B11', `${f} ${vpName(vp)} reduced motion hold`, () => b11(f, vp));
  }
} finally {
  if (browser) await browser.close().catch(() => {});
  server.closeAllConnections(); server.close();
}
const pass = results.filter(Boolean).length, n = results.length;
console.log(pass === n ? `PASS ${n}/${n}` : `FAIL ${n - pass}/${n}`);
if (pass !== n) process.exitCode = 1;
