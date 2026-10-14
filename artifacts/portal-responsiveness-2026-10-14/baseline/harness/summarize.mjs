// SQ-952: median [min–max] per metric for every data/local-*.json scenario file.
//   node summarize.mjs > ../data/local-summary.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const KEYS = ['ttfb', 'fcp', 'lcp', 'firstChange', 'placeholder', 'content', 'usable', 'noBusy', 'settled', 'requests', 'apiRequests', 'authUser', 'rpc', 'depth', 'domMutationBatches', 'longTasks', 'longTaskMs', 'signinTtfb', 'signinFcp'];
const stat = (v) => { v = v.filter((x) => typeof x === 'number').sort((a, b) => a - b); if (!v.length) return null; return { med: v[Math.floor((v.length - 1) / 2)], min: v[0], max: v[v.length - 1], n: v.length }; };
const out = {};
for (const f of fs.readdirSync(dir).filter((f) => /^local-P.*\.json$/.test(f))) {
  const { rows } = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const flat = (sub) => rows.map((r) => (sub ? r[sub] : r)).filter(Boolean);
  const subs = rows[0] && rows[0].tick ? ['tick', 'untick'] : rows[0] && rows[0].search ? [null, 'search'] : [null];
  for (const sub of subs) {
    const rs = flat(sub);
    const s = {}; for (const k of KEYS) { const x = stat(rs.map((r) => r[k])); if (x) s[k] = x; }
    s.errors = rows.filter((r) => r.error).length; s.capped = rs.filter((r) => r.capped).length; s.path = rs[0] && rs[0].path;
    out[f.replace(/^local-|\.json$/g, '') + (sub ? `:${sub}` : '')] = s;
  }
}
console.log(JSON.stringify(out, null, 1));
