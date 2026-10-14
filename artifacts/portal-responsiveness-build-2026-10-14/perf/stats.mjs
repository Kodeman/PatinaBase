// US-34 F17 (SQ-966): shared reader for lab run directories (one local-<scenario>-<vp>.json per
// scenario, written by portal-responsiveness-2026-10-14/baseline/harness/lab.mjs).
// Medians follow the SQ-952 summarize.mjs convention: the lower middle value, with min and max.
import fs from 'node:fs';
import path from 'node:path';

// Metrics summarised per scenario key. Times are ms from the input (or navigation start).
export const METRICS = [
  'ttfb', 'fcp', 'lcp', 'firstChange', 'placeholder', 'content', 'usable', 'noBusy', 'settled',
  'requests', 'apiRequests', 'authUser', 'rpc', 'depth', 'domMutationBatches', 'longTasks', 'longTaskMs',
  'reactCommits', 'cls', 'layoutShifts', 'arrivalStart', 'arrivalPlayStart', 'arrivalEnd',
  'writeStart', 'writeEnd', 'refetchesAfterWrite',
  'tickShowsState', 'phaseShowsState', 'pendingShown', 'roomShown', 'sendingShown', 'sendBlockedAt',
];
// Counts compare by value; everything else is a time (or CLS), where lower is better too.
export const COUNTS = new Set(['requests', 'apiRequests', 'authUser', 'rpc', 'depth', 'domMutationBatches', 'longTasks', 'reactCommits', 'layoutShifts', 'refetchesAfterWrite']);

export function stat(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  return { med: v[Math.floor((v.length - 1) / 2)], min: v[0], max: v[v.length - 1], n: v.length, values: v };
}

export function readRunFiles(dir) {
  const out = {};
  for (const f of fs.readdirSync(dir).filter((f) => /^local-P.*\.json$/.test(f)).sort()) {
    out[f.replace(/^local-|\.json$/g, '')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  return out;
}

// One sub-row per measured window: P6 has tick and untick, P7-P9 an act, P5 a search.
function windows(row) {
  if (row.tick || row.untick) return [['tick', row.tick], ['untick', row.untick]];
  if (row.act) return [[null, row.act]];
  if (row.search) return [[null, row], ['search', row.search]];
  return [[null, row]];
}

/** { "<scenario>-<vp>[:sub]": { n, errors, capped, path, metrics: { name: stat } } } */
export function summarize(dir) {
  const out = {};
  for (const [name, file] of Object.entries(readRunFiles(dir))) {
    // A run that threw is an error row for every window of its scenario.
    const errors = file.rows.filter((r) => r.error).length;
    const groups = {};
    for (const row of file.rows.filter((r) => !r.error)) {
      for (const [sub, w] of windows(row)) {
        if (!w) continue;
        (groups[sub ? `${name}:${sub}` : name] ??= []).push(w);
      }
    }
    if (!Object.keys(groups).length) groups[name] = [];
    for (const [key, rows] of Object.entries(groups)) {
      const metrics = {};
      for (const m of METRICS) { const s = stat(rows.map((r) => r[m])); if (s) metrics[m] = s; }
      const g = { rows };
      out[key] = {
        n: rows.length,
        errors,
        capped: g.rows.filter((r) => r.capped).length,
        path: g.rows[0]?.path ?? null,
        metrics,
      };
    }
  }
  return out;
}

const cell = (s) => (s ? (s.min === s.max ? `${s.med}` : `${s.med} [${s.min}–${s.max}]`) : '—');

/** A markdown table of the headline metrics for one run directory. */
export function markdownTable(summary) {
  const cols = ['firstChange', 'placeholder', 'usable', 'settled', 'apiRequests', 'authUser', 'reactCommits', 'cls', 'arrivalStart', 'arrivalPlayStart', 'arrivalEnd', 'writeEnd', 'refetchesAfterWrite'];
  const state = ['tickShowsState', 'phaseShowsState', 'roomShown', 'sendingShown'];
  const lines = [
    `| Scenario | n | ${cols.join(' | ')} | visible state |`,
    `|---|---|${cols.map(() => '---').join('|')}|---|`,
  ];
  for (const [key, s] of Object.entries(summary)) {
    const vis = state.filter((k) => s.metrics[k]).map((k) => `${k} ${cell(s.metrics[k])}`).join('; ') || '—';
    lines.push(`| ${key} | ${s.n}${s.errors ? ` (+${s.errors} err)` : ''}${s.capped ? ` (${s.capped} capped)` : ''} | ${cols.map((c) => cell(s.metrics[c])).join(' | ')} | ${vis} |`);
  }
  return lines.join('\n');
}
