#!/usr/bin/env node
/**
 * check.mjs - the specimen gate for US-20 (SPEC.md §1 and §9).
 *
 * Reads the frame table in SPEC.md §1 and, for each direction (A, B, C) and each
 * width (1440, 390), checks that:
 *   - specimens/proposed-<x>-<w>.html exists;
 *   - its last non-empty line is exactly <!-- SPECIMEN COMPLETE -->;
 *   - it carries data-frame="frame-<id>" for every frame SPEC.md lists, required
 *     and optional alike.
 *
 *   node specimens/check.mjs
 *
 * Exit 0 when every file passes, 1 otherwise (each failure is named).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const SENTINEL = '<!-- SPECIMEN COMPLETE -->';
const WIDTHS = ['1440', '390'];

/** Frame ids in one table cell: `frame-a1` … `frame-a10`, optional `frame-a11`. */
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

const spec = readFileSync(join(DIR, 'SPEC.md'), 'utf8');
const rows = spec.split('\n').filter((l) => /^\|\s*\*\*[A-C],/.test(l));
if (rows.length !== 3) {
  console.error(`FAIL SPEC.md: expected 3 direction rows in the §1 frame table, found ${rows.length}`);
  process.exit(1);
}

let failed = false;
for (const row of rows) {
  const x = /\*\*([A-C]),/.exec(row)[1].toLowerCase();
  const cells = row.split('|').map((c) => c.trim());
  // | direction | files | 1440 frames | 390 frames |
  const lists = { 1440: frameIds(cells[3]), 390: frameIds(cells[4]) };
  for (const w of WIDTHS) {
    const name = `proposed-${x}-${w}.html`;
    const file = join(DIR, name);
    const problems = [];
    if (!lists[w].length) problems.push('SPEC.md lists no frames for this file');
    if (!existsSync(file)) {
      problems.push('file does not exist');
    } else {
      const src = readFileSync(file, 'utf8');
      const last = src.trimEnd().split('\n').at(-1).trim();
      if (last !== SENTINEL) problems.push(`last non-empty line is ${JSON.stringify(last.slice(0, 80))}, not ${SENTINEL}`);
      const missing = lists[w].filter((id) => !src.includes(`data-frame="${id}"`));
      if (missing.length) problems.push(`missing frame(s): ${missing.join(', ')}`);
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
