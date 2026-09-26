// Cinematic arrival oracle (SQ-321). Node built-ins only; no browser, no jsdom.
// Follows fullpage-oracle.mjs: each page's real inline scripts run in node:vm over a small DOM parsed from its own markup,
// here with capture-phase events, a frame clock (requestAnimationFrame at a chosen cadence), WAAPI timing (delay, duration,
// easing, fill) and a measured-layout fixture (page-coordinate rects; fixed and sticky boxes do not scroll).
// Usage: node artifacts/designer-portal-motion-2026-09-25/design/verify/cinematic-oracle.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const DESIGN = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (...p) => fs.readFileSync(path.join(DESIGN, ...p), 'utf8');
const SRC = { 'index.html': read('cinematic', 'index.html'), 'document.html': read('cinematic', 'document.html') };
const BASE = { 'index.html': read('fullpage', 'index.html'), 'document.html': read('fullpage', 'document.html') };
const concepts = read('concepts.md');
const E = 'cubic-bezier(.22,1,.36,1)', Q = 'cubic-bezier(.42,0,.58,1)', O = 'cubic-bezier(0,0,.58,1)';
const DESK = 'index.html', DOC = 'document.html';

let pass = 0;
const fails = [];
function check(name, ok, detail = '') { if (ok) pass++; else fails.push(name + (detail ? ' :: ' + detail : '')); }
function attempt(name, fn) {
  try { const r = fn(); check(name, r === true, r === true ? '' : String(r)); }
  catch (e) { check(name, false, 'threw ' + e.name + ': ' + e.message + ' ' + (e.stack || '').split('\n')[1]); }
}

/* ---------------- a small DOM ---------------- */
let W;
const ent = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const ZERO = { left: 0, right: 0, top: 0, bottom: 0 };
class Text { constructor(d, p) { this.data = d; this.parentNode = p; this.nodeType = 3; } }
class El {
  constructor(tag, attrs) {
    this.tagName = tag.toUpperCase(); this.attrs = attrs || {}; this.children = []; this.parentNode = null;
    this.style = { setProperty(k, v) { this[k] = v; } }; this.L = {}; this.C = {}; this._anims = []; this._fx = [];
    this.inert = false; this.value = ''; this.r = null; this.lines = null; this.cs = {}; this.scrollLeft = 0;
  }
  get nodeType() { return 1; }
  get id() { return this.attrs.id || ''; }
  getAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n) ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  removeAttribute(n) { delete this.attrs[n]; }
  hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this.attrs, n); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
  get classList() {
    const e = this, list = () => (e.attrs.class || '').split(/\s+/).filter(Boolean);
    const cl = {
      contains: (c) => list().includes(c),
      add: (...cs) => { const l = list(); cs.forEach((c) => { if (!l.includes(c)) l.push(c); }); e.attrs.class = l.join(' '); },
      remove: (...cs) => { e.attrs.class = list().filter((c) => !cs.includes(c)).join(' '); },
      toggle: (c, on) => { const has = list().includes(c), want = on === undefined ? !has : !!on; if (want && !has) cl.add(c); if (!want && has) cl.remove(c); return want; },
    };
    return cl;
  }
  get textContent() { return this.children.map((c) => (c.nodeType === 3 ? c.data : c.textContent)).join(''); }
  set textContent(v) { this.children = [new Text(String(v), this)]; }
  *all() { for (const c of this.children) if (c.nodeType === 1) { yield c; yield* c.all(); } }
  querySelectorAll(s) { const g = sel(s); return [...this.all()].filter((e) => matches(e, g)); }
  querySelector(s) { const g = sel(s); for (const e of this.all()) if (matches(e, g)) return e; return null; }
  matches(s) { return matches(this, sel(s)); }
  closest(s) { const g = sel(s); for (let e = this; e && e.nodeType === 1; e = e.parentNode) if (matches(e, g)) return e; return null; }
  contains(x) { for (let e = x; e; e = e.parentNode) if (e === this) return true; return false; }
  addEventListener(t, f, o) { const m = o === true || (o && o.capture) ? this.C : this.L; (m[t] = m[t] || []).push(f); }
  removeEventListener() {}
  getAnimations() { return this._anims.slice(); }
  animate(kf, opt) {
    const el = this, delay = opt.delay || 0, fill = opt.fill || 'none';
    const a = { el, kf, duration: opt.duration, delay, fill, easing: opt.easing, start: W.clock, playState: 'running', onfinish: null,
      cancel() { el._anims = el._anims.filter((x) => x !== a); el._fx = el._fx.filter((x) => x !== a); W.running = W.running.filter((x) => x !== a); W.timeouts = W.timeouts.filter((t) => t.a !== a); a.playState = 'idle'; },
      finish() { if (a.playState !== 'running') return; el._anims = el._anims.filter((x) => x !== a); W.running = W.running.filter((x) => x !== a); W.timeouts = W.timeouts.filter((t) => t.a !== a); if (fill === 'none' || fill === 'backwards') el._fx = el._fx.filter((x) => x !== a); a.playState = 'finished'; if (a.onfinish) a.onfinish(); },
      pause() {}, play() {} };
    el._anims.push(a); el._fx.push(a); W.running.push(a); W.log.push(a);
    W.timeouts.push({ at: W.clock + delay + opt.duration, fn: () => a.finish(), id: -(++W.tid), a });
    return a;
  }
  focus() { focusTo(this); }
  blur() { if (W.doc.activeElement === this) { W.doc.activeElement = W.doc.body; fire(this, 'focusout', { relatedTarget: null }); } }
  click() { return fire(this, 'click', { detail: 0 }); }
  dispatchEvent(ev) { W.dispatched.push(ev); return !fire(this, ev.type, { ...ev, synthetic: true }).defaultPrevented; }
  scrollIntoView() { W.scrolled.push(this); }
  fixed() { return !!this.closest('.arr-card,.arr-skip,.mc,.spine,.rail'); }
  box(r) { const dy = this.fixed() ? 0 : W.ctx.scrollY; return { left: r.left, right: r.right, top: r.top - dy, bottom: r.bottom - dy, width: r.right - r.left, height: r.bottom - r.top }; }
  getBoundingClientRect() { return this.box(rendered(this) ? (this.r || W.def) : ZERO); }
  getClientRects() { return rendered(this) ? [this.getBoundingClientRect()] : []; }
  get offsetParent() { return rendered(this) ? this.parentNode : null; }
  get offsetHeight() { return 0; }
}
class Doc extends El {
  constructor() { super('#document'); this.activeElement = null; this.body = null; this.documentElement = null; this.scripts = []; this.visibilityState = 'visible'; }
  get nodeType() { return 9; }
  getAnimations() { return W.running.slice(); }
  createRange() { let n = null; return { selectNodeContents(el) { n = el; }, getClientRects() { return rendered(n) ? (n.lines || [n.r || W.def]).map((r) => n.box(r)) : []; } }; }
}
function rendered(e) { for (let x = e; x && x.nodeType === 1; x = x.parentNode) { const h = x.getAttribute('hidden'); if (h !== null && h !== 'until-found') return false; } return true; }

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function parseHTML(html) {
  const doc = new Doc(), stack = [doc];
  const TOK = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = TOK.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.children.push(new Text(ent(m[5]), top)); continue; }
    if (m[1]) { const t = m[1].toUpperCase(); const i = stack.map((e) => e.tagName).lastIndexOf(t); if (i > 0) stack.length = i; continue; }
    if (!m[2]) continue;
    const attrs = {}, AT = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a; while ((a = AT.exec(m[3] || ''))) attrs[a[1]] = ent(a[2] ?? a[3] ?? a[4] ?? '');
    const el = new El(m[2], attrs); el.parentNode = top; top.children.push(el);
    const tag = m[2].toLowerCase();
    if (tag === 'script' || tag === 'style') {
      const end = html.indexOf('</' + tag + '>', TOK.lastIndex);
      const raw = html.slice(TOK.lastIndex, end);
      if (tag === 'script') doc.scripts.push(raw);
      el.children.push(new Text(raw, el)); TOK.lastIndex = end + tag.length + 3; continue;
    }
    if (!VOID.has(tag) && !m[4]) stack.push(el);
  }
  doc.documentElement = doc.querySelector('html'); doc.body = doc.querySelector('body');
  return doc;
}

/* selectors: tag, #id, .class, [attr], [attr=v], [attr^=v], :not(...), :focus-visible; descendant and child */
const SELS = new Map();
function splitTop(s, ch) { const out = []; let d = 0, q = null, cur = ''; for (const c of s) { if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '[' || c === '(') d++; else if (c === ']' || c === ')') d--; else if (c === ch && d === 0) { out.push(cur); cur = ''; continue; } cur += c; } out.push(cur); return out; }
function compound(s) {
  const c = { tag: null, id: null, cls: [], attrs: [], nots: [], fv: false }; let r = s;
  const eat = (re) => { const m = re.exec(r); if (m) r = r.slice(m[0].length); return m; };
  let m = eat(/^(\*|[a-zA-Z][\w-]*)/); if (m && m[1] !== '*') c.tag = m[1].toUpperCase();
  while (r.length) {
    if ((m = eat(/^#([\w-]+)/))) c.id = m[1];
    else if ((m = eat(/^\.([\w-]+)/))) c.cls.push(m[1]);
    else if ((m = eat(/^\[([\w-]+)(?:(\^?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/))) c.attrs.push({ n: m[1], op: m[2], v: m[3] ?? m[4] ?? m[5] });
    else if (r.startsWith(':not(')) { let d = 0, i = 4; for (; i < r.length; i++) { if (r[i] === '(') d++; else if (r[i] === ')' && --d === 0) break; } c.nots.push(sel(r.slice(5, i))); r = r.slice(i + 1); }
    else if ((m = eat(/^:focus-visible/))) c.fv = true;
    else throw new Error('unsupported selector: ' + s);
  }
  return c;
}
function complex(s) {
  const parts = []; let cur = '', d = 0, q = null;
  const flush = () => { if (cur) { parts.push(compound(cur)); cur = ''; } };
  for (const ch of s.trim()) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '[' || ch === '(') d++; if (ch === ']' || ch === ')') d--;
    if (d === 0 && (ch === ' ' || ch === '>')) { flush(); if (ch === '>') parts.push('>'); else if (parts.length && typeof parts[parts.length - 1] !== 'string') parts.push(' '); continue; }
    cur += ch;
  }
  flush();
  const out = []; for (const p of parts) { if (typeof p === 'string' && typeof out[out.length - 1] === 'string') { out[out.length - 1] = '>'; continue; } out.push(p); }
  return out;
}
function sel(s) { if (!SELS.has(s)) SELS.set(s, splitTop(s, ',').map(complex)); return SELS.get(s); }
function one(e, c) {
  if (c.tag && e.tagName !== c.tag) return false;
  if (c.id && e.id !== c.id) return false;
  const cl = (e.attrs.class || '').split(/\s+/);
  if (!c.cls.every((x) => cl.includes(x))) return false;
  for (const a of c.attrs) { const v = e.getAttribute(a.n); if (v === null) return false; if (a.op === '=' && v !== a.v) return false; if (a.op === '^=' && !v.startsWith(a.v)) return false; }
  if (c.nots.some((g) => matches(e, g))) return false;
  if (c.fv && !(W.doc.activeElement === e && W.kbd)) return false;
  return true;
}
function from(e, parts, i) {
  if (!one(e, parts[i])) return false;
  if (i === 0) return true;
  if (parts[i - 1] === '>') { const p = e.parentNode; return !!p && p.nodeType === 1 && from(p, parts, i - 2); }
  for (let p = e.parentNode; p && p.nodeType === 1; p = p.parentNode) if (from(p, parts, i - 2)) return true;
  return false;
}
function matches(e, groups) { return e.nodeType === 1 && groups.some((parts) => from(e, parts, parts.length - 1)); }

/* events (capture, then target and bubble), focus, timers and frames */
const BUBBLES = new Set(['click', 'keydown', 'focusin', 'focusout', 'input', 'pointermove', 'pointerdown', 'pointerup', 'pointercancel', 'wheel', 'touchstart']);
function fire(target, type, init = {}) {
  const ev = { type, target, pointerType: 'mouse', button: 0, relatedTarget: null, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false, stop: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stop = true; }, ...init };
  const pathUp = []; for (let e = target; e; e = e.parentNode) pathUp.push(e); pathUp.push(W.win);
  for (let i = pathUp.length - 1; i >= 0 && !ev.stop; i--) for (const f of (pathUp[i].C[type] || []).slice()) { f.call(pathUp[i], ev); if (ev.stop) break; }
  if (!ev.stop) for (const n of (BUBBLES.has(type) ? pathUp : [target])) { for (const f of (n.L[type] || []).slice()) f.call(n, ev); if (ev.stop) break; }
  if (type === 'click' && !ev.defaultPrevented) { const a = target.closest && target.closest('a[href]'); if (a) W.defaultNav.push(a.getAttribute('href')); }
  return ev;
}
const fireWin = (type, init = {}) => { const ev = { type, target: W.win, ...init }; for (const f of [...(W.win.C[type] || []), ...(W.win.L[type] || [])]) f(ev); return ev; };
function focusTo(el) {
  const d = W.doc, prev = d.activeElement;
  if (prev === el) return;
  const was = prev && prev !== d.body ? prev : null;
  if (was) { d.activeElement = d.body; fire(was, 'focusout', { relatedTarget: el }); }
  d.activeElement = el; fire(el, 'focusin', { relatedTarget: was });
}
function nextGap() { return W.gaps.length ? W.gaps.shift() : 16; }
function advance(ms) {
  const end = W.clock + ms;
  for (;;) {
    const due = W.timeouts.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
    const fAt = W.rafq.length ? W.nextFrame : Infinity;
    if (fAt <= end && (!due || fAt < due.at)) { W.clock = fAt; const q = W.rafq; W.rafq = []; W.nextFrame = W.clock + nextGap(); q.forEach((x) => x.fn(W.clock)); continue; }
    if (!due) break;
    W.clock = due.at; W.timeouts = W.timeouts.filter((t) => t !== due); due.fn();
  }
  W.clock = end;
}
const until = (t) => advance(W.t0 + t - W.clock); // to arrival-relative time t
class Matrix { constructor(s) { this.m41 = 0; this.m42 = 0; this.a = 1; const m = s && /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(s); if (m) { this.m41 = +m[1]; this.m42 = +m[2]; this.a = +m[3]; } } }
const parseTf = (s) => { const m = new Matrix(s); return { x: m.m41, y: m.m42, s: m.a, ok: !!(s && /translate\(/.test(s)) }; };

/* the measured-layout fixture: page coordinates; later puts override earlier ones on the same subtree */
const R = (left, right, top, bottom) => ({ left, right, top, bottom });
function put(doc, s, r, lines) { for (const e of doc.querySelectorAll(s)) { e.r = r; for (const d of e.all()) d.r = r; if (lines) e.lines = lines; } }
const LAYOUT = {
  'index.html@1440x900': (d) => {
    W.def = R(48, 1072, 300, 330);
    put(d, '.contents', R(48, 1072, 1900, 2100));
    put(d, '.overdue', R(48, 808, 330, 355));
    put(d, '#n-ains', R(48, 200, 370, 388));
    put(d, '[data-seam="w-ains"] > .t-d1', R(48, 808, 402, 441), [R(48, 408, 404, 440)]);
    put(d, '[data-seam="w-ains"] [data-primary]', R(48, 160, 445, 489));
    put(d, '.arr-above', R(400, 1040, 0, 84)); put(d, '.arr-foot', R(435, 1005, 0, 25)); put(d, '.arr-skip', R(1304, 1424, 840, 884));
  },
  'index.html@900x800': (d) => { LAYOUT['index.html@1440x900'](d); put(d, '.arr-skip', R(764, 884, 740, 784)); put(d, '.arr-foot', R(165, 735, 0, 25)); },
  'index.html@390x844': (d) => {
    W.def = R(16, 374, 300, 330);
    put(d, '.contents', R(16, 374, 2400, 2800));
    put(d, '.overdue', R(16, 374, 520, 595));
    put(d, '#n-ains', R(16, 120, 600, 618));
    put(d, '[data-seam="w-ains"] > .t-d1', R(16, 374, 640, 718), [R(16, 300, 642, 680), R(16, 200, 681, 718)]);
    put(d, '[data-seam="w-ains"] [data-primary]', R(16, 128, 722, 766));
    put(d, '.arr-above', R(16, 374, 0, 110)); put(d, '.arr-foot', R(16, 374, 0, 75)); put(d, '.arr-skip', R(254, 374, 784, 828));
  },
  'index.html@390x480': (d) => LAYOUT['index.html@390x844'](d),
  'document.html@1440x900': (d) => {
    W.def = R(328, 1048, 1300, 1330);
    put(d, '.sh', R(328, 1048, 48, 220)); put(d, '.mi', ZERO);
    put(d, '#s-brief', R(328, 1048, 800, 1000)); put(d, '#s-discovery', R(328, 1048, 1050, 1290)); put(d, '#s-agreement', R(328, 1048, 1560, 1690));
    put(d, '#s-procurement', R(328, 1048, 1700, 1900)); put(d, '#s-schedule', R(328, 1048, 2000, 2200)); put(d, '#s-install', R(328, 1048, 2300, 2500)); put(d, '#s-care', R(328, 1048, 2600, 2800));
    put(d, '.fixture-foot', R(48, 1392, 3000, 3070));
    put(d, '.spine', R(104, 280, 0, 900)); put(d, '.rail', R(1192, 1432, 48, 400));
    put(d, '#h-direction', R(328, 1048, 1370, 1386));
    put(d, '#s-direction [data-seam="w-direction"] > .t-d1', R(328, 1048, 1400, 1439), [R(328, 688, 1402, 1438)]);
    put(d, '#s-direction [data-primary]', R(328, 440, 1470, 1514));
    put(d, '.arr-above', R(400, 1040, 0, 110)); put(d, '.arr-below', R(400, 1040, 0, 18)); put(d, '.arr-skip', R(1304, 1424, 840, 884));
    d.querySelector('#s-direction').cs = { borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'rgba(44, 41, 38, 0.1)' };
  },
  'document.html@390x844': (d) => {
    W.def = R(16, 374, 1300, 1330);
    put(d, '.sh', R(16, 374, 32, 260)); put(d, '.rail', ZERO);
    put(d, '#s-install', R(16, 374, 2300, 2500)); put(d, '#s-care', R(16, 374, 2600, 2800)); put(d, '.fixture-foot', R(16, 374, 3000, 3070));
    put(d, '.spine', R(0, 390, 0, 44));
    put(d, '#h-direction', R(16, 200, 1470, 1486));
    put(d, '#s-direction [data-seam="w-direction"] > .t-d1', R(16, 374, 1500, 1578), [R(16, 300, 1502, 1540), R(16, 200, 1541, 1578)]);
    put(d, '#s-direction [data-primary]', R(16, 128, 1600, 1644));
    put(d, '.arr-above', R(16, 374, 0, 120)); put(d, '.arr-below', R(16, 374, 0, 18)); put(d, '.arr-skip', R(254, 374, 784, 828));
  },
};

function boot(file, { search = '', hash = '', osRM = false, session = {}, vp = [1440, 900], nav = 'navigate', fonts = true, gaps = [], base = false, visibility = 'visible' } = {}) {
  const doc = parseHTML((base ? BASE : SRC)[file]);
  W = { doc, clock: 1000, tid: 0, timeouts: [], running: [], log: [], navs: [], defaultNav: [], dispatched: [], scrolled: [], scrolls: [], intervals: 0, rafs: 0, rafq: [], nextFrame: 1016, gaps: gaps.slice(),
    kbd: false, session: new Map(Object.entries(session)), win: { L: {}, C: {} }, fontsOK: fonts, fontWait: [], vp, def: R(0, 100, 100, 130), sel: true };
  doc.activeElement = doc.body; doc.visibilityState = visibility;
  const key = file + '@' + vp.join('x');
  if (LAYOUT[key]) LAYOUT[key](doc);
  put(doc, '.mc', R(vp[0] - 336, vp[0] - 16, vp[1] - 156, vp[1] - 16)); // the review strip, bottom-right, when ?controls=1 shows it
  const html = doc.documentElement; html.clientWidth = vp[0]; html.scrollHeight = 4000;
  doc.fonts = { check: () => W.fontsOK, ready: { then(fn) { W.fontWait.push(fn); } } };
  const loc = { search, hash, h: file, get href() { return this.h; }, set href(v) { W.navs.push(String(v)); this.h = String(v); } };
  const ctx = {
    document: doc, location: loc, innerWidth: vp[0], innerHeight: vp[1], scrollY: 0,
    scrollTo(x, y) { ctx.scrollY = y; W.scrolls.push(y); },
    matchMedia: (q) => ({ matches: osRM && /reduce/.test(q), addEventListener() {} }),
    performance: { now: () => W.clock, getEntriesByType: () => [{ type: nav }] },
    getSelection: () => ({ isCollapsed: W.sel, anchorNode: null }),
    getComputedStyle: (el) => ({ transform: el.style.transform || 'none', opacity: el.style.opacity === undefined || el.style.opacity === '' ? '1' : el.style.opacity, backgroundColor: 'rgb(139, 115, 85)', ...el.cs }),
    DOMMatrixReadOnly: Matrix,
    MouseEvent: class { constructor(type, init = {}) { Object.assign(this, init); this.type = type; } },
    setTimeout(fn, d) { const id = ++W.tid; W.timeouts.push({ fn, at: W.clock + (d || 0), id }); return id; },
    clearTimeout(id) { W.timeouts = W.timeouts.filter((t) => t.id !== id); },
    setInterval() { W.intervals++; return 0; }, clearInterval() {},
    requestAnimationFrame(fn) { const id = ++W.tid; W.rafs++; if (!W.rafq.length && W.nextFrame <= W.clock) W.nextFrame = W.clock + nextGap(); W.rafq.push({ id, fn }); return id; },
    cancelAnimationFrame(id) { W.rafq = W.rafq.filter((x) => x.id !== id); },
    sessionStorage: { getItem: (k) => (W.session.has(k) ? W.session.get(k) : null), setItem: (k, v) => W.session.set(k, String(v)), removeItem: (k) => W.session.delete(k) },
    addEventListener(t, f, o) { const m = o === true || (o && o.capture) ? W.win.C : W.win.L; (m[t] = m[t] || []).push(f); },
  };
  ctx.window = ctx; W.ctx = ctx;
  vm.createContext(ctx);
  W.t0 = W.clock;
  for (const s of doc.scripts) vm.runInContext(s, ctx);
  const $ = (s) => doc.querySelector(s), $$ = (s) => doc.querySelectorAll(s);
  return { K: ctx.K, doc, $, $$, ctx };
}

/* reading the fake frame */
function valAt(a, prop) {
  const k0 = a.kf[0], k1 = a.kf[a.kf.length - 1];
  if (!(prop in k0)) return undefined;
  const local = W.clock - a.start - a.delay;
  if (local < 0) return a.fill === 'backwards' || a.fill === 'both' ? k0[prop] : undefined;
  if (local >= a.duration) return a.fill === 'forwards' || a.fill === 'both' ? k1[prop] : undefined;
  return typeof k0[prop] === 'number' ? k0[prop] + (k1[prop] - k0[prop]) * (local / a.duration) : k0[prop];
}
function ownOpacity(e) {
  let v, vis;
  for (const a of e._fx) { const x = valAt(a, 'opacity'); if (x !== undefined) v = x; const y = valAt(a, 'visibility'); if (y !== undefined) vis = y; }
  if (vis === 'hidden') return 0;
  if (v === undefined) v = e.style.opacity === undefined || e.style.opacity === '' ? 1 : +e.style.opacity;
  return v;
}
function opacity(el) { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentNode) { if (!rendered(e)) return 0; o *= ownOpacity(e); } return o; }
function onScreen(el) { const r = el.getBoundingClientRect(); return r.bottom > r.top && r.bottom > 0 && r.top < W.vp[1]; }
/* every visible, on-screen line of words; closed wells, visually-hidden text and script are not words on paper */
function visibleWords(doc) {
  const out = [];
  for (const e of doc.body.all()) {
    if (/^(SCRIPT|STYLE)$/.test(e.tagName) || e.closest('.vh') || e.closest('.well:not(.open) .well-body')) continue;
    if (!e.children.some((c) => c.nodeType === 3 && c.data.trim())) continue;
    if (opacity(e) > 0 && onScreen(e)) out.push(e.textContent.replace(/\s+/g, ' ').trim());
  }
  return out;
}
const arrAnims = () => W.log.filter((a) => !a.el.classList.contains('rule'));
const liveArr = () => W.running.filter((a) => !a.el.classList.contains('rule'));
const pendingTimers = () => W.timeouts.filter((t) => !(t.a && t.a.el.classList.contains('rule')));
const animOf = (el) => arrAnims().filter((a) => a.el === el);
// Well owns the inline opacity of .well-back and the transform of .well-body at rest (fullpage behaviour); parity checks cover those.
const leftovers = (doc) => [...doc.body.all()].filter((e) => !e.closest('.well-back,.well-body') && ['opacity', 'transform', 'transformOrigin', 'willChange', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'].some((p) => e.style[p]));
/* the resting frame: nothing pending, nothing styled, the card and Skip gone, the page whole */
function atRest(K, doc, $) {
  if (K.arrival.running()) return 'still running';
  if (liveArr().length) return 'running animations: ' + liveArr().map((a) => a.el.tagName + '.' + (a.el.attrs.class || '')).join(',');
  if (pendingTimers().length) return 'pending timers: ' + pendingTimers().length;
  if (W.rafq.length) return 'pending frame callbacks: ' + W.rafq.length;
  if (doc.body.all && [...doc.body.all()].some((e) => e._fx.some((a) => !a.el.classList.contains('rule')))) return 'animation effects still applied';
  const lo = leftovers(doc); if (lo.length) return 'inline residue on ' + lo.map((e) => e.tagName + '.' + (e.attrs.class || '') + '#' + e.id).join(',');
  if (!$('.arr-card').hidden || !$('.arr-skip').hidden) return 'card or Skip still shown';
  const c = doc.documentElement.attrs.class || '';
  if (/arr-/.test(c)) return 'html still ' + c;
  return true;
}
const hero = { [DESK]: '[data-seam="w-ains"] > .t-d1', [DOC]: '#s-direction [data-seam="w-direction"] > .t-d1' };
const actSel = { [DESK]: '[data-seam="w-ains"] [data-primary]', [DOC]: '#s-direction [data-primary]' };
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
function ser(doc) {
  const out = [];
  (function w(n, d) {
    for (const c of n.children) {
      if (c.nodeType === 3) { const t = c.data.trim(); if (t) out.push(d + '#' + t); continue; }
      if (/^(SCRIPT|STYLE)$/.test(c.tagName) || c.hasAttribute('data-arr')) continue;
      const at = Object.keys(c.attrs).sort().map((k) => k + '=' + c.attrs[k]).join(' ');
      const sty = Object.keys(c.style).filter((k) => typeof c.style[k] !== 'function' && c.style[k] !== '' && c.style[k] !== undefined).sort().map((k) => k + ':' + c.style[k]).join(';');
      out.push(d + c.tagName + '[' + at + ']{' + sty + '}' + (c.inert ? '!inert' : ''));
      w(c, d + ' ');
    }
  })(doc.body, '');
  return out.join('\n');
}

/* ---------------- 1. static checks ---------------- */
const parts = (s) => {
  const css = s.slice(s.indexOf('<style>') + 7, s.indexOf('</style>'));
  const main = s.slice(s.indexOf('<script>\n(function(){') + 9, s.lastIndexOf('</script>'));
  const text = s.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<script>[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  const block = (x, a, b) => (x.includes(a) && x.includes(b) ? x.slice(x.indexOf(a), x.indexOf(b) + b.length) : '');
  const gate = (/<script>\/\* arrival:gate[\s\S]*?<\/script>/.exec(s) || [''])[0];
  return { css, main, text, gate, sharedCss: block(css, '/* shared:start', '/* shared:end */'), sharedJs: block(main, '/* shared:start', '/* shared:end */'), arrCss: block(css, '/* arrival:start', '/* arrival:end */'), arrJs: block(main, '/* arrival:start', '/* arrival:end */') };
};
for (const f of [DESK, DOC]) {
  const s = SRC[f], p = parts(s);
  check(f + ' opens with doctype, charset and viewport (fullpage head shape)', /^<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>/.test(s));
  const title = (/<title>([^<]*)<\/title>/.exec(s) || [])[1] || '';
  check(f + ' title is a 2-4 word name', title.split(/\s+/).length >= 2 && title.split(/\s+/).length <= 4 && !title.includes(':'), title);
  const hosts = [...s.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  check(f + ' hosts are Google Fonts only; no <script src', hosts.every((h) => h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com') && !/<script[^>]*\bsrc=/i.test(s), hosts.join(','));
  check(f + ' single paper theme', p.css.includes('color-scheme:light') && !/prefers-color-scheme/.test(s));
  check(f + ' no interval, infinite, autoplay or smooth scroll; frames only inside the arrival block', !/setInterval|infinite|Infinity|animation-iteration|autoplay|scroll-behavior\s*:\s*smooth|behavior:\s*'smooth'/.test(s) && s.replace(p.arrJs, '').indexOf('requestAnimationFrame') < 0);
  check(f + ' copy has no "!", AI or lorem', !/!/.test(p.text) && !/\bAI\b/.test(p.text) && !/lorem/i.test(p.text));
  const wide = [...p.css.replace(/@media[^{]*/g, '').matchAll(/(?<![-\w])(?:min-)?width:\s*(\d+)px/g)].filter((m) => +m[1] > 358);
  check(f + ' no CSS width/min-width over 358px (390 phone)', wide.length === 0, wide.map((m) => m[0]).join(','));
  check(f + ' arrival overflow never scrolls sideways; print drops the card and Skip', /html\.arr-on\{overflow-x:hidden\}/.test(p.arrCss) && /@media print\{\.arr-card,\.arr-skip\{display:none!important\}\}/.test(p.arrCss));
  check(f + ' Skip arrival: real button, DM Mono 11/16.5, 44px target, 16px safe inset, hint', /<button type="button" class="arr-skip" data-arr aria-describedby="arr-hint" hidden>Skip arrival<\/button>/.test(s) && /<span id="arr-hint" data-arr hidden>Escape or any key skips\.<\/span>/.test(s) && /\.arr-skip\{[^}]*right:calc\(16px \+ env\(safe-area-inset-right\)\);bottom:calc\(16px \+ env\(safe-area-inset-bottom\)\)[^}]*min-width:44px;min-height:44px[^}]*font-size:11px;line-height:16\.5px/.test(p.arrCss));
  check(f + ' the opening card is aria-hidden and starts hidden', /<div class="arr-card" data-arr aria-hidden="true" hidden>/.test(s));
  const RB = (v, w) => '<button type="button" class="act" data-press data-arr-replay' + v + '><span class="w">' + w + '</span><span class="rule" aria-hidden="true"></span></button>';
  check(f + ' Replay arrival, Replay reduced, Replay without scale: real scored buttons in the fixture footer line (F8)', /<p class="fixture-foot">[^\n]*<\/p>/.test(s) && s.includes('<span data-arr> · ' + RB('', 'Replay arrival') + ' · ' + RB('="rm"', 'Replay reduced') + ' · ' + RB('="translate"', 'Replay without scale') + '</span></p>'));
  check(f + ' F1: during the arrival staged layers take no pointer hits; Skip and the review strip stay live', p.arrCss.includes('html.arr-on body{pointer-events:none}') && p.arrCss.includes('html.arr-on .arr-skip,html.arr-on .mc{pointer-events:auto}'));
  const strip = [...s.slice(s.indexOf('<aside class="mc"'), s.indexOf('</aside>', s.indexOf('<aside class="mc"'))).matchAll(/id="(mc-replay|mc-rm|mc-tr|mc-slow)"/g)].map((m) => m[1]).join(',');
  check(f + ' ?controls=1 strip: Replay · Reduced motion · Translate only · Slow ×4', strip === 'mc-replay,mc-rm,mc-tr,mc-slow' && s.includes('<aside class="mc" aria-label="Review controls" hidden>'), strip);
  for (const [i, src] of [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).entries()) attempt(f + ' inline script ' + i + ' parses', () => { new vm.Script(src); return true; });
}
{
  const a = parts(SRC[DESK]), b = parts(SRC[DOC]), fa = parts(BASE[DESK]);
  check('both pages share byte-identical shared CSS/JS and arrival CSS/JS', a.sharedCss === b.sharedCss && a.sharedJs === b.sharedJs && a.arrCss.length > 500 && a.arrCss === b.arrCss && a.arrJs.length > 5000 && a.arrJs === b.arrJs);
  check('arrival gate identical on both pages but for the page name', a.gate.length > 300 && a.gate.replace("})(window,'desk')", "})(window,'doc')") === b.gate);
  check('resting base: shared CSS is the fullpage shared CSS verbatim', a.sharedCss === fa.sharedCss);
  const REPLAY_NEW = "  $('#mc-replay').addEventListener('click',function(e){K.cancel(dwell);dwell=null;K.arrival.replay(e);}); /* cinematic: Replay is the arrival from its resting start; it never resets her work */\n";
  const swapped = fa.sharedJs.replace(/  var replay=null;\n  \$\('#mc-replay'\)[\s\S]*?\n  \}\);\n/, REPLAY_NEW);
  check('resting base: shared JS is the fullpage shared JS with only Replay pointed at the arrival', swapped !== fa.sharedJs && swapped === a.sharedJs);
  const deskCard = ['Middle West Studio', 'Friday · Sep 25', 'Ainsworth · Procurement · Leah · due today', 'One reply is past due: the Delgado delivery window needed an answer by Sep 23.'];
  const docCard = ['Ainsworth Residence', 'Edna Ainsworth · Living room and entry', 'Procurement · Madison · Target Oct 16', 'White oak · due today · Leah'];
  const cardText = (s) => { const d = parseHTML(s); return d.querySelectorAll('.arr-card p').map((e) => e.textContent); };
  check('Desk opening copy exact, in reading order (studio, day, job, footnote)', cardText(SRC[DESK]).join('|') === deskCard.join('|'), cardText(SRC[DESK]).join('|'));
  check('Document opening copy exact, in reading order (identity, household, stage, context)', cardText(SRC[DOC]).join('|') === docCard.join('|'), cardText(SRC[DOC]).join('|'));
  const fpText = BASE[DESK] + BASE[DOC];
  check('every opening word already stands in the full-page fixture', ['Middle West Studio', 'Friday · Sep 25', 'Procurement · Leah · due today', 'One reply is past due: the Delgado delivery window needed an answer by Sep 23.', 'Ainsworth Residence', 'Edna Ainsworth</a>&nbsp;· Living room and entry', '<span>Madison</span><span>Target Oct 16</span><span>Procurement</span>', 'White oak · due today · Leah', 'Finish approval needed.', 'Review finish'].every((x) => fpText.includes(x)));
  check('opening type: studio 12/18 500 .08em, day Inter 14/21, job 12/18 .04em, title Playfair 26/31.2, footnote 16/24.8', ['.arr-studio{font-family:var(--font-meta);font-size:12px;line-height:18px;font-weight:500;letter-spacing:.08em', '.arr-day{font-family:var(--font-body);font-size:14px;line-height:21px', '.arr-meta{font-family:var(--font-meta);font-size:12px;line-height:18px;font-weight:400;letter-spacing:.04em', '.arr-title{font-family:var(--font-display);font-size:26px;line-height:31.2px;font-weight:500', '.arr-foot{font-family:var(--font-body);font-size:16px;line-height:24.8px', '.arr-card>*{position:absolute;left:16px;right:16px;max-width:640px'].every((x) => a.arrCss.includes(x)));
  const idx = concepts.slice(concepts.indexOf('## §5 Mockup index'), concepts.indexOf('## §6'));
  check('concepts.md §5 indexes the cinematic pair and this oracle', idx.includes('cinematic/index.html') && idx.includes('cinematic/document.html') && idx.includes('cinematic-oracle.mjs'));
  const s8 = concepts.slice(concepts.indexOf('## §8'));
  check('concepts.md §8 Cinematic arrival (proposal) names R-DM8..R-DM17', concepts.includes('## §8 Cinematic arrival (proposal)') && [8, 9, 10, 11, 12, 13, 14, 15, 16, 17].every((n) => s8.includes('R-DM' + n + ' ')));
}

/* ---------------- 2. the Desk arrival at 1440 ---------------- */
attempt('Desk frame 0 (1440): only the card, the sentence, its act, the past-due footnote and Skip are visible', () => {
  const { K, doc } = boot(DESK);
  if (!K.arrival.running()) return 'did not play on a fresh load';
  if (/arr-pre/.test(doc.documentElement.attrs.class) || !/arr-on/.test(doc.documentElement.attrs.class)) return 'html classes ' + doc.documentElement.attrs.class;
  const words = visibleWords(doc).sort();
  const want = ['Middle West Studio', 'Friday · Sep 25', 'Ainsworth · Procurement · Leah · due today', 'One reply is past due: the Delgado delivery window needed an answer by Sep 23.', 'Finish approval needed.', 'Review finish', 'Skip arrival'].sort();
  return JSON.stringify(words) === JSON.stringify(want) ? true : words.join(' | ');
});
attempt('Desk frame 0 (1440): the real sentence at 52/34 scale, its written text centred at 50%/46%, from its ink centre', () => {
  const { $ } = boot(DESK);
  const h = $(hero[DESK]), t = parseTf(h.style.transform);
  if (!t.ok || !near(t.s, 52 / 34, 1e-9)) return 'scale ' + h.style.transform;
  // ink 48..408 x 404..440 -> centre (228,422); target (720, 0.46*900=414)
  if (!near(t.x, 492) || !near(t.y, -8)) return 'translate ' + t.x + ',' + t.y;
  if (h.style.transformOrigin !== '180px 20px') return 'origin ' + h.style.transformOrigin;
  const a = animOf(h)[0];
  return a && a.delay === 560 && a.duration === 640 && a.easing === Q && a.fill === 'both' && a.kf[1].transform === 'translate(0px,0px) scale(1)' ? true : 'flight ' + (a && [a.delay, a.duration, a.easing]);
});
attempt('Desk frame 0: the real Review finish is a second carrier, scale 1, 20px under the sentence, straight to its box', () => {
  const { $ } = boot(DESK);
  const act = $(actSel[DESK]), t = parseTf(act.style.transform), a = animOf(act)[0];
  if (!t.ok || t.s !== 1) return 'act scale ' + act.style.transform;
  const hBot = 414 + (36 * 52 / 34) / 2;
  if (!near(t.x, 720 - 104) || !near(t.y, hBot + 20 - 445)) return 'act translate ' + t.x + ',' + t.y;
  if (act.closest('[aria-hidden="true"]') || $(hero[DESK]).closest('[aria-hidden="true"]')) return 'a carrier is aria-hidden';
  return a && a.delay === 560 && a.duration === 640 && a.easing === Q && a.kf.length === 2 ? true : 'act flight';
});
attempt('Desk: no ancestor of the sentence or its act is hidden or moved; only separators on them fade', () => {
  const { $ } = boot(DESK);
  const h = $(hero[DESK]), act = $(actSel[DESK]);
  const bad = arrAnims().filter((a) => a.el !== h && a.el !== act && (a.el.contains(h) || a.el.contains(act)) && a.kf.some((k) => 'opacity' in k || 'transform' in k));
  return bad.length === 0 ? true : bad.map((a) => a.el.tagName + '.' + a.el.attrs.class).join(',');
});
const tierOf = (a) => [a.delay, a.duration, a.easing, a.kf[0].transform || '-', 'opacity' in a.kf[0] ? a.kf[0].opacity + '>' + a.kf[1].opacity : '-'].join(' ');
attempt('Desk tiers: 560 owed facts print together; 760 local +6; 840 controls opacity; 920 ledger/Boards +4; 1000 outer; below the fold untouched', () => {
  const { $, $$ } = boot(DESK);
  const T = (el) => animOf(el).map(tierOf).join(' / ');
  const exp = [
    [$('#greet').parentNode, '560 0 linear - 0>1'], [$('.overdue'), '560 0 linear - 0>1'], [$('.dayline'), '560 0 linear - 0>1'],
    [$$('#claims > [data-region]')[1], '560 0 linear - 0>1'], [$$('#claims > [data-region]')[2], '560 0 linear - 0>1'], [$('#claims .pl-id'), '560 0 linear - 0>1'],
    [$('.mnote'), '760 240 ' + E + ' translate(0px,6px) scale(1) 0>1'], [$('[data-detail="w-ains"]'), '760 240 ' + E + ' translate(0px,6px) scale(1) 0>1'], [$('#w-ains'), '760 240 ' + E + ' translate(0px,6px) scale(1) 0>1'],
    [$('.head-acts'), '840 240 ' + E + ' - 0>1'], [$('.roster-head'), '840 240 ' + E + ' - 0>1'],
    [$('#ledger'), '920 240 ' + E + ' translate(0px,4px) scale(1) 0>1'], [$('.boards'), '920 240 ' + E + ' translate(0px,4px) scale(1) 0>1'],
    [$('.fixture-foot'), '1000 240 ' + E + ' - 0>1'],
  ];
  for (const [el, want] of exp) if (T(el) !== want) return (el.id || el.attrs.class || el.tagName) + ': ' + T(el);
  if (animOf($('.contents')).length) return 'below-fold contents animated';
  const starts = new Set(arrAnims().filter((a) => !a.el.closest('[data-arr]') && a.el !== $(hero[DESK]) && a.el !== $(actSel[DESK])).map((a) => a.delay));
  return [...starts].every((t) => [560, 760, 840, 920, 1000].includes(t)) ? true : 'stray start ' + [...starts];
});
attempt('Desk 560: canonical warning and owed facts print in the frame the doubles hand off; intro context gone by 680', () => {
  const { $ } = boot(DESK);
  until(559);
  if (opacity($('.overdue')) !== 0 || opacity($('.arr-foot')) !== 1 || opacity($('.arr-above')) !== 1) return 'frame 559';
  until(560);
  if (opacity($('.overdue')) !== 1 || opacity($('.arr-foot')) !== 0 || opacity($('#claims .pl-id')) !== 1) return 'frame 560: warning ' + opacity($('.overdue')) + ' footnote ' + opacity($('.arr-foot'));
  if (!(opacity($('.arr-above')) > 0.99)) return 'intro context faded before its canonical home printed';
  until(680);
  return opacity($('.arr-above')) === 0 && opacity($('.arr-skip')) === 0 && opacity($('.mnote')) === 0 ? true : 'frame 680';
});
attempt('Desk 1200: carriers land and their transforms and origins clear; 1240 still; 1440 handed back, nothing pending', () => {
  const { K, doc, $ } = boot(DESK);
  const h = $(hero[DESK]), act = $(actSel[DESK]);
  until(1190);
  if (!h.style.transform || !act.style.transform) return 'landed early';
  until(1216);
  if (h.style.transform || h.style.transformOrigin || h.style.willChange || act.style.transform || animOf(h).some((a) => a.playState === 'running')) return 'transforms not cleared at 1200';
  until(1240);
  const active = arrAnims().filter((a) => a.playState !== 'idle' && W.clock - a.start - a.delay < a.duration);
  if (active.length) return 'still moving at 1240: ' + active.length;
  if (Math.max(...arrAnims().map((a) => a.delay + a.duration)) !== 1240) return 'score does not end at 1240';
  if (!K.arrival.running()) return 'handed back before 1440';
  until(1440); advance(20);
  const r = atRest(K, doc, $);
  if (r !== true) return r;
  if (W.doc.activeElement !== doc.body) return 'pointer or unknown entry took focus';
  return W.scrolls.length === 0 && W.intervals === 0 ? true : 'scroll writes or intervals';
});
attempt('Desk at rest after the arrival is the fullpage resting page (DOM, attributes, inline style)', () => {
  boot(DESK, { base: true }); const want = ser(W.doc);
  const { K } = boot(DESK); until(1500);
  if (K.arrival.running()) return 'still running';
  return ser(W.doc) === want ? true : 'differs';
});
attempt('Desk after rest keeps the fullpage grammar: hover dwell reveals at 160ms E, Show all latches at 0ms', () => {
  const { K, $ } = boot(DESK); until(1500);
  const seam = $('[data-seam="w-ains"]'), n = W.log.length;
  fire(seam.closest('[data-region]'), 'pointerenter'); fire(seam, 'pointermove'); advance(100);
  const a = W.log.slice(n).find((x) => x.el === $('#w-ains .well-body'));
  if (!K.wells['w-ains'].isOpen || !a || a.duration !== 160 || a.easing !== E) return 'reveal';
  fire($('[data-show-all]'), 'click');
  return Object.values(K.wells).every((w) => w.isOpen) ? true : 'show all';
});

/* ---------------- 3. input: work wins ---------------- */
function skipAt(file, t, act, opts = {}) {
  const r = boot(file, opts); until(t);
  if (!r.K.arrival.running()) throw new Error('not running at ' + t);
  const out = act(r);
  const rest = atRest(r.K, r.doc, r.$);
  if (rest !== true) throw new Error('not at rest at ' + t + ': ' + rest);
  return { ...r, out };
}
attempt('any keydown (a letter, a modifier, Cmd+K) finishes on the resting frame at once and keeps its meaning', () => {
  for (const t of [0, 300, 700, 1300]) for (const k of ['a', 'Shift', 'k']) {
    const { out } = skipAt(DESK, t, ({ doc }) => fire(doc.body, 'keydown', { key: k, metaKey: k === 'k' }));
    if (out.defaultPrevented || out.stop) return 'swallowed ' + k + ' at ' + t;
  }
  return true;
});
attempt('Escape skips only: the Document is never put down by the Escape that ends its arrival', () => {
  const s = { 'pl-arrive': 'ptr', 'pl-carry': '1' };
  for (const t of [0, 600, 1300]) {
    const { $, out } = skipAt(DOC, t, ({ doc }) => fire(doc.body, 'keydown', { key: 'Escape' }), { session: s });
    advance(400);
    if (!out.defaultPrevented || W.navs.length || animOf($('#paper')).length) return 'put down at ' + t;
  }
  const { K, $ } = boot(DOC, { session: s }); until(1500);
  fire(W.doc.body, 'keydown', { key: 'Escape' });
  const p = animOf($('#paper')).pop();
  return !K.arrival.running() && p && p.duration === 200 && p.easing === Q ? true : 'resting Esc no longer puts down';
});
attempt('Enter or Space with nothing chosen is skip only; nothing activates', () => {
  for (const k of ['Enter', ' ']) {
    const { out, K } = skipAt(DOC, 300, ({ doc }) => fire(doc.body, 'keydown', { key: k }), { session: { 'pl-arrive': 'kbd' } });
    if (!out.defaultPrevented || !out.stop || W.defaultNav.length || !W.doc.querySelector('#rec').hidden || K.wells['w-direction'].isOpen) return 'activated on ' + JSON.stringify(k);
  }
  return true;
});
attempt('Tab with nothing chosen lands on the real Review finish and is consumed; Shift+Tab continues back from it', () => {
  const r = skipAt(DESK, 400, ({ doc }) => fire(doc.body, 'keydown', { key: 'Tab' }));
  if (W.doc.activeElement !== r.$(actSel[DESK]) || !r.out.defaultPrevented) return 'Tab';
  const s = skipAt(DESK, 400, ({ doc }) => fire(doc.body, 'keydown', { key: 'Tab', shiftKey: true }));
  return W.doc.activeElement === s.$(actSel[DESK]) && !s.out.defaultPrevented ? true : 'Shift+Tab';
});
attempt('a blank press finishes and cannot click through onto what it revealed', () => {
  const { $ } = skipAt(DESK, 300, ({ $ }) => fire($('#n-ains a'), 'pointerdown'));
  const ev = fire($('#n-ains a'), 'click');
  if (!ev.defaultPrevented || W.defaultNav.length || W.session.has('pl-carry') || W.session.has('pl-arrive')) return 'clicked through';
  fire($('#n-ains a'), 'pointerup'); advance(1);
  fire($('#n-ains a'), 'click');
  return W.defaultNav.join() === 'document.html' ? true : 'the next ordinary click was lost: ' + W.defaultNav;
});
/* a press on the act at its visible (staged) box, released at pointer `up` with init `upInit`; the native click follows on the root */
function pressAct(file, t, up, upInit = {}, opts = {}) {
  const r = boot(file, opts); until(t);
  const act = r.$(actSel[file]), b = act.getBoundingClientRect(), cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
  let opened = 0; const was = r.K.openRecord; r.K.openRecord = (...a) => { opened++; return was(...a); };
  fire(act.querySelector('.w'), 'pointerdown', { pointerId: 7, clientX: cx, clientY: cy });
  const rest = atRest(r.K, r.doc, r.$); if (rest !== true) throw new Error('press did not rest at once: ' + rest);
  const early = W.defaultNav.length + opened + W.dispatched.length;
  if (up) up(r, { cx, cy, b }, upInit);
  fire(r.doc.documentElement, 'click', { detail: 1 }); // the browser's own click lands where the page now is
  return { ...r, early, opened: () => opened };
}
attempt('F2: a press on the visible Review finish ends the arrival at once and acts only on release, exactly once (Desk: to #rec; Document: opens the record)', () => {
  const release = ({ $, doc }, { cx, cy }, init) => fire(doc.documentElement, 'pointerup', { pointerId: 7, clientX: cx, clientY: cy, ...init });
  const d = pressAct(DESK, 700, release);
  if (d.early) return 'Desk: acted on the down press';
  if (W.defaultNav.join() !== 'document.html#rec' || W.session.get('pl-carry') !== '1' || W.dispatched.length !== 1) return 'Desk act: ' + W.defaultNav + ' x' + W.dispatched.length;
  const r = pressAct(DOC, 200, release, {}, { session: { 'pl-arrive': 'ptr' } });
  if (r.early) return 'Document: acted on the down press';
  return r.opened() === 1 && !r.$('#rec').hidden && W.doc.activeElement === r.$('#rec-note') ? true : 'record opened ' + r.opened() + 'x';
});
attempt('F2: a cancelled press, a scroll or wheel during the press, or a release off the act never activates; the next ordinary click still works', () => {
  const cases = {
    pointercancel: ({ doc }) => fire(doc.documentElement, 'pointercancel', { pointerId: 7 }),
    scroll: ({ doc, ctx }, { cx, cy }) => { ctx.scrollY += 60; fireWin('scroll'); fire(doc.documentElement, 'pointerup', { pointerId: 7, clientX: cx, clientY: cy }); },
    wheel: ({ doc }, { cx, cy }) => { fire(doc.documentElement, 'wheel'); fire(doc.documentElement, 'pointerup', { pointerId: 7, clientX: cx, clientY: cy }); },
    'release off the act': ({ doc }, { b }) => fire(doc.documentElement, 'pointerup', { pointerId: 7, clientX: b.right + 40, clientY: b.bottom + 40 }),
    'another pointer': ({ doc }, { cx, cy }) => fire(doc.documentElement, 'pointerup', { pointerId: 8, clientX: cx, clientY: cy }),
  };
  for (const [name, up] of Object.entries(cases)) {
    const r = pressAct(DESK, 500, up);
    if (W.defaultNav.length || W.dispatched.length || W.session.has('pl-carry')) return name + ' activated: ' + W.defaultNav;
    advance(1); fire(r.$(actSel[DESK]), 'click', { detail: 1 });
    if (W.defaultNav.join() !== 'document.html#rec') return name + ': the next ordinary click was lost';
  }
  const o = pressAct(DOC, 300, cases.pointercancel, {}, { session: { 'pl-arrive': 'ptr' } });
  return o.opened() === 0 && o.$('#rec').hidden ? true : 'Document record opened on a cancelled press';
});
attempt('F2: modifier keys on the release pass through to the act; a secondary button never activates', () => {
  let seen = null;
  const r = pressAct(DESK, 400, ({ $, doc }, { cx, cy }) => {
    $(actSel[DESK]).addEventListener('click', (e) => { seen = e; });
    fire(doc.documentElement, 'pointerup', { pointerId: 7, clientX: cx, clientY: cy, metaKey: true, shiftKey: true });
  });
  if (!seen || !seen.metaKey || !seen.shiftKey || seen.ctrlKey || seen.detail !== 1 || W.dispatched.length !== 1) return 'modifiers lost: ' + JSON.stringify(seen && { m: seen.metaKey, s: seen.shiftKey, d: seen.detail });
  const s = boot(DESK); until(400);
  const act = s.$(actSel[DESK]), b = act.getBoundingClientRect();
  fire(act, 'pointerdown', { pointerId: 3, button: 2, clientX: b.left + 1, clientY: b.top + 1 });
  fire(s.doc.documentElement, 'pointerup', { pointerId: 3, button: 2, clientX: b.left + 1, clientY: b.top + 1 });
  return r && !W.defaultNav.length && !W.dispatched.length ? true : 'secondary button activated';
});
attempt('F1: the real act is the one live target during the arrival (inline pointer-events:auto), cleared on the resting frame', () => {
  for (const [f, o] of [[DESK, {}], [DOC, { session: { 'pl-arrive': 'ptr' } }], [DESK, { search: '?rm=1' }]]) {
    const r = boot(f, o); until(100);
    if (!r.K.arrival.running() || r.$(actSel[f]).style.pointerEvents !== 'auto' || !/arr-on/.test(r.doc.documentElement.attrs.class)) return f + ' act not live ' + o.search;
    until(1500);
    if (r.$(actSel[f]).style.pointerEvents) return f + ' pointer-events residue';
  }
  return true;
});
attempt('wheel and touch finish without blocking her scroll; Skip finishes', () => {
  for (const t of ['wheel', 'touchstart']) { const { out } = skipAt(DESK, 500, ({ $ }) => fire($('.ledger-h'), t)); if (out.defaultPrevented) return t + ' prevented'; }
  skipAt(DESK, 100, ({ $ }) => fire($('.arr-skip'), 'pointerdown'));
  return true;
});
attempt('her scroll, a resize, pagehide, a selection or new focus finishes; the pre-paint position alone does not', () => {
  const r = boot(DOC, { session: { 'pl-arrive': 'ptr' } });
  until(300); fireWin('scroll');
  if (!r.K.arrival.running()) return 'the initial reading position ended it';
  skipAt(DOC, 300, ({ ctx }) => { ctx.scrollY += 40; fireWin('scroll'); }, { session: { 'pl-arrive': 'ptr' } });
  skipAt(DESK, 300, () => fireWin('resize'));
  skipAt(DESK, 300, () => fireWin('pagehide'));
  skipAt(DESK, 300, ({ doc }) => { W.sel = false; for (const f of doc.L.selectionchange || []) f({}); });
  skipAt(DESK, 300, ({ $ }) => { W.kbd = true; focusTo($('.head-acts .act')); });
  return true;
});
attempt('pointer movement during assembly never addresses a line', () => {
  const { K, $ } = boot(DESK); until(300);
  const seam = $('[data-seam="w-delg"]'); fire(seam.closest('[data-region]'), 'pointerenter'); fire(seam, 'pointermove'); until(500);
  return !K.wells['w-delg'].isOpen && K.arrival.running() ? true : 'addressed under the arrival';
});

/* ---------------- 4. focus: keyboard modality only; doorway rule ---------------- */
attempt('landing focus at 1440 only for a keyboard entry, on the real Review finish, without opening its detail', () => {
  const k = boot(DOC, { session: { 'pl-arrive': 'kbd', 'pl-carry': '1' } });
  until(1439); if (W.doc.activeElement !== k.doc.body) return 'focused before 1440';
  until(1460);
  if (W.doc.activeElement !== k.$(actSel[DOC])) return 'keyboard entry not focused on Review finish';
  if (k.K.wells['w-direction'].isOpen) return 'landing focus opened the detail';
  const p = boot(DOC, { session: { 'pl-arrive': 'ptr', 'pl-carry': '1' } }); until(1460);
  if (W.doc.activeElement !== p.doc.body) return 'pointer entry got an unsolicited focus';
  const d = boot(DESK); until(1460);
  return W.doc.activeElement === d.doc.body ? true : 'a fresh load guessed a modality';
});
attempt('doorway rule: a terminal primary act (approve/send/sign/pay/book) never takes landing focus; the section heading does', () => {
  const { $ } = boot(DOC, { session: { 'pl-arrive': 'kbd' } });
  $(actSel[DOC]).querySelector('.w').textContent = 'Approve finish';
  until(1460);
  return W.doc.activeElement === $('#h-direction') ? true : 'focus went to ' + (W.doc.activeElement.id || W.doc.activeElement.tagName);
});
attempt('the Desk name link records the entry modality for the Document; Review finish does not', () => {
  const { $ } = boot(DESK); until(1500);
  fire($('#n-ains a'), 'click', { detail: 0 });
  if (W.session.get('pl-arrive') !== 'kbd' || W.defaultNav.join() !== 'document.html') return 'name link: ' + W.session.get('pl-arrive');
  const r = boot(DESK); until(1500);
  fire(r.$('#n-ains a'), 'click', { detail: 1 });
  if (W.session.get('pl-arrive') !== 'ptr') return 'pointer pick-up';
  const s = boot(DESK); until(1500);
  fire(s.$(actSel[DESK]), 'click', { detail: 1 });
  return !W.session.has('pl-arrive') && W.session.get('pl-carry') === '1' ? true : 'Review finish carried an arrival token';
});

/* ---------------- 5. when it never plays ---------------- */
attempt('Document: the project-name pick-up plays the arrival instead of the pick-up (one entry move), tokens spent at start', () => {
  const { K, $ } = boot(DOC, { session: { 'pl-arrive': 'ptr', 'pl-carry': '1' } });
  if (!K.arrival.running() || animOf($('#paper')).length) return 'arrival and pick-up stacked or arrival missing';
  return !W.session.has('pl-arrive') && !W.session.has('pl-carry') ? true : 'tokens not spent at start';
});
attempt('#rec never plays: Review finish opens the record with the pick-up as today', () => {
  const { K, $ } = boot(DOC, { hash: '#rec', session: { 'pl-carry': '1', 'pl-arrive': 'ptr' } });
  const p = animOf($('#paper'))[0];
  return !K.arrival.running() && !$('#rec').hidden && W.doc.activeElement === $('#rec-note') && p && p.duration === 270 && p.easing === O && $('.arr-card').hidden ? true : 'hash arrival';
});
attempt('a Document opened any other way (reload, direct, no name pick-up) does not play', () => {
  const { K } = boot(DOC);
  return !K.arrival.running() && W.log.length === 0 && !/arr-/.test(W.doc.documentElement.attrs.class) ? true : 'played';
});
attempt('put-down and leave-word return to a Desk that plays nothing', () => {
  for (const how of ['esc', 'leave']) {
    const d = boot(DOC);
    if (how === 'esc') fire(d.doc.body, 'keydown', { key: 'Escape' }); else fire(d.$('[data-leave]'), 'click');
    advance(200);
    if (W.navs.join() !== 'index.html' || W.session.get('pl-from-doc') !== '1') return how + ': no put-down token';
    const r = boot(DESK, { session: Object.fromEntries(W.session) });
    if (r.K.arrival.running() || W.session.has('pl-from-doc')) return how + ': the Desk played after the put-down';
  }
  return true;
});
attempt('Back/Forward and BFCache never play: history entry declines; pageshow.persisted mid-arrival rests', () => {
  const b = boot(DESK, { nav: 'back_forward' });
  if (b.K.arrival.running()) return 'history entry played';
  const r = boot(DESK); until(300); fireWin('pageshow', { persisted: true });
  const rest = atRest(r.K, r.doc, r.$);
  return rest === true ? true : rest;
});
attempt('?arrive=0 disables the arrival: the resting page from frame 0', () => {
  const { K, doc } = boot(DESK, { search: '?arrive=0' });
  if (K.arrival.running() || W.log.length || /arr-/.test(doc.documentElement.attrs.class)) return 'played';
  const want = ser(doc); boot(DESK, { base: true });
  return want === ser(W.doc) ? true : 'differs from fullpage';
});
attempt('F3: fonts not ready: covered paper never outlasts the first frame; then the ordinary page (and the Document pick-up as today)', () => {
  const { K, doc, $ } = boot(DOC, { fonts: false, session: { 'pl-arrive': 'ptr', 'pl-carry': '1' } });
  if (K.arrival.running() || !/arr-pre/.test(doc.documentElement.attrs.class)) return 'did not wait covered';
  advance(15); if (!/arr-pre/.test(doc.documentElement.attrs.class)) return 'uncovered before the first frame';
  advance(1); // the first frame (t0 + 16)
  if (/arr-/.test(doc.documentElement.attrs.class) || K.arrival.running() || !$('.arr-card').hidden) return 'blank paper past the first frame';
  const p = animOf($('#paper'))[0];
  if (!p || p.duration !== 270) return 'no pick-up fallback';
  if (pendingTimers().filter((t) => !t.a).length || W.rafq.length) return 'the wait left a timer or frame pending';
  const r = boot(DESK, { fonts: false }); advance(5); W.fontsOK = true; W.fontWait.forEach((f) => f());
  if (!r.K.arrival.running()) return 'fonts ready before the first frame did not play';
  const late = boot(DESK, { fonts: false }); advance(100); W.fontsOK = true; W.fontWait.forEach((f) => f());
  return !late.K.arrival.running() && !/arr-/.test(late.doc.documentElement.attrs.class) ? true : 'fonts after the first frame started the cinema late';
});
attempt('F3: a key, press, wheel or touch during the font wait ends it for good: the resting page at once, no later start', () => {
  const inputs = {
    key: ({ doc }) => fire(doc.body, 'keydown', { key: 'a' }),
    Escape: ({ doc }) => fire(doc.body, 'keydown', { key: 'Escape' }),
    press: ({ $ }) => fire($('#n-ains a'), 'pointerdown'),
    wheel: ({ $ }) => fire($('.ledger-h'), 'wheel'),
    touch: ({ $ }) => fire($('.ledger-h'), 'touchstart'),
  };
  for (const [name, input] of Object.entries(inputs)) {
    for (const when of ['fonts ready', 'first frame', '150ms']) {
      const r = boot(DESK, { fonts: false }); advance(4);
      const ev = input(r);
      if (/arr-/.test(r.doc.documentElement.attrs.class) || r.K.arrival.running()) return name + ': still covered after the input';
      if (name === 'Escape' && !ev.defaultPrevented) return 'Escape during the wait was not spent as the skip';
      if (when === 'fonts ready') { W.fontsOK = true; W.fontWait.forEach((f) => f()); advance(200); }
      else if (when === 'first frame') { W.fontsOK = true; advance(16); } else advance(200);
      if (r.K.arrival.running() || W.log.some((a) => !a.el.classList.contains('rule'))) return name + ' then ' + when + ': the cinema started after the input';
      const rest = atRest(r.K, r.doc, r.$); if (rest !== true) return name + ' then ' + when + ': ' + rest;
      if (name === 'press') { fire(r.$('#n-ains a'), 'click'); if (W.defaultNav.length) return 'a press on blank paper clicked through'; }
    }
  }
  const d = boot(DOC, { fonts: false, session: { 'pl-arrive': 'ptr', 'pl-carry': '1' } }); advance(4);
  fire(d.doc.body, 'keydown', { key: 'Escape' }); advance(200);
  return !animOf(d.$('#paper')).length && !W.navs.length ? true : 'Document: the skip during the wait put the paper down or played the pick-up';
});
attempt('a background tab or no fit (390x480 collision) gets the instant page, never a squeezed ceremony', () => {
  const h = boot(DESK, { visibility: 'hidden' });
  if (h.K.arrival.running()) return 'played in a background tab';
  const { K, doc, $ } = boot(DESK, { vp: [390, 480] });
  return !K.arrival.running() && W.log.length === 0 && $('.arr-card').hidden && $('.arr-skip').hidden && !/arr-/.test(doc.documentElement.attrs.class) && W.scrolls.length === 0 ? true : 'squeezed';
});
attempt('a Sheet, an open record or a typed note holds the page: Replay does nothing over work', () => {
  const r = boot(DOC); fire(r.$('[data-sheet-open="note"]'), 'click');
  fire(r.$('#mc-replay'), 'click');
  if (r.K.arrival.running()) return 'played over a Sheet';
  const s = boot(DOC); fire(s.$(actSel[DOC]), 'click');
  s.$('#rec-note').value = 'two coats'; fire(s.$('#rec-note'), 'input'); focusTo(s.doc.body);
  fire(s.$('[data-arr-replay]'), 'click');
  return !s.K.arrival.running() && s.$('#rec-note').value === 'two coats' ? true : 'played over a typed note';
});

/* ---------------- 6. reduced motion, translate only, other widths ---------------- */
attempt('reduced motion (?rm=1 and OS): line first in place; the rest fades 120-320ms opacity only; still at 320; no transform', () => {
  for (const opt of [{ search: '?rm=1' }, { osRM: true }]) {
    const { K, doc, $ } = boot(DESK, opt);
    if (!K.arrival.running()) return 'did not run the RM arrival';
    if (!$('.arr-card').hidden || !$('.arr-skip').hidden) return 'centred card under RM';
    if (arrAnims().some((a) => a.kf.some((k) => 'transform' in k)) || $(hero[DESK]).style.transform) return 'transform under RM';
    const words = visibleWords(doc).sort().join('|');
    if (words !== ['Ainsworth', 'Procurement · Leah · due today', 'Finish approval needed.', 'One reply is past due: the Delgado delivery window needed an answer by Sep 23.', 'Review finish'].sort().join('|')) return 'RM frame 0: ' + words;
    if (!arrAnims().every((a) => a.delay === 120 && a.duration === 200 && a.easing === Q)) return 'RM timings ' + [...new Set(arrAnims().map((a) => a.delay + '/' + a.duration))];
    until(319); if (!K.arrival.running()) return 'ended early';
    until(321);
    const rest = atRest(K, doc, $); if (rest !== true) return rest;
  }
  const d = boot(DOC, { search: '?rm=1', session: { 'pl-arrive': 'kbd' } });
  if (W.scrolls.join() !== '1160') return 'RM initial position ' + W.scrolls;
  until(330);
  return W.doc.activeElement === d.$(actSel[DOC]) ? true : 'RM keyboard focus';
});
attempt('F5: reduced motion shows the whole hero block at full ink at t0 (Desk: name, owner and stage, sentence, act, warning; Document: heading, context line, sentence, act, Detail)', () => {
  const blocks = {
    [DESK]: ['#n-ains', '#claims .pl-id .ctx', hero[DESK], actSel[DESK], '.overdue'],
    [DOC]: ['#h-direction', '#s-direction [data-seam="w-direction"] > .ctx', hero[DOC], actSel[DOC], '[data-detail="w-direction"]'],
  };
  for (const [f, o] of [[DESK, { search: '?rm=1' }], [DOC, { search: '?rm=1', session: { 'pl-arrive': 'ptr' } }], [DOC, { osRM: true, session: { 'pl-arrive': 'ptr' } }]]) {
    const { K, $ } = boot(f, o);
    if (!K.arrival.running()) return f + ': the RM arrival did not run';
    for (const s of blocks[f]) if (opacity($(s)) !== 1 || animOf($(s)).some((a) => 'opacity' in a.kf[0])) return f + ' t0: ' + s + ' at ' + opacity($(s));
    const covered = f === DESK ? ['.mnote', '#ledger'] : ['#s-procurement', '#w-direction', '.spine-name'];
    for (const s of covered) if (opacity($(s)) !== 0) return f + ' t0: ' + s + ' not covered';
    until(320); for (const s of covered) if (opacity($(s)) !== 1) return f + ' 320: ' + s + ' not in';
  }
  return true;
});
attempt('?scale=0 (R-DM10 B): translate only, 34px throughout, same centre', () => {
  const { $ } = boot(DESK, { search: '?scale=0' });
  const t = parseTf($(hero[DESK]).style.transform);
  return t.ok && t.s === 1 && near(t.x, 492) && near(t.y, -8) ? true : $(hero[DESK]).style.transform;
});
attempt('Translate only in the ?controls=1 strip switches the next Replay to scale 1', () => {
  const { K, $ } = boot(DESK, { search: '?controls=1' }); until(1500);
  const tr = $('#mc-tr'); tr.checked = true; fire(tr, 'change');
  fire($('#mc-replay'), 'click');
  return K.arrival.running() && parseTf($(hero[DESK]).style.transform).s === 1 ? true : 'strip toggle ' + $(hero[DESK]).style.transform;
});
attempt('761-1023px: 42/34; 390px: scale 1, the written text centred at 195/46%', () => {
  const m = boot(DESK, { vp: [900, 800] });
  if (!near(parseTf(m.$(hero[DESK]).style.transform).s, 42 / 34, 1e-9)) return '900: ' + m.$(hero[DESK]).style.transform;
  const p = boot(DESK, { vp: [390, 844] });
  const t = parseTf(p.$(hero[DESK]).style.transform);
  // ink 16..300 x 642..718 -> centre (158,680); target (195, 388.24)
  return p.K.arrival.running() && t.s === 1 && near(t.x, 37) && near(t.y, 388.24 - 680) ? true : '390: ' + p.$(hero[DESK]).style.transform;
});
attempt('390 Desk: footnote rises clear of Skip; nothing overlaps; no scroll', () => {
  const { $ } = boot(DESK, { vp: [390, 844] });
  return $('.arr-foot').style.bottom === '72px' && $('.arr-skip').style.bottom === '16px' && W.scrolls.length === 0 ? true : 'foot ' + $('.arr-foot').style.bottom;
});

/* ---------------- 7. the held Document ---------------- */
attempt('Document (1440): initial reading position puts the Direction hero top at clamp(160, .28 x usable, 240), once, before frame 0', () => {
  const { K } = boot(DOC, { session: { 'pl-arrive': 'ptr' } });
  if (W.scrolls.join() !== '1160') return 'scrolls ' + W.scrolls;
  until(1500);
  return !K.arrival.running() && W.scrolls.length === 1 ? true : 'scroll writes after t0';
});
attempt('Document frame 0: where the project is, then what Leah can do; nothing else on the paper', () => {
  const { doc } = boot(DOC, { session: { 'pl-arrive': 'ptr' } });
  const words = visibleWords(doc).sort();
  const want = ['Ainsworth Residence', 'Edna Ainsworth · Living room and entry', 'Procurement · Madison · Target Oct 16', 'Finish approval needed.', 'White oak · due today · Leah', 'Review finish', 'Skip arrival'].sort();
  return JSON.stringify(words) === JSON.stringify(want) ? true : words.join(' | ');
});
attempt('Document carriers: 52/34 sentence to Direction, act 12px under the context line, same 560-1200 flight', () => {
  const { $ } = boot(DOC, { session: { 'pl-arrive': 'ptr' } });
  const t = parseTf($(hero[DOC]).style.transform), a = parseTf($(actSel[DOC]).style.transform);
  // after scroll 1160: ink 328..688 x 242..278 -> centre (508,260); target (720, 414)
  if (!near(t.s, 52 / 34, 1e-9) || !near(t.x, 212) || !near(t.y, 154)) return 'hero ' + $(hero[DOC]).style.transform;
  const hBot = 414 + (36 * 52 / 34) / 2;
  if (a.s !== 1 || !near(a.x, 720 - 384) || !near(a.y, hBot + 8 + 18 + 12 - 310)) return 'act ' + $(actSel[DOC]).style.transform;
  return $('.arr-below').style.top === String(Math.round((hBot + 8) * 100) / 100) + 'px' ? true : 'context line ' + $('.arr-below').style.top;
});
attempt('F4: the job name and the current stage (Procurement) print at the 560 handoff and stay readable while the intro context dissolves', () => {
  const { $ } = boot(DOC, { session: { 'pl-arrive': 'ptr' } });
  const name = $('.spine-name'), cur = $('.spine [aria-current]');
  until(559); if (opacity(name) !== 0 || opacity(cur) !== 0 || opacity($('.arr-above')) !== 1) return 'frame 559';
  for (const t of [560, 620, 680, 760, 839]) {
    until(t);
    if (opacity(name) !== 1 || opacity(cur) !== 1) return 'frame ' + t + ': name ' + opacity(name) + ' stage ' + opacity(cur);
  }
  return opacity($('.arr-above')) === 0 && opacity($('.spine .leave')) === 0 ? true : 'frame 839: intro context or optional navigation';
});
attempt('Document tiers: Direction head and context, later stages, job name and current stage at 560; detail 760; rest of the spine 840; settled and rail 920; above and below untouched', () => {
  const { $ } = boot(DOC, { session: { 'pl-arrive': 'ptr' } });
  const T = (el) => animOf(el).map(tierOf).join(' / ');
  const exp = [
    [$('#h-direction'), '560 0 linear - 0>1'], [$('#s-direction .ctx'), '560 0 linear - 0>1'], [$('#s-procurement'), '560 0 linear - 0>1'], [$('#s-schedule'), '560 0 linear - 0>1'],
    [$('[data-detail="w-direction"]'), '760 240 ' + E + ' translate(0px,6px) scale(1) 0>1'], [$('#w-direction'), '760 240 ' + E + ' translate(0px,6px) scale(1) 0>1'],
    [$('.spine-name'), '560 0 linear - 0>1'], [$('.spine [aria-current]').parentNode, '560 0 linear - 0>1'],
    [$('.spine .leave'), '840 240 ' + E + ' - 0>1'], [$('.jumps > li'), '840 240 ' + E + ' - 0>1'], [$('.spine [href="#s-schedule"]').parentNode, '840 240 ' + E + ' - 0>1'],
    [$('#s-discovery'), '920 240 ' + E + ' translate(0px,4px) scale(1) 0>1'], [$('#s-agreement'), '920 240 ' + E + ' translate(0px,4px) scale(1) 0>1'], [$('.rail'), '920 240 ' + E + ' translate(0px,4px) scale(1) 0>1'],
  ];
  for (const [el, want] of exp) if (T(el) !== want) return (el.id || el.attrs.class) + ': ' + T(el);
  for (const s of ['#doc-title', '.sh-house', '#s-install', '#s-brief', '#paper']) if (animOf($(s)).length) return s + ' animated';
  const b = animOf($('#s-direction'))[0];
  if (!b || b.delay !== 760 || b.duration !== 240 || b.kf[0].borderTopColor !== 'transparent' || 'opacity' in b.kf[0]) return 'Direction separator';
  const cur = W.doc.querySelectorAll('.spine [aria-current]');
  return cur.length === 1 && cur[0].textContent.startsWith('Procurement') ? true : 'current stage changed';
});
attempt('Document at rest after the arrival is the fullpage resting page; Procurement stays the stage', () => {
  boot(DOC, { base: true }); const want = ser(W.doc);
  const { K } = boot(DOC, { session: { 'pl-arrive': 'ptr' } }); until(1500);
  return !K.arrival.running() && ser(W.doc) === want ? true : 'differs';
});
attempt('Document 390: hero top 160px, scale 1, sticky spine clear; same score', () => {
  const { K, $ } = boot(DOC, { vp: [390, 844], session: { 'pl-arrive': 'ptr' } });
  const t = parseTf($(hero[DOC]).style.transform);
  return K.arrival.running() && W.scrolls.join() === '1340' && t.s === 1 && animOf($(hero[DOC]))[0].delay === 560 ? true : 'scroll ' + W.scrolls + ' ' + $(hero[DOC]).style.transform;
});

/* ---------------- 8. slow devices and replay ---------------- */
attempt('F6: the first frame interval runs from t0: a stalled first frame (over 50ms) cuts to rest; a 40ms one does not', () => {
  for (const [f, o] of [[DESK, {}], [DOC, { session: { 'pl-arrive': 'ptr' } }]]) {
    const r = boot(f, o); W.nextFrame = W.clock + 200; advance(200);
    const rest = atRest(r.K, r.doc, r.$); if (rest !== true) return f + ' 200ms first frame: ' + rest;
  }
  const s = boot(DESK); W.nextFrame = W.clock + 51; advance(51);
  if (s.K.arrival.running()) return '51ms first frame';
  const ok = boot(DESK); W.nextFrame = W.clock + 40; advance(60);
  return ok.K.arrival.running() ? true : 'a 40ms first frame cut the arrival';
});
attempt('frame-drop guard: a first-three interval over 50ms, one over 100ms, or two over 34ms in a row cut to rest', () => {
  for (const gaps of [[60], [55], [16, 16, 16, 16, 120], [16, 16, 16, 16, 40, 40]]) {
    const r = boot(DESK, { gaps: [16, ...gaps] });
    advance(16 + 16 + gaps.reduce((a, b) => a + b, 0) + 1); // first frame at +16, the leading 16, then the gaps
    const rest = atRest(r.K, r.doc, r.$); if (rest !== true) return JSON.stringify(gaps) + ': ' + rest;
  }
  const ok = boot(DESK, { gaps: [16, 16, 16, 55, 16, 40, 16] }); advance(260);
  return ok.K.arrival.running() ? true : 'a late 55ms frame or a single 40ms frame cut the arrival';
});
attempt('no frame loop, interval or timer survives rest; Slow x4 stretches the whole score', () => {
  const r = boot(DESK); until(1500);
  if (W.rafq.length || pendingTimers().length || W.intervals) return 'loop after rest';
  const rafs = W.rafs; advance(1000);
  if (W.rafs !== rafs) return 'frames requested after rest';
  const s = boot(DESK, { search: '?controls=1' }); until(1500);
  const slow = s.$('#mc-slow'); slow.checked = true; fire(slow, 'change');
  fire(s.$('#mc-replay'), 'click');
  const h = animOf(s.$(hero[DESK])).pop();
  if (!h || h.delay !== 2240 || h.duration !== 2560) return 'slow flight ' + (h && [h.delay, h.duration]);
  advance(5700); if (!s.K.arrival.running()) return 'slow ended early';
  advance(100);
  return !s.K.arrival.running() ? true : 'slow never ended';
});
attempt('Replay arrival from the footer: back to the resting start, plays again, keyboard replay earns landing focus', () => {
  const { K, $, ctx } = boot(DESK); until(1500);
  ctx.scrollY = 1400;
  const b = $('[data-arr-replay]'); focusTo(b);
  fire(b, 'click', { detail: 0 });
  if (!K.arrival.running() || ctx.scrollY !== 0 || W.doc.activeElement === b) return 'replay start';
  until(3000);
  return W.doc.activeElement === $(actSel[DESK]) ? true : 'no keyboard landing after replay';
});
attempt('pressing Replay mid-arrival restarts cleanly (its press is not spent as a skip)', () => {
  const { K, $ } = boot(DESK, { search: '?controls=1' }); until(700);
  fire($('#mc-replay'), 'pointerdown'); const ev = fire($('#mc-replay'), 'click');
  if (ev.defaultPrevented || !K.arrival.running()) return 'replay swallowed';
  const h = animOf($(hero[DESK])).filter((a) => a.playState === 'running');
  return h.length === 1 && h[0].start === W.clock ? true : 'restart';
});

attempt('F8: footer Replay reduced replays once under reduced motion; Replay without scale once translate-only; nothing is kept for the next Replay', () => {
  for (const [f, o] of [[DESK, {}], [DOC, { session: { 'pl-arrive': 'ptr' } }]]) {
    const r = boot(f, o); until(1500);
    const btn = (v) => r.$('[data-arr-replay="' + v + '"]');
    fire(btn('rm').querySelector('.w'), 'click', { detail: 1 });
    if (!r.K.arrival.running() || !r.$('.arr-card').hidden || r.$(hero[f]).style.transform || arrAnims().filter((a) => a.start === W.clock).some((a) => a.delay !== 120 || a.duration !== 200 || a.kf.some((k) => 'transform' in k))) return f + ': Replay reduced did not replay line-first';
    if (opacity(r.$(actSel[f])) !== 1) return f + ': Replay reduced hid the act';
    advance(330);
    let rest = atRest(r.K, r.doc, r.$); if (rest !== true) return f + ' reduced: ' + rest;
    fire(btn('translate'), 'click', { detail: 1 });
    const t = parseTf(r.$(hero[f]).style.transform);
    if (!r.K.arrival.running() || r.$('.arr-card').hidden || !t.ok || t.s !== 1 || r.K.arrScale0) return f + ': Replay without scale ' + r.$(hero[f]).style.transform;
    advance(1500);
    rest = atRest(r.K, r.doc, r.$); if (rest !== true) return f + ' without scale: ' + rest;
    fire(r.$('[data-arr-replay=""]'), 'click', { detail: 1 });
    if (!r.K.arrival.running() || r.$('.arr-card').hidden || !near(parseTf(r.$(hero[f]).style.transform).s, 52 / 34, 1e-9) || r.K.rm()) return f + ': a mode persisted into the plain Replay';
  }
  const q = boot(DESK, { search: '?rm=1&scale=0' });
  return q.K.rm() && q.K.arrScale0 && q.K.arrival.running() && q.$('.arr-card').hidden ? true : 'query toggles no longer work';
});
attempt('F8: any hash still declines the arrival (the artifact host passes only a bare #anchor)', () => {
  for (const hash of ['#rec', '#controls', '#s-direction', '#x.y_z~-1']) {
    const d = boot(DESK, { hash });
    if (d.K.arrival.running() || W.log.some((a) => !a.el.classList.contains('rule'))) return 'Desk played under ' + hash;
    const o = boot(DOC, { hash, session: { 'pl-arrive': 'ptr' } });
    if (o.K.arrival.running()) return 'Document played under ' + hash;
  }
  return true;
});
if (process.env.CINE_ORACLE_FORCE_FAIL) check('forced failing assertion (F7 self-test)', false);
else {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, CINE_ORACLE_FORCE_FAIL: '1' }, encoding: 'utf8' });
  check('F7: a failed assertion exits non-zero (forced-failure child run)', child.status === 1 && /FAILED/.test(child.stdout), 'exit ' + child.status);
}

/* ---------------- report ---------------- */
const total = pass + fails.length;
for (const x of fails) console.log('FAIL ' + x);
console.log(`${fails.length ? 'FAILED' : 'PASS'} ${pass}/${total} checks · cinematic/index.html + cinematic/document.html`);
if (fails.length) process.exitCode = 1;
console.log('Not run: rendered browser at 1440/1280/390, real font metrics and safe areas, screen reader, device frame timing (source and in-memory runs only).');
