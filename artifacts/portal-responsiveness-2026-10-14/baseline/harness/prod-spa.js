// SQ-952 prod walk: in-app (client-side) transitions, read-only.
// Clicks only <a href> navigation links (and types into the Library search
// field without pressing Enter), then times: first DOM mutation after the
// action (click -> first visual change proxy), last mutation before a 3 s quiet
// window (click -> settled proxy), and the Supabase/edge requests issued.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function measure(label, act) {
  const t0 = performance.now();
  let first = null, last = 0;
  const mo = new MutationObserver(() => { const t = performance.now() - t0; if (first === null) first = t; last = t; });
  mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  const before = performance.getEntriesByType('resource').length;
  const ok = act();
  let n = -1, stable = 0;
  while (stable < 6) { await sleep(500); const c = performance.getEntriesByType('resource').length; if (c === n) stable++; else { stable = 0; n = c; } }
  mo.disconnect();
  const api = performance.getEntriesByType('resource').slice(before).filter((r) => /api\.patina\.cloud|supabase\.co|127\.0\.0\.1:54321/.test(r.name) && !/realtime/.test(r.name));
  const s = [...api].sort((a, b) => a.startTime - b.startTime); const d = [];
  s.forEach((r, i) => { let m = 0; for (let j = 0; j < i; j++) if (s[j].responseEnd <= r.startTime) m = Math.max(m, d[j]); d.push(m + 1); });
  return { label, ok: !!ok, path: location.pathname.replace(/[0-9a-f-]{36}/g, '[id]'), firstMutation: first === null ? null : Math.round(first), lastMutation: Math.round(last), api: api.length, authUser: api.filter((r) => /auth\/v1\/user/.test(r.name)).length, apiLastEnd: api.length ? Math.round(Math.max(...api.map((r) => r.responseEnd)) - t0) : null, depth: Math.max(0, ...d) };
}
const click = (sel) => () => { const a = document.querySelector(sel); if (a) a.click(); return a; };
const out = [];
out.push(await measure('P2 desk->doc', click('a[href^="/doc/"]')));
const docHref = location.pathname;
out.push(await measure('P3 doc->pieces', click(`a[href="${docHref}/pieces"]`)));
out.push(await measure('P4 ->people', click('a[href="/people"]')));
out.push(await measure('P10 ->desk', click('a[href="/desk"]')));
JSON.stringify(out);
