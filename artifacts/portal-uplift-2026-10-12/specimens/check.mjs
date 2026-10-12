#!/usr/bin/env node
/**
 * check.mjs - the specimen gate for US-27 (SPEC.md §1, §2.1, §5 and §6).
 * Adapted from tools/check.us26.mjs.
 *
 * Reads the area table in SPEC.md §1, the frame register in §2.1, and shared.css.
 *
 * --spec-only validates SPEC.md and shared.css alone: nine area rows in slug order,
 * every frame id well formed, listed once and registered at its width, today images
 * present in ../walk/, pairings inside their area, a dark frame for desk, document
 * and money, and shared.css itself free of shadow and truncation. No specimen is opened.
 *
 * Otherwise, for each area (all nine, or the slugs named) and each width (1440, 390):
 *   - specimens/<slug>-<w>.html exists (MISSING otherwise);
 *   - its last non-empty line is exactly <!-- SPECIMEN COMPLETE -->;
 *   - it carries data-frame="<id>" for every frame SPEC.md lists at that width,
 *     and each dark frame's element carries the theme-dark class;
 *   - each today frame's screenshot is referenced as ../walk/<file>;
 *   - no src/href/srcset/poster/action, CSS url(), @import or fetch() reaches an
 *     http(s) or protocol-relative URL outside fonts.googleapis.com / fonts.gstatic.com;
 *   - no box-shadow and no drop-shadow( anywhere;
 *   - no text-overflow: ellipsis, no line-clamp, no `truncate` class or selector;
 *   - no standalone "AI" (case-sensitive, word-bounded) and no "A.I.";
 *   - exactly one <style data-shared="uplift"> whose text is shared.css, verbatim;
 *   - 390 files only, US-26's static overflow check: no width / min-width / flex-basis
 *     over 390px, no grid-template-columns whose px tracks and gaps sum over 390px, no
 *     width="…" attribute over 390, no white-space:nowrap on a p/li/h1-h6/blockquote rule.
 *     Rules inside @media / @container with a min-width over 390px are skipped;
 *   - no data:image base64 payload is over 20 KB (20,480 characters).
 *
 * --self-test builds an in-memory specimen per slug and width from SPEC.md and
 * shared.css, checks that it passes, then injects each violation and checks that
 * the gate names it. No specimen file is read or written.
 *
 *   node specimens/check.mjs                 # all 18 files
 *   node specimens/check.mjs desk chrome     # only these areas
 *   node specimens/check.mjs --spec-only     # SPEC.md and shared.css only
 *   node specimens/check.mjs --self-test     # the gate's own detectors
 *
 * Exit 0 when everything passes, 1 otherwise (each failure is named), 2 on a bad argument.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const WALK = join(DIR, '..', 'walk');
const SENTINEL = '<!-- SPECIMEN COMPLETE -->';
const SLUGS = ['desk', 'document', 'rooms', 'people', 'library', 'boards', 'papers', 'money', 'chrome'];
const DARK_REQUIRED = ['desk', 'document', 'money'];
const WIDTHS = ['1440', '390'];
const NARROW = 390;
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const MAX_BASE64 = 20 * 1024;
const FONT_LINK = '<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">';

// ---- arguments ----
const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const named = args.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase());
const badFlag = flags.find((f) => f !== '--spec-only' && f !== '--self-test');
const badSlug = named.find((s) => !SLUGS.includes(s));
if (badFlag || badSlug || flags.length > 1 || (flags.length && named.length)) {
  console.error(`usage: node check.mjs [${SLUGS.join('|')} ...] | --spec-only | --self-test`);
  if (badFlag) console.error(`unknown flag: ${badFlag}`);
  if (badSlug) console.error(`unknown area slug: ${badSlug}`);
  process.exit(2);
}
const mode = flags[0] ?? 'full';

// ---- detectors (pure: source text in, problem strings out) ----

/** External URLs in loading contexts whose host is not a Google Fonts host. */
function externalRefs(src) {
  const bad = [];
  const patterns = [
    /\b(?:src|href|poster|action)\s*=\s*["']?\s*((?:https?:)?\/\/[^"'\s>]+)/gi,
    /\bsrcset\s*=\s*["']([^"']+)["']/gi,
    /url\(\s*["']?\s*((?:https?:)?\/\/[^"')\s]+)/gi,
    /@import\s+(?:url\(\s*)?["']?\s*((?:https?:)?\/\/[^"')\s;]+)/gi,
    /\bfetch\(\s*["'`]\s*((?:https?:)?\/\/[^"'`\s]+)/gi,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) {
      const urls = re.source.startsWith('\\bsrcset')
        ? m[1].split(',').map((s) => s.trim().split(/\s+/)[0]).filter((u) => /^(?:https?:)?\/\//i.test(u))
        : [m[1]];
      for (const u of urls) {
        const host = /^(?:https?:)?\/\/([^/:?#]+)/i.exec(u)?.[1]?.toLowerCase();
        if (!host || !FONT_HOSTS.has(host)) bad.push(u.slice(0, 100));
      }
    }
  }
  return [...new Set(bad)];
}

/** data:image base64 payloads over the limit, as their lengths. */
function oversizeImages(src) {
  const sizes = [];
  for (const m of src.matchAll(/data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)/gi)) {
    const len = m[1].replace(/\s+/g, '').length;
    if (len > MAX_BASE64) sizes.push(len);
  }
  return sizes;
}

/** Any shadow: box-shadow in any form, or a drop-shadow() filter. */
function shadows(src) {
  const hits = [];
  for (const m of src.matchAll(/box-shadow\s*:[^;}"']*|drop-shadow\s*\([^)]*\)?/gi)) hits.push(m[0].trim().slice(0, 60));
  return [...new Set(hits)];
}

/** Truncation: text-overflow: ellipsis, any line-clamp, or a `truncate` class or selector. */
function truncation(src) {
  const hits = [];
  for (const m of src.matchAll(/text-overflow\s*:\s*ellipsis/gi)) hits.push(m[0]);
  for (const m of src.matchAll(/(?:-webkit-)?line-clamp\s*:[^;}"']*/gi)) hits.push(m[0].trim().slice(0, 40));
  for (const m of src.matchAll(/\bclass\s*=\s*["']([^"']*)["']/gi)) {
    if (m[1].split(/\s+/).includes('truncate')) hits.push(`class="${m[1].slice(0, 40)}"`);
  }
  for (const m of src.matchAll(/\.truncate(?![\w-])/g)) hits.push('.truncate selector');
  return [...new Set(hits)];
}

/** The word "AI" (case-sensitive, word-bounded) or "A.I.", with its line number.
 *  data: URIs are blanked first, so a base64 run such as "/AI+" is not copy. */
function saysAI(src) {
  const hits = [];
  src.split('\n').forEach((raw, i) => {
    const line = raw.replace(/data:[^"')\s]+/gi, 'data:');
    const m = /(?<![A-Za-z0-9_-])AI(?![A-Za-z0-9_-])|\bA\.I\./.exec(line);
    if (m) hits.push(`line ${i + 1}: ${JSON.stringify(line.trim().slice(Math.max(0, m.index - 20), m.index + 24))}`);
  });
  return hits;
}

/** CSS text: every <style> body plus every inline style="" value, comments removed. */
function cssOf(src) {
  const blocks = [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const inline = [...src.matchAll(/\bstyle\s*=\s*"([^"]*)"|\bstyle\s*=\s*'([^']*)'/gi)].map((m) => `x{${m[1] ?? m[2]}}`);
  return [...blocks, ...inline].join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Drop every @media / @container block whose condition needs min-width over 390px:
 *  at a 390px viewport (or any container inside it) those rules cannot apply. */
function withoutWideQueries(css) {
  let out = '';
  let i = 0;
  const re = /@(?:media|container)\b[^{]*\{/g;
  for (let m = re.exec(css); m; m = re.exec(css)) {
    const min = /min-width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(m[0]);
    if (!min || Number(min[1]) <= NARROW) continue;
    let depth = 1;
    let j = m.index + m[0].length;
    while (j < css.length && depth) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') depth -= 1;
      j += 1;
    }
    out += css.slice(i, m.index);
    i = j;
    re.lastIndex = j;
  }
  return out + css.slice(i);
}

/** Static overflow risks in a 390 file. A floor, not proof: the render check decides. */
function overflow390(src) {
  const bad = [];
  const css = withoutWideQueries(cssOf(src));
  for (const m of css.matchAll(/(?:^|[;{\s])((?:min-)?width|flex-basis)\s*:\s*(\d+(?:\.\d+)?)px/gi)) {
    if (Number(m[2]) > NARROW) bad.push(`${m[1]}: ${m[2]}px`);
  }
  for (const m of css.matchAll(/grid-template-columns\s*:\s*([^;}]+)/gi)) {
    const value = m[1];
    const tracks = [...value.replace(/minmax\([^)]*\)|repeat\([^)]*\)/gi, '').matchAll(/(\d+(?:\.\d+)?)px/g)]
      .reduce((sum, t) => sum + Number(t[1]), 0);
    const rule = css.slice(Math.max(0, css.lastIndexOf('{', m.index)), css.indexOf('}', m.index));
    const gap = /(?:^|[;{\s])(?:column-)?gap\s*:\s*(?:\d+(?:\.\d+)?px\s+)?(\d+(?:\.\d+)?)px/i.exec(rule);
    const count = value.replace(/\([^)]*\)/g, '()').trim().split(/\s+/).length;
    const total = tracks + (gap ? Number(gap[1]) * Math.max(0, count - 1) : 0);
    if (total > NARROW) bad.push(`grid-template-columns: ${value.trim().slice(0, 60)} (≈${total}px)`);
  }
  for (const m of src.matchAll(/<(?:img|svg|canvas|iframe|video|table|td|th)\b[^>]*\bwidth\s*=\s*["']?(\d+)/gi)) {
    if (Number(m[1]) > NARROW) bad.push(`width="${m[1]}" attribute`);
  }
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (!/white-space\s*:\s*nowrap/i.test(m[2])) continue;
    const prose = m[1].split(',').some((sel) => /(?:^|[\s>+~])(?:p|li|h[1-6]|blockquote)(?=$|[\s.#:[>+~])/i.test(sel.trim()));
    if (prose) bad.push(`white-space: nowrap on prose (${m[1].trim().slice(0, 40)})`);
  }
  for (const m of src.matchAll(/<(p|li|h[1-6]|blockquote)\b[^>]*\bstyle\s*=\s*["'][^"']*white-space\s*:\s*nowrap/gi)) {
    bad.push(`white-space: nowrap on an inline-styled <${m[1]}>`);
  }
  return [...new Set(bad)];
}

/** The shared block: exactly one <style data-shared="uplift">, text identical to shared.css. */
function sharedBlock(src, sharedCss) {
  const blocks = [...src.matchAll(/<style\b[^>]*\bdata-shared\s*=\s*["']uplift["'][^>]*>([\s\S]*?)<\/style>/gi)];
  if (blocks.length !== 1) return [`expected exactly one <style data-shared="uplift">, found ${blocks.length}`];
  const norm = (s) => s.replace(/\r\n/g, '\n').replace(/^\n/, '').replace(/\n$/, '');
  const got = norm(blocks[0][1]);
  const want = norm(sharedCss);
  if (got === want) return [];
  const a = got.split('\n');
  const b = want.split('\n');
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n += 1;
  return [`shared block differs from shared.css at line ${n + 1}: ${JSON.stringify((a[n] ?? '<end>').slice(0, 60))} vs ${JSON.stringify((b[n] ?? '<end>').slice(0, 60))}`];
}

/** The opening tag of the element carrying data-frame="<id>". */
function frameTag(src, id) {
  const at = src.indexOf(`data-frame="${id}"`);
  if (at < 0) return null;
  return src.slice(src.lastIndexOf('<', at), src.indexOf('>', at) + 1);
}

/** Every problem with one specimen's source, as strings. */
function checkSource(src, { width, frames, sharedCss }) {
  const problems = [];
  const last = src.trimEnd().split('\n').at(-1).trim();
  if (last !== SENTINEL) problems.push(`last non-empty line is ${JSON.stringify(last.slice(0, 80))}, not ${SENTINEL}`);
  const missing = frames.filter((f) => !src.includes(`data-frame="${f.id}"`)).map((f) => f.id);
  if (missing.length) problems.push(`missing frame anchor(s): ${missing.join(', ')}`);
  const pale = frames.filter((f) => f.kind === 'd' && !missing.includes(f.id) && !/\bclass\s*=\s*["'][^"']*\btheme-dark\b/.test(frameTag(src, f.id) ?? '')).map((f) => f.id);
  if (pale.length) problems.push(`dark frame(s) without class theme-dark on the frame element: ${pale.join(', ')}`);
  const unref = [...new Set(frames.filter((f) => f.kind === 't').map((f) => f.pair))].filter((jpg) => !src.includes(`../walk/${jpg}`));
  if (unref.length) problems.push(`today image(s) not referenced as ../walk/<file>: ${unref.join(', ')}`);
  const ext = externalRefs(src);
  if (ext.length) problems.push(`external fetch outside Google Fonts: ${ext.join(', ')}`);
  const sh = shadows(src);
  if (sh.length) problems.push(`shadow(s): ${sh.join(' | ')}`);
  const tr = truncation(src);
  if (tr.length) problems.push(`truncation: ${tr.join(' | ')}`);
  const ai = saysAI(src);
  if (ai.length) problems.push(`says "AI": ${ai.slice(0, 5).join(' | ')}`);
  problems.push(...sharedBlock(src, sharedCss));
  if (width === String(NARROW)) {
    const ov = overflow390(src);
    if (ov.length) problems.push(`may overflow 390: ${ov.join(' | ')}`);
  }
  const big = oversizeImages(src);
  if (big.length) problems.push(`data:image base64 over 20 KB: ${big.map((n) => `${n} chars`).join(', ')}`);
  return problems;
}

// ---- SPEC.md and shared.css ----
let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`FAIL ${msg}`);
};

const specPath = join(DIR, 'SPEC.md');
const sharedPath = join(DIR, 'shared.css');
if (!existsSync(specPath)) {
  console.error('FAIL SPEC.md does not exist');
  process.exit(1);
}
const lines = readFileSync(specPath, 'utf8').split('\n');
const sharedCss = existsSync(sharedPath) ? readFileSync(sharedPath, 'utf8') : null;
if (sharedCss === null) fail('shared.css does not exist');
else {
  const own = [...shadows(sharedCss), ...truncation(sharedCss)];
  if (own.length) fail(`shared.css: ${own.join(' | ')}`);
}

// §1: | **desk** | 1. The Desk | `frame-desk-t1` … | `frame-desk-t2` … |
const rows = lines.filter((l) => /^\|\s*\*\*/.test(l));
const areas = rows.map((row) => {
  const cells = row.split('|').map((c) => c.trim());
  const slug = /^\*\*([a-z]+)\*\*$/.exec(cells[1])?.[1] ?? cells[1];
  const ids = (cell) => [...(cell ?? '').matchAll(/`(frame-[^`]+)`/g)].map((m) => m[1]);
  return { slug, lists: { 1440: ids(cells[3]), 390: ids(cells[4]) } };
});
if (areas.map((a) => a.slug).join(',') !== SLUGS.join(',')) {
  fail(`SPEC.md §1: expected the nine area rows ${SLUGS.join(', ')} in that order, found ${areas.map((a) => a.slug).join(', ') || 'none'}`);
}

// §2.1: | `frame-desk-t1` | 1440 | today | `a1-desk-fold-1440.jpg` | … |
const register = new Map();
for (const l of lines) {
  const m = /^\|\s*`(frame-[^`]+)`\s*\|\s*(\d+)\s*\|\s*(today|proposed|dark)\s*\|\s*`([^`]+)`\s*\|/.exec(l);
  if (!m) continue;
  const [, id, width, kindWord, pair] = m;
  if (register.has(id)) fail(`SPEC.md §2.1: ${id} is registered twice`);
  register.set(id, { id, width, kind: kindWord[0], pair });
}
if (!register.size) fail('SPEC.md §2.1: no frame register rows (| `frame-<slug>-<kind><n>` | width | kind | `pair` | … |) found');

const seen = new Set();
for (const { slug, lists } of areas) {
  const problems = [];
  let dark = 0;
  for (const w of WIDTHS) {
    if (!lists[w].length) problems.push(`lists no ${w} frames`);
    for (const id of lists[w]) {
      const m = /^frame-([a-z]+)-([tpd])(\d+)$/.exec(id);
      if (!m) { problems.push(`${id} is not frame-<slug>-<t|p|d><n>`); continue; }
      if (m[1] !== slug) problems.push(`${id} does not belong to ${slug}`);
      if (seen.has(id)) problems.push(`${id} is listed twice`);
      seen.add(id);
      if (m[2] === 'd') dark += 1;
      const r = register.get(id);
      if (!r) { problems.push(`§2.1 has no row for ${id}`); continue; }
      if (r.width !== w) problems.push(`${id} is listed at ${w} but registered at ${r.width}`);
      if (r.kind !== m[2]) problems.push(`${id} is registered as kind ${r.kind}`);
      if (r.kind === 't' && !existsSync(join(WALK, r.pair))) problems.push(`${id}: ../walk/${r.pair} does not exist`);
      if (r.kind === 'p' && !new RegExp(`^frame-${slug}-t\\d+$`).test(r.pair)) problems.push(`${id} pairs with ${r.pair}, not a today frame of ${slug}`);
      if (r.kind === 'd' && !new RegExp(`^frame-${slug}-p\\d+$`).test(r.pair)) problems.push(`${id} pairs with ${r.pair}, not a proposed frame of ${slug}`);
      if ((r.kind === 'p' || r.kind === 'd') && !register.has(r.pair)) problems.push(`${id} pairs with ${r.pair}, which is not registered`);
    }
  }
  if (DARK_REQUIRED.includes(slug) && !dark) problems.push('needs at least one dark frame');
  if (problems.length) fail(`SPEC.md §1 ${slug}: ${problems.join('; ')}`);
}
for (const id of register.keys()) if (!seen.has(id)) fail(`SPEC.md §2.1: ${id} is registered but listed in no §1 row`);

const framesOf = (slug, w) => (areas.find((a) => a.slug === slug)?.lists[w] ?? []).map((id) => register.get(id) ?? { id, kind: id.split('-').at(-1)[0], pair: '' });
const total = [...seen].length;

if (mode === '--spec-only') {
  if (failed) process.exit(1);
  console.log(`PASS SPEC.md (${areas.length} areas, ${total} frames, every today image present in ../walk/) and shared.css (${sharedCss.split('\n').length} lines, no shadow, no truncation)`);
  process.exit(0);
}
if (failed) {
  console.error('SPEC.md or shared.css failed; fix them before judging specimens (run --spec-only).');
  process.exit(1);
}

// ---- self-test ----
if (mode === '--self-test') {
  const build = (slug, w, frames) => [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    FONT_LINK,
    `<style data-shared="uplift">\n${sharedCss}</style>`,
    '<style>.canvas-local { display: grid; gap: 24px; }</style>',
    `</head><body><main>`,
    ...frames.map((f) => (f.kind === 't'
      ? `<section class="frame" data-frame="${f.id}"><figure class="today"><img src="../walk/${f.pair}" alt="today"></figure></section>`
      : `<section class="frame${f.kind === 'd' ? ' theme-dark' : ''}" data-frame="${f.id}"><div class="canvas"><p>Holloway Den, ${slug} at ${w}</p></div></section>`)),
    '</main></body></html>',
    SENTINEL,
    '',
  ].join('\n');
  const inject = (src, text) => src.replace('</main>', `${text}\n</main>`);
  const cases = [
    ['external fetch', (s) => inject(s, '<img src="https://example.com/x.png" alt="x">'), 'external fetch'],
    ['font host allowed', (s) => inject(s, '<link href="https://fonts.gstatic.com/x.woff2" rel="preload">'), null],
    ['box-shadow', (s) => inject(s, '<div style="box-shadow: 0 1px 2px #000"></div>'), 'shadow'],
    ['drop-shadow', (s) => inject(s, '<div style="filter: drop-shadow(0 1px 2px #000)"></div>'), 'shadow'],
    ['ellipsis', (s) => inject(s, '<style>.x { text-overflow: ellipsis; }</style>'), 'truncation'],
    ['line-clamp', (s) => inject(s, '<style>.x { -webkit-line-clamp: 2; }</style>'), 'truncation'],
    ['truncate class', (s) => inject(s, '<p class="t-body truncate">x</p>'), 'truncation'],
    ['says AI', (s) => inject(s, '<p>Our AI picks pieces.</p>'), 'says "AI"'],
    ['missing frame', (s, frames) => s.replace(`data-frame="${frames[0].id}"`, 'data-frame="frame-gone-p0"'), 'missing frame anchor'],
    ['no sentinel', (s) => s.replace(SENTINEL, ''), 'last non-empty line'],
    ['shared block edited', (s) => s.replace('--paper: #FAF7F2;', '--paper: #FFFFFF;'), 'shared block differs'],
    ['shared block twice', (s) => inject(s, `<style data-shared="uplift">${sharedCss}</style>`), 'exactly one'],
    ['shared block absent', (s) => s.replace('data-shared="uplift"', 'data-local="x"'), 'exactly one'],
    ['big data image', (s) => inject(s, `<img alt="x" src="data:image/png;base64,${'A'.repeat(MAX_BASE64 + 4)}">`), 'over 20 KB'],
  ];
  const narrowCases = [
    ['wide width at 390', (s) => inject(s, '<style>.x { width: 640px; }</style>'), 'may overflow 390'],
    ['wide grid at 390', (s) => inject(s, '<style>.x { grid-template-columns: 200px 200px; gap: 24px; }</style>'), 'may overflow 390'],
    ['nowrap prose at 390', (s) => inject(s, '<style>p.x { white-space: nowrap; }</style>'), 'may overflow 390'],
    ['wide rule behind min-width 900 is skipped', (s) => inject(s, '<style>@media (min-width: 900px) { .x { width: 640px; } }</style>'), null],
  ];
  let checks = 0;
  const selfFail = (msg) => {
    failed = true;
    console.error(`SELF-TEST FAIL ${msg}`);
  };
  for (const slug of SLUGS) {
    for (const w of WIDTHS) {
      const frames = framesOf(slug, w);
      const good = build(slug, w, frames);
      const base = checkSource(good, { width: w, frames, sharedCss });
      checks += 1;
      if (base.length) { selfFail(`${slug}-${w}: a clean specimen fails: ${base.join(' | ')}`); continue; }
      const dark = frames.find((f) => f.kind === 'd');
      const own = [...cases, ...(w === String(NARROW) ? narrowCases : [])];
      if (dark) own.push(['dark frame not dark', (s) => s.replace(`frame theme-dark" data-frame="${dark.id}"`, `frame" data-frame="${dark.id}"`), 'without class theme-dark']);
      const today = frames.find((f) => f.kind === 't');
      if (today) own.push(['today image unreferenced', (s) => s.replaceAll(`../walk/${today.pair}`, 'walk.jpg'), 'today image']);
      for (const [name, mutate, expect] of own) {
        const got = checkSource(mutate(good, frames), { width: w, frames, sharedCss });
        checks += 1;
        if (expect === null && got.length) selfFail(`${slug}-${w} "${name}": expected a pass, got ${got.join(' | ')}`);
        if (expect !== null && !got.some((p) => p.includes(expect))) selfFail(`${slug}-${w} "${name}": expected "${expect}", got ${got.join(' | ') || 'a pass'}`);
      }
    }
  }
  if (failed) process.exit(1);
  console.log(`PASS self-test (${checks} checks over ${SLUGS.length * WIDTHS.length} synthetic specimens: each clean one passes, each injected violation is named)`);
  process.exit(0);
}

// ---- specimens ----
const targets = named.length ? SLUGS.filter((s) => named.includes(s)) : SLUGS;
let passed = 0;
let missing = 0;
for (const slug of targets) {
  for (const w of WIDTHS) {
    const name = `${slug}-${w}.html`;
    const file = join(DIR, name);
    const frames = framesOf(slug, w);
    if (!existsSync(file)) {
      failed = true;
      missing += 1;
      console.error(`MISSING ${name} (${frames.length} frames expected: ${frames.map((f) => f.id).join(', ')})`);
      continue;
    }
    const problems = checkSource(readFileSync(file, 'utf8'), { width: w, frames, sharedCss });
    if (problems.length) {
      failed = true;
      console.error(`FAIL ${name}\n  ${problems.join('\n  ')}`);
    } else {
      passed += 1;
      console.log(`PASS ${name} (${frames.length} frames: ${frames[0].id} … ${frames.at(-1).id})`);
    }
  }
}
const checked = targets.length * WIDTHS.length;
console.log(`${passed} of ${checked} specimen file(s) pass; ${missing} missing.`);
process.exit(failed ? 1 : 0);
