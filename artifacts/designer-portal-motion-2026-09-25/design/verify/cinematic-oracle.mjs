// Cinematic arrival oracle, v3 (SQ-333): page-agnostic. Node built-ins only; no browser, no jsdom.
// It globs cinematic/index.html and every cinematic/document*.html and runs the whole suite on each page: the page's real
// scripts (its inline scripts and the shared arrival.js it loads) run in node:vm over a small DOM parsed from its own markup,
// with capture-phase events, a frame clock, WAAPI timing and a generic flow layout (no per-page layout tables), so a new
// Document built on the engine is covered without editing this file. Contract: SQ-333 "ARRIVAL v3 MERGED CONTRACT".
// Usage: node artifacts/designer-portal-motion-2026-09-25/design/verify/cinematic-oracle.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const DESIGN = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CINE = path.join(DESIGN, 'cinematic');
const read = (...p) => fs.readFileSync(path.join(DESIGN, ...p), 'utf8');
const PAGES = ['index.html', ...fs.readdirSync(CINE).filter((f) => /^document.*\.html$/.test(f)).sort()];
const SRC = Object.fromEntries(PAGES.map((f) => [f, read('cinematic', f)]));
const ENGINE = read('cinematic', 'arrival.js'), ENGINE_CSS = read('cinematic', 'arrival.css');
const FULL = { 'index.html': read('fullpage', 'index.html'), 'document.html': read('fullpage', 'document.html') };
// SQ-330 §3: the copy each fixture's inputs must yield (keyed by job name; the Desk by 'desk')
const EXPECT = {
  desk: { place: 'Middle West Studio · Friday, Sep 25', headline: 'Ainsworth: finish approval needed.', facts: ['Delgado: delivery reply overdue 2 days.', 'Reyes: fabric sample due from the mill.', "Since yesterday: Hale's final order confirmed."], act: 'Review finish' },
  Ainsworth: { place: 'Ainsworth · Procurement', headline: 'Finish approval needed.', facts: ['Install targeted for Oct 16.', 'Since Wednesday: white oak sample recorded.', 'Your pen, due today; the workshop waits.'], act: 'Review finish' },
  Delgado: { place: 'Delgado · Schedule', headline: 'Overdue 2 days: delivery window needed.', facts: ['Delivery offered Oct 12–16.', 'Nothing new since Monday.', 'Waiting on the Delgados to confirm access.'], act: 'Review delivery' },
  Reyes: { place: 'Reyes · Install', headline: 'Waiting for the fabric sample.', facts: ['Install booked Oct 21.', 'Since Tuesday: sample marked in transit.', 'With the maker; promised by today.'], act: 'Follow up on sample' },
  Whitfield: { place: 'Whitfield · Install', headline: 'Install starts Oct 6; nothing needs you.', facts: ['All 14 lines delivered.', 'Since Sep 18: final delivery signed.', 'At rest; punch list opens at install.'], act: null },
  'Okafor-Bright': { place: 'Okafor-Bright · Discovery', headline: 'Yours to add: budget, how they live.', facts: ['Two of five essentials on record.', 'New to you: brief opened Sep 20.', 'No proposal drafted yet.'], act: 'Continue the brief' },
};
// A doorway verb may be phrasal ("Follow up on sample"): its particle counts with the verb, not as a word.
const verbAct = (act) => act.replace(/^([A-Z][a-z]+) (up|out|in|on|back|over)\b/, '$1');
const HINT = 'Skip goes straight to the page; any key opens it.';
const CE = 1800, HOLD = 10000;

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
const R = (left, right, top, bottom) => ({ left, right, top, bottom });
class Text { constructor(d, p) { this.data = d; this.parentNode = p; this.nodeType = 3; } cloneNode() { return new Text(this.data, null); } }
class Style {
  setProperty(k, v) { this[k] = v; }
  getPropertyValue(k) { return this[k] || ''; }
  set cssText(s) { for (const d of String(s).split(';')) { const i = d.indexOf(':'); if (i > 0) this[d.slice(0, i).trim().replace(/-([a-z])/g, (m, c) => c.toUpperCase())] = d.slice(i + 1).trim(); } }
  get cssText() { return ''; }
}
class El {
  constructor(tag, attrs) {
    this.tagName = tag.toUpperCase(); this.attrs = attrs || {}; this.childNodes = []; this.parentNode = null;
    this.style = new Style(); this.L = {}; this.C = {}; this._anims = []; this._fx = [];
    this.inert = false; this.value = ''; this.r = null; this.lines = null; this.scrollLeft = 0;
  }
  get nodeType() { return 1; }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = String(v); }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
  get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
  get ownerDocument() { return W.doc; }
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
  get textContent() { return this.childNodes.map((c) => (c.nodeType === 3 ? c.data : c.textContent)).join(''); }
  set textContent(v) { this.childNodes = [new Text(String(v), this)]; }
  get childElements() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get children() { return this.childElements; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); W.dirty = true; return c; }
  removeChild(c) { this.childNodes = this.childNodes.filter((x) => x !== c); c.parentNode = null; W.dirty = true; return c; }
  cloneNode(deep) { const e = new El(this.tagName, { ...this.attrs }); if (deep) for (const c of this.childNodes) { const k = c.cloneNode(true); k.parentNode = e; e.childNodes.push(k); } return e; }
  *all() { for (const c of this.childNodes) if (c.nodeType === 1) { yield c; yield* c.all(); } }
  querySelectorAll(s) { const g = sel(s); return [...this.all()].filter((e) => matches(e, g)); }
  querySelector(s) { const g = sel(s); for (const e of this.all()) if (matches(e, g)) return e; return null; }
  matches(s) { return matches(this, sel(s)); }
  closest(s) { const g = sel(s); for (let e = this; e && e.nodeType === 1; e = e.parentNode) if (matches(e, g)) return e; return null; }
  contains(x) { for (let e = x; e; e = e.parentNode) if (e === this) return true; return false; }
  addEventListener(t, f, o) { const m = o === true || (o && o.capture) ? this.C : this.L; (m[t] = m[t] || []).push(f); }
  removeEventListener() {}
  getAnimations() { return this._anims.slice(); }
  animate(kf, opt) { return anim(this, kf, opt); }
  focus() { focusTo(this); }
  blur() { if (W.doc.activeElement === this) { W.doc.activeElement = W.doc.body; fire(this, 'focusout', { relatedTarget: null }); } }
  click() { return fire(this, 'click', { detail: 0 }); }
  dispatchEvent(ev) { W.dispatched.push(ev); return !fire(this, ev.type, { ...ev, synthetic: true }).defaultPrevented; }
  scrollIntoView() { W.scrolled.push(this); }
  getBoundingClientRect() { W.reads++; return rect(this); }
  getClientRects() { W.reads++; const r = rect(this); return r.right > r.left || r.bottom > r.top ? [r] : []; }
  get scrollWidth() { return this.sw || 0; }
  get clientWidth() { return this.cw || 0; }
}
class Doc extends El {
  constructor() { super('#document'); this.activeElement = null; this.body = null; this.documentElement = null; this.scripts = []; this.visibilityState = 'visible'; }
  get nodeType() { return 9; }
  createElement(t) { return new El(t, {}); }
  getElementById(id) { return this.querySelector('#' + id); }
  getAnimations() { return W.running.slice(); }
  createRange() { let n = null; return { selectNodeContents(el) { n = el; }, getClientRects() { W.reads++; return inkRects(n); } }; }
}
function anim(el, kf, opt) {
  const delay = opt.delay || 0, fill = opt.fill || 'none', dur = opt.duration || 0;
  const a = { el, kf, duration: dur, delay, fill, easing: opt.easing, start: W.clock, playState: 'running', pausedAt: null, onfinish: null,
    effect: { target: el, getTiming: () => ({ delay, duration: dur }) },
    get currentTime() { return (a.pausedAt === null ? W.clock : a.pausedAt) - a.start; },
    cancel() { el._anims = el._anims.filter((x) => x !== a); el._fx = el._fx.filter((x) => x !== a); W.running = W.running.filter((x) => x !== a); W.timeouts = W.timeouts.filter((t) => t.a !== a); a.playState = 'idle'; },
    finish() { if (a.playState === 'finished' || a.playState === 'idle') return; a.start = W.clock - delay - dur; a.pausedAt = null; el._anims = el._anims.filter((x) => x !== a); W.running = W.running.filter((x) => x !== a); W.timeouts = W.timeouts.filter((t) => t.a !== a); if (fill === 'none' || fill === 'backwards') el._fx = el._fx.filter((x) => x !== a); a.playState = 'finished'; if (a.onfinish) a.onfinish(); },
    pause() { if (a.playState !== 'running') return; a.pausedAt = W.clock; W.timeouts = W.timeouts.filter((t) => t.a !== a); a.playState = 'paused'; },
    play() { if (a.playState !== 'paused') return; a.start += W.clock - a.pausedAt; a.pausedAt = null; a.playState = 'running'; arm(a); } };
  el._anims.push(a); el._fx.push(a); W.running.push(a); W.log.push(a);
  arm(a);
  return a;
}
function arm(a) { W.timeouts.push({ at: a.start + a.delay + a.duration, fn: () => a.finish(), id: -(++W.tid), a }); }
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function parseHTML(html) {
  const doc = new Doc(), stack = [doc];
  const TOK = /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = TOK.exec(html))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.childNodes.push(new Text(ent(m[5]), top)); continue; }
    if (m[1]) { const t = m[1].toUpperCase(); const i = stack.map((e) => e.tagName).lastIndexOf(t); if (i > 0) stack.length = i; continue; }
    if (!m[2]) continue;
    const attrs = {}, AT = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a; while ((a = AT.exec(m[3] || ''))) attrs[a[1]] = ent(a[2] ?? a[3] ?? a[4] ?? '');
    const el = new El(m[2], attrs); el.parentNode = top; top.childNodes.push(el);
    const tag = m[2].toLowerCase();
    if (tag === 'script' || tag === 'style') {
      const end = html.indexOf('</' + tag + '>', TOK.lastIndex);
      const raw = html.slice(TOK.lastIndex, end);
      if (tag === 'script') doc.scripts.push({ raw, src: attrs.src, type: attrs.type });
      el.childNodes.push(new Text(raw, el)); TOK.lastIndex = end + tag.length + 3; continue;
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
    else if ((m = eat(/^\[([\w-]+)(?:([\^~]?=)(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/))) c.attrs.push({ n: m[1], op: m[2], v: m[3] ?? m[4] ?? m[5] });
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
  for (const a of c.attrs) { const v = e.getAttribute(a.n); if (v === null) return false; if (a.op === '=' && v !== a.v) return false; if (a.op === '^=' && !v.startsWith(a.v)) return false; if (a.op === '~=' && !v.split(/\s+/).includes(a.v)) return false; }
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
const BUBBLES = new Set(['click', 'keydown', 'focusin', 'focusout', 'input', 'pointermove', 'pointerdown', 'pointerup', 'pointercancel', 'wheel', 'touchstart', 'dblclick', 'touchend']);
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

/* ---------------- a generic flow layout: page coordinates, from the markup alone ---------------- */
// type metrics [font-size, line-height, char width]; a leaf takes the nearest class it or an ancestor carries
const TYPE = { 't-d1': [34, 39.1, 16], 't-d2': [28, 34, 13], 't-d3': [20, 27, 9.5], 't-head': [11, 16.5, 8], 't-meta': [12, 18, 8], 't-body': [16, 24.8, 7.6], 't-body-sm': [14, 21, 6.7],
  'arr-place': [20, 26, 9.5], 'arr-slug': [11, 16.5, 8], 'arr-day': [14, 21, 6.7], 'arr-job': [11, 16.5, 8], 'arr-f1': [12, 18, 8], 'arr-f': [16, 24.8, 7.6], 'arr-cue': [11, 16.5, 8], 'act': [12, 44, 8], 'arr-skip': [11, 44, 8] };
const PHONE_TYPE = { 'arr-f': [14, 21, 6.7] };
const INLINE = new Set(['SPAN', 'EM', 'KBD', 'I', 'SMALL', 'STRONG', 'B', 'SVG', 'RECT', 'INPUT', 'LABEL']);
const ROWS = '.acts,.pl-id,.desk-head,.roster-head,.sh-vitals,.lrow,.strip,.contents,.mnote,.sec-head,.fill,.fixture-foot,.leave';
// borders by class: [side, width]; a first child of .lines or of a note list carries none
const BORDERS = [['.pl', 'Top', 1], ['.tsec', 'Top', 1], ['.desk-head', 'Bottom', 1], ['.roster-head', 'Bottom', 1], ['.ledger-h', 'Bottom', 1], ['.lrow', 'Bottom', 1], ['.board', 'Top', 1],
  ['.contents', 'Top', 1], ['.door', 'Bottom', 1], ['.mnote', 'Left', 2], ['.spine-name', 'Bottom', 1], ['.note-row', 'Top', 1], ['.rail', 'Left', 1]];
const phone = () => W.vp[0] <= 760;
function hiddenByCss(e) {
  const vw = W.vp[0];
  if (e.matches('.margin-inline') && vw >= 1440) return true;
  if (e.matches('.rail') && vw < 1440) return true;
  if (e.matches('.spine-name') && vw <= 760) return true;
  if (e.matches('.well') && !e.classList.contains('open')) return false;
  if (e.matches('.mc') && !W.doc.documentElement.classList.contains('controls')) return true;
  return false;
}
function rendered(e) {
  for (let x = e; x && x.nodeType === 1; x = x.parentNode) {
    const h = x.getAttribute('hidden'); if (h !== null && h !== 'until-found') return false;
    if (/^(SCRIPT|STYLE|TEMPLATE|HEAD|META|LINK|TITLE)$/.test(x.tagName) || hiddenByCss(x)) return false;
  }
  return !!(e && (e.parentNode || e === W.doc.documentElement));
}
function metric(e) {
  const T = phone() ? { ...TYPE, ...PHONE_TYPE } : TYPE;
  for (let x = e; x && x.nodeType === 1; x = x.parentNode) for (const c of (x.attrs.class || '').split(/\s+/)) if (T[c]) return T[c];
  return [16, 24, 7.6];
}
const textOf = (e) => e.textContent.replace(/\s+/g, ' ').trim();
const isRow = (e) => e.matches(ROWS) || (phone() && e.matches('.spine,.jumps'));
const isInline = (e) => INLINE.has(e.tagName) || (e.tagName === 'A' && !e.matches('.act,.board,.door,.leave,.jump')) || e.tagName === 'BUTTON' && !e.matches('.act');
function natural(e) { const [, lh, cw] = metric(e); return { w: Math.max(8, textOf(e).length * cw + (e.matches('.act') ? 4 : 0)), h: e.matches('.act') ? 44 : lh }; }
// lay one element into [left,right] from y; returns its bottom. Rects are page coordinates.
function flow(e, left, right, y) {
  if (!rendered(e)) { e.r = R(left, left, y, y); return y; }
  if (e.matches('.well:not(.open)') || e.matches('.arr-card,.arr-rules,.arr-rules-fix,.arr-safe,.arr-vh,.arr-skip,.layer')) { e.r = R(left, left, y, y); for (const d of e.all()) if (!d.r) d.r = R(left, left, y, y); return y; }
  const kids = e.childElements.filter((c) => rendered(c) && !c.matches('.arr-card,.arr-rules,.arr-rules-fix,.arr-safe,.arr-vh,.arr-skip'));
  const hasText = e.childNodes.some((c) => c.nodeType === 3 && c.data.trim());
  const pad = e.matches('.pl,.tsec') ? [24, 12] : e.matches('.lrow,.board') ? [12, 12] : e.matches('.note-row') ? [6, 6] : [0, 0];
  if (!kids.length || hasText || e.matches('.act,.t-d1,.t-d2,.t-d3,.state')) {
    const n = natural(e), width = Math.max(8, right - left), lines = Math.max(1, Math.ceil(n.w / width)), h = n.h * (e.matches('.act') ? 1 : lines);
    e.r = R(left, e.matches('.act') ? left + n.w : right, y + pad[0], y + pad[0] + h);
    e.lines = []; let rest = n.w; for (let i = 0; i < lines; i++) { const w = Math.min(rest, width); e.lines.push(R(left, left + w, y + pad[0] + i * n.h, y + pad[0] + (i + 1) * n.h)); rest -= w; }
    for (const d of e.all()) { d.r = e.r; d.lines = e.lines; }
    return e.r.bottom + pad[1];
  }
  let cy = y + pad[0];
  if (isRow(e)) {
    let x = left, rowTop = cy, rowH = 0;
    for (const c of kids) {
      const n = natural(c), w = Math.min(n.w, right - left);
      if (x > left && x + w > right && !e.matches('.spine,.jumps')) { x = left; rowTop += rowH + 4; rowH = 0; }
      const b = flow(c, x, x + w, rowTop); c.r = R(x, x + w, rowTop, Math.max(b, rowTop + n.h));
      rowH = Math.max(rowH, c.r.bottom - rowTop); x += w + 16;
    }
    if (e.matches('.spine,.jumps')) { e.sw = x - left; e.cw = right - left; }
    cy = rowTop + rowH;
  } else {
    kids.forEach((c, i) => { cy = flow(c, left, right, cy + (i ? 8 : 0)); });
  }
  e.r = R(left, right, y, cy + pad[1]);
  return e.r.bottom;
}
function layout() {
  const d = W.doc, [vw, vh] = W.vp, P = phone();
  W.dirty = false;
  for (const e of d.body.all()) { e.r = null; e.lines = null; }
  const ground = d.querySelector('.ground'), docEl = d.querySelector('.doc');
  let y = 0;
  if (ground) { const l = P ? 16 : Math.max(0, (vw - 1120) / 2) + 48, r = P ? vw - 16 : l + 1024; y = flow(ground, l, r, 48); }
  if (docEl) {
    const sp = d.querySelector('.spine'), main = d.querySelector('.main'), rail = d.querySelector('.rail');
    if (P) { flow(sp, 0, vw, 0); sp.r = R(0, vw, 0, 44); y = flow(main, 16, vw - 16, 60); }
    else {
      const wide = vw >= 1440, l = Math.max(48, (vw - (wide ? 1232 : 944)) / 2);
      flow(sp, l, l + 176, 40); y = flow(main, l + 224, l + 944, 48); if (rail && wide) flow(rail, l + 992 + 24, l + 1232, 48);
    }
    docEl.r = R(0, vw, 0, y);
  }
  for (const e of [ground, docEl]) if (e) for (let a = e.parentNode; a && a !== d.body; a = a.parentNode) a.r = a.r || e.r; // a wrapper (the put-down paper) is the box it holds
  for (const e of d.body.childElements) if (!e.r && rendered(e)) y = flow(e, 16, vw - 16, y + 24);
  d.documentElement.scrollHeight = Math.max(vh, y + 48);
}
// fixed and sticky boxes do not scroll; the arrival's own layers carry their inline coordinates
const pinned = (e) => !!e.closest('.spine,.rail,.mc,.arr-skip,.arr-safe,.arr-rules-fix');
const pxv = (v) => parseFloat(v) || 0;
function rect(e) {
  if (!rendered(e)) return { ...ZERO, width: 0, height: 0 };
  if (W.dirty) layout();
  const [vw, vh] = W.vp, sy = W.ctx.scrollY;
  const out = (r, dy) => ({ left: r.left, right: r.right, top: r.top - dy, bottom: r.bottom - dy, width: r.right - r.left, height: r.bottom - r.top });
  if (e.matches('.arr-safe')) return out(R(0, vw, 0, vh), 0);
  if (e.matches('.arr-vh')) return out(R(0, 1, 0, 1), 0);
  if (e.matches('.arr-skip')) { const w = textOf(e).length * 8 + 16; return out(R(vw - 16 - w, vw - 16, vh - 60, vh - 16), 0); }
  if (e.parentNode && e.parentNode.nodeType === 1 && e.parentNode.matches('.arr-card,.arr-rules,.arr-rules-fix')) {
    const fix = e.parentNode.matches('.arr-rules-fix'), l = pxv(e.style.left), t = pxv(e.style.top);
    let w, h;
    if (e.style.width) { w = pxv(e.style.width); h = pxv(e.style.height); }
    else if (e.matches('.arr-line')) { w = 120; h = 1; }
    else if (e.matches('.arr-crown')) { w = h = phone() ? 14 : 16; }
    else { const n = natural(e); w = Math.min(n.w, phone() ? vw - 32 : 640); h = n.h * Math.ceil(n.w / w); }
    return out(R(l, l + w, t, t + h), fix ? 0 : sy);
  }
  const card = e.closest('.arr-card'); if (card) return out(R(0, 0, 0, 0), 0);
  const r = e.r || R(0, 0, 0, 0);
  return out(r, pinned(e) ? 0 : sy);
}
function inkRects(e) {
  if (!e || !rendered(e)) return [];
  const b = rect(e);
  if (!e.lines || e.closest('.arr-card')) return [b];
  const dy = pinned(e) ? 0 : W.ctx.scrollY;
  return e.lines.map((r) => ({ left: r.left, right: r.right, top: r.top - dy, bottom: r.bottom - dy, width: r.right - r.left, height: r.bottom - r.top }));
}
function computed(e) {
  W.reads++;
  const [fs] = e.nodeType === 1 ? metric(e) : [16];
  const cs = { fontSize: fs + 'px', display: 'block', position: 'static', overflowX: 'visible', overflowY: 'visible', color: 'rgb(44, 41, 38)', backgroundColor: 'rgb(139, 115, 85)',
    paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px', opacity: e.style && e.style.opacity !== undefined && e.style.opacity !== '' ? e.style.opacity : '1', transform: (e.style && e.style.transform) || 'none',
    getPropertyValue: (n) => (n === '--text-faint' ? '#9A8F84' : '') };
  for (const s of ['Top', 'Right', 'Bottom', 'Left']) { cs['border' + s + 'Width'] = '0px'; cs['border' + s + 'Style'] = 'none'; cs['border' + s + 'Color'] = 'rgba(44, 41, 38, 0.1)'; }
  if (e.nodeType !== 1 || e.tagName === 'HTML') return cs;
  if (INLINE.has(e.tagName) || isInline(e)) cs.display = 'inline';
  if (e.matches('.act')) cs.display = 'inline-flex';
  if (e.matches('.spine,.rail')) cs.position = 'sticky';
  if (e.matches('.arr-skip,.mc,.arr-safe,.arr-rules-fix')) cs.position = 'fixed';
  if (e.matches('.spine')) { cs.overflowX = 'auto'; cs.overflowY = phone() ? 'hidden' : 'auto'; }
  if (phone() && e.matches('.spine')) { cs.borderBottomWidth = '1px'; cs.borderBottomStyle = 'solid'; }
  if (e.matches('.state')) cs.color = 'rgb(150, 90, 60)';
  const first = e.parentNode && e.parentNode.childElements && e.parentNode.childElements[0] === e;
  for (const [s, side, wd] of BORDERS) if (e.matches(s) && !(first && e.matches('.lines > .pl, .note-row'))) { cs['border' + side + 'Width'] = wd + 'px'; cs['border' + side + 'Style'] = 'solid'; }
  for (const k of Object.keys(e.style)) if (/^border\w+Color$/.test(k) && e.style[k]) cs[k] = e.style[k];
  return cs;
}

/* ---------------- boot: the page's scripts, in document order, in a vm context ---------------- */
// promises settle synchronously here, so the O2 font wait runs on the fake clock
class SP {
  constructor(ex) { this.s = 0; this.v = undefined; this.cb = []; try { ex((v) => this._set(1, v), (v) => this._set(2, v)); } catch (e) { this._set(2, e); } }
  _set(s, v) { if (this.s) return; if (s === 1 && v && typeof v.then === 'function') { v.then((x) => this._set(1, x), (x) => this._set(2, x)); return; } this.s = s; this.v = v; const c = this.cb; this.cb = []; c.forEach((f) => f()); }
  then(f, r) { return new SP((res, rej) => { const run = () => { try { if (this.s === 1) res(f ? f(this.v) : this.v); else if (r) res(r(this.v)); else rej(this.v); } catch (e) { rej(e); } }; if (this.s) run(); else this.cb.push(run); }); }
  catch(r) { return this.then(null, r); }
  static all(a) { return new SP((res, rej) => { const out = []; let n = a.length; if (!n) res(out); a.forEach((p, i) => SP.resolve(p).then((v) => { out[i] = v; if (--n === 0) res(out); }, rej)); }); }
  static resolve(v) { return v instanceof SP ? v : new SP((r) => r(v)); }
}
const EPOCH = Date.UTC(2026, 8, 25, 14, 0, 0);
function boot(file, { search = '', hash = '', osRM = false, coarse = false, session = {}, vp = [1440, 900], nav = 'navigate', fontAt = 0, gaps = [], visibility = 'visible', src = null, epoch = EPOCH, sel = true } = {}) {
  const doc = parseHTML(src || SRC[file]);
  W = { doc, clock: 1000, tid: 0, timeouts: [], running: [], log: [], navs: [], defaultNav: [], dispatched: [], scrolled: [], scrolls: [], rafq: [], nextFrame: 1016, gaps: gaps.slice(),
    kbd: false, session: new Map(Object.entries(session)), win: { L: {}, C: {} }, vp, sel, reads: 0, dirty: true, epoch, fontAt: 1000 + fontAt, clicks: [] };
  doc.activeElement = doc.body; doc.visibilityState = visibility;
  const html = doc.documentElement; html.cw = vp[0]; html.scrollHeight = 4000;
  const ctx = {
    document: doc, location: null, innerWidth: vp[0], innerHeight: vp[1], scrollY: 0, scrollX: 0, Promise: SP, JSON, Math,
    Date: class extends Date { static now() { return W.epoch + W.clock; } },
    scrollTo(x, y) { ctx.scrollY = typeof x === 'object' ? x.top : y; W.scrolls.push({ y: ctx.scrollY, at: W.clock }); },
    matchMedia: (q) => ({ matches: (osRM && /reduce/.test(q)) || (coarse && /coarse/.test(q)), addEventListener() {} }),
    performance: { now: () => W.clock, getEntriesByType: () => [{ type: nav }] },
    getSelection: () => ({ isCollapsed: W.sel, anchorNode: null }),
    getComputedStyle: (el) => computed(el),
    DOMMatrixReadOnly: class { constructor(s) { this.m41 = 0; this.m42 = 0; this.a = 1; const m = s && /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(s); if (m) { this.m41 = +m[1]; this.m42 = +m[2]; this.a = +m[3]; } } },
    MouseEvent: class { constructor(type, init = {}) { Object.assign(this, init); this.type = type; } },
    setTimeout(fn, d) { const id = ++W.tid; W.timeouts.push({ fn, at: W.clock + (d || 0), id }); return id; },
    clearTimeout(id) { W.timeouts = W.timeouts.filter((t) => t.id !== id); },
    setInterval() { return 0; }, clearInterval() {},
    requestAnimationFrame(fn) { const id = ++W.tid; if (!W.rafq.length && W.nextFrame <= W.clock) W.nextFrame = W.clock + nextGap(); W.rafq.push({ id, fn }); return id; },
    cancelAnimationFrame(id) { W.rafq = W.rafq.filter((x) => x.id !== id); },
    sessionStorage: { getItem: (k) => (W.session.has(k) ? W.session.get(k) : null), setItem: (k, v) => W.session.set(k, String(v)), removeItem: (k) => W.session.delete(k) },
    addEventListener(t, f, o) { const m = o === true || (o && o.capture) ? W.win.C : W.win.L; (m[t] = m[t] || []).push(f); },
  };
  ctx.location = { search, hash, h: file, get href() { return this.h; }, set href(v) { W.navs.push(String(v)); this.h = String(v); } };
  doc.fonts = { check: () => W.clock >= W.fontAt, ready: { then() {} }, load: () => new SP((res) => { if (W.clock >= W.fontAt) res(); else ctx.setTimeout(res, W.fontAt - W.clock); }) };
  ctx.window = ctx; W.ctx = ctx;
  vm.createContext(ctx);
  for (const s of doc.scripts) {
    if (s.type === 'application/json') continue;
    vm.runInContext(s.src ? read('cinematic', s.src) : s.raw, ctx, { filename: s.src || file });
  }
  const $ = (s) => doc.querySelector(s), $$ = (s) => doc.querySelectorAll(s);
  const K = ctx.K, A = K && K.arrival;
  const o = { K, A, doc, $, $$, ctx, file, card: A && A.card(), inputs: JSON.parse($('#briefing').textContent) };
  o.part = (n) => doc.querySelectorAll('[data-part~="' + n + '"]').filter((e) => rect(e).right > rect(e).left)[0] || null;
  return o;
}
/* the clock */
function nextGap() { return W.gaps.length ? W.gaps.shift() : 16; }
function tick(ms) {
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
const phaseOf = (o) => o.A.phase();
function toPhase(o, ph, max = 30000) { for (let i = 0; i < max / 10 && phaseOf(o) !== ph; i++) tick(10); return phaseOf(o) === ph; }
function toRest(o, max = 40000) { for (let i = 0; i < max / 20 && o.A.running(); i++) tick(20); tick(50); return !o.A.running(); }
const key = (o, k, init = {}) => fire(o.doc.activeElement || o.doc.body, 'keydown', { key: k, ...init });
const scrollBy = (o, dy) => { o.ctx.scrollY += dy; fireWin('scroll'); };
function press(o, el, { x, y, type = 'mouse', id = 1 } = {}) {
  const r = el ? rect(el) : { left: 5, top: 5, right: 6, bottom: 6 }, t = el || o.doc.documentElement, cx = x ?? (r.left + r.right) / 2, cy = y ?? (r.top + r.bottom) / 2;
  const d = fire(t, 'pointerdown', { pointerId: id, pointerType: type, clientX: cx, clientY: cy });
  fire(t, 'pointerup', { pointerId: id, pointerType: type, clientX: cx, clientY: cy });
  const c = fire(t, 'click', { detail: 1, clientX: cx, clientY: cy }); // pointerup, then click, in one task (a timer set in pointerup runs after the click)
  tick(1);
  return { down: d, click: c };
}

/* reading the fake frame */
function valAt(a, prop) {
  const k0 = a.kf[0], k1 = a.kf[a.kf.length - 1];
  if (!(prop in k0)) return undefined;
  const local = a.currentTime - a.delay;
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
const liveArr = () => W.running.filter((a) => !a.el.classList.contains('rule') || a.el.closest('.arr-card'));
const pendingTimers = () => W.timeouts.filter((t) => !t.a);
const RESIDUE = ['opacity', 'transform', 'translate', 'transformOrigin', 'willChange', 'pointerEvents', 'filter', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];
const leftovers = (doc) => [...doc.body.all()].filter((e) => !e.closest('.well-back,.well-body,[data-arr]') && RESIDUE.some((p) => e.style[p]));
function atRest(o) {
  const { A, doc } = o;
  if (A.running()) return 'still running (' + A.phase() + ')';
  if (liveArr().length) return 'running animations: ' + liveArr().map((a) => a.el.tagName + '.' + (a.el.attrs.class || '')).join(',');
  if (pendingTimers().length) return 'pending timers: ' + pendingTimers().length;
  if (W.rafq.length) return 'pending frame callbacks: ' + W.rafq.length;
  if ([...doc.body.all()].some((e) => e._fx.length && !e.closest('.well-back,.well-body'))) return 'animation effects still applied';
  const lo = leftovers(doc); if (lo.length) return 'inline residue on ' + lo.map((e) => e.tagName + '.' + (e.attrs.class || '') + '#' + e.id + ' ' + RESIDUE.filter((p) => e.style[p]).join('/')).join(',');
  if (doc.querySelector('.arr-card,.arr-skip,.arr-rules,.arr-rules-fix,#arr-hint')) return 'arrival nodes still in the page';
  const c = doc.documentElement.attrs.class || '';
  if (/arr-/.test(c)) return 'html still ' + c;
  return true;
}
function ser(doc) {
  const out = [];
  (function w(n, d) {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { const t = c.data.trim(); if (t) out.push(d + '#' + t); continue; }
      if (/^(SCRIPT|STYLE)$/.test(c.tagName) || c.hasAttribute('data-arr')) continue;
      const at = Object.keys(c.attrs).sort().map((k) => k + '=' + c.attrs[k]).join(' ');
      const sty = Object.keys(c.style).filter((k) => c.style[k] !== '' && c.style[k] !== undefined).sort().map((k) => k + ':' + c.style[k]).join(';');
      out.push(d + c.tagName + '[' + at + ']{' + sty + '}' + (c.inert ? '!inert' : ''));
      w(c, d + ' ');
    }
  })(doc.body, '');
  return out.join('\n');
}
const norm = (s) => String(s).toLowerCase().replace(/[’']/g, "'").replace(/[^\w\s'–-]+/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => String(s || '').split(/\s+/).filter((x) => /[\w\d]/.test(x)).length;
const cardLines = (c) => [c.place, c.headline, ...c.facts, c.act].filter(Boolean);
const keyOf = (o) => (o.inputs.kind === 'desk' ? 'desk' : o.inputs.job.name);
// an independent cubic-bezier for the corridor check
function bez(c, x) { if (x <= 0) return 0; if (x >= 1) return 1; const b = (p1, p2, t) => { const u = 1 - t; return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t; }; let lo = 0, hi = 1, t = x; for (let i = 0; i < 50; i++) { t = (lo + hi) / 2; if (b(c[0], c[2], t) < x) lo = t; else hi = t; } return b(c[1], c[3], t); }
const overlap = (a, b, e) => a.left < b.right + e && a.right > b.left - e && a.top < b.bottom + e && a.bottom > b.top - e;

/* ---------------- 1. static and selection checks (SQ-330 T2-T7, T10 links) ---------------- */
const block = (s, a, b) => (s.includes(a) && s.includes(b) ? s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)) + b.length) : '');
const shared = (s) => block(s, '/* shared:start', '/* shared:end */') + '\n' + block(s.slice(s.indexOf('<script>\n')), '/* shared:start', '/* shared:end */');
attempt('arrival.css: phone overflow is clipped on body, never hidden on html (R4); print hides the arrival', () => {
  if (!/html\.arr-on body\{overflow-x:clip\}/.test(ENGINE_CSS)) return 'no overflow-x:clip';
  if (/html\.arr-on\{overflow-x:hidden/.test(ENGINE_CSS)) return 'html overflow hidden';
  return /@media print\{[^}]*\.arr-card/.test(ENGINE_CSS) || 'no print rule';
});
attempt('arrival.js: select() is a pure function with no DOM or clock reads', () => {
  const i = ENGINE.indexOf('function select('), j = ENGINE.indexOf('function message(');
  const body = ENGINE.slice(i, j);
  return !/\bdocument\.|\bwindow\.|\bd\.|\bw\.|Date\.now|performance|querySelector/.test(body) || 'select() touches the page or the clock';
});
attempt('T6: the since forms (SQ-330 §4)', () => {
  const o = boot('index.html'), sel = o.ctx.Arrival.select;
  const base = (anchor, changes, extra = {}) => ({ kind: 'document', today: '2026-09-25', viewer: 'Leah', job: { name: 'Test', stage: 'Direction' }, position: { text: 'Install targeted for Oct 16.', fidelity: 'exact' },
    needs: [{ kind: 'finish_approval', owner: 'studio', who: 'Leah', dueOn: '2026-09-25', line: 'Finish approval needed.', act: 'Review finish' }], since: anchor === undefined ? { first: 'brief opened Sep 20' } : { anchor, changes }, ...extra });
  const f2 = (inp) => sel(inp, inp.today, inp.viewer).facts[1];
  const c = (at, by, kind, text, need) => ({ at, by, kind, text, need });
  const cases = [
    [base(undefined), 'New to you: brief opened Sep 20.'],
    [base('2026-09-24', [c('2026-09-24', 'Tomás', 'message', 'sample recorded')]), 'Since yesterday: sample recorded.'],
    [base('2026-09-25', [c('2026-09-25', 'Tomás', 'message', 'sample recorded')]), 'Since earlier today: sample recorded.'],
    [base('2026-09-22', [c('2026-09-23', 'Tomás', 'message', 'sample recorded')]), 'Since Tuesday: sample recorded.'],
    [base('2026-09-18', [c('2026-09-20', 'Tomás', 'message', 'sample recorded')]), 'Since Sep 18: sample recorded.'],
    [base('2026-09-21', []), 'Nothing new since Monday.'],
    [base('2026-09-21', [c('2026-09-22', 'Leah', 'message', 'her own change')]), 'Nothing new since Monday.'],
    [base('2026-09-21', [c('2026-09-22', 'Tomás', 'hours', 'hours logged'), c('2026-09-22', 'Tomás', 'workshop_note', 'a note')]), 'Nothing new since Monday.'],
    [base('2026-09-21', [c('2026-09-20', 'Tomás', 'message', 'before the anchor')]), 'Nothing new since Monday.'],
    [base('2026-09-21', [c('2026-09-24', 'Tomás', 'invoice', 'invoice paid'), c('2026-09-22', 'Tomás', 'message', 'sample recorded', 'finish_approval')]), 'Since Monday: sample recorded.'],
    [base('2026-09-21', [c('2026-09-22', 'Tomás', 'invoice', 'invoice paid'), c('2026-09-23', 'Tomás', 'decision', 'direction chosen')]), 'Since Monday: direction chosen.'],
  ];
  for (const [inp, want] of cases) { const got = f2(inp); if (got !== want) return 'got "' + got + '" want "' + want + '"'; }
  return true;
});

for (const file of PAGES) {
  const P = (n) => file + ': ' + n, src = SRC[file];
  const head = src.slice(0, src.indexOf('</head>'));
  attempt(P('S1 loads the shared engine in <head>; declares only a Briefing and data-part marks'), () => {
    if (!/<html lang="en" data-arrival="(desk|doc)">/.test(src)) return 'no data-arrival on <html>';
    if (!head.includes('<link rel="stylesheet" href="arrival.css">') || !head.includes('<script src="arrival.js"></script>')) return 'arrival.css/js not loaded relatively in <head>';
    if (!/rel="preconnect" href="https:\/\/fonts\.googleapis\.com"/.test(head) || !/rel="preconnect" href="https:\/\/fonts\.gstatic\.com"/.test(head)) return 'no preconnect to both font hosts (O2)';
    if (/arrival:start|arrival:gate|K\.page\.arrive\s*=/.test(src)) return 'an inline arrival engine, gate or cfg remains';
    if (!/<script type="application\/json" id="briefing">/.test(src)) return 'no Briefing JSON';
    JSON.parse(/<script type="application\/json" id="briefing">([\s\S]*?)<\/script>/.exec(src)[1]);
    return /data-part="headline"/.test(src) || 'no headline mark';
  });
  attempt(P('S2 shared CSS and JS are verbatim across the cinematic pages'), () => shared(src) === shared(SRC['index.html']) || 'shared block differs from index.html');
  attempt(P('S3 footer keeps Replay, Replay reduced, Replay without scale and adds Replay cold (O7)'), () => {
    const d = parseHTML(src), v = d.querySelectorAll('[data-arr-replay]').map((b) => b.getAttribute('data-arr-replay')).sort().join(',');
    return v === ',cold,rm,translate' || 'replay buttons: ' + v;
  });
  const o = boot(file), card = o.card, k = keyOf(o), exp = EXPECT[k];
  attempt(P('copy: the authored inputs yield exactly SQ-330 §3 for ' + k), () => {
    if (!exp) return 'no SQ-330 expectation for "' + k + '"';
    if (card.place.toLowerCase() !== exp.place.toLowerCase()) return 'place "' + card.place + '"';
    if (card.headline !== exp.headline) return 'headline "' + card.headline + '"';
    for (let i = 0; i < 3; i++) if (card.facts[i] !== exp.facts[i]) return 'F' + (i + 1) + ' "' + card.facts[i] + '"';
    return (card.act || null) === exp.act || 'act "' + card.act + '"';
  });
  attempt(P('T2 budgets: place, headline, facts, act, core, card and message'), () => {
    const desk = k === 'desk';
    if (words(card.place) > (desk ? 6 : 5)) return 'place ' + words(card.place);
    const hw = words(card.headline); if (hw < 3 || hw > 8 || !/\.$/.test(card.headline)) return 'headline ' + hw + ' words';
    for (const f of card.facts) if (words(f) > 7) return 'fact "' + f + '" ' + words(f);
    if (card.act && (words(verbAct(card.act)) < 1 || words(verbAct(card.act)) > 3)) return 'act ' + words(verbAct(card.act));
    if (words(card.place) + words(card.headline) > 12) return 'core ' + (words(card.place) + words(card.headline));
    const all = cardLines(card).reduce((n, s) => n + words(s), 0); if (all > 36) return 'card ' + all;
    const m = o.ctx.Arrival.message(card); return words(m) <= 45 || 'message ' + words(m);
  });
  attempt(P('T3 preview rule: every card line is on the page it opens'), () => {
    const text = norm(o.doc.body.all ? [...o.doc.body.children].filter((c) => c.nodeType === 1 && !/^(SCRIPT|STYLE)$/.test(c.tagName) && !c.hasAttribute('data-arr')).map((c) => c.textContent).join(' ') : '');
    for (const line of cardLines(card)) {
      const segs = line.split(' · ').flatMap((s) => { const m = /^([^:]{2,40}): (.+)$/.exec(s); return m ? [m[1], m[2]] : [s]; });
      for (const s of segs) if (!text.includes(norm(s))) return '"' + s + '" (from "' + line + '") is not on the page';
    }
    return true;
  });
  attempt(P('T4 selection is deterministic under shuffled inputs'), () => {
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const want = JSON.stringify(cardLines(card)) + card.warn;
    for (let n = 0; n < 25; n++) {
      const inp = JSON.parse(JSON.stringify(o.inputs));
      if (inp.needs) shuffle(inp.needs);
      if (inp.jobs) { shuffle(inp.jobs); inp.jobs.forEach((j) => j.needs && shuffle(j.needs)); }
      if (inp.since && inp.since.changes) shuffle(inp.since.changes);
      const c = o.ctx.Arrival.select(inp, inp.today, inp.viewer), got = JSON.stringify(cardLines(c)) + c.warn;
      if (got !== want) return 'shuffle ' + n + ' gave ' + got;
    }
    return true;
  });
  attempt(P('T5 one day later: due today becomes overdue 1 day; every overdue count grows by one'), () => {
    const inp = JSON.parse(JSON.stringify(o.inputs)), c = o.ctx.Arrival.select(inp, '2026-09-26', inp.viewer), t0 = cardLines(card).join(' '), t1 = cardLines(c).join(' ');
    if (/\btoday\b/.test(t1)) return 'still says today: ' + t1;
    if (/\bdue today\b|\bby today\b/.test(t0) && !/overdue 1 day\b/i.test(t1)) return 'no "overdue 1 day": ' + t1;
    for (const m of t0.matchAll(/overdue (\d+) days?/gi)) if (!new RegExp('overdue ' + (+m[1] + 1) + ' days', 'i').test(t1)) return 'overdue ' + m[1] + ' did not become ' + (+m[1] + 1);
    if (k === 'desk' && !/Saturday, Sep 26/.test(c.place)) return 'place ' + c.place;
    return true;
  });
  attempt(P('T7 voice: plain statements ending in a period; no exclamations, no "AI", no pleading; acts are verbs'), () => {
    for (const s of [card.place, card.headline, ...card.facts]) {
      if (s !== card.place && !/\.$/.test(s)) return 'no period: ' + s;
      if (/!|\bAI\b|\bplease\b|\bsmart\b|\bjust\b|[\u{1F300}-\u{1FAFF}]/u.test(s)) return 'voice: ' + s;
    }
    if (card.act && (/\.$/.test(card.act) || !/^[A-Z][a-z]+( [a-z]+){0,2}$/.test(verbAct(card.act)))) return 'act ' + card.act;
    return true;
  });
  if (o.inputs.kind === 'desk') {
    attempt(P('T10 links: each name block opens its Document with the arrival; each act band goes to #rec without it'), () => {
      const d = o.doc, names = d.querySelectorAll('#claims .pl-id a'), acts = d.querySelectorAll('#claims [data-primary]');
      if (names.length < 3) return 'claims ' + names.length;
      for (const a of names) { const h = a.getAttribute('href'); if (!/^document(-[a-z-]+)?\.html$/.test(h) || !a.hasAttribute('data-arrive')) return 'name ' + a.textContent + ' → ' + h; }
      for (const [i, a] of acts.entries()) { if (a.getAttribute('href') !== names[i].getAttribute('href') + '#rec') return 'act band ' + i + ' → ' + a.getAttribute('href'); }
      const led = d.querySelectorAll('#ledger-stage a[data-arrive]').map((a) => a.getAttribute('href')).sort().join(',');
      if (led !== 'document-okafor-bright.html,document-whitfield.html') return 'ledger links ' + led;
      for (const [n, h] of [['Delgado', 'document-delgado.html'], ['Reyes', 'document-reyes.html']]) if (!names.some((a) => a.textContent === n && a.getAttribute('href') === h)) return n;
      return true;
    });
    attempt(P('T10 a name pick-up hands its modality to the Document (pl-arrive); an act band does not'), () => {
      const q = boot(file, { search: '?arrive=0' }), a = q.doc.querySelector('#claims .pl-id a[href="document-delgado.html"]');
      fire(a, 'click', { detail: 1 }); if (W.session.get('pl-arrive') !== 'ptr') return 'no ptr token';
      W.session.delete('pl-arrive'); fire(q.doc.querySelector('#claims [data-primary]'), 'click', { detail: 0 });
      return !W.session.has('pl-arrive') || 'act band set a token';
    });
  } else {
    attempt(P('T10 the Document keeps "← Desk" and the put-down'), () => {
      const l = o.doc.querySelector('a.leave[data-leave]');
      return (!!l && l.getAttribute('href') === 'index.html' && /Desk/.test(l.textContent) && typeof o.K.page.putDown === 'function') || 'no leave link';
    });
  }
  attempt(P('T10 gate: a Desk plays once per visit (30 min); a Document on every unanchored entry; #anchors, Back and arrive=0 never'), () => {
    const desk = o.inputs.kind === 'desk', now = EPOCH + 1000;
    const plays = (opt) => { const q = boot(file, opt); return q.A.phase() !== null; };
    if (!plays({})) return 'fresh entry did not play';
    if (desk && plays({ session: { 'pl-visit': String(now - 10 * 60e3) } })) return 'Desk played within the visit';
    if (desk && !plays({ session: { 'pl-visit': String(now - 31 * 60e3) } })) return 'Desk did not play after 30 minutes';
    if (!desk && !plays({ session: { 'pl-visit': String(now - 60e3) } })) return 'Document did not play mid-visit';
    for (const opt of [{ hash: '#rec' }, { nav: 'back_forward' }, { search: '?arrive=0' }]) if (plays(opt)) return 'played under ' + JSON.stringify(opt);
    const q = boot(file, { session: { 'pl-arrive': 'kbd' } }); if (W.session.has('pl-arrive') || !q.ctx.ARR.kbd) return 'token not spent into keyboard modality';
    return true;
  });
}

/* ---------------- 2. the three acts and the input model (O1, T8, T9, T11) ---------------- */
const VPS = { desktop: { vp: [1440, 900] }, phone: { vp: [390, 844], coarse: true } };
const skipEl = (o) => o.doc.querySelector('.arr-skip');
const actEl = (o) => o.part('act');
const blank = (o) => o.doc.body;
// a control on the page outside the card: a name block on the Desk, the put-down on a Document
const pageCtrl = (o) => o.doc.querySelector(o.inputs.kind === 'desk' ? '#claims .pl-id a[href="document-delgado.html"]' : 'a.leave');
const clicks = (el) => { const n = { c: 0 }; el.addEventListener('click', () => n.c++); return n; };
function toHold(o) { return toPhase(o, 'hold', 4000); }

for (const file of PAGES) for (const [vn, vo] of Object.entries(VPS)) {
  const P = (n) => file + ' @' + vn + ': ' + n;
  attempt(P('plays: the card layer is hidden from assistive tech; Skip carries the hint; one polite status, silent until the hold'), () => {
    const o = boot(file, vo);
    if (o.A.phase() !== 'compose') return 'phase ' + o.A.phase();
    const layer = o.doc.querySelector('.arr-card'); if (!layer || layer.getAttribute('aria-hidden') !== 'true') return 'card not aria-hidden';
    const sk = skipEl(o), hint = o.doc.getElementById('arr-hint');
    if (!sk || sk.getAttribute('aria-describedby') !== 'arr-hint' || !hint || hint.textContent !== HINT) return 'skip/hint';
    const st = o.doc.querySelectorAll('[role="status"][data-arr]'); if (st.length !== 1 || st[0].getAttribute('aria-live') !== 'polite') return 'status regions ' + st.length;
    if (st[0].textContent) return 'status spoke during compose';
    tick(CE - 20); if (o.A.phase() !== 'compose') return 'left compose at ' + (W.clock - 1000);
    tick(40); if (o.A.phase() !== 'hold') return 'no hold at CE';
    if (st[0].textContent !== o.ctx.Arrival.message(o.card)) return 'status "' + st[0].textContent + '"';
    toRest(o);
    return o.doc.querySelectorAll('[role="status"][data-arr]').length === 1 || 'status regions multiplied';
  });
  attempt(P('the hold waits 10s, then opens the page by itself; the assembly rests within 3,200ms'), () => {
    const o = boot(file, vo); toHold(o); const h = W.clock;
    tick(HOLD - 30); if (o.A.phase() !== 'hold') return 'left the hold early at ' + (W.clock - h);
    tick(60); if (o.A.phase() !== 'assemble') return 'no assembly after 10s: ' + o.A.phase();
    const a = W.clock; toRest(o); const sc = o.A.schedule();
    if (sc.finished !== 'rest') return 'finished ' + sc.finished;
    if (!(sc.rest <= 3200)) return 'rest ' + sc.rest;
    return atRest(o);
  });
  attempt(P('O1(a) input in Act 1 completes the compose and starts Act 3 at once'), () => {
    const o = boot(file, vo); tick(500); const ev = key(o, 'x');
    if (o.A.phase() !== 'assemble') return 'phase ' + o.A.phase();
    if (o.A.advances() !== 1) return 'advances ' + o.A.advances();
    toRest(o); return atRest(o);
  });
  attempt(P('O1(b) in the hold any key opens the page: a letter, Enter, Escape (not the put-down), a scroll key (prevented)'), () => {
    for (const k of ['a', 'Enter', 'Escape', 'ArrowDown', 'PageDown', ' ']) {
      const o = boot(file, vo); toHold(o); const ev = key(o, k);
      if (o.A.phase() !== 'assemble') return k + ': phase ' + o.A.phase();
      if (/Enter|Escape|Arrow|Page| /.test(k) && !ev.defaultPrevented) return k + ' not prevented';
      toRest(o);
      if (W.navs.length || W.defaultNav.length) return k + ' navigated ' + W.navs.concat(W.defaultNav);
    }
    return true;
  });
  attempt(P('O1(b)(c) Tab, Shift+Tab and lone modifiers never advance; Tab cycles act, then Skip'), () => {
    const o = boot(file, vo); toHold(o);
    for (const k of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']) { key(o, k); if (o.A.phase() !== 'hold') return k + ' advanced'; }
    const a = actEl(o), sk = skipEl(o);
    key(o, 'Tab'); if (o.doc.activeElement !== (a || sk)) return 'Tab went to ' + o.doc.activeElement.tagName;
    if (a) { key(o, 'Tab'); if (o.doc.activeElement !== sk) return 'second Tab went to ' + o.doc.activeElement.tagName; }
    key(o, 'Tab', { shiftKey: true }); if (o.doc.activeElement !== (a || sk)) return 'Shift+Tab went to ' + o.doc.activeElement.tagName;
    if (o.A.phase() !== 'hold' || o.A.advances()) return 'Tab advanced';
    toRest(o, 60000); return true;
  });
  attempt(P('O1(c) pointer, touch swipe, wheel and scroll each advance; the press is swallowed; the swipe\'s scroll never finishes Act 3'), () => {
    const cases = [['pointer', (o) => press(o, blank(o))], ['wheel', (o) => fire(blank(o), 'wheel', { deltaY: 40 })], ['touch', (o) => { fire(blank(o), 'touchstart', {}); scrollBy(o, 180); }], ['scroll', (o) => scrollBy(o, 120)]];
    for (const [n, f] of cases) for (const early of [false, true]) {
      const o = boot(file, vo); if (early) tick(300); else toHold(o);
      f(o);
      if (o.A.phase() !== 'assemble') return n + (early ? ' in compose' : ' in hold') + ': ' + o.A.phase();
      if (W.defaultNav.length) return n + ' navigated';
      scrollBy(o, 60); tick(50);
      if (o.A.phase() !== 'assemble') return n + ': a following scroll ended Act 3';
      toRest(o); if (o.A.schedule().finished !== 'rest' || o.A.advances() !== 1) return n + ': ' + o.A.schedule().finished + ' / ' + o.A.advances();
    }
    return true;
  });
  attempt(P('O1(b) Skip is the only way to rest: it rests at once, from the hold and from Act 1 (Enter and click)'), () => {
    for (const how of ['click-hold', 'click-compose', 'enter']) {
      const o = boot(file, vo); if (how === 'click-compose') tick(200); else toHold(o);
      if (how === 'enter') { key(o, 'Tab', { shiftKey: true }); if (o.doc.activeElement !== skipEl(o)) return 'Shift+Tab did not reach Skip'; key(o, 'Enter'); }
      else press(o, skipEl(o));
      if (o.A.running()) return how + ': still ' + o.A.phase();
      if (o.A.advances() !== 0) return how + ': assembled';
      const r = atRest(o); if (r !== true) return how + ': ' + r;
    }
    return true;
  });
  attempt(P('O1(c) a completed act activation acts directly, exactly once, with no assembly; before the act shows a press only advances'), () => {
    const a0 = boot(file, vo); if (!actEl(a0)) return true;
    for (const when of ['hold', 'compose', 'kbd']) {
      const o = boot(file, vo), a = actEl(o), n = clicks(a);
      if (when === 'compose') tick(1300); else toHold(o);
      if (when === 'kbd') { key(o, 'Tab'); key(o, 'Enter'); } else press(o, a);
      if (o.A.running()) return when + ': still ' + o.A.phase();
      if (n.c !== 1) return when + ': the act received ' + n.c + ' clicks';
      if (o.A.advances()) return when + ': assembled first';
    }
    const o = boot(file, vo), a = actEl(o), n = clicks(a); tick(200); press(o, a);
    if (o.A.phase() !== 'assemble' || n.c) return 'an early press on the act: ' + o.A.phase() + ' / clicks ' + n.c;
    toRest(o); return true;
  });
  attempt(P('O1(d) Act 3 is never cancelled: scroll, keys, blank and double clicks leave it running; Escape is swallowed'), () => {
    const o = boot(file, vo); toHold(o); key(o, 'a'); tick(100);
    scrollBy(o, 200); key(o, 'b'); press(o, blank(o)); fire(blank(o), 'dblclick', {}); fire(blank(o), 'wheel', {}); fire(blank(o), 'touchstart', {});
    const esc = key(o, 'Escape');
    if (o.A.phase() !== 'assemble') return 'phase ' + o.A.phase();
    if (!esc.defaultPrevented) return 'Escape not swallowed';
    if (o.A.advances() !== 1) return 'advances ' + o.A.advances();
    toRest(o); if (W.navs.length) return 'navigated ' + W.navs;
    return o.A.schedule().finished === 'rest' || 'finished ' + o.A.schedule().finished;
  });
  attempt(P('O1(d) a click on a page control in Act 3 snaps to rest first, then the control acts once'), () => {
    const o = boot(file, vo); toHold(o); key(o, 'a'); tick(200);
    const c = pageCtrl(o); if (!c) return 'no page control';
    const n = clicks(c); press(o, c);
    if (o.A.running()) return 'still ' + o.A.phase();
    if (n.c !== 1) return 'control clicked ' + n.c;
    if (o.doc.querySelector('.arr-card,.arr-skip,.arr-rules,#arr-hint') || /arr-/.test(o.doc.documentElement.attrs.class || '')) return 'arrival left behind';
    return o.A.schedule().finished === 'cut' || 'finished ' + o.A.schedule().finished;
  });
  attempt(P('O1(d) exactly-once advance: repeated input in the hold and Act 3 advances once'), () => {
    const o = boot(file, vo); tick(300); key(o, 'a'); key(o, 'b'); press(o, blank(o)); scrollBy(o, 40); fire(blank(o), 'wheel', {});
    if (o.A.advances() !== 1) return 'advances ' + o.A.advances();
    toRest(o); return o.A.advances() === 1 || 'advances after rest ' + o.A.advances();
  });
  attempt(P('O1(e) focus in the card pauses the hold and cools the hairline over 200ms; leaving resumes the rest of the 10s'), () => {
    const o = boot(file, vo); toHold(o); tick(2000);
    key(o, 'Tab');
    const fr = W.log.filter((a) => a.el.matches('.arr-line') && a.kf[1] && a.kf[1].backgroundColor);
    if (!fr.length || fr[0].duration !== 200 || !/9a8f84/i.test(fr[0].kf[1].backgroundColor)) return 'no 200ms freeze to text-faint';
    tick(30000); if (o.A.phase() !== 'hold') return 'the hold ran on under focus: ' + o.A.phase();
    o.doc.activeElement.blur(); tick(1);
    tick(HOLD - 2000 - 60); if (o.A.phase() !== 'hold') return 'resumed short: ' + o.A.phase();
    tick(120); if (o.A.phase() !== 'assemble') return 'did not resume: ' + o.A.phase();
    toRest(o); return true;
  });
  attempt(P('O1(e) a hidden page pauses the hold; a page hidden at hold start starts paused; both sources must clear'), () => {
    const o = boot(file, vo); tick(600); o.doc.visibilityState = 'hidden';
    toHold(o); tick(30000); if (o.A.phase() !== 'hold') return 'hidden at hold start did not pause';
    key(o, 'Tab'); o.doc.visibilityState = 'visible'; fire(o.doc, 'visibilitychange'); tick(30000);
    if (o.A.phase() !== 'hold') return 'resumed with focus still in the card';
    o.doc.activeElement.blur(); tick(1); tick(HOLD + 20);
    if (o.A.phase() !== 'assemble') return 'did not resume when both cleared';
    toRest(o);
    const q = boot(file, vo); toHold(q); tick(3000); q.doc.visibilityState = 'hidden'; fire(q.doc, 'visibilitychange'); tick(30000);
    if (q.A.phase() !== 'hold') return 'hidden mid-hold did not pause';
    q.doc.visibilityState = 'visible'; fire(q.doc, 'visibilitychange'); tick(HOLD - 3000 + 20);
    return q.A.phase() === 'assemble' || 'did not resume from hidden';
  });
  attempt(P('T9 landing: a keyboard open lands focus on the doorway act (or the heading); a pointer open never moves focus'), () => {
    const o = boot(file, vo); toHold(o); key(o, 'a'); toRest(o);
    const want = o.A.card().act && /^(Review|Open|Read|See|Plan|Draft|Continue|Follow up|Inspect|Resolve)\b/.test(o.A.card().act) ? actEl(o) : o.part('head');
    if (o.doc.activeElement !== want) return 'keyboard landed on ' + o.doc.activeElement.tagName + '.' + o.doc.activeElement.className;
    const q = boot(file, vo); toHold(q); press(q, blank(q)); toRest(q);
    return q.doc.activeElement === q.doc.body || 'pointer moved focus to ' + q.doc.activeElement.tagName;
  });
}

/* ---------------- 3. cold load, reduced motion, the field, the guard and the resting page (O2, O5, T11) ---------------- */
const clickReplay = (o, m) => { const b = replayBtn(o, m); b.focus(); return fire(b, 'click', { detail: 1 }); }; // a click focuses its button first
const replayBtn = (o, m) => o.doc.querySelectorAll('[data-arr-replay]').find((b) => b.getAttribute('data-arr-replay') === m);
const ARR_NODES = '.arr-card,.arr-skip,.arr-rules,.arr-rules-fix,#arr-hint';
for (const file of PAGES) {
  const P = (n) => file + ': ' + n;
  attempt(P('O2 cold load: bare paper while the faces load; fonts at 1,400ms play; at 1,600ms the ordinary page shows'), () => {
    const o = boot(file, { fontAt: 1400 });
    if (o.A.phase() !== 'wait' || !/arr-pre/.test(o.doc.documentElement.attrs.class)) return 'no wait: ' + o.A.phase();
    tick(1390); if (o.A.phase() !== 'wait') return 'left the wait early: ' + o.A.phase();
    tick(20); if (o.A.phase() !== 'compose') return 'fonts at 1,400ms did not play: ' + o.A.phase();
    toRest(o);
    const q = boot(file, { fontAt: 1600 }); tick(1510);
    if (q.A.phase() !== null || /arr-pre/.test(q.doc.documentElement.attrs.class || '')) return 'fonts at 1,600ms: ' + q.A.phase();
    tick(200); if (q.A.phase() !== null) return 'late fonts started it';
    return atRest(q);
  });
  attempt(P('O2 input during the wait cancels for good: the resting page, no later start'), () => {
    for (const f of [(o) => key(o, 'a'), (o) => press(o, o.doc.body), (o) => fire(o.doc.body, 'wheel', {}), (o) => fire(o.doc.body, 'touchstart', {})]) {
      const o = boot(file, { fontAt: 1400 }); tick(300); f(o);
      if (o.A.phase() !== null || /arr-pre/.test(o.doc.documentElement.attrs.class || '')) return 'input did not cancel: ' + o.A.phase();
      tick(3000); if (o.A.phase() !== null) return 'started after cancel';
      if (W.defaultNav.length) return 'the cancelling press navigated';
    }
    return true;
  });
  attempt(P('O7 Replay, Replay reduced, Replay without scale and Replay cold each replay from rest'), () => {
    const o = boot(file); toHold(o); key(o, 'a'); toRest(o);
    clickReplay(o, ''); if (o.A.phase() !== 'compose') return 'Replay: ' + o.A.phase();
    const r0 = o.A.schedule(); if (r0.rm) return 'Replay kept reduced motion'; toRest(o, 60000);
    clickReplay(o, 'rm'); if (!o.A.schedule().rm) return 'Replay reduced was not reduced'; toRest(o, 60000);
    clickReplay(o, 'translate'); if (o.A.schedule().s !== 1) return 'Replay without scale scaled ' + o.A.schedule().s; toRest(o, 60000);
    clickReplay(o, ''); if (o.A.schedule().rm || (!o.A.schedule().phone && o.A.schedule().s === 1 && r0.s !== 1)) return 'one-shot replay modes persisted'; toRest(o, 60000);
    clickReplay(o, 'cold'); if (o.A.phase() !== 'wait') return 'Replay cold: ' + o.A.phase();
    tick(720); if (o.A.phase() !== 'compose') return 'Replay cold did not play after its wait: ' + o.A.phase();
    toRest(o, 60000); return atRest(o);
  });
  attempt(P('T11 reduced motion: no card lines, opacity-only, onsets within 400ms, Skip stays'), () => {
    const o = boot(file, { osRM: true }), n0 = W.log.length;
    const shown = o.doc.querySelector('.arr-card').children.filter((c) => !c.hidden && !c.matches('.arr-cue'));
    if (shown.length) return 'card lines shown: ' + shown.map((c) => c.className);
    if (!skipEl(o)) return 'no Skip';
    toHold(o); if (!skipEl(o)) return 'Skip gone in the hold';
    key(o, 'a'); toRest(o);
    // motion is a keyframed geometry that changes, or any transform other than none (a static "none" pins the part in place)
    const moved = W.log.slice(n0).filter((a) => Object.keys(a.kf[0]).some((p) => !/^(opacity|visibility|offset|easing|color|backgroundColor|border\w*Color)$/.test(p) && (a.kf.some((k) => k[p] !== a.kf[0][p]) || (/transform|translate|scale/.test(p) && a.kf[0][p] !== 'none'))));
    if (moved.length) return 'moving keyframes: ' + moved.map((a) => a.el.className + ' ' + Object.keys(a.kf[0])).slice(0, 3);
    const late = o.A.schedule().units.filter((u) => u.t > 400 || u.kids.some((t) => t > 400));
    return !late.length || 'onsets past 400ms: ' + late.map((u) => u.t);
  });
  for (const [vn, vo] of Object.entries(VPS)) {
    const Q = (n) => file + ' @' + vn + ': ' + n;
    const o = boot(file, vo), reads0 = W.reads, sy0 = W.scrolls.filter((s) => s.at > 1000).length;
    toHold(o); tick(HOLD + 20); toRest(o);
    const sc = o.A.schedule(), U = sc.units, C_ = o.A.C, readsRun = W.reads - reads0;
    attempt(Q('O5 the ladder and the arc: 56/44/34 on desktop (1 on phone), d = clamp(880, 700 + 1.25·dist, 1100)'), () => {
      const ok = vn === 'phone' ? sc.s === 1 : [56 / 34, 44 / 34, 1].some((k) => Math.abs(sc.s - k) < 0.01);
      if (!ok) return 's ' + sc.s;
      for (const c of sc.carriers) {
        if (!(c.d >= 880 && c.d <= 1100)) return 'd ' + c.d;
      }
      const h = sc.carriers[0], mid = (r) => [(r.left + r.right) / 2, (r.top + r.bottom) / 2], dist = Math.hypot(mid(h.r0)[0] - mid(h.r1)[0], mid(h.r0)[1] - mid(h.r1)[1]); // the sentence travels centre to centre
      return Math.abs(h.d - Math.min(1100, Math.max(880, 700 + 1.25 * dist))) < 1 || 'headline d ' + h.d + ' for dist ' + Math.round(dist);
    });
    attempt(Q('O5 the field: onsets follow the nearest-point distance; last onset ≤2,000ms; rest ≤3,200ms'), () => {
      if (U.length < 3) return 'only ' + U.length + ' units';
      const byD = U.slice().sort((a, b) => a.d - b.d);
      for (let i = 1; i < byD.length; i++) if (byD[i].base < byD[i - 1].base) return 'base out of distance order at ' + i;
      for (const u of U) {
        if (Math.abs(u.base - Math.round(520 + 1480 * Math.pow(u.d / Math.max(...U.map((x) => x.d), 1), 1.25))) > 1) return 'base ' + u.base + ' for d ' + u.d;
        if (u.t < u.base) return 'onset before its base';
        if (Math.max(u.t, ...u.kids) > 2000) return 'onset ' + Math.max(u.t, ...u.kids);
      }
      if (!(sc.fieldEnd <= sc.rest && sc.rest <= 3200)) return 'fieldEnd ' + sc.fieldEnd + ' rest ' + sc.rest;
      return sc.finished === 'rest' || sc.finished;
    });
    attempt(Q('O5 the corridor: no part begins while a carrier\'s remaining path crosses it (24 samples, 4px), recomputed here'), () => {
      for (const u of U) for (const c of sc.carriers) for (let i = 0; i <= 24; i++) {
        const ts = c.t + c.d * i / 24; if (ts < u.t || (i === 24 && ts <= u.t)) continue; // landing is the end of the path
        const k = Math.min(1, Math.max(0, (ts - c.t) / c.d)), px_ = bez(C_.IO, k), py = bez(C_.YL, k);
        const p = { left: c.r0.left + (c.r1.left - c.r0.left) * px_, right: c.r0.right + (c.r1.right - c.r0.right) * px_, top: c.r0.top + (c.r1.top - c.r0.top) * py, bottom: c.r0.bottom + (c.r1.bottom - c.r0.bottom) * py };
        if (overlap(p, u.r, 4) && u.t < 2000) return (u.el.className || u.el.tagName) + ' begins at ' + u.t + ' under a carrier at ' + Math.round(ts);
      }
      return true;
    });
    attempt(Q('O5 the concurrency cap: at most ' + (vn === 'phone' ? 8 : 12) + ' parts in motion at any onset'), () => {
      if (sc.cap !== (vn === 'phone' ? 8 : 12)) return 'cap ' + sc.cap;
      for (const u of U) { const n = U.filter((x) => x.t <= u.t && x.t + x.dur > u.t).length; if (n > sc.cap && u.t < 2000) return n + ' at ' + u.t; }
      return true;
    });
    attempt(Q('O5 seen() in both axes: every part is inside the view and every clipping ancestor'), () => {
      const [vw, vh] = VPS[vn].vp;
      for (const u of U) {
        const r = u.r; if (!(r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh)) return 'outside the view: ' + u.el.className;
        const sp = u.el.closest('.spine'); if (sp && vn === 'phone' && r.left >= vw) return 'a spine item past the phone edge';
      }
      if (vn === 'phone' && o.inputs.kind !== 'desk') {
        const past = o.doc.querySelectorAll('.spine a,.spine .jump').filter((e) => rect(e).left >= vw);
        if (!past.length) return 'fixture has no spine item past the edge (vacuous)';
        if (U.some((u) => past.some((e) => e === u.el || e.contains(u.el)))) return 'a clipped spine item was assembled';
      }
      return true;
    });
    attempt(Q('O5 no layout reads from the start through rest, and no scroll writes after the start'), () => {
      if (readsRun) return readsRun + ' layout reads after the start';
      const late = W.scrolls.filter((s) => s.at > 1000).length - sy0;
      return !late || late + ' scroll writes after the start';
    });
    attempt(Q('resting page: nothing left behind, and the DOM matches ?arrive=0'), () => {
      const r = atRest(o); if (r !== true) return r;
      const a = ser(o.doc), q = boot(file, { ...vo, search: '?arrive=0' });
      if (q.A.phase() !== null) return 'arrive=0 played';
      const b = ser(q.doc); if (a === b) return true;
      const x = a.split('\n'), y = b.split('\n'); const i = x.findIndex((l, j) => l !== y[j]);
      return 'differs at line ' + i + ': ' + x[i] + ' vs ' + y[i];
    });
    attempt(Q('guard ladder: a slow compose trips to the hold; the first Act 3 trip thins to fades; the second snaps to rest'), () => {
      const g = boot(file, { ...vo, gaps: [16, 16, 130] }); tick(400);
      if (g.A.phase() !== 'hold') return 'compose trip: ' + g.A.phase();
      key(g, 'a'); W.gaps = [16, 120]; tick(200);
      if (g.A.phase() !== 'assemble') return 'first Act 3 trip ended it: ' + g.A.phase();
      if (!W.log.some((a) => a.duration === 160 && 'opacity' in a.kf[0])) return 'not thinned to 160ms fades';
      W.gaps = [16, 120]; tick(300);
      if (g.A.running()) return 'second trip did not rest';
      return atRest(g);
    });
  }
  attempt(P('busy: a live selection, or an open record, never plays'), () => {
    const o = boot(file, { sel: false }); if (o.A.phase() !== null) return 'played over a selection: ' + o.A.phase();
    const src = SRC[file].replace(/(<[^>]*\bdata-record\b[^>]*?)\s+hidden(?=[\s>])/, '$1');
    if (src === SRC[file]) return true; // this page has no record markup
    const q = boot(file, { src }); return q.A.phase() === null || 'played over an open record: ' + q.A.phase();
  });
}

/* ---------------- 4. retained SQ-323 / SQ-326 guards ---------------- */
for (const file of PAGES) {
  const P = (n) => file + ': ' + n;
  attempt(P('a still pointer never addresses a line while the arrival runs (pointermove is held at the root)'), () => {
    const o = boot(file); toHold(o); key(o, 'a'); tick(100);
    const ev = fire(o.doc.body, 'pointermove', { pointerType: 'mouse' }); if (!ev.stop) return 'pointermove reached the page during Act 3';
    toRest(o); return !fire(o.doc.body, 'pointermove', { pointerType: 'mouse' }).stop || 'pointermove still held at rest';
  });
  attempt(P('a press that leaves the act before release opens the page instead of acting'), () => {
    const o = boot(file), a = actEl(o); if (!a) return true;
    const n = clicks(a); toHold(o); const r = rect(a);
    fire(a, 'pointerdown', { pointerId: 3, pointerType: 'mouse', clientX: r.left + 2, clientY: r.top + 2 });
    fire(o.doc.body, 'pointerup', { pointerId: 3, pointerType: 'mouse', clientX: r.right + 200, clientY: r.bottom + 200 });
    fire(o.doc.body, 'click', { detail: 1 }); tick(1);
    if (n.c) return 'the act acted'; if (o.A.phase() !== 'assemble') return 'phase ' + o.A.phase();
    toRest(o); return true;
  });
  attempt(P('a width change rests; a height-only change (the phone toolbar) changes nothing'), () => {
    const o = boot(file, VPS.phone); tick(300); o.ctx.innerHeight = 780; fireWin('resize'); if (o.A.phase() !== 'compose') return 'height change: ' + o.A.phase();
    o.doc.documentElement.cw = 844; o.ctx.innerWidth = 844; fireWin('resize'); if (o.A.running()) return 'width change kept running';
    return atRest(o);
  });
  attempt(P('pagehide, beforeprint, a selection and the reduced-motion control each rest at once'), () => {
    const cases = [['pagehide', () => fireWin('pagehide')], ['beforeprint', () => fireWin('beforeprint')],
      ['selection', (o) => { W.sel = false; fire(o.doc, 'selectionchange'); }], ['mc-rm', (o) => { const c = o.$('#mc-rm'); if (!c) return 'none'; fire(c, 'change'); }]];
    for (const [n, f] of cases) {
      const o = boot(file); tick(400); if (f(o) === 'none') continue;
      if (o.A.running()) return n + ' kept it running';
      const r = atRest(o); if (r !== true) return n + ': ' + r;
    }
    return true;
  });
  attempt(P('a restored page (pageshow persisted) never replays or strands the arrival'), () => {
    const o = boot(file); tick(400); fireWin('pageshow', { persisted: true });
    return (!o.A.running() && atRest(o) === true) || 'still ' + o.A.phase();
  });
}

/* ---------------- F7: the oracle fails loudly ---------------- */
if (process.env.CINE_ORACLE_FORCE_FAIL) check('forced failing assertion (F7 self-test)', false);
else {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { env: { ...process.env, CINE_ORACLE_FORCE_FAIL: '1' }, encoding: 'utf8', maxBuffer: 64 << 20 });
  check('F7: a failed assertion exits non-zero (forced-failure child run)', child.status === 1 && /FAILED/.test(child.stdout), 'exit ' + child.status);
}

/* ---------------- report ---------------- */
const total = pass + fails.length;
for (const x of fails) console.log('FAIL ' + x);
console.log(`${fails.length ? 'FAILED' : 'PASS'} ${pass}/${total} checks · ${PAGES.map((f) => 'cinematic/' + f).join(' + ')}`);
if (fails.length) process.exitCode = 1;
console.log('Not run: rendered browser (real font metrics, safe areas, device frame timing), screen reader. Source and in-memory runs only; the Playwright pass covers the rendered frames.');
