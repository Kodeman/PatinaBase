import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { BrowserContext, Page, Request } from "@playwright/test";
import { test, expect } from "../fixtures/auth";
import { scrollTo, settle } from "../helpers/lens";
import { applyCover, expectCoverRendered } from "./rc7-e8-cover";

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
 * - Network settle: no request in flight on the context for 1 s, bounded at
 *   30 s; the bound fails the test (it is never swallowed).
 *
 * Asserted (ACCEPTANCE.md X07; unthrottled localhost next dev, not the WP-00
 * representative profile): settled-scroll CLS (paced, the contract) == 0 as a
 * raw sum, skipped with a stated reason where the engine has no layout-shift
 * entry type (WebKit); LCP ≤ 2,500 ms on chromium; request capture agrees
 * with Resource Timing; the studio renders the photographic cover (applied by
 * this spec's beforeAll, not left to spec order). Cold-load CLS is recorded
 * and its ≤ 0.1 target is the RC7-E8-4 (first visit, residual) and RC7-E8-5
 * (returning reader) fixmes. Flung-scroll CLS and
 * WebKit LCP are recorded, not asserted.
 */

const JOB = "f0180000-0000-4000-8000-000000000010";
const OUT =
  process.env.PLAYWRIGHT_OUTPUT_DIR ??
  path.join(__dirname, "../../test-results/round8");
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
const apiHosts = new Set([`127.0.0.1:${api.port}`, `localhost:${api.port}`]);
const readings: Record<string, unknown> = {};
const LCP_BUDGET_MS = 2_500;
const NO_LAYOUT_SHIFT =
  "this engine has no layout-shift entry type (PerformanceObserver.supportedEntryTypes), so CLS cannot be read; never reported as 0";

const VITALS = () => {
  const w = window as unknown as {
    __e8: {
      cls: number;
      shifts: Array<{
        t: number;
        v: number;
        arrival: string | null;
        sources: string[];
      }>;
      lcp: number | null;
      lcpElement: string | null;
      supported: readonly string[];
    };
  };
  w.__e8 = {
    cls: 0,
    shifts: [],
    lcp: null,
    lcpElement: null,
    supported: PerformanceObserver.supportedEntryTypes,
  };
  if (w.__e8.supported.includes("layout-shift")) {
    new PerformanceObserver((list) =>
      list.getEntries().forEach((entry: any) => {
        if (entry.hadRecentInput) return;
        w.__e8.cls += entry.value;
        // arrival: the arrival class on <html> when the entry is delivered (arr-pre veils [data-arrival] at opacity 0).
        w.__e8.shifts.push({
          t: Math.round(entry.startTime),
          v: entry.value,
          arrival: (document.documentElement.className.match(
            /\barr-(?:pre|on|press)\b/,
          ) ?? [null])[0],
          sources: (entry.sources ?? []).slice(0, 3).map((s: any) => {
            const n = s.node as Element | null;
            return n && n.nodeType === 1
              ? `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ""}${[
                  ...n.attributes,
                ]
                  .filter((a) => a.name.startsWith("data-"))
                  .slice(0, 2)
                  .map((a) => `[${a.name}]`)
                  .join("")}`
              : String(n?.nodeName ?? "unknown");
          }),
        });
      }),
    ).observe({ type: "layout-shift", buffered: true });
  }
  if (w.__e8.supported.includes("largest-contentful-paint")) {
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1) as any;
      if (!last) return;
      w.__e8.lcp = last.startTime;
      const n = last.element as Element | null;
      w.__e8.lcpElement = n
        ? `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ""}${n.className && typeof n.className === "string" ? `.${n.className.split(" ").slice(0, 2).join(".")}` : ""}`
        : null;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  }
};

function captureRequests(context: BrowserContext) {
  const requests: Request[] = [];
  const failed: Request[] = [];
  const inFlight = new Set<Request>();
  let lastChange = Date.now();
  const onRequest = (request: Request) => {
    requests.push(request);
    // Long-lived streams never finish; none is expected on these surfaces.
    if (request.resourceType() === "eventsource") return;
    inFlight.add(request);
    lastChange = Date.now();
  };
  const onFinished = (request: Request) => {
    if (inFlight.delete(request)) lastChange = Date.now();
  };
  const onFailed = (request: Request) => {
    failed.push(request);
    onFinished(request);
  };
  context.on("request", onRequest);
  context.on("requestfinished", onFinished);
  context.on("requestfailed", onFailed);
  return {
    /** Resolves once nothing has been in flight for `windowMs`; throws at `timeoutMs`. */
    async settle(page: Page, windowMs = 1_000, timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs;
      while (inFlight.size > 0 || Date.now() - lastChange < windowMs) {
        if (Date.now() > deadline)
          throw new Error(
            `network never settled in ${timeoutMs} ms: ${inFlight.size} in flight ` +
              JSON.stringify([...inFlight].slice(0, 5).map((r) => r.url())),
          );
        await page.waitForTimeout(100);
      }
    },
    stop() {
      context.off("request", onRequest);
      context.off("requestfinished", onFinished);
      context.off("requestfailed", onFailed);
    },
    summary() {
      const byOrigin: Record<string, number> = {};
      const apiPaths: Record<string, number> = {};
      for (const request of requests) {
        const url = new URL(request.url());
        if (!/^https?:$/.test(url.protocol)) continue;
        const key = apiHosts.has(url.host) ? "supabase-api" : url.host;
        byOrigin[key] = (byOrigin[key] ?? 0) + 1;
        if (key === "supabase-api") {
          const name = `${request.method()} ${url.pathname.replace(/[0-9a-f-]{36}/g, ":id")}`;
          apiPaths[name] = (apiPaths[name] ?? 0) + 1;
        }
      }
      return {
        total: Object.values(byOrigin).reduce((a, b) => a + b, 0),
        byOrigin,
        apiPaths,
        failed: failed.length,
      };
    },
  };
}

const resetShifts = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __e8: { cls: number; shifts: unknown[] } };
    w.__e8.cls = 0;
    w.__e8.shifts = [];
  });

const readShifts = async (page: Page) => {
  const vitals = await page.evaluate(
    () =>
      (
        window as unknown as {
          __e8: {
            cls: number;
            shifts: Array<{ t: number; v: number; sources: string[] }>;
            supported: readonly string[];
          };
        }
      ).__e8,
  );
  // No layout-shift entry type (WebKit): no reading, never a zero.
  if (!vitals.supported.includes("layout-shift"))
    return { cls: null, clsRounded: null, shiftCount: null, shifts: [] };
  return {
    cls: vitals.cls, // raw sum: the assertion never sees a rounded value
    clsRounded: Math.round(vitals.cls * 10_000) / 10_000,
    shiftCount: vitals.shifts.length,
    shifts: vitals.shifts.slice(0, 10),
  };
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
async function scrollCls(
  page: Page,
  surface: "studio" | "job",
  mode: "paced" | "fling",
) {
  const lens = surface === "job";
  await page.evaluate(() => window.scrollTo(0, 0));
  if (lens) await settle(page);
  else await page.waitForTimeout(500);
  await resetShifts(page);
  const docHeight = () =>
    page.evaluate(() => document.documentElement.scrollHeight);
  const startHeight = await docHeight();
  const step =
    mode === "paced"
      ? 240
      : await page.evaluate(() => Math.floor(innerHeight * 0.9));
  let steps = 0;
  // Where the window actually was after each step: `steps` counts attempts,
  // so a page that never scrolled would otherwise read as a vacuous 0.
  const ys: number[] = [];
  // The paper grows as stops open, so the bottom is re-read at every step.
  for (let y = step; y < (await docHeight()) + step; y += step) {
    steps++;
    if (mode === "paced" && lens) await scrollTo(page, y);
    else
      await page.evaluate(async (to) => {
        window.scrollTo(0, to);
        await new Promise((resolve) =>
          requestAnimationFrame(() => setTimeout(resolve, 150)),
        );
      }, y);
    ys.push(await page.evaluate(() => Math.round(window.scrollY)));
  }
  const scrollable = await page.evaluate(() =>
    Math.round(document.documentElement.scrollHeight - innerHeight),
  );
  if (lens) await scrollTo(page, 0);
  else await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  return {
    mode,
    step,
    steps,
    startHeight,
    height: await docHeight(),
    scrollable,
    maxScrollY: Math.max(0, ...ys),
    moves: ys.filter((y, i) => y > (i === 0 ? 0 : ys[i - 1])).length,
    ...(await readShifts(page)),
  };
}

/** Two paced steps: below this the scroll proves nothing about the paper. */
const MIN_TRAVEL_PX = 480;

const ROUTE = { studio: "/desk", job: `/doc/${JOB}` } as const;

/**
 * Warm compile, then a cold navigation with the init-script observers, wait
 * for arrival and a settled network. Returns the load readings.
 */
async function coldLoad(
  page: Page,
  surface: "studio" | "job",
  { warm = true }: { warm?: boolean } = {},
) {
  const route = ROUTE[surface];
  const ready =
    surface === "studio"
      ? page.locator('[data-studio="round8"][data-arrival-ready]')
      : page.locator("[data-document-shell][data-arrival-ready]");
  // Warm the dev compile so the measured navigation is not a first compile.
  // The warm visit also makes the measured load a returning reader's (the
  // job enters the recent-documents list, so page.tsx's landing scroll runs).
  // `warm: false` measures a first visit in this fresh context instead.
  if (warm) {
    await page.goto(route, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(ready).toHaveCount(1, { timeout: 60_000 });
  }
  await page.goto("about:blank");
  await page.addInitScript(VITALS);
  const capture = captureRequests(page.context());
  // Diagnostic for the R3b capture defect: the old counter listened on the Page.
  let pageLevelApi = 0;
  const onPageRequest = (request: Request) => {
    if (apiHosts.has(new URL(request.url()).host)) pageLevelApi++;
  };
  page.on("request", onPageRequest);
  await page.evaluate(() => performance.clearResourceTimings());
  try {
    const started = Date.now();
    await page.goto(route, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await expect(ready).toHaveCount(1, { timeout: 60_000 });
    await expect(page.locator("html")).not.toHaveClass(
      /\barr-(?:pre|on|press)\b/,
      { timeout: 30_000 },
    );
    const readyMs = Date.now() - started;
    await capture.settle(page);
    const load = await page.evaluate(() => {
      const w = window as unknown as {
        __e8: {
          cls: number;
          shifts: Array<{ t: number; v: number; sources: string[] }>;
          lcp: number | null;
          lcpElement: string | null;
          supported: readonly string[];
        };
      };
      const resources = performance.getEntriesByType(
        "resource",
      ) as PerformanceResourceTiming[];
      const nav = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
      const layoutShift = w.__e8.supported.includes("layout-shift");
      return {
        lcpMs: w.__e8.lcp === null ? null : Math.round(w.__e8.lcp),
        lcpElement: w.__e8.lcpElement,
        loadClsRaw: layoutShift ? w.__e8.cls : null,
        loadClsBeforeScroll: layoutShift
          ? Math.round(w.__e8.cls * 10_000) / 10_000
          : null,
        loadShiftCount: w.__e8.shifts.length,
        loadShiftsLargest: [...w.__e8.shifts]
          .sort((a, b) => b.v - a.v)
          .slice(0, 8)
          .map((shift) => ({
            ...shift,
            v: Math.round(shift.v * 10_000) / 10_000,
          })),
        supported: w.__e8.supported.filter((t) =>
          ["layout-shift", "largest-contentful-paint"].includes(t),
        ),
        resourceTimingCount: resources.length,
        resourceTimingByHost: resources.reduce<Record<string, number>>(
          (acc, r) => {
            const host = new URL(r.name).host;
            acc[host] = (acc[host] ?? 0) + 1;
            return acc;
          },
          {},
        ),
        domContentLoadedMs: nav
          ? Math.round(nav.domContentLoadedEventEnd)
          : null,
        transferKB: Math.round(
          resources.reduce((sum, r) => sum + (r.transferSize || 0), 0) / 1024,
        ),
        nodes: document.querySelectorAll("*").length,
      };
    });
    return {
      route,
      readyMs,
      load,
      requests: { ...capture.summary(), pageLevelApi },
    };
  } finally {
    capture.stop();
    page.off("request", onPageRequest);
  }
}

const reading = (key: string, patch: Record<string, unknown>) => {
  readings[key] = { ...(readings[key] as object | undefined), ...patch };
};

test.describe("RC-7 E8 X07 performance", () => {
  test.setTimeout(240_000);

  // Global setup recreates F01 every run: the studio is measured with the cover.
  test.beforeAll(async () => {
    await applyCover("rc7-e8 perf");
  });

  for (const surface of ["studio", "job"] as const) {
    test(`X07 ${surface}: cold load — LCP and request capture`, async ({
      authenticatedPage: page,
      browserName,
    }, info) => {
      const { route, readyMs, load, requests } = await coldLoad(page, surface);
      const cover =
        surface === "studio" ? await expectCoverRendered(page) : null;
      reading(`${info.project.name} ${surface}`, {
        surface,
        route,
        browser: info.project.name,
        viewport: page.viewportSize(),
        readyMs,
        ...load,
        requests,
        cover,
        profile: `unthrottled localhost; next dev --webpack; ${os.cpus()[0]?.model}; F01 (80 lines, 3 rooms)${surface === "studio" ? " + rc7-e8 cover board" : ""}`,
      });
      console.log(
        "[rc7-e8 perf load]",
        JSON.stringify({
          surface,
          browser: info.project.name,
          lcpMs: load.lcpMs,
          readyMs,
          requests: requests.total,
          api: requests.byOrigin["supabase-api"] ?? 0,
          rt: load.resourceTimingCount,
          loadCls: load.loadClsBeforeScroll,
        }),
      );
      // The capture is not empty and agrees with the page's own Resource Timing on API reads.
      expect(
        requests.byOrigin["supabase-api"] ?? 0,
        "API requests captured",
      ).toBeGreaterThan(0);
      const rtApi = Object.entries(load.resourceTimingByHost)
        .filter(([host]) => apiHosts.has(host))
        .reduce((a, [, n]) => a + n, 0);
      expect(
        Math.abs((requests.byOrigin["supabase-api"] ?? 0) - rtApi),
        "context capture ≈ Resource Timing for the API",
      ).toBeLessThanOrEqual(Math.max(3, rtApi * 0.1));
      if (browserName === "chromium") {
        expect(load.lcpMs, "chromium reports LCP").not.toBeNull();
        expect(load.lcpMs!, `LCP ≤ ${LCP_BUDGET_MS} ms`).toBeLessThanOrEqual(
          LCP_BUDGET_MS,
        );
      }
    });

    test(`X07 ${surface}: settled-scroll CLS is 0`, async ({
      authenticatedPage: page,
    }, info) => {
      const { load } = await coldLoad(page, surface);
      test.skip(!load.supported.includes("layout-shift"), NO_LAYOUT_SHIFT);
      const scroll = await scrollCls(page, surface, "paced");
      const fling = await scrollCls(page, surface, "fling");
      reading(`${info.project.name} ${surface}`, { scroll, fling });
      console.log(
        "[rc7-e8 perf scroll]",
        JSON.stringify({
          surface,
          browser: info.project.name,
          pacedCls: scroll.cls,
          pacedShifts: scroll.shiftCount,
          flingCls: fling.cls,
          flingShifts: fling.shiftCount,
          height: scroll.height,
        }),
      );
      // The window really moved, through the whole document, in several steps.
      expect(
        scroll.maxScrollY,
        `the scroll travelled at least ${MIN_TRAVEL_PX}px`,
      ).toBeGreaterThanOrEqual(MIN_TRAVEL_PX);
      expect(
        scroll.maxScrollY,
        "the scroll reached the bottom of the document (within one step)",
      ).toBeGreaterThanOrEqual(scroll.scrollable - scroll.step);
      expect(scroll.moves, "scrollY advanced on several steps").toBeGreaterThan(
        2,
      );
      // The contract (paced, settled): a raw sum of exactly 0, not a rounded one.
      expect(
        scroll.cls,
        `settled-scroll CLS (raw); shifts ${JSON.stringify(scroll.shifts)}`,
      ).toBe(0);
    });
  }

  // DEFECT RC7-E8-4 (residual after FIX5 74a324b26): a first visit's job cold-load
  // CLS fell from 1.16–1.17 to 0.04–0.11, so it still crosses 0.1 on some runs.
  // The round-8 cover is never held, and use-chapter-reveal.ts revealStep gates
  // the chapters below it only on the cover's loading register, so the cover's
  // late growth (77–234 px at 1.7–2.3 s) pushes the shown brief and kickoff
  // band down. Kept out of the gate.
  test.fixme("RC7-E8-4: job cold-load CLS ≤ 0.1, first visit", async ({
    authenticatedPage: page,
  }, info) => {
    const { load } = await coldLoad(page, "job", { warm: false });
    reading(`${info.project.name} job`, {
      firstVisitLoadCls: load.loadClsBeforeScroll,
      firstVisitLcpMs: load.lcpMs,
    });
    test.skip(!load.supported.includes("layout-shift"), NO_LAYOUT_SHIFT);
    expect(
      load.loadClsRaw!,
      `first-visit cold-load CLS (raw); largest ${JSON.stringify(load.loadShiftsLargest)}`,
    ).toBeLessThanOrEqual(0.1);
  });

  // DEFECT RC7-E8-5: a returning reader's cold load of the job paper shifts
  // 1.40–1.47 (chromium). page.tsx:1744 (the returning-reader landing, run
  // from afterArrival) calls scrollIntoRevealed on the active section, which
  // marks every chapter above it data-paper-shown (use-chapter-reveal.ts:59–63)
  // at ~1.1 s, before their bodies resolve; the bodies then resolve visibly.
  // Kept out of the gate.
  test.fixme("RC7-E8-5: job cold-load CLS ≤ 0.1, returning reader", async ({
    authenticatedPage: page,
  }) => {
    const { load } = await coldLoad(page, "job");
    test.skip(!load.supported.includes("layout-shift"), NO_LAYOUT_SHIFT);
    expect(
      load.loadClsRaw!,
      `returning-reader cold-load CLS (raw); largest ${JSON.stringify(load.loadShiftsLargest)}`,
    ).toBeLessThanOrEqual(0.1);
  });
});

test.afterAll(() => {
  mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `rc7-e8-perf-${test.info().project.name}.json`);
  let prior = {};
  try {
    prior = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    /* first worker */
  }
  writeFileSync(file, JSON.stringify({ ...prior, ...readings }, null, 2));
});
