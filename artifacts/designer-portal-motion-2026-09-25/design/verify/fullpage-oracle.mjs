// Full-page Plain Lines oracle (SQ-317). Node built-ins only; no browser, no jsdom.
// Follows oracle.mjs: each page's real inline scripts run in node:vm, here over a small DOM parsed from the
// page's own markup (tags, attributes, selectors, focus, bubbling events, WAAPI calls recorded on a fake clock).
// Usage: node artifacts/designer-portal-motion-2026-09-25/design/verify/fullpage-oracle.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const DESIGN = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FP = path.join(DESIGN, 'fullpage');
const SRC = { 'index.html': fs.readFileSync(path.join(FP, 'index.html'), 'utf8'), 'document.html': fs.readFileSync(path.join(FP, 'document.html'), 'utf8') };
const M04 = fs.readFileSync(path.join(DESIGN, 'mockups', '04-direction2-desk.html'), 'utf8');
const concepts = fs.readFileSync(path.join(DESIGN, 'concepts.md'), 'utf8');
const E = 'cubic-bezier(.22,1,.36,1)', Q = 'cubic-bezier(.42,0,.58,1)', O = 'cubic-bezier(0,0,.58,1)';

let pass = 0;
const fails = [];
function check(name, ok, detail = '') { if (ok) pass++; else fails.push(name + (detail ? ' :: ' + detail : '')); }
function attempt(name, fn) {
  try { const r = fn(); check(name, r === true, r === true ? '' : String(r)); }
  catch (e) { check(name, false, 'threw ' + e.name + ': ' + e.message); }
}

/* ---------------- a small DOM ---------------- */
let W; // the current world: document, fake clock, timers, animations, navigations
const ent = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
class Text { constructor(d, p) { this.data = d; this.parentNode = p; this.nodeType = 3; } }
class El {
  constructor(tag, attrs) { this.tagName = tag.toUpperCase(); this.attrs = attrs || {}; this.children = []; this.parentNode = null; this.style = { setProperty(k, v) { this[k] = v; } }; this.L = {}; this._anims = []; this.inert = false; this.value = ''; this.rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; }
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
  addEventListener(t, f) { (this.L[t] = this.L[t] || []).push(f); }
  removeEventListener() {}
  getAnimations() { return this._anims.slice(); }
  animate(kf, opt) {
    const el = this;
    const a = { el, kf, duration: opt.duration, easing: opt.easing, start: W.clock, playState: 'running', onfinish: null,
      cancel() { drop(); a.playState = 'idle'; }, finish() { if (a.playState !== 'running') return; drop(); a.playState = 'finished'; if (a.onfinish) a.onfinish(); }, pause() {}, play() {} };
    const drop = () => { el._anims = el._anims.filter((x) => x !== a); W.running = W.running.filter((x) => x !== a); };
    el._anims.push(a); W.running.push(a); W.log.push(a);
    W.timeouts.push({ at: W.clock + opt.duration, fn: () => a.finish(), id: -(++W.tid), anim: true });
    return a;
  }
  focus() { focusTo(this); }
  blur() {}
  scrollIntoView() { W.scrolled.push(this); }
  getBoundingClientRect() { return this.rect; }
  getClientRects() { return rendered(this) ? [this.rect] : []; }
  get offsetParent() { return rendered(this) ? this.parentNode : null; }
  get offsetHeight() { return 0; }
}
class Doc extends El {
  constructor() { super('#document'); this.activeElement = null; this.body = null; this.documentElement = null; this.scripts = []; }
  get nodeType() { return 9; }
  getAnimations() { return W.running.slice(); }
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

/* events, focus and time */
const BUBBLES = new Set(['click', 'keydown', 'focusin', 'focusout', 'input', 'pointermove', 'pointerdown']);
function fire(target, type, init = {}) {
  const ev = { type, target, pointerType: 'mouse', relatedTarget: null, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stop = true; }, ...init };
  const chain = [];
  if (BUBBLES.has(type)) { for (let e = target; e; e = e.parentNode) chain.push(e); chain.push(W.win); } else chain.push(target);
  for (const n of chain) { for (const f of (n.L[type] || []).slice()) f.call(n, ev); if (ev.stop) break; }
  if (type === 'click' && !ev.defaultPrevented) { const a = target.closest('a[href]'); if (a) W.defaultNav.push(a.getAttribute('href')); }
  return ev;
}
function focusTo(el) {
  const d = W.doc, prev = d.activeElement;
  if (prev === el) return;
  const was = prev && prev !== d.body ? prev : null;
  if (was) { d.activeElement = d.body; fire(was, 'focusout', { relatedTarget: el }); }
  d.activeElement = el; fire(el, 'focusin', { relatedTarget: was });
}
function advance(ms) { const end = W.clock + ms; for (;;) { const due = W.timeouts.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0]; if (!due) break; W.clock = due.at; W.timeouts = W.timeouts.filter((t) => t !== due); due.fn(); } W.clock = end; }
class Matrix { constructor(s) { this.m41 = 0; this.m42 = 0; this.a = 1; const m = s && /translate\(([-\d.e]+)px,\s*([-\d.e]+)px\)\s*scale\(([-\d.e]+)\)/.exec(s); if (m) { this.m41 = +m[1]; this.m42 = +m[2]; this.a = +m[3]; } } }

function boot(file, { search = '', hash = '', osRM = false, session = {} } = {}) {
  const doc = parseHTML(SRC[file]);
  W = { doc, clock: 1000, tid: 0, timeouts: [], running: [], log: [], navs: [], defaultNav: [], scrolled: [], intervals: 0, rafs: 0, kbd: false, session: new Map(Object.entries(session)), win: { L: {} } };
  doc.activeElement = doc.body;
  const loc = { search, hash, h: file, get href() { return this.h; }, set href(v) { W.navs.push(String(v)); this.h = String(v); } };
  const ctx = {
    document: doc, location: loc, innerHeight: 800, scrollY: 0, scrollTo() {},
    matchMedia: (q) => ({ matches: osRM && /reduce/.test(q), addEventListener() {} }),
    performance: { now: () => W.clock },
    getSelection: () => ({ isCollapsed: true }),
    getComputedStyle: (el) => ({ transform: el.style.transform || 'none', opacity: el.style.opacity === undefined || el.style.opacity === '' ? '1' : el.style.opacity, backgroundColor: 'rgb(139, 115, 85)' }),
    DOMMatrixReadOnly: Matrix,
    setTimeout(fn, d) { const id = ++W.tid; W.timeouts.push({ fn, at: W.clock + (d || 0), id }); return id; },
    clearTimeout(id) { W.timeouts = W.timeouts.filter((t) => t.id !== id); },
    setInterval() { W.intervals++; return 0; }, clearInterval() {},
    requestAnimationFrame() { W.rafs++; return 0; }, cancelAnimationFrame() {},
    sessionStorage: { getItem: (k) => (W.session.has(k) ? W.session.get(k) : null), setItem: (k, v) => W.session.set(k, String(v)), removeItem: (k) => W.session.delete(k) },
    addEventListener(t, f) { (W.win.L[t] = W.win.L[t] || []).push(f); },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const s of doc.scripts) vm.runInContext(s, ctx);
  const $ = (s) => doc.querySelector(s), $$ = (s) => doc.querySelectorAll(s);
  return { K: ctx.K, doc, $, $$ };
}
/* her acts */
const click = (el, extra) => fire(el, 'click', extra);
const key = (el, k) => fire(el, 'keydown', { key: k });
function activate(el, k) { const ev = key(el, k); if (!ev.defaultPrevented) click(el, { detail: 0 }); } // the browser's Space/Enter activation of a button
function tabTo(el) { W.kbd = true; focusTo(el); }
function hover(seam) { const r = seam.closest('[data-region]'); W.kbd = false; fire(r, 'pointerenter'); fire(seam, 'pointermove'); }
function leaveTo(region, to) { fire(region.querySelector('[data-seam]'), 'pointerleave', { relatedTarget: to }); fire(region, 'pointerleave', { relatedTarget: to }); const g = region.closest('[data-group]'); if (g && !g.contains(to)) fire(g, 'pointerleave', { relatedTarget: to }); }
const animsOn = (el, since = 0) => W.log.filter((a) => a.el === el && a.start >= since);
const moved = (a) => JSON.stringify(a.kf.map((k) => k.transform || null));
const labelOf = (b) => b.querySelector('.w').textContent;

/* ---------------- 1. static checks on both pages ---------------- */
const parts = (s) => {
  const css = s.slice(s.indexOf('<style>') + 7, s.indexOf('</style>'));
  const j = s.indexOf('<script>\n(function(){');
  const iife = s.slice(j + 9, s.indexOf('})();', j) + 5);
  const text = s.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<script>[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  const block = (x, a, b) => x.slice(x.indexOf(a), x.indexOf(b) + b.length);
  return { css, iife, text, sharedCss: block(css, '/* shared:start', '/* shared:end */'), sharedJs: block(iife, '/* shared:start', '/* shared:end */') };
};
const T_LINE = 'var T={R:160,X:120,M:180,P:270,Pfade:200,D:200,S:240,B:180,press:150,dwell:100};';
const rootLines = M04.slice(M04.indexOf(':root{') + 6, M04.indexOf('}', M04.indexOf(':root{'))).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('--mc-clear'));
for (const f of Object.keys(SRC)) {
  const s = SRC[f], p = parts(s);
  check(f + ' opens with doctype, charset and viewport', /^<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1/.test(s));
  const title = (/<title>([^<]*)<\/title>/.exec(s) || [])[1] || '';
  check(f + ' title is a 2-4 word name', title.split(/\s+/).length >= 2 && title.split(/\s+/).length <= 4 && !title.includes(':'), title);
  const hosts = [...s.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
  check(f + ' hosts are Google Fonts only; no <script src', hosts.every((h) => h === 'fonts.googleapis.com' || h === 'fonts.gstatic.com') && !/<script[^>]*\bsrc=/i.test(s), hosts.join(','));
  check(f + ' reuses 04 tokens verbatim (fonts, paper, ink, easings)', rootLines.every((l) => p.css.includes(l)), rootLines.filter((l) => !p.css.includes(l)).join(' | '));
  check(f + ' exactly one --font-display definition', (p.css.match(/--font-display:/g) || []).length === 1);
  check(f + ' headline class is 34px Playfair (.t-d1)', p.css.includes('.t-d1{font-family:var(--font-display);font-size:34px;'));
  check(f + ' timing constants identical to mockup 04', p.iife.includes(T_LINE) && M04.includes(T_LINE));
  check(f + ' E/Q/O easings', [E, Q, O].every((x) => s.includes(x)));
  check(f + ' prefers-reduced-motion query and ?rm=1', s.includes('@media (prefers-reduced-motion') && s.includes('rm=1'));
  check(f + ' body has an explicit background', /body\{[^}]*background:var\(--/.test(p.css));
  check(f + ' single committed light theme', p.css.includes('color-scheme:light') && !/prefers-color-scheme/.test(s));
  check(f + ' ambient ban: no interval, frame loop, infinite, autoplay or smooth scroll', !/setInterval|requestAnimationFrame|infinite|Infinity|animation-iteration|autoplay|scroll-behavior\s*:\s*smooth|behavior:\s*'smooth'/.test(s));
  check(f + ' no caption; review strip hidden unless ?controls=1', !/class="cap[ "]/.test(s) && s.includes('<aside class="mc" aria-label="Review controls" hidden>') && s.includes('controls=1'));
  check(f + ' copy has no "!", AI or lorem', !/!/.test(p.text) && !/\bAI\b/.test(p.text) && !/lorem/i.test(p.text));
  const wide = [...p.css.replace(/@media[^{]*/g, '').matchAll(/(?<![-\w])(?:min-)?width:\s*(\d+)px/g)].filter((m) => +m[1] > 358);
  check(f + ' no CSS width/min-width over 358px (390 phone)', wide.length === 0, wide.map((m) => m[0]).join(','));
  check(f + ' 16px phone gutter declared', /padding:[^;]*16px/.test(p.css));
  for (const [i, src] of [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).entries()) attempt(f + ' inline script ' + i + ' parses', () => { new vm.Script(src); return true; });
}
{
  const a = parts(SRC['index.html']), b = parts(SRC['document.html']);
  check('both pages share byte-identical shared CSS and shared JS', a.sharedCss.length > 1000 && a.sharedCss === b.sharedCss && a.sharedJs.length > 1000 && a.sharedJs === b.sharedJs);
  const idx = concepts.slice(concepts.indexOf('## §5 Mockup index'), concepts.indexOf('## §6'));
  check('concepts.md §5 indexes both full-page files', idx.includes('fullpage/index.html') && idx.includes('fullpage/document.html'));
}

/* ---------------- 2. the Desk ---------------- */
const DESK = 'index.html';
attempt('Desk: every inventory population is present', () => {
  const { $, $$ } = boot(DESK);
  const greet = $('#greet');
  if (!/^Good morning, Leah\.$/.test(greet.textContent) || !greet.querySelector('em') || !greet.classList.contains('t-d2')) return 'greeting';
  if (!$('.date').classList.contains('t-head')) return 'date line not the uppercase meta';
  const head = $$('.head-acts .act').map(labelOf).join('|');
  if (head !== 'Capture a lead|Open a project|Find anything' || !$('.head-acts kbd')) return 'header row: ' + head;
  if ($$('.mnote').length !== 1) return 'margin notes: ' + $$('.mnote').length;
  if ($$('.roster-head [data-facet][aria-pressed]').map(labelOf).join('|') !== 'Only what needs me|By person') return 'facets';
  if (!$('.roster-head [data-show-all="#claims"]')) return 'Show all not in the roster head';
  if (!/past due/.test($('.overdue').textContent) || $('.dayline').textContent !== 'Finish approval today.') return 'overdue sentence or day line';
  if ($$('.strip .board').length < 3) return 'boards strip';
  if ($$('.contents .t-head').map((e) => e.textContent).join('|') !== 'Rooms|Ledgers|Begin' || $$('.contents .door').length < 6) return 'Desk Contents';
  return true;
});
attempt('Desk: claim count 3, each one 34px truth, context, primary act, visible Detail over a reserved well', () => {
  const { $$ } = boot(DESK);
  const claims = $$('#claims > [data-region]');
  if (claims.length !== 3) return 'claims=' + claims.length;
  if (claims.map((c) => c.querySelector('h3').textContent).join('|') !== 'Ainsworth|Delgado|Reyes') return 'names';
  for (const c of claims) {
    if (c.querySelectorAll('[data-seam] .t-d1').length !== 1 || c.querySelectorAll('.t-d1').length !== 1) return 'truth lines in ' + c.id;
    if (!c.querySelector('.ctx') || c.querySelectorAll('[data-primary]').length !== 1 || !c.querySelector('[data-primary]').classList.contains('act-primary')) return 'context or primary act';
    const d = c.querySelectorAll('[data-detail]'), w = c.querySelectorAll('.well');
    if (d.length !== 1 || w.length !== 1 || labelOf(d[0]) !== 'Detail' || d[0].tagName !== 'BUTTON' || d[0].getAttribute('aria-controls') !== w[0].id) return 'Detail control';
  }
  return true;
});
attempt('Desk: ledger rows >= 5 by stage, and the By person / Only what needs me facets switch at 0ms', () => {
  const { $, $$ } = boot(DESK);
  const n = $$('#ledger-stage .lrow').length; if (n < 5) return 'rows=' + n;
  click($('[data-facet="person"]'));
  if (!$('#ledger-stage').hidden || $('#ledger-person').hidden || $$('#ledger-person .lrow').length !== n) return 'By person';
  click($('[data-facet="need"]'));
  if (!$('#ledger').hidden || $('[data-facet="need"]').getAttribute('aria-pressed') !== 'true') return 'Only what needs me';
  return W.log.filter((a) => !a.el.classList.contains('rule')).length === 0 ? true : 'facets animated';
});
attempt('Desk: Ainsworth name and primary act navigate to document.html and carry the paper', () => {
  const { $ } = boot(DESK);
  const name = $('#n-ains a'), act = $('#claims [data-seam="w-ains"] [data-primary]');
  if (name.getAttribute('href') !== 'document.html') return 'name href=' + name.getAttribute('href');
  if (labelOf(act) !== 'Review finish' || !/^document\.html(#rec)?$/.test(act.getAttribute('href'))) return 'Review finish href=' + act.getAttribute('href');
  if (!/^document\.html/.test($('#w-ains [data-carry]').getAttribute('href'))) return 'Open finish record doorway';
  click(name);
  return W.defaultNav[0] === 'document.html' && W.session.get('pl-carry') === '1' ? true : 'nav=' + W.defaultNav + ' carry=' + W.session.get('pl-carry');
});
attempt('Desk: margin note puts away at 0ms', () => {
  const { $ } = boot(DESK);
  click($('[data-put-away]'));
  return $('#mnote').hidden && W.doc.activeElement === $('#roster-h') && W.log.length === 0 ? true : 'not put away cleanly';
});

/* ---------------- 3. the grammar, run on both pages ---------------- */
function grammar(file, A, B) {
  const tag = file === DESK ? 'Desk' : 'Document';
  attempt(tag + ': sparse rest; nothing moved, no timer, frame loop or interval on load', () => {
    const { K, $$ } = boot(file);
    const wells = $$('.well');
    if (!wells.length || Object.keys(K.wells).length !== wells.length) return 'wells not wired';
    const bad = wells.filter((w) => w.classList.contains('open') || w.getAttribute('aria-hidden') !== 'true' || !w.querySelector('.well-body').inert);
    if (bad.length) return 'not at rest: ' + bad.map((w) => w.id).join(',');
    if ($$('[data-detail]').some((d) => d.getAttribute('aria-expanded') !== 'false' || labelOf(d) !== 'Detail')) return 'Detail controls not at rest';
    if ($$('[data-seam]').some((s) => s.querySelectorAll('.t-d1').length !== 1) && tag === 'Desk') return 'seam without one headline';
    return W.log.length === 0 && W.timeouts.length === 0 && W.intervals === 0 && W.rafs === 0 ? true : `anims=${W.log.length} timers=${W.timeouts.length}`;
  });
  attempt(tag + ': hover reveal after the 100ms dwell rises y+4->0 at 160ms E, headline untouched', () => {
    const { K, $ } = boot(file);
    const seam = $(`[data-seam="${A}"]`), well = $('#' + A), body = well.querySelector('.well-body');
    hover(seam); advance(99);
    if (K.wells[A].isOpen) return 'opened before the dwell';
    advance(1);
    const a = animsOn(body)[0], back = animsOn(well.querySelector('.well-back'))[0];
    if (!K.wells[A].isOpen || !well.classList.contains('open') || well.hasAttribute('aria-hidden')) return 'not open';
    if (!a || a.duration !== 160 || a.easing !== E || moved(a) !== '["translate(0px,4px) scale(1)","translate(0px,0px) scale(1)"]') return 'body move ' + (a && [a.duration, a.easing, moved(a)]);
    if (!back || back.duration !== 160 || back.easing !== E) return 'paper backing';
    return W.log.every((x) => !x.el.closest('[data-seam]')) ? true : 'something in the headline seam moved';
  });
  attempt(tag + ': keyboard focus reveals at once (no dwell), same 160ms E', () => {
    const { K, $ } = boot(file);
    tabTo($(`[data-detail="${A}"]`));
    const a = animsOn($('#' + A + ' .well-body'))[0];
    return K.wells[A].isOpen && a && a.duration === 160 && a.easing === E ? true : 'focus did not address';
  });
  attempt(tag + ': addressing another line: old recedes 120ms Q while new rises 160ms E, same instant, no queue', () => {
    const { K, $ } = boot(file);
    const sa = $(`[data-seam="${A}"]`), sb = $(`[data-seam="${B}"]`);
    hover(sa); advance(100);
    leaveTo(sa.closest('[data-region]'), sb);
    if (!K.wells[A].isOpen) return 'moving along the list receded early (would queue)';
    fire(sb.closest('[data-region]'), 'pointerenter'); fire(sb, 'pointermove'); advance(100);
    const x = animsOn($('#' + A + ' .well-body')).pop(), r = animsOn($('#' + B + ' .well-body')).pop();
    if (!x || x.duration !== 120 || x.easing !== Q || moved(x) !== '["translate(0px,0px) scale(1)","translate(0px,4px) scale(1)"]') return 'recede ' + (x && [x.duration, x.easing]);
    if (!r || r.duration !== 160 || r.easing !== E) return 'rise';
    if (x.start !== r.start) return 'not concurrent: ' + x.start + ' vs ' + r.start;
    return !K.wells[A].isOpen && K.wells[B].isOpen ? true : 'states';
  });
  attempt(tag + ': keyboard arrow to the next Detail recedes and rises concurrently', () => {
    const { K, $ } = boot(file);
    const da = $(`[data-detail="${A}"]`), db = $(`[data-detail="${B}"]`);
    tabTo(da); key(da, 'ArrowDown');
    if (W.doc.activeElement !== db) return 'arrow did not move to the next Detail';
    const x = animsOn($('#' + A + ' .well-body')).pop(), r = animsOn($('#' + B + ' .well-body')).pop();
    return x && r && x.duration === 120 && r.duration === 160 && x.start === r.start && !K.wells[A].isOpen && K.wells[B].isOpen ? true : 'not concurrent';
  });
  attempt(tag + ': recede on leave only when unheld (hover out, focus out); never on a timer', () => {
    const { K, $ } = boot(file);
    const sa = $(`[data-seam="${A}"]`), ra = sa.closest('[data-region]'), out = $('[data-show-all]');
    hover(sa); advance(100); advance(60000);
    if (!K.wells[A].isOpen) return 'receded on a timer';
    leaveTo(ra, out);
    const x = animsOn($('#' + A + ' .well-body')).pop();
    if (K.wells[A].isOpen || !x || x.duration !== 120 || x.easing !== Q) return 'hover leave did not recede';
    tabTo($(`[data-detail="${A}"]`)); if (!K.wells[A].isOpen) return 'focus did not reopen';
    tabTo(out);
    return !K.wells[A].isOpen ? true : 'focus leave did not recede';
  });
  attempt(tag + ': click on Detail holds, reads Close detail, survives leave; click again recedes', () => {
    const { K, $ } = boot(file);
    const d = $(`[data-detail="${A}"]`), ra = d.closest('[data-region]'), out = $('[data-show-all]');
    click(d);
    if (!K.wells[A].isOpen || !K.wells[A].pinned || labelOf(d) !== 'Close detail' || d.getAttribute('aria-expanded') !== 'true') return 'click did not hold: ' + labelOf(d);
    leaveTo(ra, out); focusTo(out);
    if (!K.wells[A].isOpen) return 'a held block receded on leave';
    click(d);
    return !K.wells[A].isOpen && labelOf(d) === 'Detail' && d.getAttribute('aria-expanded') === 'false' ? true : 'second click did not release';
  });
  attempt(tag + ': Space on Detail holds (browser activation), keydown alone does not toggle twice', () => {
    const { K, $ } = boot(file);
    const d = $(`[data-detail="${B}"]`);
    tabTo(d); if (!K.wells[B].isOpen || K.wells[B].pinned) return 'focus address state';
    key(d, ' '); if (K.wells[B].pinned) return 'keydown toggled on its own';
    click(d, { detail: 0 });
    if (!K.wells[B].pinned || labelOf(d) !== 'Close detail') return 'Space did not hold';
    activate(d, 'Enter');
    return !K.wells[B].isOpen && labelOf(d) === 'Detail' ? true : 'Enter did not release';
  });
  attempt(tag + ': Show all detail is a 0ms latch, all blocks together; off returns to sparse rest', () => {
    const { K, $, $$ } = boot(file);
    const btn = $('[data-show-all]'), g = $(btn.getAttribute('data-show-all')), wells = $$('.well').filter((w) => g.contains(w));
    click(btn);
    if (btn.getAttribute('aria-pressed') !== 'true' || !wells.every((w) => K.wells[w.id].isOpen && w.classList.contains('open'))) return 'not all open';
    if (W.log.some((a) => a.el.closest('.well'))) return 'latch animated';
    const sa = $(`[data-seam="${A}"]`); hover(sa); advance(100); leaveTo(sa.closest('[data-region]'), btn);
    if (!K.wells[A].isOpen) return 'leave receded a latched block';
    const n = W.log.length; click(btn);
    if (btn.getAttribute('aria-pressed') !== 'false' || wells.some((w) => K.wells[w.id].isOpen || !w.querySelector('.well-body').inert)) return 'not back to sparse rest';
    return W.log.slice(n).every((a) => !a.el.closest('.well')) ? true : 'latch off animated';
  });
  attempt(tag + ': reduced motion (?rm=1 and the OS setting): same sparse/dense choice, detail instant', () => {
    for (const opt of [{ search: '?rm=1' }, { osRM: true }]) {
      const { K, $ } = boot(file, opt);
      if (!W.doc.documentElement.classList.contains('rm')) return 'html.rm missing for ' + JSON.stringify(opt);
      const sa = $(`[data-seam="${A}"]`), sb = $(`[data-seam="${B}"]`);
      hover(sa); advance(100);
      if (!K.wells[A].isOpen) return 'no reveal under RM';
      leaveTo(sa.closest('[data-region]'), sb); fire(sb, 'pointermove'); advance(100);
      if (K.wells[A].isOpen || !K.wells[B].isOpen) return 'address under RM';
      click($('[data-show-all]'));
      if (!Object.values(K.wells).every((w) => w.isOpen)) return 'Show all under RM';
      if (W.log.some((a) => a.el.closest('.well'))) return 'detail travelled under RM';
    }
    return true;
  });
  attempt(tag + ': headlines never move; only wells, paper, sheets and score rules animate', () => {
    const { $, $$ } = boot(file);
    click($('[data-show-all]')); click($('[data-show-all]'));
    hover($(`[data-seam="${A}"]`)); advance(100); tabTo($(`[data-detail="${B}"]`)); click($(`[data-detail="${B}"]`));
    fire($('[data-press]'), 'pointerdown');
    const heads = $$('.t-d1');
    return W.log.length > 0 && W.log.every((a) => !heads.some((h) => a.el === h || a.el.contains(h)) || a.el.id === 'paper') ? true : 'a headline moved';
  });
  attempt(tag + ': every Detail and act is a real, tabbable button or link', () => {
    const { $$ } = boot(file);
    const acts = $$('.act, [data-detail]');
    const bad = acts.filter((e) => !(e.tagName === 'BUTTON' || (e.tagName === 'A' && e.hasAttribute('href'))) || e.getAttribute('tabindex') === '-1');
    return acts.length > 10 && !bad.length ? true : bad.length + ' not real controls';
  });
}
grammar(DESK, 'w-ains', 'w-delg');

attempt('Desk: Esc closes an open detail first; nothing else to put down', () => {
  const { K, $ } = boot(DESK);
  click($('[data-detail="w-ains"]'));
  const ev = key($('[data-detail="w-ains"]'), 'Escape');
  if (K.wells['w-ains'].isOpen || !ev.defaultPrevented) return 'detail not closed by Esc';
  key(W.doc.body, 'Escape');
  return W.navs.length === 0 ? true : 'Desk navigated on Esc';
});

/* ---------------- 4. the held Document ---------------- */
const DOC = 'document.html';
const ORDER = ['Brief', 'Discovery', 'Direction', 'Agreement', 'Procurement', 'Schedule', 'Install', 'Care'];
attempt('Document: spine has 8 section jumps in stage order, a Strata Mark each, one active mark (Procurement)', () => {
  const { $$ } = boot(DOC);
  const jumps = $$('.spine [data-jump]');
  if (jumps.length !== 8) return 'jumps=' + jumps.length;
  if (jumps.map((j) => j.querySelector('span').textContent).join('|') !== ORDER.join('|')) return 'order';
  if (!jumps.every((j) => j.querySelector('svg.sm'))) return 'Strata Mark missing';
  const cur = jumps.filter((j) => j.hasAttribute('aria-current'));
  if (cur.length !== 1 || !cur[0].textContent.startsWith('Procurement') || !cur[0].querySelector('svg.sm.active')) return 'active mark';
  const settled = jumps.filter((j) => j.querySelector('svg.sm.settled')).length;
  return settled === 4 ? true : 'settled marks=' + settled;
});
attempt('Document: every stage section in order, each one 34px truth, context, primary act and Detail over a well', () => {
  const { $, $$ } = boot(DOC);
  const secs = $$('#t-group > .tsec[data-region]');
  if (secs.length !== 8) return 'sections=' + secs.length;
  if (secs.map((s) => s.querySelector('.sec-head span').textContent).join('|') !== ORDER.join('|')) return 'order';
  const hrefs = $$('.spine [data-jump]').map((j) => j.getAttribute('href').slice(1));
  if (secs.map((s) => s.id).join() !== hrefs.join()) return 'spine targets';
  for (const s of secs) {
    if (s.querySelectorAll('.t-d1').length !== 1 || !s.querySelector('[data-seam] .t-d1') || !/\.$/.test(s.querySelector('.t-d1').textContent)) return 'truth in ' + s.id;
    if (!s.querySelector('.ctx') || s.querySelectorAll('[data-primary]').length !== 1 || s.querySelectorAll('[data-detail]').length !== 1 || s.querySelectorAll('.well').length !== 1) return 'parts in ' + s.id;
  }
  if ($('#s-direction .t-d1').textContent !== 'Finish approval needed.' || $('#s-procurement .t-d1').textContent !== 'Delivery not booked.') return 'truths';
  return $$('.tsec.settled-sec').map((s) => s.id).join() === 's-brief,s-discovery,s-agreement' ? true : 'settled sections';
});
attempt('Document: standing head (34px title, household line, vitals, fill mark, Send a note, View as)', () => {
  const { $, $$ } = boot(DOC);
  const h = $('.sh h1');
  if (h.textContent !== 'Ainsworth Residence' || !h.classList.contains('t-d1')) return 'title';
  if (!$('.sh-house').classList.contains('t-d3') || !$('.sh-house a').textContent.includes('Edna Ainsworth')) return 'household line';
  if (!/Madison/.test($('.sh-vitals').textContent) || $$('.fill i').length !== 8 || $$('.fill i.s').length !== 4 || !$('.fill[role=img][aria-label]')) return 'vitals or fill mark';
  const acts = $$('.sh-acts .act').map(labelOf).join('|');
  return /^Send a note\|View as[^|]*\|Show all detail$/.test(acts) ? true : acts;
});
attempt('Document: margin rail has 2-3 items at >=1440px and folds into an inline Margin Detail below', () => {
  const { $, $$ } = boot(DOC);
  const n = $$('.rail .note-row').length, m = $$('#w-margin .note-row').length;
  if (n < 2 || n > 3 || m !== n) return `rail=${n} inline=${m}`;
  if (!$('.mi.margin-inline [data-detail="w-margin"]')) return 'inline Margin Detail';
  const css = parts(SRC[DOC]).css;
  return /\.margin-inline\{display:none\}/.test(css) && /@media \(max-width:1439px\)\{[^@]*\.rail\{display:none\}[^@]*\.margin-inline\{display:block\}/.test(css) && /@media \(max-width:760px\)\{[^@]*\.spine\{position:sticky;top:0;/.test(css) ? true : 'breakpoints';
});
attempt('Document: spine jump moves focus to the section head, instantly, without addressing it', () => {
  const { K, $ } = boot(DOC);
  const j = $('[data-jump][href="#s-install"]');
  W.kbd = true; const ev = click(j);
  return ev.defaultPrevented && W.scrolled[0] === $('#s-install') && W.doc.activeElement === $('#h-install') && !K.wells['w-install'].isOpen && W.log.length === 0 ? true : 'jump';
});
grammar(DOC, 'w-direction', 'w-agreement');
attempt('Document: Esc order is open detail, then Sheet, then the Desk (200ms Q put-down)', () => {
  const { K, $ } = boot(DOC);
  const d = $('[data-detail="w-direction"]'), send = $('[data-sheet-open="note"]');
  click(d); click(send);
  if (K.sheet.openId() !== 'note' || W.doc.activeElement !== $('#note-in') || send.getAttribute('aria-expanded') !== 'true') return 'sheet did not open';
  key(W.doc.activeElement, 'Escape');
  if (K.wells['w-direction'].isOpen) return 'Esc 1 left the detail open';
  if (K.sheet.openId() !== 'note') return 'Esc 1 closed the Sheet before the detail';
  key(W.doc.activeElement, 'Escape'); advance(180);
  if (K.sheet.openId() || !$('#note').hidden || W.doc.activeElement !== send) return 'Esc 2 did not return the Sheet and focus';
  if (W.navs.length) return 'navigated early';
  key(W.doc.activeElement, 'Escape');
  const p = animsOn($('#paper')).pop();
  if (!p || p.duration !== 200 || p.easing !== Q || W.navs.length) return 'put-down move ' + (p && [p.duration, p.easing]);
  advance(200);
  return W.navs.join() === 'index.html' ? true : 'navs=' + W.navs.join();
});
attempt('Document: Esc put-down under reduced motion is instant', () => {
  const { $ } = boot(DOC, { search: '?rm=1' });
  key($('#doc-title'), 'Escape');
  return W.navs.join() === 'index.html' && animsOn($('#paper')).length === 0 ? true : 'navs=' + W.navs.join();
});
attempt('Document: leave-word in the spine head returns to index.html', () => {
  const { $ } = boot(DOC);
  const l = $('.spine [data-leave]');
  if (l.getAttribute('href') !== 'index.html' || !/Desk/.test(l.textContent)) return 'leave-word';
  click(l); advance(200);
  return W.navs.join() === 'index.html' ? true : 'navs=' + W.navs.join();
});
attempt('Document: an unsaved finish note stops the put-down; saved, the paper goes down', () => {
  const { $ } = boot(DOC);
  click($('#s-direction [data-primary]'));
  const ta = $('#rec-note');
  if ($('#rec').hidden || W.doc.activeElement !== ta) return 'Review finish did not open the record';
  ta.value = 'Clear oil, two coats.'; fire(ta, 'input');
  key(ta, 'Escape'); if (W.navs.length) return 'the field did not consume Esc';
  focusTo(W.doc.body); key(W.doc.body, 'Escape'); advance(400);
  if (W.navs.length || !/Not saved yet/.test($('#rec [role=status]').textContent)) return 'unsaved note was put down';
  click($('#rec [data-save]')); focusTo(W.doc.body); key(W.doc.body, 'Escape'); advance(200);
  return W.navs.join() === 'index.html' ? true : 'saved note still blocked';
});
attempt('Document: arrival moves only because she picked it up (270ms O; RM 200ms fade); #rec opens the record at 0ms', () => {
  let r = boot(DOC, { session: { 'pl-carry': '1' } });
  let a = animsOn(r.$('#paper'))[0];
  if (!a || a.duration !== 270 || a.easing !== O || !a.kf[0].transform || W.session.has('pl-carry')) return 'pick-up ' + (a && [a.duration, a.easing]);
  advance(270); if (r.$('#paper').style.transform) return 'paper kept a transform after the pick-up';
  r = boot(DOC, { session: { 'pl-carry': '1' }, osRM: true });
  a = animsOn(r.$('#paper'))[0];
  if (!a || a.duration !== 200 || a.kf[0].transform) return 'RM pick-up is not the 200ms opacity fade';
  r = boot(DOC, { hash: '#rec' });
  return !r.$('#rec').hidden && W.doc.activeElement === r.$('#rec-note') && W.log.length === 0 ? true : 'hash arrival';
});

/* ---------------- report ---------------- */
const total = pass + fails.length;
for (const x of fails) console.log('FAIL ' + x);
console.log(`${fails.length ? 'FAILED' : 'PASS'} ${pass}/${total} checks · fullpage/index.html + fullpage/document.html`);
console.log('Not run: rendered browser at 1440/1280/390, screen reader, native find and print (source and in-memory runs only).');
process.exit(fails.length ? 1 : 0);
