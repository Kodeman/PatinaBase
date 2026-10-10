#!/usr/bin/env node
// Validates the Direction C labeling manifest.
// Usage: node validate.mjs [designer|portals|field ...]   (no args = every part present)
//
// Row files:       rows-<part>.json        — array of rows (schema below)
// Ownership files: ownership-<part>.json   — { "<owner>": ["repo/relative/path", ...] }
// A path may appear under exactly one owner across ALL ownership files.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PARTS = { designer: 'C-', portals: ['CL-', 'AD-', 'MF-'], field: 'FD-' };
const OWNERS = ['L', 'D1', 'D2', 'D3', 'P1', 'P2', 'F1', 'F2'];
const AUDIENCES = ['designer', 'homeowner', 'admin', 'manufacturer', 'field', 'trade', 'shared'];
const STATUSES = ['planned', 'implemented', 'unchanged', 'exception'];
const REQUIRED = ['id', 'audience', 'surface', 'source', 'current', 'proposed', 'meaning', 'owner', 'verify', 'status'];

const asked = process.argv.slice(2);
const parts = asked.length ? asked : Object.keys(PARTS).filter((p) => existsSync(join(here, `rows-${p}.json`)));
const errors = [];
const ids = new Set();

for (const part of parts) {
  if (!PARTS[part]) { errors.push(`unknown part ${part}`); continue; }
  const file = join(here, `rows-${part}.json`);
  if (!existsSync(file)) { errors.push(`missing ${file}`); continue; }
  const rows = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(rows)) { errors.push(`${file} is not an array`); continue; }
  const prefixes = [].concat(PARTS[part]);
  const counts = {};
  for (const [i, row] of rows.entries()) {
    const at = `${part}[${i}]${row?.id ? ` ${row.id}` : ''}`;
    for (const key of REQUIRED) {
      if (row[key] === undefined || row[key] === null || row[key] === '') errors.push(`${at}: missing ${key}`);
    }
    if (row.id && !prefixes.some((p) => row.id.startsWith(p))) errors.push(`${at}: id must start with ${prefixes.join('|')}`);
    if (row.id && ids.has(row.id)) errors.push(`${at}: duplicate id`);
    ids.add(row.id);
    if (row.owner && !OWNERS.includes(row.owner)) errors.push(`${at}: owner ${row.owner} not in ${OWNERS}`);
    if (row.audience && !AUDIENCES.includes(row.audience)) errors.push(`${at}: audience ${row.audience}`);
    if (row.status && !STATUSES.includes(row.status)) errors.push(`${at}: status ${row.status}`);
    if (row.status === 'exception' && !row.exception) errors.push(`${at}: status exception needs an exception note`);
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  if (part === 'designer') {
    const seeded = rows.filter((r) => Number.isInteger(r.seedRow));
    const seedIdx = new Set(seeded.map((r) => r.seedRow));
    if (seedIdx.size < 1334) errors.push(`designer: ${seedIdx.size}/1334 founder seed rows reconciled (seedRow 0..1333)`);
  }
  console.log(`${part}: ${rows.length} rows ${JSON.stringify(counts)}`);
}

const owned = new Map();
for (const f of readdirSync(here).filter((n) => /^ownership-.+\.json$/.test(n))) {
  const map = JSON.parse(readFileSync(join(here, f), 'utf8'));
  for (const [owner, paths] of Object.entries(map)) {
    if (!OWNERS.includes(owner)) errors.push(`${f}: unknown owner ${owner}`);
    for (const p of paths) {
      if (owned.has(p) && owned.get(p) !== owner) errors.push(`${f}: ${p} owned by both ${owned.get(p)} and ${owner}`);
      owned.set(p, owner);
    }
  }
}
console.log(`ownership: ${owned.size} paths`);

if (errors.length) {
  console.error(errors.slice(0, 50).join('\n'));
  if (errors.length > 50) console.error(`… ${errors.length - 50} more`);
  process.exit(1);
}
