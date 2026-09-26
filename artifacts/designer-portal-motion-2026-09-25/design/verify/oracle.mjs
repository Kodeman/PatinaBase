// Motion mockups oracle (SQ-301). Node built-ins only; no browser, no jsdom.
// Re-runs the SQ-276 document checks, guards the nine mockups against drift, and encodes Astra's
// SQ-277 reproductions as regressions by running each file's real shared script in node:vm with a
// minimal fake DOM. Usage: node artifacts/designer-portal-motion-2026-09-25/design/verify/oracle.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const DESIGN = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MOCK = path.join(DESIGN, 'mockups');
const files = fs.readdirSync(MOCK).filter((f) => /^0\d-.*\.html$/.test(f)).sort();
const read = (f) => fs.readFileSync(path.join(MOCK, f), 'utf8');
const concepts = fs.readFileSync(path.join(DESIGN, 'concepts.md'), 'utf8');

let pass = 0;
const fails = [];
function check(name, ok, detail = '') {
  if (ok) pass++;
  else fails.push(name + (detail ? ' :: ' + detail : ''));
}
function attempt(name, fn) {
  try { const r = fn(); check(name, r === true, r === true ? '' : String(r)); }
  catch (e) { check(name, false, 'threw ' + e.name + ': ' + e.message); }
}

const IIFE_OPEN = '<script>\n(function(){';
function parts(s) {
  const css = s.slice(s.indexOf('<style>') + 7, s.indexOf('</style>'));
  const headEnd = s.indexOf('</script>', s.indexOf('</style>')) + 9;
  const head = s.slice(s.indexOf('<style>'), headEnd);
  const j = s.indexOf(IIFE_OPEN), k = s.indexOf('})();', j) + 5;
  const iife = s.slice(j + '<script>\n'.length, k);
  const text = s.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<script>[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  return { css, head, iife, text };
}

/* ---------------- 1. SQ-276 document checks, re-run ---------------- */
const FIXTURE = 'Fixture · Middle West Studio · not a client record';
const shared = [];
for (const f of files) {
  const s = read(f), p = parts(s);
  shared.push(p.head + '\n' + p.iife);
  const hosts = [...s.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  check(f + ' hosts are Google Fonts only', hosts.every((h) => h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com'), hosts.join(','));
  check(f + ' no <script src', !/<script[^>]*\bsrc=/i.test(s));
  check(f + ' has Replay and Reduced motion', s.includes('Replay') && s.includes('Reduced motion'));
  check(f + ' has prefers-reduced-motion query', s.includes('@media (prefers-reduced-motion'));
  check(f + ' has fixture line', s.includes(FIXTURE));
  check(f + ' has "mockup controls" label', s.includes('mockup controls'));
  check(f + ' has Slow ×4 review-aid label', s.includes('Slow ×4') && s.includes('review aid, not a product setting'));
  check(f + ' E/Q/O easings', ['cubic-bezier(.22,1,.36,1)', 'cubic-bezier(.42,0,.58,1)', 'cubic-bezier(0,0,.58,1)'].every((e) => s.includes(e)));
  check(f + ' exactly one --font-display definition', (p.css.match(/--font-display:/g) || []).length === 1);
  check(f + ' copy has no "!", AI or lorem', !/!/.test(p.text) && !/\bAI\b/.test(p.text) && !/lorem/i.test(p.text));
  const wide = [...p.css.replace(/@media[^{]*/g, '').matchAll(/(?<![-\w])(?:min-)?width:\s*(\d+)px/g)].filter((m) => +m[1] > 358);
  check(f + ' no CSS width/min-width over 358px', wide.length === 0, wide.map((m) => m[0]).join(','));
  check(f + ' nothing infinite or interval-driven', !/infinite|Infinity|setInterval/.test(s));
  for (const [i, src] of [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).entries()) {
    attempt(f + ' inline script ' + i + ' parses', () => { new vm.Script(src); return true; });
  }
}
check('all nine share byte-identical CSS, head script and shared JS', shared.every((x) => x === shared[0]));

const words = concepts.split(/\s+/).filter(Boolean).length;
check('concepts.md within 4,500 words', words <= 4500, String(words));
check('concepts.md attribution line', concepts.includes('Concept: Astra (GPT-6) · Review and synthesis: Fable · Build: Opus'));
check('concepts.md nine-move table', ['Ink answers', 'Detail rises', 'Margin opens', 'Paper is taken', 'Sheet is drawn', 'Sheet is returned', 'Ink lands', 'Detail recedes', 'Paper is put down'].every((m) => concepts.includes('| ' + m + ' |')));
check('concepts.md three directions', ['### 1. Open Edges', '### 2. Plain Lines', '### 3. Reading Line'].every((h) => concepts.includes(h)));
check('concepts.md trade-off table', concepts.includes('| Test | Open Edges | Plain Lines | Reading Line |'));
check('concepts.md R-DM1..7', [1, 2, 3, 4, 5, 6, 7].every((n) => concepts.includes('**R-DM' + n + ' ')));
check('concepts.md six (synthesis) marks', (concepts.match(/\(synthesis\)/g) || []).length === 6);

/* ---------------- 2. SQ-277 static regressions ---------------- */
for (const f of files) {
  const s = read(f), p = parts(s);
  const cmdRule = (p.css.match(/\.cmd\{[^}]*\}/) || [''])[0];
  check(f + ' (d/F12) .cmd carries no --elevation-sheet', !!cmdRule && !cmdRule.includes('--elevation-sheet'));
  check(f + ' (d/F12) no inset box-shadow', !/box-shadow:[^;}]*inset/.test(p.css));
  check(f + ' (e/F4) @media print exposes well bodies', /@media print\{[\s\S]*\.well-body\{visibility:visible!important/.test(p.css));
  check(f + ' (e/F4) beforematch or hidden="until-found"', s.includes('beforematch') && s.includes('until-found'));
  check(f + ' (e/F14) aria-hidden toggles on closed wells', p.iife.includes("setAttribute('aria-hidden','true')") && p.iife.includes("removeAttribute('aria-hidden')"));
  check(f + ' (e/F7) ?frame=product handling', /frame=product/.test(p.head) && p.css.includes('html.frame-product .cap,html.frame-product .mc{display:none!important}') && s.includes('<p class="fixture-foot">' + FIXTURE + '</p>'));
  check(f + ' (F7) Controls toggle and caption More toggle', s.includes('class="mc-toggle" aria-expanded="false" aria-controls="mc-body">Controls</button>') && s.includes('class="cap-more"') && p.css.includes('.mc:not(.mc-open) .mc-body{display:none}'));
  check(f + ' (F7) overlays reserve strip clearance', /\.layer\{[^}]*var\(--mc-clear\)/.test(p.css) && /\.cmd-layer\{[^}]*var\(--mc-clear\)/.test(p.css));
  check(f + ' (F15) .act and [data-unfold] min-width 44px', p.css.includes('.act,[data-unfold]{min-width:44px}'));
  check(f + ' (F8) no smooth-scroll simulation; dwell and Replay use pausable timers', !/smooth|simScroll/.test(p.iife) && p.iife.includes('dwell=K.later(') && p.iife.includes('replay=K.later('));
  check(f + ' (F1/F2) Tab routed to the modal trap', p.iife.includes("if(e.key==='Tab'){K.onTab(e);return;}"));
  check(f + ' (F9) no "Open finish record" left as a dead fixture', !/data-fixture[^>]*><span class="w">Open finish record/.test(s));
  check(f + ' (F9) stubs labelled "not in this mockup"', s.includes('not in this mockup'));
}
{
  const s6 = read('06-direction2-command.html');
  check('06 (F9) ⌘K finish-record row opens the record', s6.includes('data-go="record:rec"><span>Ainsworth finish record</span>'));
  check('06 (F9) Library row labelled not in this mockup', s6.includes('Pieces and makers · not in this mockup'));
  const s2 = read('02-direction1-document.html');
  check('02 (F10) phone seam has a real well, no orphan', s2.includes('id="w-note-m"') && !s2.includes('data-phone-sheet'));
  check('02 (F10) phone trigger controls the note sheet', /data-sheet-open="note-sheet" aria-haspopup="dialog" aria-expanded="false" aria-controls="note-sheet"/.test(s2));
  for (const f of ['01-direction1-desk.html', '04-direction2-desk.html', '07-direction3-desk.html']) {
    const s = read(f);
    check(f + ' (F9) Desk finish record picks up the paper with the record', s.includes('data-pick-up data-open-record="rec"><span class="w">Open finish record') && s.includes('id="rec" data-record hidden'));
  }
  for (const f of ['07-direction3-desk.html', '08-direction3-document.html']) {
    check(f + ' (R-F2) caption says Replay jumps', read(f).includes('Replay jumps to the reading line; in the product she scrolls.'));
  }
}

/* ---------------- 3. concepts.md restored guarantees (f/F13) ---------------- */
for (const phrase of [
  'permission explanation',
  'dirty input, validation, pending action',
  'Trigger OR body hover/focus sustains the reveal',
  'Closed details leave tab order/accessibility tree; expanded state and landmarks agree',
  'Find-in-page, print and plain reading expose the complete text without motion',
  '**Prototype limitations.**',
  'margin wells are content-sized',
  'cannot freeze her own scrolling',
]) check('concepts.md (f/F13) contains: ' + phrase, concepts.includes(phrase));

/* ---------------- 4. Runtime regressions on each file's real shared script ---------------- */
class El {
  constructor(tag, id) { this.tagName = tag; this.id = id || ''; this.attrs = {}; this.q = {}; this.kids = new Set(); this.style = {}; this.hidden = false; this.rect = { top: 0, bottom: 0 }; this.offsetHeight = 0; }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  hasAttribute(n) { return n in this.attrs; }
  querySelector(s) { const r = this.q[s]; return Array.isArray(r) ? r[0] || null : r || null; }
  querySelectorAll(s) { const r = this.q[s] !== undefined ? this.q[s] : this.q['*']; return r ? (Array.isArray(r) ? r : [r]) : []; }
  contains(x) { return x === this || this.kids.has(x); }
  closest(s) { return (this.up || {})[s] || null; }
  getBoundingClientRect() { return this.rect; }
  getClientRects() { return [this.rect]; }
  getAnimations() { return []; }
  addEventListener() {}
  focus() { doc.activeElement = this; }
  get classList() { const self = this; return { toggle(c, on) { self.cls = on; }, add() {}, remove() {}, contains() { return false; } }; }
}
let doc, clock, timeouts;
function sandbox(iife) {
  clock = 1000; timeouts = [];
  const winL = {}, docL = {};
  doc = {
    activeElement: null, body: new El('BODY'), documentElement: new El('HTML'), q: {},
    querySelector(s) { const r = this.q[s]; return Array.isArray(r) ? r[0] || null : r || null; },
    querySelectorAll(s) { const r = this.q[s]; return r ? (Array.isArray(r) ? r : [r]) : []; },
    addEventListener(t, f) { (docL[t] = docL[t] || []).push(f); },
    getAnimations() { return []; },
  };
  const ctx = {
    document: doc, innerHeight: 800, scrollY: 0, scrollTo() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    performance: { now: () => clock },
    getSelection: () => ({ isCollapsed: true }),
    setTimeout(fn, d) { const t = { fn, at: clock + d, id: timeouts.length + 1 }; timeouts.push(t); return t.id; },
    clearTimeout(id) { timeouts = timeouts.filter((t) => t.id !== id); },
    addEventListener(t, f) { (winL[t] = winL[t] || []).push(f); },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(iife, ctx);
  const fire = (L, t, e = {}) => (L[t] || []).forEach((f) => f(e));
  return { K: ctx.K, win: (t, e) => fire(winL, t, e), doc: (t, e) => fire(docL, t, e) };
}
function advance(ms) { const end = clock + ms; for (;;) { const due = timeouts.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0]; if (!due) break; clock = due.at; timeouts = timeouts.filter((t) => t !== due); due.fn(); } clock = end; }
const key = (k, extra = {}) => ({ key: k, shiftKey: false, defaultPrevented: false, prevented: false, preventDefault() { this.prevented = true; }, ...extra });
function readingRig(K, top) {
  const group = new El('SECTION', 'g'); group.setAttribute('data-mode', 'reading');
  const sec = new El('ARTICLE'), head = new El('H2');
  sec.setAttribute('data-rl', 'w-x'); sec.q['[data-rl-head]'] = head; group.q['[data-rl]'] = [sec]; group.q['.well'] = [];
  const g = { t: top };
  Object.defineProperty(head, 'rect', { get: () => ({ top: g.t, bottom: g.t + 20 }) });
  Object.defineProperty(sec, 'rect', { get: () => ({ top: g.t - 10, bottom: g.t + 400 }) });
  const well = { isOpen: false, opens: 0, closes: 0, open() { this.opens++; this.isOpen = true; }, close() { this.closes++; this.isOpen = false; }, held: () => false, sync() {} };
  K.wells['w-x'] = well;
  return { group, g, well };
}

for (const f of files) {
  const { iife } = parts(read(f));

  // (a) F1: Sheet focus trap with the real call shape: K.onTab resolves '#<layer> .sheet' to an element.
  attempt(f + ' (a/F1) Sheet Tab trap does not throw and wraps first<->last', () => {
    const { K } = sandbox(iife);
    const layer = new El('DIV', 'accounts'); layer._open = true;
    const sheet = new El('DIV'), b1 = new El('BUTTON'), b2 = new El('A'), b3 = new El('BUTTON'), outside = new El('BUTTON');
    sheet.q['*'] = [b1, b2, b3]; [b1, b2, b3].forEach((b) => sheet.kids.add(b));
    doc.q['.layer'] = [layer]; doc.q['#accounts .sheet'] = sheet; doc.q['#cmd'] = null;
    let threw = false; try { K.$$('button', '#accounts .sheet'); } catch (e) { threw = !!e && e.name === 'TypeError'; } /* vm realm: no instanceof */
    if (!threw) return 'fake DOM would not have caught the original selector-string scope';
    doc.activeElement = b1; const e1 = key('Tab', { shiftKey: true }); K.onTab(e1);
    if (!(e1.prevented && doc.activeElement === b3)) return 'Shift-Tab on first did not wrap to last';
    const e2 = key('Tab'); K.onTab(e2);
    if (!(e2.prevented && doc.activeElement === b1)) return 'Tab on last did not wrap to first';
    doc.activeElement = outside; const e3 = key('Tab'); K.onTab(e3);
    return e3.prevented && doc.activeElement === b1 ? true : 'Tab from outside the Sheet did not return to it';
  });

  // F2: command dialog traps Tab and refuses to stack over an open Sheet.
  attempt(f + ' (F2) command traps Tab; ⌘K refuses while a Sheet is open', () => {
    const { K } = sandbox(iife);
    const cmd = new El('DIV', 'cmd'), box = new El('DIV'), input = new El('INPUT', 'cmd-in');
    box.q['*'] = [input]; box.kids.add(input); doc.q['#cmd'] = cmd; doc.q['#cmd .cmd'] = box; doc.q['.layer'] = [];
    doc.activeElement = input; const e = key('Tab'); K.onTab(e);
    if (!(e.prevented && doc.activeElement === input)) return 'Tab left the command input';
    const layer = new El('DIV', 'accounts'); layer._open = true; doc.q['.layer'] = [layer];
    cmd.hidden = true; K.cmd.open();
    return cmd.hidden === true && K.overlay === 0 ? true : 'command opened over a Sheet';
  });

  // (b) F5: focus on any descendant (link or button) holds the region; focus elsewhere does not.
  attempt(f + ' (b/F5) held() is true for a focused A or BUTTON inside the region', () => {
    const { K } = sandbox(iife);
    const region = new El('ARTICLE'), a = new El('A'), b = new El('BUTTON'), away = new El('BUTTON');
    region.kids.add(a); region.kids.add(b);
    const w = Object.create(K.Well.prototype); w.pinned = false; w.region = region; K.overlay = 0;
    doc.activeElement = a; if (w.held() !== true) return 'focused A not held';
    doc.activeElement = b; if (w.held() !== true) return 'focused BUTTON not held';
    doc.activeElement = away; if (w.held() !== false) return 'focus outside still held (next address broken)';
    doc.activeElement = doc.body; return w.held() === false ? true : 'body focus held';
  });

  // (c) F3: reverse crossing is an accepted address; recede stays offscreen-only.
  attempt(f + ' (c/F3) reading line 300→180→−600→100→220 gives opens=2 closes=1 isOpen=true', () => {
    const { K, win } = sandbox(iife);
    const { group, g, well } = readingRig(K, 300);
    K.reading(group);
    for (const t of [180, -600, 100, 220]) { g.t = t; clock += 16; win('wheel'); win('scroll'); }
    return well.opens === 2 && well.closes === 1 && well.isOpen === true ? true : `opens=${well.opens} closes=${well.closes} isOpen=${well.isOpen}`;
  });

  // F11: page keys are intent even with a Detail button focused; Space on a control, consumed arrows
  // and focus scrolls are not, and a focus scroll rebaselines instead of addressing.
  attempt(f + ' (F11) PageDown on a focused Detail control addresses the crossing', () => {
    const { K, win } = sandbox(iife);
    const { group, g, well } = readingRig(K, 300); K.reading(group);
    const detail = new El('BUTTON'); detail.setAttribute('data-detail', 'w-x');
    detail.closest = (s) => (/button|data-detail/.test(s) ? detail : null); /* it is a Detail button */
    clock += 1000; win('keydown', key('PageDown', { target: detail })); g.t = 180; win('scroll');
    return well.opens === 1 ? true : 'opens=' + well.opens;
  });
  attempt(f + ' (F11) Space on a button, a consumed arrow and a focus scroll do not address', () => {
    const { K, win, doc: fireDoc } = sandbox(iife);
    const { group, g, well } = readingRig(K, 300); K.reading(group);
    const btn = new El('BUTTON'); btn.closest = (s) => (/button/.test(s) ? btn : null);
    clock += 1000; win('keydown', key(' ', { target: btn })); g.t = 250; win('scroll');
    win('keydown', key('ArrowDown', { target: btn, defaultPrevented: true })); g.t = 240; win('scroll');
    win('wheel'); fireDoc('focusin'); g.t = 180; win('scroll');
    clock += 16; win('wheel'); g.t = 170; win('scroll');
    return well.opens === 0 ? true : 'opens=' + well.opens + ' (focus scroll was not rebaselined)';
  });

  // F6: under reduced motion a Reading Line group keeps every summary printed.
  attempt(f + ' (F6) RM: Close detail and Show all off cannot hide; openAll includes the margin note', () => {
    const { K } = sandbox(iife);
    const group = new El('SECTION', 'g'); group.setAttribute('data-mode', 'reading');
    const e1 = new El('DIV', 'w-a'), e2 = new El('DIV', 'w-note'); group.q['.well'] = [e1, e2]; group.q['[data-rl]'] = [];
    const opened = []; const fake = (id) => ({ open() { opened.push(id); }, sync() {}, held: () => false });
    K.wells['w-a'] = fake('w-a'); K.wells['w-note'] = fake('w-note');
    const btn = new El('BUTTON'); btn.setAttribute('data-show-all', '#g'); doc.q['[data-show-all]'] = [btn]; doc.q['#g'] = group;
    K.userRM = true;
    const RL = K.reading(group); RL.rm(true);
    if (opened.join() !== 'w-a,w-note' || btn.getAttribute('aria-pressed') !== 'true') return 'openAll=' + opened.join() + ' pressed=' + btn.getAttribute('aria-pressed');
    K.showAll(btn, false); if (btn.getAttribute('aria-pressed') !== 'true') return 'Show all released under RM';
    const w = Object.create(K.Well.prototype); Object.assign(w, { isOpen: true, pinned: true, group, ctrls: [] });
    w.close(); return w.isOpen === true && w.pinned === false ? true : 'Close detail hid a summary under RM';
  });

  // F14 + F4: a closed well leaves the accessibility tree, keeps its height, and is find-reachable where supported.
  attempt(f + ' (F14/F4) closed well: aria-hidden, until-found, reserved height; open clears all', () => {
    const { K } = sandbox(iife);
    const el = new El('DIV', 'w-a'), body = new El('DIV'); body.offsetHeight = 163;
    const w = Object.create(K.Well.prototype); Object.assign(w, { el, body });
    K.uf = true; w.expose(false);
    if (el.getAttribute('aria-hidden') !== 'true' || body.getAttribute('hidden') !== 'until-found' || body.style.minHeight !== '163px' || body.style.display) return 'closed: ' + JSON.stringify({ ah: el.getAttribute('aria-hidden'), h: body.getAttribute('hidden'), mh: body.style.minHeight });
    w.expose(true);
    if (el.hasAttribute('aria-hidden') || body.hasAttribute('hidden') || body.style.minHeight !== '') return 'open state not restored';
    K.uf = false; w.expose(false);
    return body.inert === true && el.getAttribute('aria-hidden') === 'true' ? true : 'fallback path not inert';
  });

  // F8: review-aid timers pause, resume, cancel and rescale with Slow.
  attempt(f + ' (F8) Pause holds a pending Replay; Resume continues; cancel and Slow ×4 scale', () => {
    const { K } = sandbox(iife);
    let fired = 0; K.later(() => fired++, 360);
    advance(200); K.paused = true; K.timers.hold(); advance(5000);
    if (fired) return 'fired while paused';
    K.paused = false; K.timers.resume(); advance(159); if (fired) return 'resumed early';
    advance(2); if (fired !== 1) return 'did not fire after resume';
    const t = K.later(() => fired++, 360); K.cancel(t); advance(1000); if (fired !== 1) return 'cancelled Replay still fired';
    K.slow = 4; K.later(() => fired++, 100); advance(399); if (fired !== 1) return 'dwell not scaled by Slow ×4';
    advance(2); if (fired !== 2) return 'scaled dwell never fired';
    K.slow = 1; K.later(() => fired++, 360); advance(100); K.timers.scale(4); advance(1039);
    if (fired !== 2) return 'Slow change did not rescale the pending hold';
    advance(2); return fired === 3 ? true : 'rescaled hold never fired';
  });
}

/* ---------------- report ---------------- */
const total = pass + fails.length;
for (const x of fails) console.log('FAIL ' + x);
console.log(`${fails.length ? 'FAILED' : 'PASS'} ${pass}/${total} checks · ${files.length} mockups · concepts.md ${words} words`);
console.log('Not run: rendered browser, 390px phone layout, screen reader, native find/print in a real browser (headless browsers are blocked).');
process.exit(fails.length ? 1 : 0);
