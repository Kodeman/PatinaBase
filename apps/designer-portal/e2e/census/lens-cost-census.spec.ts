/**
 * D-B33's long-paper cost census — owed at W6, PRINTED and never gated.
 *
 * When W4-fix deleted the `content-visibility: auto` block (OD-4), the
 * ARCHITECT's verdict carried a condition: W6 measures what the long paper
 * actually costs without it, on the production build, and prints the numbers
 * into I152. If the settled-scroll p95 frame exceeds 16.7ms the OD-4 candidate
 * reopens; below it, the deletion stands on evidence rather than on the
 * absence of a complaint.
 *
 * It lives in `e2e/census/`, NOT `e2e/document/`, on purpose: the ship-bar
 * basket is `e2e/document` and this file must never join it. It asserts
 * nothing about the product — every number is reported through
 * `console.log`, and the only `expect` is that the instrument itself ran.
 *
 * chromium only: `PerformanceObserver` with `long-animation-frame` /
 * `longtask`, and `performance.memory`, are Chromium APIs.
 */
import { test, expect } from '../fixtures/auth';
import { LONG_PAPER_ID } from '../document/lens-fixtures';
import { quiet, scrollTo, settle } from '../helpers/lens';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'the cost census reads long-animation-frame and performance.memory — Chromium only',
);

interface Census {
  domNodes: number;
  regionRoots: number;
  fullRoots: number;
  passedRoots: number;
  scrollHeight: number;
  /** Total blocking time attributed by LoAF/longtask (>50ms events only). */
  mainThreadMs: number;
  /** How many events those observers reported at all. Zero is a RESULT — no
   *  task or animation frame crossed 50ms — not a missing instrument. */
  longFrames: number;
  /** The real distribution: every rAF-to-rAF delta across the walk. This is
   *  what the 16.7ms line is about; the LoAF numbers above only see the tail. */
  p50FrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  maxFrameMs: number;
  frameSamples: number;
  heapUsedMB: number | null;
  heapLimitMB: number | null;
}

test('D-B33 · the long paper without content-visibility — DOM, main thread, p95 frame, heap', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/doc/${LONG_PAPER_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-document-shell]')).toBeVisible({ timeout: 30_000 });
  await settle(page);
  // The readiness fan-out is the initial load's tail, not the lens's cost
  // (D-B28). Measuring through it would price someone else's work.
  const network = await quiet(page);
  await scrollTo(page, 0);

  // Arm the instrument at the settled, quiet origin, then walk 30 steps.
  await page.evaluate(() => {
    const w = window as unknown as {
      __census?: {
        long: number[];
        blockingMs: number;
        frames: number[];
        stop?: () => void;
      };
    };
    w.__census = { long: [], blockingMs: 0, frames: [] };
    const record = (durationMs: number) => {
      w.__census!.long.push(durationMs);
      w.__census!.blockingMs += durationMs;
    };

    // EVERY frame, not only the ones an observer calls long. `longtask` and
    // `long-animation-frame` fire at 50ms; the line this census is measured
    // against is 16.7ms, so an empty long-frame set says nothing about p95.
    // rAF-to-rAF is the frame the reader actually waited for.
    let last = performance.now();
    let running = true;
    const tick = () => {
      if (!running) return;
      const now = performance.now();
      w.__census!.frames.push(now - last);
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(() => {
      last = performance.now();
      requestAnimationFrame(tick);
    });
    w.__census!.stop = () => {
      running = false;
    };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) record(entry.duration);
      }).observe({ type: 'long-animation-frame', buffered: false });
    } catch {
      /* not every Chromium build ships LoAF; the longtask arm below covers it */
    }
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) record(entry.duration);
      }).observe({ type: 'longtask', buffered: false });
    } catch {
      /* neither observer is available — the census prints 0 samples, honestly */
    }
  });

  // The same 30 settled steps `lens-cls.spec.ts` uses, so the two instruments
  // are reading the same journey.
  const STEP = 400;
  for (let i = 1; i <= 30; i += 1) await scrollTo(page, STEP * i);
  await settle(page);

  const census: Census = await page.evaluate(() => {
    const w = window as unknown as {
      __census: {
        long: number[];
        blockingMs: number;
        frames: number[];
        stop?: () => void;
      };
    };
    w.__census.stop?.();
    // The first frame after each `scrollTo` includes the test harness's own
    // round-trip, not the page's work; the walk is 30 steps and the sampler
    // runs continuously, so those are a small minority and are left in rather
    // than filtered by a rule this census would then have to defend.
    const frames = [...w.__census.frames].sort((a, b) => a - b);
    const at = (q: number) =>
      frames.length === 0 ? 0 : frames[Math.min(frames.length - 1, Math.floor(frames.length * q))]!;
    const roots = Array.from(
      document.querySelectorAll('[data-document-paper] [data-index-region]'),
    );
    const memory = (performance as unknown as {
      memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    }).memory;
    const mb = (n: number) => Math.round((n / (1024 * 1024)) * 10) / 10;
    return {
      domNodes: document.getElementsByTagName('*').length,
      regionRoots: roots.length,
      fullRoots: roots.filter((r) => r.getAttribute('data-density') === 'full').length,
      passedRoots: roots.filter((r) => r.hasAttribute('data-passed')).length,
      scrollHeight: document.documentElement.scrollHeight,
      mainThreadMs: Math.round(w.__census.blockingMs),
      longFrames: w.__census.long.length,
      p50FrameMs: Math.round(at(0.5) * 100) / 100,
      p95FrameMs: Math.round(at(0.95) * 100) / 100,
      p99FrameMs: Math.round(at(0.99) * 100) / 100,
      maxFrameMs: Math.round((frames[frames.length - 1] ?? 0) * 100) / 100,
      frameSamples: frames.length,
      heapUsedMB: memory ? mb(memory.usedJSHeapSize) : null,
      heapLimitMB: memory ? mb(memory.jsHeapSizeLimit) : null,
    };
  });

  console.log('D-B33 COST CENSUS ' + JSON.stringify({ ...census, ...network }, null, 2));
  console.log(
    `D-B33 VERDICT p95=${census.p95FrameMs}ms vs the 16.7ms line — ` +
      (census.p95FrameMs > 16.7
        ? 'OVER: the OD-4 content-visibility candidate REOPENS'
        : 'UNDER: the OD-4 deletion stands'),
  );

  // The only assertions: the instrument ran, against a real long paper, and
  // actually sampled frames — a census that measured nothing must not print a
  // p95 of 0 and be read as "fast".
  expect(census.regionRoots).toBeGreaterThan(0);
  expect(census.scrollHeight).toBeGreaterThan(3000);
  expect(census.frameSamples).toBeGreaterThan(30);
});
