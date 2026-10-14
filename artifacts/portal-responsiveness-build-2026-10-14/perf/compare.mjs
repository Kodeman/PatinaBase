// US-34 F17 (SQ-966): diff a later lab run directory against the pre-fix baseline.
//   node compare.mjs <runDir> [baselineDir]          markdown diff of medians, per scenario
//   node compare.mjs <runDir> [baselineDir] --json   the same as JSON
//   node compare.mjs <runDir> [baselineDir] --strict exit 1 if any metric regressed
//   node compare.mjs --table <dir>                   the headline table for one directory
// A metric "regressed" when the run's median is above the baseline's max (every metric here is
// better lower). "improved" when the run's median is below the baseline's min. Otherwise "within"
// (inside the baseline's run-to-run range). The wave-3 perf gate (SQ-1002) applies its own
// per-row thresholds on top of this; this script only reports.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTS, METRICS, markdownTable, summarize } from './stats.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const pos = args.filter((a) => !a.startsWith('--'));

if (flags.has('--table')) {
  console.log(markdownTable(summarize(path.resolve(pos[0] || path.join(here, 'baseline')))));
  process.exit(0);
}
if (!pos[0]) {
  console.error('usage: node compare.mjs <runDir> [baselineDir] [--json] [--strict] | --table <dir>');
  process.exit(2);
}

const run = summarize(path.resolve(pos[0]));
const base = summarize(path.resolve(pos[1] || path.join(here, 'baseline')));
const rows = [];
for (const key of [...new Set([...Object.keys(base), ...Object.keys(run)])]) {
  const b = base[key];
  const r = run[key];
  if (!b || !r) { rows.push({ key, metric: null, verdict: b ? 'missing-in-run' : 'not-in-baseline' }); continue; }
  for (const m of METRICS) {
    const bm = b.metrics[m];
    const rm = r.metrics[m];
    if (!bm && !rm) continue;
    if (!bm || !rm) { rows.push({ key, metric: m, base: bm?.med ?? null, run: rm?.med ?? null, verdict: bm ? 'missing-in-run' : 'new' }); continue; }
    const verdict = rm.med > bm.max ? 'regressed' : rm.med < bm.min ? 'improved' : 'within';
    const delta = Math.round((rm.med - bm.med) * 10000) / 10000;
    rows.push({ key, metric: m, kind: COUNTS.has(m) ? 'count' : 'time', base: bm.med, baseRange: [bm.min, bm.max], run: rm.med, runRange: [rm.min, rm.max], delta,
      pct: bm.med ? Math.round((delta / bm.med) * 1000) / 10 : null, verdict });
  }
}

const regressed = rows.filter((r) => r.verdict === 'regressed');
if (flags.has('--json')) {
  console.log(JSON.stringify({ run: path.resolve(pos[0]), baseline: path.resolve(pos[1] || path.join(here, 'baseline')), rows, regressed: regressed.length }, null, 1));
} else {
  console.log('| Scenario | Metric | Baseline med [min–max] | Run med [min–max] | Δ | Δ% | Verdict |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    if (!r.metric) { console.log(`| ${r.key} | — | — | — | — | — | ${r.verdict} |`); continue; }
    const br = r.baseRange ? `${r.base} [${r.baseRange.join('–')}]` : `${r.base ?? '—'}`;
    const rr = r.runRange ? `${r.run} [${r.runRange.join('–')}]` : `${r.run ?? '—'}`;
    console.log(`| ${r.key} | ${r.metric} | ${br} | ${rr} | ${r.delta ?? '—'} | ${r.pct ?? '—'} | ${r.verdict} |`);
  }
  console.log(`\n${regressed.length} regressed, ${rows.filter((r) => r.verdict === 'improved').length} improved, ${rows.filter((r) => r.verdict === 'within').length} within the baseline range.`);
}
process.exit(flags.has('--strict') && regressed.length ? 1 : 0);
