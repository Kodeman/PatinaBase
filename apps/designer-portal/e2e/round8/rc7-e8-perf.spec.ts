import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BrowserContext, Page, Request } from '@playwright/test';
import { test, expect } from '../fixtures/auth';
import { scrollTo, settle } from '../helpers/lens';

/**
 * RC-7 E8 — X07 performance readings on the F01 fixture (80 lines, 3 rooms;
 * the representative job size the round-8 docs use), chromium 1440 and
 * webkit-iphone 390.
 *
 * - Settled-scroll CLS: after the page settles (arrival ready, network quiet,
 *   1 s idle), the layout-shift sum is reset and the whole document is
 *   scrolled top → bottom → top, paced and then flung (see scrollCls); every
 *   layout-shift entry without recent input is summed (a plain sum, not
 *   session windows). layout-shift is Chromium-only: WebKit reports null.
 * - Load: LCP (largest-contentful-paint, last entry before input) and the
 *   request count of a cold navigation, split by origin.
 * - Request capture (R3b: "request capture broken in recorded scale run"):
 *   counted on the BrowserContext, not the Page, and matched on host+port
 *   against both 127.0.0.1 and localhost spellings of the API, then
 *   cross-checked against the page's own Resource Timing entries.
 * Numbers only: ACCEPTANCE.md X07 proposes CLS ≤0.1 and LCP ≤2.5 s on an
 * agreed representative profile; this is unthrottled localhost next dev.
 */

const JOB = 'f0180000-0000-4000-8000-000000000010';
const OUT = process.env.PLAYWRIGHT_OUTPUT_DIR ?? path.join(__dirname, '../../test-results/round8');
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
const apiHosts = new Set([`127.0.0.1:${api.port}`, `localhost:${api.port}`]);
const readings: Record<string, unknown> = {};

const VITALS = () => {
  const w = window as unknown as { __e8: { cls: number; shifts: Array<{ t: number; v: number; arrival: string | null; sources: string[] }>; lcp: number | null; lcpElement: string | null; supported: readonly string[] } };
  w.__e8 = { cls: 0, shifts: [], lcp: null, lcpElement: null, supported: PerformanceObserver.supportedEntryTypes };
  if (w.__e8.supported.includes('layout-shift')) {
    new PerformanceObserver((list) => list.getEntries().forEach((entry: any) => {
      if (entry.hadRecentInput) return;
      w.__e8.cls += entry.value;
      // arrival: the arrival class on <html> when the entry is delivered (arr-pre veils [data-arrival] at opacity 0).
      w.__e8.shifts.push({ t: Math.round(entry.startTime), v: entry.value, arrival: (document.documentElement.className.match(/\barr-(?:pre|on|press)\b/) ?? [null])[0],
        sources: (entry.sources ?? []).slice(0, 3).map((s: any) => {
          const n = s.node as Element | null;
          return n && n.nodeType === 1 ? `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${[...n.attributes].filter((a) => a.name.startsWith('data-')).slice(0, 2).map((a) => `[${a.name}]`).join('')}` : String(n?.nodeName ?? 'unknown');
        }) });
    })).observe({ type: 'layout-shift', buffered: true });
  }
  if (w.__e8.supported.includes('largest-contentful-paint')) {
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1) as any;
      if (!last) return;
      w.__e8.lcp = last.startTime;
      const n = last.element as Element | null;
      w.__e8.lcpElement = n ? `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${n.className && typeof n.className === 'string' ? `.${n.className.split(' ').slice(0, 2).join('.')}` : ''}` : null;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  }
};

function captureRequests(context: BrowserContext) {
  const requests: Request[] = [];
  const failed: Request[] = [];
  const onRequest = (request: Request) => requests.push(request);
  const onFailed = (request: Request) => failed.push(request);
  context.on('request', onRequest);
  context.on('requestfailed', onFailed);
  return {
    reset() { requests.length = 0; failed.length = 0; },
    stop() { context.off('request', onRequest); context.off('requestfailed', onFailed); },
    summary() {
      const byOrigin: Record<string, number> = {};
      const apiPaths: Record<string, number> = {};
      for (const request of requests) {
        const url = new URL(request.url());
        if (!/^https?:$/.test(url.protocol)) continue;
        const key = apiHosts.has(url.host) ? 'supabase-api' : url.host;
        byOrigin[key] = (byOrigin[key] ?? 0) + 1;
        if (key === 'supabase-api') {
          const name = `${request.method()} ${url.pathname.replace(/[0-9a-f-]{36}/g, ':id')}`;
          apiPaths[name] = (apiPaths[name] ?? 0) + 1;
        }
      }
      return { total: Object.values(byOrigin).reduce((a, b) => a + b, 0), byOrigin, apiPaths, failed: failed.length };
    },
  };
}

async function quiet(page: Page) {
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);
}

const resetShifts = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __e8: { cls: number; shifts: unknown[] } };
  w.__e8.cls = 0;
  w.__e8.shifts = [];
});

const readShifts = async (page: Page) => {
  const vitals = await page.evaluate(() => (window as unknown as { __e8: { cls: number; shifts: Array<{ t: number; v: number; sources: string[] }>; supported: readonly string[] } }).__e8);
  // No layout-shift entry type (WebKit): no reading, never a zero.
  if (!vitals.supported.includes('layout-shift')) return { cls: null, shiftCount: null, shifts: [] };
  return { cls: Math.round(vitals.cls * 10_000) / 10_000, shiftCount: vitals.shifts.length, shifts: vitals.shifts.slice(0, 10) };
};

/**
 * Two scrolls through the whole document, each from a settled top, summing
 * every layout-shift entry without recent input:
 * - `paced`: the contract's reader pace (e2e/document/lens-cls.spec.ts):
 *   240px steps, each settled. On the job paper the settle is the lens's own
 *   (helpers/lens.ts settle: data-lens-settled + data-lens-resolved); 240px
 *   stays inside LENS_LOOKAHEAD_PX (288), the distance the lens promotes ahead.
 * - `fling`: 90%-of-viewport jumps with ~170ms between them, larger than the
 *   lookahead, so stops can land in the frame before they open. Reported, not
 *   the contract.
 */
async function scrollCls(page: Page, surface: 'studio' | 'job', mode: 'paced' | 'fling') {
  const lens = surface === 'job';
  await page.evaluate(() => window.scrollTo(0, 0));
  if (lens) await settle(page); else await page.waitForTimeout(500);
  await resetShifts(page);
  const docHeight = () => page.evaluate(() => document.documentElement.scrollHeight);
  const startHeight = await docHeight();
  const step = mode === 'paced' ? 240 : await page.evaluate(() => Math.floor(innerHeight * 0.9));
  let steps = 0;
  // The paper grows as stops open, so the bottom is re-read at every step.
  for (let y = step; y < (await docHeight()) + step; y += step) {
    steps++;
    if (mode === 'paced' && lens) await scrollTo(page, y);
    else await page.evaluate(async (to) => {
      window.scrollTo(0, to);
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 150)));
    }, y);
  }
  if (lens) await scrollTo(page, 0); else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  return { mode, step, steps, startHeight, height: await docHeight(), ...await readShifts(page) };
}

for (const surface of ['studio', 'job'] as const) {
  test(`X07 ${surface}: cold load LCP + requests, then settled-scroll CLS`, async ({ authenticatedPage: page }, info) => {
    test.setTimeout(240_000);
    const route = surface === 'studio' ? '/desk' : `/doc/${JOB}`;
    const ready = surface === 'studio'
      ? page.locator('[data-studio="round8"][data-arrival-ready]')
      : page.locator('[data-document-shell][data-arrival-ready]');
    // Warm the dev compile so the measured navigation is not a first compile.
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect(ready).toHaveCount(1, { timeout: 60_000 });
    await page.goto('about:blank');
    await page.addInitScript(VITALS);
    const capture = captureRequests(page.context());
    // Diagnostic for the R3b capture defect: the old counter listened on the Page.
    let pageLevelApi = 0;
    const onPageRequest = (request: Request) => { if (apiHosts.has(new URL(request.url()).host)) pageLevelApi++; };
    page.on('request', onPageRequest);
    await page.evaluate(() => performance.clearResourceTimings());

    const started = Date.now();
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await expect(ready).toHaveCount(1, { timeout: 60_000 });
    await expect(page.locator('html')).not.toHaveClass(/\barr-(?:pre|on|press)\b/, { timeout: 30_000 });
    const readyMs = Date.now() - started;
    await quiet(page);
    const load = await page.evaluate(() => {
      const w = window as unknown as { __e8: { cls: number; shifts: Array<{ t: number; v: number; sources: string[] }>; lcp: number | null; lcpElement: string | null; supported: readonly string[] } };
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
      return {
        lcpMs: w.__e8.lcp === null ? null : Math.round(w.__e8.lcp),
        lcpElement: w.__e8.lcpElement,
        loadClsBeforeScroll: w.__e8.supported.includes('layout-shift') ? Math.round(w.__e8.cls * 10_000) / 10_000 : null,
        loadShiftCount: w.__e8.shifts.length,
        loadShiftsLargest: [...w.__e8.shifts].sort((a, b) => b.v - a.v).slice(0, 8)
          .map((shift) => ({ ...shift, v: Math.round(shift.v * 10_000) / 10_000 })),
        supported: w.__e8.supported.filter((t) => ['layout-shift', 'largest-contentful-paint'].includes(t)),
        resourceTimingCount: resources.length,
        resourceTimingByHost: resources.reduce<Record<string, number>>((acc, r) => {
          const host = new URL(r.name).host; acc[host] = (acc[host] ?? 0) + 1; return acc;
        }, {}),
        domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        transferKB: Math.round(resources.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024),
        nodes: document.querySelectorAll('*').length,
      };
    });
    const requests = { ...capture.summary(), pageLevelApi };
    capture.stop();
    page.off('request', onPageRequest);
    const scroll = await scrollCls(page, surface, 'paced');
    const fling = await scrollCls(page, surface, 'fling');
    const reading = {
      surface, route, browser: info.project.name, viewport: page.viewportSize(), readyMs, ...load, requests, scroll, fling,
      profile: `unthrottled localhost; next dev --webpack; ${os.cpus()[0]?.model}; F01 (80 lines, 3 rooms)${surface === 'studio' ? ' + rc7-e8 cover board' : ''}`,
    };
    readings[`${info.project.name} ${surface}`] = reading;
    console.log('[rc7-e8 perf]', JSON.stringify({ surface, browser: info.project.name, lcpMs: load.lcpMs, readyMs,
      requests: requests.total, api: requests.byOrigin['supabase-api'] ?? 0, rt: load.resourceTimingCount,
      loadCls: load.loadClsBeforeScroll, pacedCls: scroll.cls, pacedShifts: scroll.shiftCount, flingCls: fling.cls, flingShifts: fling.shiftCount, height: scroll.height }));
    // The capture is not empty and agrees with the page's own Resource Timing on API reads.
    expect(requests.byOrigin['supabase-api'] ?? 0, 'API requests captured').toBeGreaterThan(0);
    const rtApi = Object.entries(load.resourceTimingByHost).filter(([host]) => apiHosts.has(host)).reduce((a, [, n]) => a + n, 0);
    expect(Math.abs((requests.byOrigin['supabase-api'] ?? 0) - rtApi), 'context capture ≈ Resource Timing for the API').toBeLessThanOrEqual(Math.max(3, rtApi * 0.1));
    expect(scroll.steps, 'the full document was scrolled').toBeGreaterThan(1);
  });
}

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `rc7-e8-perf-${test.info().project.name}.json`);
  let prior = {};
  try { prior = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first worker */ }
  writeFileSync(file, JSON.stringify({ ...prior, ...readings }, null, 2));
});
