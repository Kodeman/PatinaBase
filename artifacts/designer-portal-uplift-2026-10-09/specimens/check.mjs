#!/usr/bin/env node
/**
 * check.mjs - the specimen gate for US-24 (SPEC.md §1, §2.1, §5 and §6).
 *
 * Reads the frame table in SPEC.md §1 and the pairing table in §2.1. For each
 * direction (A, B, C, or the one named) and each width (1440, 390) it checks:
 *   - specimens/proposed-<x>-<w>.html exists;
 *   - its last non-empty line is exactly <!-- SPECIMEN COMPLETE -->;
 *   - it carries data-frame="frame-<x><n>" for every frame SPEC.md lists;
 *   - each frame's before image exists in ../walk/ and is referenced as ../walk/<file>;
 *   - no src/href/srcset/poster/action, CSS url(), @import or fetch() reaches an
 *     http(s) or protocol-relative URL outside fonts.googleapis.com / fonts.gstatic.com;
 *   - no data:image base64 payload is over 20 KB (20,480 characters).
 *
 *   node specimens/check.mjs        # all directions
 *   node specimens/check.mjs a      # one direction
 *
 * Exit 0 when every file passes, 1 otherwise (each failure is named), 2 on a bad argument.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const WALK = join(DIR, '..', 'walk');
const SENTINEL = '<!-- SPECIMEN COMPLETE -->';
const WIDTHS = ['1440', '390'];
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);
const MAX_BASE64 = 20 * 1024;

const arg = process.argv[2];
if (arg !== undefined && !/^[abc]$/i.test(arg)) {
  console.error('usage: node check.mjs [a|b|c]');
  process.exit(2);
}
const only = arg?.toLowerCase();

/** Frame ids in one table cell: `frame-a1` … `frame-a7`, optional `frame-a8`. */
function frameIds(cell) {
  const ids = [];
  for (const part of cell.split(/optional/i)) {
    const toks = [...part.matchAll(/`frame-([a-z])(\d+)`/g)];
    if (toks.length === 2 && part.includes('…')) {
      const [a, b] = toks;
      for (let n = Number(a[2]); n <= Number(b[2]); n += 1) ids.push(`frame-${a[1]}${n}`);
    } else {
      for (const t of toks) ids.push(`frame-${t[1]}${t[2]}`);
    }
  }
  return ids;
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

const spec = readFileSync(join(DIR, 'SPEC.md'), 'utf8');
const lines = spec.split('\n');
const rows = lines.filter((l) => /^\|\s*\*\*[A-C],/.test(l));
if (rows.length !== 3) {
  console.error(`FAIL SPEC.md: expected 3 direction rows in the §1 frame table, found ${rows.length}`);
  process.exit(1);
}

// §2.1 pairing table: | x1 | 1440 | S1, S7 | `desk-fold-1440.jpg` | … |
const before = new Map();
let specFailed = false;
for (const l of lines) {
  const m = /^\|\s*x(\d+)\s*\|\s*(1440|390)\s*\|[^|]*\|\s*`([^`]+\.jpg)`\s*\|/.exec(l);
  if (!m) continue;
  before.set(Number(m[1]), m[3]);
  if (!existsSync(join(WALK, m[3]))) {
    specFailed = true;
    console.error(`FAIL SPEC.md §2.1: x${m[1]} before image ../walk/${m[3]} does not exist`);
  }
}
if (!before.size) {
  console.error('FAIL SPEC.md §2.1: no pairing rows (| xN | width | scenario | `before.jpg` | … |) found');
  process.exit(1);
}

let failed = specFailed;
for (const row of rows) {
  const x = /\*\*([A-C]),/.exec(row)[1].toLowerCase();
  if (only && x !== only) continue;
  const cells = row.split('|').map((c) => c.trim());
  // | direction | files | 1440 frames | 390 frames |
  const lists = { 1440: frameIds(cells[3]), 390: frameIds(cells[4]) };
  for (const w of WIDTHS) {
    const name = `proposed-${x}-${w}.html`;
    const file = join(DIR, name);
    const problems = [];
    if (!lists[w].length) problems.push('SPEC.md lists no frames for this file');
    for (const id of lists[w]) {
      if (!before.has(Number(id.slice(7)))) problems.push(`SPEC.md §2.1 has no before image for ${id}`);
    }
    if (!existsSync(file)) {
      problems.push('file does not exist');
    } else {
      const src = readFileSync(file, 'utf8');
      const last = src.trimEnd().split('\n').at(-1).trim();
      if (last !== SENTINEL) problems.push(`last non-empty line is ${JSON.stringify(last.slice(0, 80))}, not ${SENTINEL}`);
      const missing = lists[w].filter((id) => !src.includes(`data-frame="${id}"`));
      if (missing.length) problems.push(`missing frame(s): ${missing.join(', ')}`);
      const unref = [...new Set(lists[w].map((id) => before.get(Number(id.slice(7)))).filter(Boolean))]
        .filter((jpg) => !src.includes(`../walk/${jpg}`));
      if (unref.length) problems.push(`before image(s) not referenced as ../walk/<file>: ${unref.join(', ')}`);
      const ext = externalRefs(src);
      if (ext.length) problems.push(`external fetch outside Google Fonts: ${ext.join(', ')}`);
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
