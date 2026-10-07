#!/usr/bin/env node
// Specimen gate (SPEC.md §8): sentinel last line, no banned strings.
// Usage: node specimens/check.mjs <a|b|c>   (checks proposed-<x>-1440.html and proposed-<x>-390.html)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const x = process.argv[2];
if (!['a', 'b', 'c'].includes(x)) { console.error('usage: check.mjs <a|b|c>'); process.exit(2); }

const BANNED = [/box-shadow/, /text-overflow/, /placeholder=/, /\sdisabled[\s>=]/, /\bAI\b/, /curated/i, /luxury/i, /bespoke/i];
let failed = false;
for (const w of ['1440', '390']) {
  const f = join(dir, `proposed-${x}-${w}.html`);
  let src;
  try { src = readFileSync(f, 'utf8'); } catch { console.error(`FAIL missing ${f}`); failed = true; continue; }
  const lines = src.trimEnd().split('\n');
  const problems = [];
  if (lines.at(-1).trim() !== '<!-- specimen-complete -->') problems.push('last line is not the sentinel');
  lines.forEach((l, i) => BANNED.forEach((re) => { if (re.test(l)) problems.push(`line ${i + 1}: ${re}`); }));
  if ((src.match(/<h1[\s>]/g) || []).length !== 1) problems.push('needs exactly one <h1>');
  if (problems.length) { failed = true; console.error(`FAIL ${f}\n  ${problems.join('\n  ')}`); }
  else console.log(`PASS ${f}`);
}
process.exit(failed ? 1 : 0);
