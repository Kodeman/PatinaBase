// SQ-952 baseline lab harness (throwaway; lives outside src/).
// Drives the locally built designer portal (`next start`) with Playwright's
// Chromium under CDP throttling and writes one JSON row per run.
//
//   node lab.mjs explore             # unthrottled DOM survey of each route
//   node lab.mjs run <scenario> <n> [viewport]   # P1..P10 (+P1hard, P2hard, P3hard); viewport 1440|390
//                                                # P6-P9 write LOCAL fixtures (fixtures.mjs) and remove them
//   node lab.mjs shots <scenario>    # 0/200/1000 ms + settled screenshots
//
// Env: BASE (default http://localhost:3000; SQ-952 ran on :3110), OUT (data dir), SHOTS (shots dir),
//      STATE (storageState path), DOC (doc id for the read scenarios), BASE_COMMIT (recorded),
//      PGURL (local fixtures database, default 127.0.0.1:54322).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import * as fx from './fixtures.mjs';
const { withFixture } = fx;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../../..');
const require = createRequire(path.join(root, 'apps/designer-portal/package.json'));
const { chromium } = require('@playwright/test');

const BASE = process.env.BASE || 'http://localhost:3000';
const OUT = process.env.OUT || path.resolve(here, '../data');
const SHOTS = process.env.SHOTS || path.resolve(here, '../shots');
const STATE = process.env.STATE;
const DOC = process.env.DOC || 'b0000000-0000-0000-0000-00000000c0d1';
// The US-14 arrival declines under navigator.webdriver (lib/arrival/gate.ts:22) unless the tab
// carries its e2e opt-in, so SQ-952 and E1 never saw it play. ARRIVAL=1 (default) arms the opt-in
// (e2e/arrival/helpers.ts) so the lab sees the arrival a designer sees; ARRIVAL=0 reproduces SQ-952.
const ARRIVAL = process.env.ARRIVAL !== '0';
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
// SQ-966 (F17) adds, per measured window:
//   - React commits: a minimal DevTools global hook installed before React loads. React (prod
//     builds included) calls hook.onCommitFiberRoot once per commit, the same commits the React
//     Profiler reports. Counts only, no durations.
//   - CLS: the sum of layout-shift values without recent input, plus the shift count.
//   - Arrival marks: arrivalStart is the first moment <html> carries arr-pre/arr-on or a
//     [data-arrival-held] root exists; arrivalEnd is the first moment after that when none
//     remain; arrivalPlayed records whether arr-on (the run itself) was ever seen, and
//     arrivalPlayStart when it first appeared (start..playStart is the wait, playStart..end the play).
//   - Watches: named DOM conditions checked on every mutation batch and every 50 ms, so a
//     write's visible state (a tick label flip, "Sending") is timed at mutation precision.
const INIT = `(() => {
  try { performance.setResourceTimingBufferSize(5000); } catch {}
  const M = window.__sq = { marks: {}, mut: 0, lastMut: 0, firstMut: null, sel: window.__sqSel || null, lt: [], lcp: null,
    commits: 0, shifts: [], arrival: { start: null, end: null, played: false, playStart: null }, watches: [] };
  const ep = () => performance.timeOrigin + performance.now();
  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    let id = 0;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { renderers: new Map(), supportsFiber: true, isDisabled: false,
      inject(r) { id += 1; this.renderers.set(id, r); return id; },
      onCommitFiberRoot() { M.commits += 1; }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onScheduleFiberRoot() {},
      setStrictMode() {}, checkDCE() {} };
  }
  const vis = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.getBoundingClientRect().height > 0;
  const anyVis = (sel) => { const i = sel.indexOf('||'); if (i >= 0) { if (!new RegExp(sel.slice(0, i)).test(location.pathname)) return false; sel = sel.slice(i + 2); } for (const el of document.querySelectorAll(sel)) if (vis(el)) return true; return false; };
  const PH = '[aria-busy="true"], .animate-pulse, .strata-sweep, [data-skeleton]';
  const busy = () => anyVis(PH) || /Picking up/.test(document.body.innerText || '');
  const mark = (k) => { if (M.marks[k] == null) { M.marks[k] = ep(); try { window.__sqReport(k, M.marks[k]); } catch {} } };
  M.reset = (sel) => { M.marks = {}; M.mut = 0; M.firstMut = null; M.sel = sel; M.t0 = ep(); M.commits = 0; M.shifts = []; M.watches = [];
    M.arrival = { start: null, end: null, played: false, playStart: null }; };
  // A watch is { key, sel, text?, present } : present=true marks when an element matching sel
  // (and text, a regex source, if given) is visible; present=false marks when none exists.
  M.watch = (ws) => { M.watches = ws.map((w) => ({ ...w, re: w.text ? new RegExp(w.text) : null })); checkWatches(); };
  const hit = (w) => { for (const el of document.querySelectorAll(w.sel)) if (vis(el) && (!w.re || w.re.test(el.textContent || ''))) return true; return false; };
  const checkWatches = () => { for (const w of M.watches) if (M.marks[w.key] == null && (w.present ? hit(w) : !document.querySelector(w.sel))) mark(w.key); };
  const checkArrival = () => {
    const cls = document.documentElement.classList;
    const holding = cls.contains('arr-pre') || cls.contains('arr-on') || !!document.querySelector('[data-arrival-held]');
    if (cls.contains('arr-on')) { M.arrival.played = true; if (M.arrival.playStart == null) M.arrival.playStart = ep(); }
    if (holding && M.arrival.start == null) M.arrival.start = ep();
    if (!holding && M.arrival.start != null && M.arrival.end == null) M.arrival.end = ep();
  };
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => M.lt.push([performance.timeOrigin + e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { const e = l.getEntries().pop(); if (e) M.lcp = performance.timeOrigin + e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) M.shifts.push([performance.timeOrigin + e.startTime, e.value]); })).observe({ type: 'layout-shift', buffered: true }); } catch {}
  setInterval(() => {
    if (!document.body) return;
    const cls = document.documentElement.classList;
    const held = cls.contains('arr-pre') || cls.contains('arr-on');
    if ((document.body.innerText || '').trim().length > 0) mark('anyText');
    if (busy()) mark('placeholder');
    if (M.sel && anyVis(M.sel)) { mark('content'); if (!held) mark('usable'); }
    if (M.marks.usable != null && !busy()) mark('noBusy');
    checkWatches(); checkArrival();
  }, 50);
  // Watches run on every batch; the arrival check only when <html> itself changed (its class).
  const mo = new MutationObserver((recs) => { M.mut++; M.lastMut = ep(); if (M.firstMut == null) { M.firstMut = M.lastMut; try { window.__sqReport('firstMut', M.firstMut); } catch {} }
    if (M.watches.length) checkWatches(); if (recs.some((r) => r.target === document.documentElement)) checkArrival(); });
  const start = () => mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start);
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isApi = (u) => u.includes('127.0.0.1:54321') && !u.includes('/realtime/');

const isLocal = (u) => /^(data:|blob:|about:)/.test(u) || /^[a-z]+:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u);

// blockFunctions (P9 only): every Supabase edge-function request is aborted in the browser
// before it leaves, and recorded. This is how P9 reaches "Sending" without a send.
async function newPage(ctx, { throttle = true, blockFunctions = false } = {}) {
  const page = await ctx.newPage();
  const rec = { marks: {}, reqs: [], frames: [], blocked: [] };
  if (ARRIVAL) await page.addInitScript('try { window.sessionStorage.setItem("pl-arrive-e2e", "1"); } catch (e) {}');
  if (blockFunctions) await page.route(/\/functions\/v1\//, (route) => { rec.blocked.push({ url: route.request().url(), at: Date.now() }); return route.abort(); });
  page.on('websocket', (ws) => ws.on('framereceived', (f) => { const p = typeof f.payload === 'string' ? f.payload : ''; if (p.includes('postgres_changes')) rec.frames.push({ at: Date.now(), table: (p.match(/"table":"([^"]+)"/) || [])[1] || null }); }));
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
    const M = window.__sq;
    return { origin: performance.timeOrigin, ttfb: n ? n.responseStart - n.requestStart : null, fp: p['first-paint'] ?? null, fcp: p['first-contentful-paint'] ?? null, lcp: M.lcp, mut: M.mut, lt: M.lt,
      path: location.pathname, commits: M.commits, shifts: M.shifts, arrival: M.arrival };
  });
  const rel = (t) => (t == null ? null : Math.round(t - t0));
  const win = rec.reqs.filter((q) => q.start >= t0 - 5 && q.start <= settledAt);
  const api = win.filter((q) => isApi(q.url));
  const lt = ins.lt.filter(([s]) => s >= t0 - 5 && s <= settledAt);
  const shifts = ins.shifts.filter(([s]) => s >= t0 - 5 && s <= settledAt);
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
    reactCommits: ins.commits,
    cls: Math.round(shifts.reduce((s, [, v]) => s + v, 0) * 10000) / 10000, layoutShifts: shifts.length,
    arrivalStart: rel(ins.arrival.start), arrivalEnd: rel(ins.arrival.end), arrivalPlayStart: rel(ins.arrival.playStart), arrivalPlayed: ins.arrival.played,
    externalRequests: [...new Set(win.filter((q) => !isLocal(q.url)).map((q) => q.url.split('/').slice(0, 3).join('/')))],
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

// "GET project_tasks", "POST rpc:get_project_workflow": the request kinds E1 reported.
const kindOf = (q) => { const u = new URL(q.url); const m = u.pathname.match(/\/rest\/v1\/(rpc\/)?([^/]+)/); return m ? `${q.method} ${m[1] ? 'rpc:' : ''}${m[2]}` : `${q.method} ${u.pathname}`; };

// The write is the first API request in the window that matches; refetches are the API reads
// (not auth, not the write) that start at or after the write ends. Same split as E1's P6.
function writeStats(rec, t0, settledAt, isWrite) {
  const api = rec.reqs.filter((q) => q.start >= t0 - 5 && q.start <= settledAt && isApi(q.url)).sort((a, b) => a.start - b.start);
  const w = api.find(isWrite);
  const rel = (t) => (t == null ? null : Math.round(t - t0));
  if (!w) return { writeStart: null, writeEnd: null, refetchesAfterWrite: null, error: 'no write request seen' };
  const after = api.filter((q) => q !== w && w.end != null && q.start >= w.end && !q.url.includes('/auth/v1/') && !q.url.includes('/functions/v1/'));
  const byKind = {};
  for (const q of after) byKind[kindOf(q)] = (byKind[kindOf(q)] || 0) + 1;
  return {
    write: kindOf(w), writeStart: rel(w.start), writeEnd: rel(w.end),
    beforeWrite: api.filter((q) => q.start < w.start && !q.url.includes('/auth/v1/')).map((q) => ({ k: kindOf(q), s: rel(q.start), e: rel(q.end) })),
    refetchesAfterWrite: after.length,
    refetchesByKind: Object.fromEntries(Object.entries(byKind).sort((a, b) => b[1] - a[1])),
    realtimeEchoFrames: rec.frames.filter((f) => w.end != null && f.at >= w.end && f.at <= settledAt).map((f) => ({ table: f.table, at: rel(f.at) })),
    requestTimeline: after.map((q) => ({ k: kindOf(q), s: rel(q.start), e: rel(q.end) })),
  };
}

// One measured write: reset, arm the visible-state watches, act, settle on the primary watch.
async function writeAct(page, rec, { action, isWrite, watches, act }) {
  await reset(page, rec, null);
  await page.evaluate((ws) => window.__sq.watch(ws), watches);
  await act();
  const s = await settle(page, rec, { need: watches[0].key });
  const r = await collect(page, rec, rec.t0, s.settled, { capped: s.capped, spa: true });
  const marks = Object.fromEntries(watches.map((w) => [w.key, rec.marks[w.key] == null ? null : Math.round(rec.marks[w.key] - rec.t0)]));
  return { action, ...r, ttfb: null, firstPaint: null, fcp: null, lcp: null, anyText: null, ...marks, ...writeStats(rec, rec.t0, s.settled, isWrite) };
}

const isReq = (method, re) => (q) => q.method === method && re.test(new URL(q.url).pathname);

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
      // Tick then untick the fixture task in "The work" (coordination-work.tsx). E1's P6, promoted.
      return await withFixture('P6', async ({ title }) => {
        const { page, rec } = await hardNav(ctx, `${BASE}/doc/${fx.PROJECT}`, SEL.doc);
        const undone = `button[aria-label='Mark "${title}" done']`, done = `button[aria-label='Mark "${title}" not done']`;
        const task = page.locator(undone);
        if (!(await task.count())) throw new Error('P6: fixture task row not rendered');
        await task.scrollIntoViewIfNeeded();
        const isWrite = isReq('PATCH', /\/rest\/v1\/project_tasks$/);
        const tick = await writeAct(page, rec, { action: 'tick', isWrite, act: () => task.click(),
          watches: [{ key: 'tickShowsState', sel: done, present: true }] });
        const untick = await writeAct(page, rec, { action: 'untick', isWrite, act: () => page.locator(done).click(),
          watches: [{ key: 'tickShowsState', sel: undone, present: true }] });
        return { tick, untick };
      });
    }
    if (name === 'P7') {
      // Complete an in-progress phase (phase-advance-control.tsx) on fixtures.PHASE_PROJECT; restored after.
      return await withFixture('P7', async ({ phaseName, project }) => {
        const { page, rec } = await hardNav(ctx, `${BASE}/doc/${project}`, SEL.doc);
        const sel = `button[aria-label^="Complete ${phaseName} ("]`;
        const btn = page.locator(sel).first();
        if (!(await btn.count())) throw new Error('P7: complete-phase action not rendered');
        await btn.scrollIntoViewIfNeeded();
        return { act: await writeAct(page, rec, { action: 'complete-phase', isWrite: isReq('POST', /\/rpc\/advance_project_phase$/), act: () => btn.click(),
          watches: [{ key: 'phaseShowsState', sel, present: false }, { key: 'pendingShown', sel: '[aria-busy="true"]', text: 'Completing', present: true }] }) };
      });
    }
    if (name === 'P8') {
      // Add a room through the Pieces folio's inline form (ffe-section.tsx AddRoomInline); deleted after.
      return await withFixture('P8', async ({ room }) => {
        const { page, rec } = await hardNav(ctx, `${BASE}/doc/${fx.PROJECT}`, SEL.doc);
        await page.locator('button').filter({ hasText: /^Pieces/ }).first().click();
        const open = page.getByRole('button', { name: 'Add a room' }).first();
        await open.waitFor({ state: 'visible', timeout: 20000 });
        await open.scrollIntoViewIfNeeded();
        await open.click();
        await page.getByPlaceholder('Room name').fill(room);
        await sleep(1500);
        const add = page.getByRole('button', { name: 'Add', exact: true }).first();
        return { act: await writeAct(page, rec, { action: 'add-room', isWrite: isReq('POST', /\/rest\/v1\/project_rooms$/), act: () => add.click(),
          watches: [{ key: 'roomShown', sel: 'h3 button', text: room, present: true }] }) };
      });
    }
    if (name === 'P9') {
      // Edit the fixture outbound draft in the ready-to-send sheet and press Send, up to "Sending".
      // Every /functions/v1/ request is aborted in the browser (newPage blockFunctions), so the
      // send never leaves; teardown also asserts the row was never claimed or sent.
      return await withFixture('P9', async ({ draft }) => {
        const { page, rec } = await hardNav(ctx, `${BASE}/doc/${fx.PROJECT}`, SEL.doc, { blockFunctions: true });
        await page.locator('button').filter({ hasText: /^All open/ }).first().click();
        // The "One ready to send" line rides the drafted-unsent kind, whose act reads "Open the purchase order" here.
        const need = page.getByRole('dialog').getByRole('button', { name: /Open the purchase order|Review and send/i }).first();
        await need.waitFor({ state: 'visible', timeout: 20000 });
        await need.click();
        await page.locator(`[aria-controls="outbound-review-${draft}"]`).click();
        const body = page.locator(`#outbound-${draft}-body`);
        await body.fill('A perf fixture draft, edited by the harness. It is never sent.');
        await sleep(1500);
        const send = page.locator(`#outbound-review-${draft} button`).filter({ hasText: /^Send$/ }).first();
        const act = await writeAct(page, rec, { action: 'edit-then-send-until-sending', isWrite: isReq('POST', /\/rpc\/update_outbound_draft$/), act: () => send.click(),
          watches: [{ key: 'sendingShown', sel: `#outbound-review-${draft} [aria-busy="true"]`, text: 'Sending', present: true }] });
        const sends = rec.blocked.filter((b) => b.url.includes('outbound-draft-send'));
        if (rec.reqs.some((q) => q.url.includes('/functions/v1/') && q.end != null && !rec.blocked.some((b) => b.url === q.url))) throw new Error('P9: a function request was not blocked');
        return { act: { ...act, sendBlocked: sends.length, sendBlockedAt: sends[0] ? Math.round(sends[0].at - rec.t0) : null, functionsBlocked: rec.blocked.length } };
      });
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
      // Host 1-minute load average when the run starts (CDP throttling multiplies whatever the host
      // leaves free, so a contended host inflates every CPU-bound mark). Recorded, never gated.
      const hostLoad = Math.round(os.loadavg()[0] * 10) / 10;
      try { rows.push({ scenario: a, viewport: vp, run: i, hostLoad, ...(await scenario(browser, a, vp)) }); }
      catch (e) { rows.push({ scenario: a, viewport: vp, run: i, hostLoad, error: String(e.message || e).slice(0, 1500) }); }
      console.log(JSON.stringify(rows[rows.length - 1]));
    }
    fs.writeFileSync(file, JSON.stringify({ throttling: { cpu: CPU, network: FAST_4G }, base: BASE, commit: process.env.BASE_COMMIT || null, arrivalOptIn: ARRIVAL, doc: DOC, writeDoc: fx.PROJECT, rows }, null, 1));
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
