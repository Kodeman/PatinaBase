// SQ-952 B4 (middleware cost), local route-differential probe against `next start`.
// Same route set as the prod probe: the middleware does different work per route
// (src/middleware.ts), so TTFB differences isolate its hops without touching src/.
//   STATE=<playwright storageState.json> node b4-local.mjs > ../data/local-b4-probes.csv
import fs from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:3110';
const DOC = process.env.DOC || 'b0000000-0000-0000-0000-00000000c0d1';
const state = JSON.parse(fs.readFileSync(process.env.STATE, 'utf8'));
const cookie = state.cookies.filter((c) => c.domain.includes('localhost')).map((c) => `${c.name}=${c.value}`).join('; ');
const routes = ['/desk', `/doc/${DOC}`, `/doc/${DOC}/pieces`, '/people', '/library', '/auth/signin', '/terms', '/auth/error', '/api/version'];
console.log('round,route,status,ttfb_ms,total_ms');
for (let round = 1; round <= 7; round++) {
  for (const r of routes) {
    const t0 = performance.now();
    const res = await fetch(`${BASE}${r}`, { headers: { cookie }, redirect: 'manual' });
    const t1 = performance.now();
    await res.arrayBuffer();
    const t2 = performance.now();
    console.log([round, r.replace(DOC, '[id]').replace('/doc/[id]', '/doc/[id]'), res.status, Math.round(t1 - t0), Math.round(t2 - t0)].join(','));
  }
}
