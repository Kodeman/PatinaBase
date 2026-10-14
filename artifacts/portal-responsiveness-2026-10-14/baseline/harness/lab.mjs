// SQ-952 baseline lab harness (throwaway; lives outside src/).
// Drives the locally built designer portal (`next start`) with Playwright's
// Chromium under CDP throttling and writes one JSON row per run.
//
//   node lab.mjs explore             # unthrottled DOM survey of each route
//   node lab.mjs run <scenario> <n> [viewport]   # P1..P6, P10; viewport 1440|390
//   node lab.mjs shots <scenario>    # 0/200/1000 ms + settled screenshots
//
// Env: BASE (default http://localhost:3110), OUT (data dir), SHOTS (shots dir),
//      STATE (storageState path), DOC (doc id).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const require = createRequire(path.join(root, 'apps/designer-portal/package.json'));
const { chromium } = require('@playwright/test');

const BASE = process.env.BASE || 'http://localhost:3110';
const OUT = process.env.OUT || path.resolve(here, '../data');
const SHOTS = process.env.SHOTS || path.resolve(here, '../shots');
const STATE = process.env.STATE;
const DOC = process.env.DOC || 'b0000000-0000-0000-0000-00000000c0d1';
const EMAIL = 'designer@patina.dev';
const PASSWORD = 'password123';

// Chrome DevTools "Fast 4G" preset (latency 60 ms x 2.75, 9 Mbps down x 0.9, 1.5 Mbps up x 0.9).
const FAST_4G = { offline: false, latency: 165, downloadThroughput: (9e6 / 8) * 0.9, uploadThroughput: (1.5e6 / 8) * 0.9 };
const CPU = 4;
const VIEW = { 1440: { width: 1440, height: 900 }, 390: { width: 390, height: 844 } };

// "path-regex||css": content counts only when the URL path matches and the css is visible.
const SEL = {
  desk: '^/desk||a[href^="/doc/"]',
  doc: '^/doc/[^/]+$||h1',
  pieces: '/pieces$||h2',
  people: '^/people||main li',
  library: '^/library||a[href^="/library/"]',
  search: '^/library||[data-library-exact-results] li',
};

// In-page instrumentation. Marks are absolute epoch ms (timeOrigin + now) so a
// click on one document and the content on the next compare directly.
const INIT = `(() => {
  try { performance.setResourceTimingBufferSize(5000); } catch {}
  const M = window.__sq = { marks: {}, mut: 0, lastMut: 0, firstMut: null, sel: window.__sqSel || null, lt: [], lcp: null };
  const ep = () => performance.timeOrigin + performance.now();
  const vis = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.getBoundingClientRect().height > 0;
  const anyVis = (sel) => { const i = sel.indexOf('||'); if (i >= 0) { if (!new RegExp(sel.slice(0, i)).test(location.pathname)) return false; sel = sel.slice(i + 2); } for (const el of document.querySelectorAll(sel)) if (vis(el)) return true; return false; };
  const PH = '[aria-busy="true"], .animate-pulse, .strata-sweep, [data-skeleton]';
  const busy = () => anyVis(PH) || /Picking up/.test(document.body.innerText || '');
  const mark = (k) => { if (M.marks[k] == null) { M.marks[k] = ep(); try { window.__sqReport(k, M.marks[k]); } catch {} } };
  M.reset = (sel) => { M.marks = {}; M.mut = 0; M.firstMut = null; M.sel = sel; M.t0 = ep(); };
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => M.lt.push([performance.timeOrigin + e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { const e = l.getEntries().pop(); if (e) M.lcp = performance.timeOrigin + e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  setInterval(() => {
    if (!document.body) return;
    const cls = document.documentElement.classList;
    const held = cls.contains('arr-pre') || cls.contains('arr-on');
    if ((document.body.innerText || '').trim().length > 0) mark('anyText');
    if (busy()) mark('placeholder');
    if (M.sel && anyVis(M.sel)) { mark('content'); if (!held) mark('usable'); }
    if (M.marks.usable != null && !busy()) mark('noBusy');
  }, 50);
  const mo = new MutationObserver(() => { M.mut++; M.lastMut = ep(); if (M.firstMut == null) { M.firstMut = M.lastMut; try { window.__sqReport('firstMut', M.firstMut); } catch {} } });
  const start = () => mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isApi = (u) => u.includes('127.0.0.1:54321') && !u.includes('/realtime/');

async function newPage(ctx, { throttle = true } = {}) {
  const page = await ctx.newPage();
  const rec = { marks: {}, reqs: [] };
  await page.exposeBinding('__sqReport', (_s, k, t) => { if (rec.marks[k] == null || k === 'firstMut') rec.marks[k] = rec.marks[k] ?? t; });
  page.on('request', (r) => { const q = { url: r.url(), start: Date.now(), end: null, method: r.method() }; rec.reqs.push(q); r.__q = q; });
  page.on('requestfinished', (r) => { if (r.__q) r.__q.end = Date.now(); });
  page.on('requestfailed', (r) => { if (r.__q) r.__q.end = Date.now(); });
  if (throttle) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', FAST_4G);
  }
  return { page, rec };
}

function setSel(page, sel) { return page.addInitScript(`window.__sqSel = ${JSON.stringify(sel)};`).then(() => page.addInitScript(INIT)); }

async function reset(page, rec, sel) {
  rec.marks = {};
  await page.evaluate((s) => window.__sq.reset(s), sel);
  rec.t0 = Date.now();
}

async function settle(page, rec, { need = 'usable', cap = 40000, quiet = 1500 } = {}) {
  const t0 = rec.t0;
  while (Date.now() - t0 < cap) {
    await sleep(250);
    let lastMut = 0;
    try { lastMut = await page.evaluate(() => window.__sq && window.__sq.lastMut); } catch { continue; }
    const inflight = rec.reqs.filter((q) => q.start >= t0 && q.end == null && !q.url.startsWith('data:')).length;
    const lastNet = Math.max(0, ...rec.reqs.filter((q) => q.start >= t0).map((q) => q.end || Date.now()));
    const now = Date.now();
    if ((need == null || rec.marks[need] != null) && inflight === 0 && now - lastNet > quiet && now - lastMut > quiet) return { settled: Math.max(lastMut, lastNet), capped: false };
  }
  return { settled: Date.now(), capped: true };
}

function depthOf(reqs) {
  const s = [...reqs].sort((a, b) => a.start - b.start); const d = [];
  s.forEach((r, i) => { let m = 0; for (let j = 0; j < i; j++) if (s[j].end != null && s[j].end <= r.start) m = Math.max(m, d[j]); d.push(m + 1); });
  return Math.max(0, ...d);
}

async function collect(page, rec, t0, settledAt, extra = {}) {
  const ins = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const p = Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, performance.timeOrigin + e.startTime]));
    return { origin: performance.timeOrigin, ttfb: n ? n.responseStart - n.requestStart : null, fp: p['first-paint'] ?? null, fcp: p['first-contentful-paint'] ?? null, lcp: window.__sq.lcp, mut: window.__sq.mut, lt: window.__sq.lt, path: location.pathname };
  });
  const rel = (t) => (t == null ? null : Math.round(t - t0));
  const win = rec.reqs.filter((q) => q.start >= t0 - 5 && q.start <= settledAt);
  const api = win.filter((q) => isApi(q.url));
  const lt = ins.lt.filter(([s]) => s >= t0 - 5 && s <= settledAt);
  return {
    ...extra,
    path: ins.path.replace(/[0-9a-f-]{36}/g, '[id]'),
    ttfb: ins.ttfb == null ? null : Math.round(ins.ttfb),
    firstPaint: rel(ins.fp), fcp: rel(ins.fcp), lcp: rel(ins.lcp),
    firstChange: rel(rec.marks.firstMut), placeholder: rel(rec.marks.placeholder), anyText: rel(rec.marks.anyText),
    content: rel(rec.marks.content), usable: rel(rec.marks.usable), noBusy: rel(rec.marks.noBusy), settled: rel(settledAt),
    requests: win.length, apiRequests: api.length,
    authUser: api.filter((q) => q.url.includes('/auth/v1/user')).length,
    rpc: api.filter((q) => q.url.includes('/rest/v1/rpc/')).length,
    depth: depthOf(api), domMutationBatches: ins.mut,
    longTasks: lt.length, longTaskMs: Math.round(lt.reduce((s, [, d]) => s + d, 0)),
  };
}

async function signIn(page) {
  await page.goto(`${BASE}/auth/signin`, { waitUntil: 'domcontentloaded' });
  const toggle = page.getByRole('button', { name: /Use a password instead/ });
  await toggle.waitFor({ state: 'visible', timeout: 60000 });
  await page.waitForFunction(() => { const b = [...document.querySelectorAll('button')].find((x) => /Use a password instead/.test(x.textContent)); return b && !b.disabled && getComputedStyle(document.body).pointerEvents !== 'none'; }, null, { timeout: 60000 });
  await toggle.click();
  await page.locator('#portal-auth-email').fill(EMAIL);
  await page.locator('#portal-auth-password').fill(PASSWORD);
}

async function hardNav(ctx, url, sel, opts = {}) {
  const { page, rec } = await newPage(ctx, opts);
  await setSel(page, sel);
  rec.t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  const origin = await page.evaluate(() => performance.timeOrigin).catch(() => rec.t0);
  rec.t0 = origin;
  const s = await settle(page, rec);
  return { page, rec, row: await collect(page, rec, origin, s.settled, { capped: s.capped }) };
}

async function clickAndMeasure(page, rec, sel, act) {
  await reset(page, rec, sel);
  await act();
  const s = await settle(page, rec, { need: sel ? 'usable' : null });
  const r = await collect(page, rec, rec.t0, s.settled, { capped: s.capped, spa: true });
  return { ...r, ttfb: null, firstPaint: null, fcp: null, lcp: null, anyText: null };
}

const byText = (page, re) => page.locator('button, a').filter({ hasText: re }).first();

async function scenario(browser, name, vp) {
  const viewport = VIEW[vp];
  if (name === 'P1') {
    const ctx = await browser.newContext({ viewport });
    const { page, rec } = await newPage(ctx);
    await setSel(page, SEL.desk);
    rec.t0 = Date.now();
    await page.goto(`${BASE}/auth/signin`, { waitUntil: 'commit' });
    const signinOrigin = await page.evaluate(() => performance.timeOrigin);
    await signIn(page);
    const signinPage = await collect(page, rec, signinOrigin, Date.now());
    rec.reqs.length = 0;
    await reset(page, rec, SEL.desk);
    await page.locator('#portal-auth-password-panel button[type="submit"]').click();
    const s = await settle(page, rec, { cap: 60000 });
    const row = await collect(page, rec, rec.t0, s.settled, { capped: s.capped });
    await ctx.close();
    return { ...row, signinTtfb: signinPage.ttfb, signinFcp: signinPage.fcp, signinArrivalToClickable: signinPage.settled };
  }
  const ctx = await browser.newContext({ viewport, storageState: STATE });
  try {
    if (name === 'P2') {
      const { page, rec } = await hardNav(ctx, `${BASE}/desk`, SEL.desk);
      const link = page.locator(`a[href="/doc/${DOC}"]`).first();
      const target = (await link.count()) ? link : page.locator('a[href^="/doc/"]').first();
      return await clickAndMeasure(page, rec, SEL.doc, () => target.click());
    }
    if (name === 'P1hard') return (await hardNav(ctx, `${BASE}/desk`, SEL.desk)).row;
    if (name === 'P2hard') return (await hardNav(ctx, `${BASE}/doc/${DOC}`, SEL.doc)).row;
    if (name === 'P3') {
      const { page, rec } = await hardNav(ctx, `${BASE}/doc/${DOC}`, SEL.doc);
      const stop = byText(page, /^Pieces|Build room|Build the item list/i);
      if (await stop.count()) return { via: 'rail', ...(await clickAndMeasure(page, rec, SEL.pieces, () => stop.click())) };
      return { via: 'hard', ...(await hardNav(ctx, `${BASE}/doc/${DOC}/pieces`, SEL.pieces)).row };
    }
    if (name === 'P3hard') return (await hardNav(ctx, `${BASE}/doc/${DOC}/pieces`, SEL.pieces)).row;
    if (name === 'P4') {
      const { page, rec } = await hardNav(ctx, `${BASE}/doc/${DOC}`, SEL.doc);
      return await clickAndMeasure(page, rec, SEL.people, () => byText(page, /Studio contacts/).click());
    }
    if (name === 'P5') {
      const { page, rec } = await hardNav(ctx, `${BASE}/people`, SEL.people);
      const nav = await clickAndMeasure(page, rec, SEL.library, () => byText(page, /Resource library/).click());
      const search = await clickAndMeasure(page, rec, SEL.search, () => page.locator('input[data-library-omnibox]').fill('chair'));
      return { ...nav, search };
    }
    if (name === 'P10') {
      const { page, rec } = await hardNav(ctx, `${BASE}/doc/${DOC}`, SEL.doc);
      return await clickAndMeasure(page, rec, SEL.desk, () => page.locator('a[href="/desk"]').first().click());
    }
    if (name === 'P6') {
      // Tick then untick the same task (reversible; local Supabase only).
      const { page, rec } = await hardNav(ctx, `${BASE}/doc/${DOC}`, SEL.doc);
      const task = page.locator('ul.px-1\\.5 > li.border-dashed > button.grid').first();
      if (!(await task.count())) return { error: 'no task row on this doc' };
      await task.scrollIntoViewIfNeeded();
      const tick = await clickAndMeasure(page, rec, null, () => task.click());
      const untick = await clickAndMeasure(page, rec, null, () => task.click());
      return { tick, untick };
    }
    throw new Error(`unknown scenario ${name}`);
  } finally { await ctx.close(); }
}

async function explore(browser) {
  const ctx = await browser.newContext({ viewport: VIEW[1440] });
  const { page } = await newPage(ctx, { throttle: false });
  await page.addInitScript(INIT);
  await signIn(page);
  await page.locator('#portal-auth-password-panel button[type="submit"]').click();
  await page.waitForURL(/\/desk/, { timeout: 60000 });
  await sleep(8000);
  await ctx.storageState({ path: STATE });
  const out = {};
  for (const p of ['/desk', `/doc/${DOC}`, `/doc/${DOC}/pieces`, '/people', '/library']) {
    await page.goto(`${BASE}${p}`); await sleep(9000);
    out[p] = await page.evaluate(() => ({
      cls: document.documentElement.className.slice(0, 80),
      arrival: document.querySelectorAll('[data-arrival]').length, held: document.querySelectorAll('[data-arrival-held]').length,
      h1: [...document.querySelectorAll('h1,h2')].slice(0, 4).map((h) => h.tagName + ':' + h.textContent.trim().slice(0, 40)),
      links: [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href').replace(/[0-9a-f-]{36}/g, '[id]')))].slice(0, 25),
      buttons: [...document.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.textContent).trim().slice(0, 30)).slice(0, 45),
      busy: document.querySelectorAll('[aria-busy="true"], .animate-pulse, .strata-sweep').length,
      tasks: document.querySelectorAll('li.border-dashed > button').length,
      mainLi: document.querySelectorAll('main li').length, mainImg: document.querySelectorAll('main img').length,
    }));
  }
  await ctx.close();
  return out;
}

async function shots(browser, name) {
  const vp = VIEW[1440];
  const ctx = await browser.newContext({ viewport: vp, storageState: name === 'P1' ? undefined : STATE });
  const { page, rec } = await newPage(ctx);
  await page.addInitScript(INIT);
  const act = {
    P1: async () => { await signIn(page); return () => page.locator('#portal-auth-password-panel button[type="submit"]').click(); },
    P2: async () => { await page.goto(`${BASE}/desk`); await sleep(12000); return () => page.locator('a[href^="/doc/"]').first().click(); },
    P3: async () => { await page.goto(`${BASE}/doc/${DOC}`); await sleep(15000); return () => page.goto(`${BASE}/doc/${DOC}/pieces`, { waitUntil: 'commit' }); },
    P4: async () => { await page.goto(`${BASE}/doc/${DOC}`); await sleep(15000); return () => byText(page, /Studio contacts/).click(); },
    P5: async () => { await page.goto(`${BASE}/library`); await sleep(12000); return () => page.locator('input[data-library-omnibox]').fill('chair'); },
  }[name];
  if (name === 'P1') await page.goto(`${BASE}/auth/signin`);
  const go = await act();
  const t0 = Date.now();
  const taken = [];
  const snap = async (label) => { const t = Date.now() - t0; const f = path.join(SHOTS, `${name}-${label}.png`); await page.screenshot({ path: f }); taken.push({ label, requestedAt: label, capturedAtMs: t, file: path.basename(f) }); };
  const p = go();
  await snap('0ms');
  await sleep(Math.max(0, 200 - (Date.now() - t0))); await snap('200ms');
  await sleep(Math.max(0, 1000 - (Date.now() - t0))); await snap('1000ms');
  await p.catch(() => {});
  rec.t0 = t0; await settle(page, rec, { need: null, cap: 30000 });
  await snap('settled');
  await ctx.close();
  return taken;
}

const [mode, a, b, c] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
try {
  if (mode === 'explore') console.log(JSON.stringify(await explore(browser), null, 1));
  else if (mode === 'run') {
    const n = Number(b || 3), vp = c || '1440';
    const file = path.join(OUT, `local-${a}-${vp}.json`);
    const rows = [];
    for (let i = 1; i <= n; i++) {
      try { rows.push({ scenario: a, viewport: vp, run: i, ...(await scenario(browser, a, vp)) }); }
      catch (e) { rows.push({ scenario: a, viewport: vp, run: i, error: String(e.message || e).slice(0, 1500) }); }
      console.log(JSON.stringify(rows[rows.length - 1]));
    }
    fs.writeFileSync(file, JSON.stringify({ throttling: { cpu: CPU, network: FAST_4G }, base: BASE, rows }, null, 1));
  } else if (mode === 'shots') console.log(JSON.stringify(await shots(browser, a)));
  else if (mode === 'waterfall') {
    // Throttled hard load; one line per request (path only, query stripped), offsets from navigation start.
    const ctx = await browser.newContext({ viewport: VIEW[1440], storageState: STATE });
    const route = a === 'doc' ? `/doc/${DOC}` : `/${a}`;
    const { rec, row } = await hardNav(ctx, `${BASE}${route}`, a === 'doc' ? SEL.doc : SEL[a] || SEL.desk);
    const t0 = rec.t0;
    const reqs = rec.reqs.filter((q) => !q.url.startsWith('data:')).map((q) => ({ m: q.method, u: q.url.replace(BASE, '').replace('http://127.0.0.1:54321', 'SB').replace(/[0-9a-f-]{36}/g, '[id]').split('?')[0], s: q.start - t0, e: q.end == null ? null : q.end - t0 })).sort((x, y) => x.s - y.s);
    await ctx.close();
    console.log(JSON.stringify({ route: route.replace(DOC, '[id]'), throttling: { cpu: CPU, network: FAST_4G }, summary: row, requests: reqs }, null, 0));
  }
  else if (mode === 'jsweight') {
    // Per-route client JS actually fetched by a signed-in hard load (next start gzips responses).
    const ctx = await browser.newContext({ viewport: VIEW[1440], storageState: STATE });
    const out = {};
    for (const r of ['/auth/signin', '/desk', `/doc/${DOC}`, `/doc/${DOC}/pieces`, '/people', '/library']) {
      const c2 = r === '/auth/signin' ? await browser.newContext({ viewport: VIEW[1440] }) : ctx;
      const page = await c2.newPage();
      await page.goto(`${BASE}${r}`); await sleep(10000);
      out[r.replace(DOC, '[id]')] = await page.evaluate(() => {
        const js = performance.getEntriesByType('resource').filter((e) => /\.js(\?|$)/.test(e.name));
        const kb = (n) => Math.round(n / 102.4) / 10;
        return { files: js.length, transferGzipKB: kb(js.reduce((s, e) => s + e.encodedBodySize, 0)), decodedKB: kb(js.reduce((s, e) => s + e.decodedBodySize, 0)), top: js.sort((a, b) => b.encodedBodySize - a.encodedBodySize).slice(0, 6).map((e) => [e.name.replace(/.*\/_next\/static\/chunks\//, ''), kb(e.encodedBodySize)]) };
      });
      await page.close(); if (c2 !== ctx) await c2.close();
    }
    await ctx.close();
    console.log(JSON.stringify(out, null, 1));
  }
  else if (mode === 'setup') {
    // One-time: dismiss the help-system welcome modal the way a returning designer already has.
    const ctx = await browser.newContext({ viewport: VIEW[1440], storageState: STATE });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/desk`); await sleep(10000);
    const skip = page.getByRole('button', { name: /Skip for now/ });
    const had = await skip.count();
    if (had) { await skip.click(); await sleep(3000); }
    await page.reload(); await sleep(10000);
    console.log(JSON.stringify({ had, stillShown: await page.getByRole('button', { name: /Skip for now/ }).count() }));
    await ctx.storageState({ path: STATE });
    await ctx.close();
  }
} finally { await browser.close(); }
