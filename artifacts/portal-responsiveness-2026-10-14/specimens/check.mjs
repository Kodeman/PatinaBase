#!/usr/bin/env node
/**
 * check.mjs - the specimen gate for US-33 (SPEC.md §2, §3, §5, §8 and §9).
 *
 *   node artifacts/portal-responsiveness-2026-10-14/specimens/check.mjs
 *
 * Deterministic, no dependencies, no network. It checks that:
 *   - every file on disk is exactly what build.mjs writes (no drift between SPEC.md and the HTML);
 *   - every frame id in SPEC.md §2 exists once, in the file named, and no file holds an unlisted frame;
 *   - each frame's data-departures equals §2, uses only §3 tokens, and matches the marker classes in its markup;
 *   - every interactive element and drawn target carries .t44, and .t44 is at least 44px both ways;
 *   - animation or transition implies a prefers-reduced-motion rule that removes both, and animating
 *     scripts check prefers-reduced-motion;
 *   - every §5 text pair clears 4.5:1 in light and dark in every file, and every CSS color is a §5 text token;
 *   - the sentinel, no fetch outside Google Fonts, no gendered pronoun, no "AI".
 *
 * Exit 0 when everything passes, 1 otherwise (each failure is named).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const SENTINEL = '<!-- SPECIMEN COMPLETE -->';
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const MIN_RATIO = 4.5;
const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);
let passes = 0;

/* ── 1. drift ─────────────────────────────────────────────────────────────────── */
const expected = build();
for (const [name, text] of Object.entries(expected)) {
  const p = join(DIR, name);
  if (!existsSync(p)) fail(name, 'missing; run node build.mjs');
  else if (readFileSync(p, 'utf8') !== text) fail(name, 'differs from what build.mjs writes; run node build.mjs');
  else passes += 1;
}

/* ── 2. SPEC.md tables ────────────────────────────────────────────────────────── */
const spec = readFileSync(join(DIR, 'SPEC.md'), 'utf8').split('\n');
const vocab = new Map(); // token -> marker class
const frames = []; // {id, file, deps}
const pairs = []; // [fg, bg]
for (const l of spec) {
  let m;
  if ((m = /^\|\s*`(frame-[a-z0-9-]+)`\s*\|\s*`([a-z0-9-]+\.html)`\s*\|[^|]*\|\s*([a-z -]+?)\s*\|\s*$/.exec(l))) {
    frames.push({ id: m[1], file: m[2], deps: m[3] === 'none' ? [] : m[3].split(/\s+/) });
  } else if ((m = /^\|\s*`([a-z-]+)`\s*\|\s*`\.([a-z0-9-]+)`\s*\|\s*(PQ\d+)\s*\|/.exec(l))) {
    vocab.set(m[1], m[2]);
  } else if ((m = /^\|\s*`--([a-z-]+)`\s*\|\s*`--([a-z-]+)`\s*\|\s*$/.exec(l))) {
    pairs.push([m[1], m[2]]);
  }
}
if (!frames.length) fail('SPEC.md §2', 'no frame rows found');
if (!vocab.size) fail('SPEC.md §3', 'no departure rows found');
if (!pairs.length) fail('SPEC.md §5', 'no contrast pairs found');
const textTokens = new Set(pairs.map(([fg]) => fg));

/* ── helpers ──────────────────────────────────────────────────────────────────── */
const classesIn = (html) => {
  const set = new Set();
  for (const m of html.matchAll(/\bclass="([^"]*)"/g)) for (const c of m[1].split(/\s+/)) if (c) set.add(c);
  return set;
};
const cssOf = (src) => [...src.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const scriptsOf = (src) => [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
function tokenBlock(css, selector) {
  const i = css.indexOf(selector + '{');
  if (i < 0) return null;
  const body = css.slice(i + selector.length + 1, css.indexOf('}', i));
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
function lum(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const isHex = (v) => /^#[0-9a-f]{6}$/i.test(v || '');
function externalRefs(src) {
  const bad = [];
  const patterns = [
    /\b(?:src|href|poster|action)\s*=\s*["']?\s*((?:https?:)?\/\/[^"'\s>]+)/gi,
    /url\(\s*["']?\s*((?:https?:)?\/\/[^"')\s]+)/gi,
    /@import\s+(?:url\(\s*)?["']?\s*((?:https?:)?\/\/[^"')\s;]+)/gi,
    /\bfetch\(\s*["'`]\s*((?:https?:)?\/\/[^"'`\s]+)/gi,
  ];
  for (const re of patterns) for (const m of src.matchAll(re)) {
    const host = /^(?:https?:)?\/\/([^/:?#]+)/i.exec(m[1])?.[1]?.toLowerCase();
    if (!host || !FONT_HOSTS.has(host)) bad.push(m[1].slice(0, 100));
  }
  return [...new Set(bad)];
}
const visibleText = (src) => src.replace(/<script>[\s\S]*?<\/script>/g, ' ').replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');

/* ── 3. per file ──────────────────────────────────────────────────────────────── */
const htmlFiles = readdirSync(DIR).filter((f) => f.endsWith('.html')).sort();
const seen = new Map(); // frame id -> count
for (const file of htmlFiles) {
  const src = readFileSync(join(DIR, file), 'utf8');
  const css = cssOf(src);
  const js = scriptsOf(src);
  const before = failures.length;

  // sentinel + external fetches
  const last = src.trimEnd().split('\n').at(-1).trim();
  if (last !== SENTINEL) fail(file, `last non-empty line is ${JSON.stringify(last.slice(0, 60))}, not the sentinel`);
  const ext = externalRefs(src);
  if (ext.length) fail(file, `fetch outside Google Fonts: ${ext.join(', ')}`);

  // copy rules
  const text = visibleText(src);
  const pron = text.match(/\b(she|her|hers|herself|he|him|his|himself)\b/gi);
  if (pron) fail(file, `gendered pronoun in copy: ${[...new Set(pron.map((p) => p.toLowerCase()))].join(', ')}`);
  if (/\bAI\b/.test(text)) fail(file, '"AI" appears in copy');

  // 44px targets: .t44 declares both minimums ≥ 44px
  const t44 = /\.t44\{([^}]*)\}/.exec(css);
  const px = (prop) => Number(new RegExp(`${prop}:\\s*(\\d+)px`).exec(t44?.[1] || '')?.[1] || 0);
  if (!t44 || px('min-height') < 44 || px('min-width') < 44) fail(file, '.t44 must declare min-height and min-width of at least 44px');
  const body = src.replace(/<head>[\s\S]*?<\/head>/, '').replace(/<script>[\s\S]*?<\/script>/g, '');
  const small = [];
  for (const m of body.matchAll(/<([a-z0-9]+)\b([^>]*)>/gi)) {
    const [tag, attrs] = [m[1].toLowerCase(), m[2]];
    const cls = (/\bclass="([^"]*)"/.exec(attrs)?.[1] || '').split(/\s+/);
    const interactive = ['button', 'a', 'input', 'select', 'summary', 'textarea'].includes(tag) || /\btabindex="0"/.test(attrs);
    const drawn = cls.some((c) => c === 'act' || c === 'lnk' || c === 'tgt');
    if (!interactive && !drawn) continue;
    if (cls.includes('t44')) continue;
    if (!interactive && /\bdata-today\b/.test(attrs)) continue;
    small.push(`<${tag} class="${cls.join(' ')}">`);
  }
  if (small.length) fail(file, `${small.length} target(s) without .t44, e.g. ${[...new Set(small)].slice(0, 3).join(' ')}`);

  // reduced motion
  const animates = /@keyframes|\banimation\s*:|\btransition\s*:/.test(css);
  if (animates) {
    const rm = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\})\s*\}/.exec(css);
    if (!rm) fail(file, 'animates but has no @media (prefers-reduced-motion: reduce) rule');
    else if (!/animation:\s*none/.test(rm[1]) || !/transition:\s*none/.test(rm[1])) fail(file, 'the reduced-motion rule must set animation and transition to none');
  }
  if (/requestAnimationFrame|setTimeout/.test(js) && !/prefers-reduced-motion/.test(js)) fail(file, 'a script animates without checking prefers-reduced-motion');

  // contrast + text tokens
  const themes = { light: tokenBlock(css, ':root,[data-theme="light"]'), dark: tokenBlock(css, '[data-theme="dark"]') };
  if (!/@media \(prefers-color-scheme: dark\)/.test(css)) fail(file, 'no prefers-color-scheme dark block');
  for (const [theme, toks] of Object.entries(themes)) {
    if (!toks) { fail(file, `no ${theme} token block`); continue; }
    for (const [fg, bg] of pairs) {
      if (!isHex(toks[fg]) || !isHex(toks[bg])) { fail(file, `${theme}: --${fg} on --${bg} is not a pair of hex tokens`); continue; }
      const r = ratio(toks[fg], toks[bg]);
      if (r < MIN_RATIO) fail(file, `${theme}: --${fg} ${toks[fg]} on --${bg} ${toks[bg]} is ${r.toFixed(2)}:1, under ${MIN_RATIO}:1`);
    }
  }
  for (const m of css.matchAll(/(?:^|[;{\s])color\s*:\s*([^;}]+)/g)) {
    const v = m[1].trim();
    const tok = /^var\(--([a-z0-9-]+)\)$/.exec(v)?.[1];
    if (['inherit', 'currentColor', 'transparent'].includes(v)) continue;
    if (!tok || !textTokens.has(tok)) fail(file, `CSS color "${v}" is not a §5 text token`);
  }

  // frames in this file
  for (const m of src.matchAll(/<!-- frame:(frame-[a-z0-9-]+) -->([\s\S]*?)<!-- \/frame:\1 -->/g)) {
    const [id, html] = [m[1], m[2]];
    seen.set(id, (seen.get(id) || 0) + 1);
    const row = frames.find((f) => f.id === id);
    if (!row) { fail(file, `${id} is not listed in SPEC.md §2`); continue; }
    if (row.file !== file) fail(file, `${id} is listed in SPEC.md §2 under ${row.file}`);
    const open = new RegExp(`<section class="frame" data-frame="${id}"[^>]*>`).exec(html)?.[0];
    if (!open) { fail(file, `${id}: no <section class="frame" data-frame="${id}">`); continue; }
    const depAttr = /data-departures="([^"]*)"/.exec(open)?.[1];
    if (depAttr === undefined || depAttr.trim() === '') { fail(file, `${id}: no data-departures`); continue; }
    const deps = depAttr === 'none' ? [] : depAttr.split(/\s+/);
    const unknown = deps.filter((d) => !vocab.has(d));
    if (unknown.length) fail(file, `${id}: departures not in SPEC.md §3: ${unknown.join(', ')}`);
    if ([...deps].sort().join(' ') !== [...row.deps].sort().join(' ')) fail(file, `${id}: data-departures "${depAttr}" ≠ SPEC.md §2 "${row.deps.join(' ') || 'none'}"`);
    const cls = classesIn(html);
    for (const [tokn, marker] of vocab) {
      const has = cls.has(marker);
      const listed = deps.includes(tokn);
      if (has && !listed) fail(file, `${id}: uses .${marker} but does not list "${tokn}"`);
      if (listed && !has) fail(file, `${id}: lists "${tokn}" but its markup has no .${marker}`);
    }
  }
  if (failures.length === before) { passes += 1; console.log(`PASS ${file}`); }
}

for (const f of frames) {
  const n = seen.get(f.id) || 0;
  if (n !== 1) fail(f.file, `${f.id} appears ${n} times (SPEC.md §2 expects exactly 1)`);
}

if (failures.length) {
  console.error(`FAIL ${failures.length} problem(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`PASS ${frames.length} frames in ${htmlFiles.length} files · ${vocab.size} departure tokens · ${pairs.length} contrast pairs × 2 themes`);
process.exit(0);
