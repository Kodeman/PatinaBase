#!/usr/bin/env node
/**
 * check.mjs - the specimen gate for US-26 (SPEC.md §1, §2.1, §5 and §6).
 * Adapted from tools/check.us24.mjs.
 *
 * Reads the frame table in SPEC.md §1 and the pairing table in §2.1.
 *
 * --spec-only validates SPEC.md alone: three direction rows, frames listed at both
 * widths, each frame numbered on its own width in §2.1, and every today image
 * present in ../walk/. No specimen is opened.
 *
 * Otherwise, for each direction (A, B, C, or the one named) and each width (1440, 390):
 *   - specimens/proposed-<x>-<w>.html exists;
 *   - its last non-empty line is exactly <!-- SPECIMEN COMPLETE -->;
 *   - it carries data-frame="frame-<x><n>" for every frame SPEC.md lists;
 *   - each frame's today image is referenced as ../walk/<file>;
 *   - no src/href/srcset/poster/action, CSS url(), @import or fetch() reaches an
 *     http(s) or protocol-relative URL outside fonts.googleapis.com / fonts.gstatic.com;
 *   - no box-shadow and no drop-shadow( anywhere;
 *   - no standalone "AI" (case-sensitive, word-bounded) and no "A.I.";
 *   - 390 files only, a static overflow check: no width / min-width / flex-basis over
 *     390px, no grid-template-columns whose px tracks and gaps sum over 390px, no
 *     width="…" attribute over 390, no white-space:nowrap on a p/li/h1-h6/blockquote rule;
 *   - no data:image base64 payload is over 20 KB (20,480 characters).
 *
 *   node specimens/check.mjs              # all directions
 *   node specimens/check.mjs a            # one direction
 *   node specimens/check.mjs --spec-only  # SPEC.md only
 *
 * Exit 0 when everything passes, 1 otherwise (each failure is named), 2 on a bad argument.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const WALK = join(DIR, '..', 'walk');
const SENTINEL = '<!-- SPECIMEN COMPLETE -->';
const WIDTHS = ['1440', '390'];
const NARROW = 390;
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const MAX_BASE64 = 20 * 1024;

const args = process.argv.slice(2);
const specOnly = args.includes('--spec-only');
const rest = args.filter((a) => a !== '--spec-only');
if (rest.length > 1 || (rest[0] !== undefined && !/^[abc]$/i.test(rest[0])) || (specOnly && rest.length)) {
  console.error('usage: node check.mjs [a|b|c] | node check.mjs --spec-only');
  process.exit(2);
}
const only = rest[0]?.toLowerCase();

/** Frame ids in one table cell: `frame-a1` … `frame-a7`, or a plain list. */
function frameIds(cell) {
  const toks = [...cell.matchAll(/`frame-([a-z])(\d+)`/g)];
  if (toks.length === 2 && cell.includes('…')) {
    const [a, b] = toks;
    const ids = [];
    for (let n = Number(a[2]); n <= Number(b[2]); n += 1) ids.push(`frame-${a[1]}${n}`);
    return ids;
  }
  return toks.map((t) => `frame-${t[1]}${t[2]}`);
}

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

/** CSS text: every <style> body plus every inline style="" value. */
function cssOf(src) {
  const blocks = [...src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const inline = [...src.matchAll(/\bstyle\s*=\s*"([^"]*)"|\bstyle\s*=\s*'([^']*)'/gi)].map((m) => `x{${m[1] ?? m[2]}}`);
  return [...blocks, ...inline].join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Static overflow risks in a 390 file. A floor, not proof: the render check decides. */
function overflow390(src) {
  const bad = [];
  const css = cssOf(src);
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

// ---- SPEC.md ----
const spec = readFileSync(join(DIR, 'SPEC.md'), 'utf8');
const lines = spec.split('\n');
const rows = lines.filter((l) => /^\|\s*\*\*[A-C],/.test(l));
if (rows.length !== 3) {
  console.error(`FAIL SPEC.md §1: expected 3 direction rows in the frame table, found ${rows.length}`);
  process.exit(1);
}

// §2.1 pairing table: | x1 | 1440 | M1 | `today-leah-studio-fold-1440.jpg` | … |
const pairing = new Map();
let failed = false;
for (const l of lines) {
  const m = /^\|\s*x(\d+)\s*\|\s*(1440|390)\s*\|[^|]*\|\s*`([^`]+\.jpg)`\s*\|/.exec(l);
  if (!m) continue;
  const n = Number(m[1]);
  if (pairing.has(n)) {
    failed = true;
    console.error(`FAIL SPEC.md §2.1: x${n} is listed twice`);
  }
  pairing.set(n, { width: m[2], today: m[3] });
  if (!existsSync(join(WALK, m[3]))) {
    failed = true;
    console.error(`FAIL SPEC.md §2.1: x${n} today image ../walk/${m[3]} does not exist`);
  }
}
if (!pairing.size) {
  console.error('FAIL SPEC.md §2.1: no pairing rows (| xN | width | moment | `today.jpg` | … |) found');
  process.exit(1);
}

const directions = rows.map((row) => {
  const x = /\*\*([A-C]),/.exec(row)[1].toLowerCase();
  const cells = row.split('|').map((c) => c.trim());
  // | direction | files | 1440 frames | 390 frames |
  return { x, lists: { 1440: frameIds(cells[3] ?? ''), 390: frameIds(cells[4] ?? '') } };
});

let frameCount = 0;
for (const { x, lists } of directions) {
  for (const w of WIDTHS) {
    const problems = [];
    if (!lists[w].length) problems.push('lists no frames');
    for (const id of lists[w]) {
      if (!id.startsWith(`frame-${x}`)) problems.push(`${id} does not belong to direction ${x.toUpperCase()}`);
      const p = pairing.get(Number(id.slice(7)));
      if (!p) problems.push(`§2.1 has no today image for ${id}`);
      else if (p.width !== w) problems.push(`${id} is listed at ${w} but §2.1 numbers x${id.slice(7)} at ${p.width}`);
    }
    frameCount += lists[w].length;
    if (problems.length) {
      failed = true;
      console.error(`FAIL SPEC.md §1 ${x.toUpperCase()} ${w}: ${problems.join('; ')}`);
    }
  }
}

if (specOnly) {
  if (failed) process.exit(1);
  console.log(`PASS SPEC.md (3 directions, ${frameCount} frames, ${pairing.size} pairing rows, every today image present in ../walk/)`);
  process.exit(0);
}

// ---- specimens ----
for (const { x, lists } of directions) {
  if (only && x !== only) continue;
  for (const w of WIDTHS) {
    const name = `proposed-${x}-${w}.html`;
    const file = join(DIR, name);
    const problems = [];
    if (!existsSync(file)) {
      problems.push('file does not exist');
    } else {
      const src = readFileSync(file, 'utf8');
      const last = src.trimEnd().split('\n').at(-1).trim();
      if (last !== SENTINEL) problems.push(`last non-empty line is ${JSON.stringify(last.slice(0, 80))}, not ${SENTINEL}`);
      const missing = lists[w].filter((id) => !src.includes(`data-frame="${id}"`));
      if (missing.length) problems.push(`missing frame anchor(s): ${missing.join(', ')}`);
      const unref = [...new Set(lists[w].map((id) => pairing.get(Number(id.slice(7)))?.today).filter(Boolean))]
        .filter((jpg) => !src.includes(`../walk/${jpg}`));
      if (unref.length) problems.push(`today image(s) not referenced as ../walk/<file>: ${unref.join(', ')}`);
      const ext = externalRefs(src);
      if (ext.length) problems.push(`external fetch outside Google Fonts: ${ext.join(', ')}`);
      const sh = shadows(src);
      if (sh.length) problems.push(`shadow(s): ${sh.join(' | ')}`);
      const ai = saysAI(src);
      if (ai.length) problems.push(`says "AI": ${ai.slice(0, 5).join(' | ')}`);
      if (w === String(NARROW)) {
        const ov = overflow390(src);
        if (ov.length) problems.push(`may overflow 390: ${ov.join(' | ')}`);
      }
      const big = oversizeImages(src);
      if (big.length) problems.push(`data:image base64 over 20 KB: ${big.map((n) => `${n} chars`).join(', ')}`);
    }
    if (problems.length) {
      failed = true;
      console.error(`FAIL ${name}\n  ${problems.join('\n  ')}`);
    } else {
      console.log(`PASS ${name} (${lists[w].length} frames: ${lists[w][0]}…${lists[w].at(-1)})`);
    }
  }
}
process.exit(failed ? 1 : 0);
