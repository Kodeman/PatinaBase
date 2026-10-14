// SQ-952 prod walk collector. Pasted into the signed-in tab after a hard navigation.
// Read-only: reads Performance Timeline entries only. Waits until no new resource
// entries arrive for 3 s, then summarises the navigation and the Supabase/edge-API
// request waterfall. "depth" is an inferred upper bound: a request's depth is 1 +
// the max depth of any API request that had finished before it started.
await (async () => {
  let n = -1, stable = 0;
  while (stable < 6) {
    await new Promise((r) => setTimeout(r, 500));
    const c = performance.getEntriesByType('resource').length;
    if (c === n) stable++; else { stable = 0; n = c; }
  }
})();
const nav = performance.getEntriesByType('navigation')[0];
const res = performance.getEntriesByType('resource');
const api = res.filter((r) => /api\.patina\.cloud|supabase\.co|127\.0\.0\.1:54321/.test(r.name) && !/realtime/.test(r.name));
const sorted = [...api].sort((a, b) => a.startTime - b.startTime);
const d = [];
sorted.forEach((r, i) => { let m = 0; for (let j = 0; j < i; j++) if (sorted[j].responseEnd <= r.startTime) m = Math.max(m, d[j]); d.push(m + 1); });
const st = Object.fromEntries((nav.serverTiming || []).map((s) => [s.name, s.duration]));
const js = res.filter((r) => /\.js(\?|$)/.test(r.name));
JSON.stringify({
  path: location.pathname.replace(/[0-9a-f-]{36}/g, '[id]'),
  ttfb: Math.round(nav.responseStart - nav.requestStart),
  cfEdge: st.cfEdge ?? null, cfWorker: st.cfWorker ?? null,
  dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd),
  resources: res.length, jsFiles: js.length,
  jsKBtransfer: Math.round(js.reduce((s, r) => s + r.transferSize, 0) / 1024),
  api: api.length,
  rpc: api.filter((r) => /\/rpc\//.test(r.name)).length,
  authUser: api.filter((r) => /auth\/v1\/user/.test(r.name)).length,
  functions: api.filter((r) => /functions\/v1/.test(r.name)).length,
  apiFirstStart: api.length ? Math.round(Math.min(...api.map((r) => r.startTime))) : null,
  apiLastEnd: api.length ? Math.round(Math.max(...api.map((r) => r.responseEnd))) : null,
  depth: Math.max(0, ...d),
  visibility: document.visibilityState,
});
