// US-14 arrival — the engine's real-browser lane (the pattern of the mockup's verify/cinematic-browser.mjs, SQ-343).
// jsdom has no CSS transitions and resolves no calc()/var() layout, so these checks run the real engine modules
// (transpiled on the fly), arrival.css and the portal's own globals.css (the real `.da-act` transition) in a browser:
//   E1 Skip clears the persistent bottom edge (the MobileBar at 390, the Studio Drawer at 1440), is hittable, and the
//      plan's cue fit reads that same Skip box.
//   E2 at Skip the displaced act is home on the very next frame: no transform glide from `.da-act`'s transition.
// Chromium, WebKit and Firefox: Chromium starts no transition when a WAAPI fill held the property, so it alone never
// shows the E2 glide; WebKit (the phone) and Firefox do.
// Usage: node apps/designer-portal/src/lib/arrival/__tests__/engine-browser.mjs
// Browsers cannot launch inside the macOS command sandbox: run it unsandboxed. Prints PASS/FAIL per check; exit 1 on any
// failure. Jest never collects it (testMatch is js/jsx/ts/tsx).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ARRIVAL = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = path.resolve(ARRIVAL, '../../..');
const req = createRequire(path.join(APP, 'package.json'));
const ts = req('typescript');
const pwFrom = req.resolve('@playwright/test');
const pw = createRequire(pwFrom)('playwright-core');

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/arrival.css">
<style>body{margin:0}main{padding:24px 16px 0;max-width:720px}ul{list-style:none;margin:0;padding:0}
#edge{position:fixed;left:0;right:0;bottom:0;z-index:40}
/* document-action.tsx:54's base Tailwind classes (not compiled here): an inline box would take no transform at all */
.da-act{display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;padding:4px 6px 10px;font-size:12px;text-transform:uppercase;text-decoration:none}</style></head><body>
<main data-arrival="desk">
  <header><p data-part="head" tabindex="-1">MONDAY · 28 SEPTEMBER</p></header>
  <ul>
    <li class="desk-claim-card" data-claim-card>
      <a data-roster-name data-part="job" href="/doc/w1">Whitfield</a>
      <p data-register="sentence" data-part="headline">Overdue 23 days — Invoice 1042 overdue — oldest due Aug 2 — send a reminder</p>
      <div data-register="act"><a class="da-act" data-part="act" href="/doc/w1">Send the reminder</a></div>
    </li>
    <li><p data-part="f1"><a href="/doc/r2">Reyes</a><span data-day-line-overdue> — overdue 4 days</span></p></li>
    <li><p data-part="f2"><a href="/doc/o3">Okafor</a><span> — sign the quote</span></p></li>
  </ul>
  <p data-part="settle">Nothing is overdue.</p>
</main>
<nav id="edge"></nav>
<script type="module">
import { engine } from '/m/engine';
const root = document.querySelector('[data-arrival]');
const edge = document.getElementById('edge');
const phone = innerWidth < 1180;
// the persistent edge as the layout prints it: the MobileBar (publishing its height on html) or the Studio Drawer
edge.style.height = phone ? '72px' : '60px';
edge.style.background = phone ? 'var(--color-charcoal)' : 'var(--bg-surface)';
if (phone) document.documentElement.style.setProperty('--doc-mobile-bar-height', '72px');
const A = root.querySelector('[data-part~="act"]');
const host = {
  root: () => root, ready: () => true, busy: () => false, faces: () => ["'Playfair Display'"],
  // CONTRACT §3: view() subtracts the MobileBar
  view: () => { const b = phone ? edge.getBoundingClientRect().top : innerHeight; return { top: 0, height: b, width: document.documentElement.clientWidth, bottom: b }; },
  telemetry() {}, markArrival() {},
};
const rest = A.getBoundingClientRect();
const pre = { transition: getComputedStyle(A).transitionProperty, duration: getComputedStyle(A).transitionDuration };
const frames = [];
const read = () => { const cs = getComputedStyle(A); const r = A.getBoundingClientRect(); return { transform: cs.transform, translate: cs.translate, dx: r.left - rest.left, dy: r.top - rest.top }; };
addEventListener('patina:arrival-ended', (e) => {
  frames.push({ at: 'sync', how: e.detail.how, ...read() });
  requestAnimationFrame(() => { frames.push({ at: 'frame1', ...read() }); requestAnimationFrame(() => frames.push({ at: 'frame2', ...read() })); });
  setTimeout(() => frames.push({ at: '+300ms', transition: getComputedStyle(A).transitionProperty, ...read() }), 300);
});
const run = engine.createRun(engine.brief(root, 'desk'), host, { via: null, reduced: false, entryAt: performance.now(), now: () => performance.now() });
for (const [t, fn] of [['keydown', 'onKeyDown'], ['pointerdown', 'onPointerDown'], ['pointerup', 'onPointerUp'], ['focusin', 'onFocusIn']]) addEventListener(t, (e) => run[fn](e), true);
run.start();
window.__arr = { run, A, edge, rest, pre, frames };
</script></body></html>`;

function transpile(file) {
  const src = fs.readFileSync(file, 'utf8');
  return ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
}

function serve() {
  const server = http.createServer((q, res) => {
    const p = new URL(q.url, 'http://x').pathname;
    const send = (type, body) => { res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
    try {
      if (p === '/') return send('text/html', PAGE);
      if (p === '/arrival.css') return send('text/css', fs.readFileSync(path.join(ARRIVAL, 'arrival.css')));
      if (p === '/globals.css') return send('text/css', fs.readFileSync(path.join(APP, 'src/app/globals.css')));
      const m = /^\/m\/([a-z-]+)$/.exec(p);
      if (m && fs.existsSync(path.join(ARRIVAL, `${m[1]}.ts`))) return send('text/javascript', transpile(path.join(ARRIVAL, `${m[1]}.ts`)));
    } catch (e) {
      res.writeHead(500);
      return res.end(String(e));
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

const results = [];
function report(id, what, pass, detail) {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id} ${what}${detail ? ' · ' + detail : ''}`);
}

const VPS = [{ w: 1440, h: 900, touch: false }, { w: 390, h: 844, touch: true }];
const server = await serve();
const BASE = `http://127.0.0.1:${server.address().port}/`;
for (const engineName of ['chromium', 'webkit', 'firefox']) {
  const browser = await pw[engineName].launch();
  try {
    for (const vp of VPS) {
      const name = `${engineName} ${vp.w}x${vp.h}`;
      // Firefox takes no isMobile
      const mobile = engineName === 'firefox' ? {} : { isMobile: vp.touch };
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, hasTouch: vp.touch, ...mobile });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(BASE);
      await page.waitForFunction(() => window.__arr && window.__arr.run.phase === 'hold', null, { timeout: 5000 });

      const pre = await page.evaluate(() => window.__arr.pre);
      report('E0', `${name} the page's own .da-act transform transition is loaded (else E2 is vacuous)`,
        /\btransform\b/.test(pre.transition) && /0\.24s/.test(pre.duration), JSON.stringify(pre));

      const e1 = await page.evaluate(() => {
        const sk = document.querySelector('.arr-skip').getBoundingClientRect();
        const edge = window.__arr.edge.getBoundingClientRect();
        const hit = document.elementFromPoint(sk.left + sk.width / 2, sk.top + sk.height / 2);
        const line = document.querySelector('.arr-line').getBoundingClientRect();
        const cue = document.querySelector('.arr-cue').getBoundingClientRect();
        return { sk: { top: sk.top, bottom: sk.bottom }, edgeTop: edge.top, edgeH: edge.height, ih: innerHeight,
          onSkip: !!hit && hit.classList.contains('arr-skip'), lineBottom: line.bottom, cueBottom: cue.bottom, cueRight: cue.right, skLeft: sk.left };
      });
      report('E1', `${name} Skip sits 16px clear above the ${vp.w < 1180 ? 'MobileBar' : 'Studio Drawer'}`,
        e1.sk.bottom <= e1.ih - e1.edgeH - 16 + 0.5 && e1.sk.bottom <= e1.edgeTop - 16 + 0.5,
        `skip.bottom ${e1.sk.bottom} · limit ${e1.ih - e1.edgeH - 16}`);
      report('E1', `${name} Skip is the hit at its own centre`, e1.onSkip);
      if (vp.w <= 760 || e1.cueRight > e1.skLeft - 8) {
        report('E1', `${name} the plan's cue fit reads the same Skip box (hairline ends ≥ 8px above Skip)`,
          e1.lineBottom <= e1.sk.top - 8 + 0.5 && e1.cueBottom <= e1.sk.top + 0.5,
          `line.bottom ${e1.lineBottom} · cue.bottom ${e1.cueBottom} · skip.top ${e1.sk.top}`);
      }

      const held = await page.evaluate(() => {
        const r = window.__arr.A.getBoundingClientRect();
        return { dx: r.left - window.__arr.rest.left, dy: r.top - window.__arr.rest.top };
      });
      report('E2', `${name} the act holds on the card, displaced from its rest box`, Math.hypot(held.dx, held.dy) > 4, JSON.stringify(held));
      const sk = await page.evaluate(() => { const r = document.querySelector('.arr-skip').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.click(sk.x, sk.y);
      await page.waitForFunction(() => window.__arr.frames.length >= 4, null, { timeout: 3000 });
      const frames = await page.evaluate(() => window.__arr.frames);
      const home = (f) => f.transform === 'none' && f.translate === 'none' && Math.abs(f.dx) <= 0.5 && Math.abs(f.dy) <= 0.5;
      report('E2', `${name} Skip ends the run as skip`, frames[0].how === 'skip', frames[0].how);
      for (const f of frames) report('E2', `${name} the act is home at ${f.at} (no glide)`, home(f), JSON.stringify(f));
      const last = frames[frames.length - 1];
      report('E2', `${name} the page's own transition is back after the run`, /\btransform\b/.test(last.transition || ''), last.transition);
      report('E*', `${name} no page errors`, errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}
server.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `FAIL ${failed}/${results.length}` : `PASS ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);
