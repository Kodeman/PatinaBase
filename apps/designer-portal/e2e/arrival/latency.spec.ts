/**
 * Arrival under production latency (US-14, post-ship patch 1).
 *
 * The incident: arrival v3 shipped to production on 2026-09-29, and opening a
 * Document there showed no arrival. Locally every Supabase round trip takes a
 * few milliseconds; production pays roughly 300–400 ms per round trip
 * (Worker → Strata). The wait in arrival-run.tsx arms `BUDGET.HIDDEN_CAP_MS`
 * (1200 ms) the first time it sees the route root `[data-arrival]`. The
 * Document paints that root as soon as its project row exists, but it only
 * earns `data-arrival-ready` after a waterfall of project-keyed reads. When
 * that waterfall takes longer than the cap, the entry ends
 * `declined · hidden` (or `late`), and she sees the ordinary page.
 *
 * The instrument: a Chrome DevTools Protocol (CDP) session adds L ms to every
 * request the page makes (`Network.emulateNetworkConditions`, unlimited
 * throughput). CDP latency applies once per request, so L approximates one
 * round trip. Supabase REST, Auth and Next chunks all pay it, as they do in
 * production. L runs over [0, 150, 350]; 350 is close to the production
 * Worker → Strata round trip the investigation measured. CDP is
 * Chromium-only, so WebKit skips.
 *
 * Each cell covers one latency and one entry mode:
 *  - hard: `page.goto('/doc/{id}')`.
 *  - soft: `page.goto('/desk')`. Her Desk arrival ends first (a card is
 *    skipped). Then she clicks the claim card's NAME link, which writes a
 *    `ptr` token. The "Open the job" act declines `token` by design
 *    (R-DM21 A), so it is not used here.
 *
 * `window.__arrivalProbe` (an init-script MutationObserver) records, in
 * `performance.now()` time:
 *  - the first sighting of each `[data-arrival]` root;
 *  - the first time that root carries `data-arrival-ready`;
 *  - childList/characterData mutations inside the root after ready (each one
 *    restarts the 200 ms quiet window);
 *  - every `patina:arrival-ended` detail.
 * rootToReadyMs is the span the hidden cap has to cover. The patch (option A,
 * CONTRACT §4h): while a wait is armed the Document's paper stands mounted
 * (its reads run beside the ready waterfall) but unmarked and hidden until
 * ready, so the root first appears ready and rootToReadyMs is ~0.
 *
 * Two rig limits apply. The local stack (127.0.0.1:54321) speaks HTTP/1.1,
 * so Chromium opens at most six connections to it; production Supabase is
 * HTTP/2. At high L, supabase-js also serialises `auth.getUser()` behind its
 * navigator lock, and past 5 s it steals the lock and the losing reads fail.
 * Each cell records the lock warnings, the `/auth/v1/user` count and the
 * page's error state, so a page that never rendered is not mistaken for an
 * arrival decline.
 *
 * Each cell prints one `LATENCY-PROBE {json}` line, adds a test annotation,
 * and merges into the JSON matrix at `LATENCY_PROBE_OUT` (default: this test's
 * output dir) under the run label `LATENCY_PROBE_RUN`. Then it asserts: the
 * Document PLAYS in every cell (its card is visible, it is still up after a
 * dwell of at least 1.5 s and until the page's reads have been quiet for 2 s,
 * Skip is pressed, and its last end is `how: 'skip'`). The dwell is what lets
 * a late read that would cut the run `how: 'mutation'` show; an instant Skip
 * hides it.
 */
import fs from 'fs';
import path from 'path';
import type { CDPSession, Page } from '@playwright/test';
import { expect, test } from '../fixtures/auth';
import { seedWorkflowGateFixture } from '../helpers/workflow-gate-fixture';
import {
  ARRIVAL_PROJECT_ID,
  armE2EOptIn,
  dwellOnCard,
  installArrivalInstruments,
  settleDeskWalkthrough,
  watchReads,
  CARD_SELECTOR,
  SKIP_SELECTOR,
  type ReadWatch,
} from './helpers';

const LATENCIES = [0, 150, 350] as const;
const MODES = ['hard', 'soft'] as const;
type Mode = (typeof MODES)[number];

/** The claim card's name link (desk-claim-card.tsx `data-roster-name`), never its act. */
const NAME_LINK = `[data-claim-card="${ARRIVAL_PROJECT_ID}"] a[data-roster-name]`;

type SurfaceRec = {
  firstSeenAt: number | null;
  readyAt: number | null;
  rootNodes: number;
  readyLost: number;
  mutationsAfterReadyBeforeEnd: number;
  mutationsAfterReady: number;
  lastMutationAfterReadyAt: number | null;
  endedAt: number | null;
};
type Probe = {
  surfaces: Record<string, SurfaceRec>;
  ended: Array<{ detail: Record<string, unknown>; at: number }>;
  nameClickAt: number | null;
};

/** One init script: the probe exists before any app code runs, on every document. */
async function installLatencyProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      performance.setResourceTimingBufferSize(5000);
    } catch {
      /* the matrix loses its request list, nothing else */
    }
    const probe: Probe = { surfaces: {}, ended: [], nameClickAt: null };
    (window as unknown as { __arrivalProbe: Probe }).__arrivalProbe = probe;
    const roots = new Map<string, Element>();
    const wasReady = new Map<string, boolean>();
    const rec = (s: string): SurfaceRec =>
      (probe.surfaces[s] ??= {
        firstSeenAt: null,
        readyAt: null,
        rootNodes: 0,
        readyLost: 0,
        mutationsAfterReadyBeforeEnd: 0,
        mutationsAfterReady: 0,
        lastMutationAfterReadyAt: null,
        endedAt: null,
      });
    const own = (n: Node | null): boolean =>
      !!n && n.nodeType === 1 && !!(n as Element).closest?.('[data-arr]');
    const scan = (now: number) => {
      const seen = new Set<string>();
      document.querySelectorAll('[data-arrival]').forEach((el) => {
        const s = el.getAttribute('data-arrival') ?? '';
        seen.add(s);
        const r = rec(s);
        if (r.firstSeenAt === null) r.firstSeenAt = now;
        if (roots.get(s) !== el) {
          roots.set(s, el);
          r.rootNodes += 1;
        }
        const ready = el.hasAttribute('data-arrival-ready');
        if (ready && r.readyAt === null) r.readyAt = now;
        if (!ready && wasReady.get(s)) r.readyLost += 1;
        wasReady.set(s, ready);
      });
      for (const s of roots.keys()) {
        if (seen.has(s)) continue;
        if (wasReady.get(s)) rec(s).readyLost += 1;
        roots.delete(s);
        wasReady.set(s, false);
      }
    };
    new MutationObserver((records) => {
      const now = performance.now();
      scan(now);
      for (const m of records) {
        if (m.type === 'attributes') continue;
        if (own(m.target) || (m.type === 'childList' && [...m.addedNodes].every(own) && m.addedNodes.length > 0)) {
          continue;
        }
        for (const [s, root] of roots) {
          if (!(root === m.target || root.contains(m.target))) continue;
          const r = rec(s);
          if (r.readyAt === null) continue;
          r.mutationsAfterReady += 1;
          r.lastMutationAfterReadyAt = now;
          if (r.endedAt === null) r.mutationsAfterReadyBeforeEnd += 1;
        }
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-arrival', 'data-arrival-ready'],
    });
    window.addEventListener('patina:arrival-ended', (e: Event) => {
      const at = performance.now();
      const detail = ((e as CustomEvent).detail ?? {}) as Record<string, unknown>;
      probe.ended.push({ detail, at });
      const r = rec(String(detail.surface ?? ''));
      if (r.endedAt === null) r.endedAt = at;
    });
    window.addEventListener(
      'click',
      (e) => {
        const t = e.target;
        if (t instanceof Element && t.closest('[data-roster-name]')) probe.nameClickAt = performance.now();
      },
      true,
    );
  });
}

async function emulate(cdp: CDPSession, latency: number): Promise<void> {
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
}

/** Resolves once `surface` has ended, or its card is up (then Skip ends it). With `reads`, the card
 *  first dwells on screen (dwellOnCard), and `cardHeld` says whether it was still up after. */
async function settleSurface(
  page: Page,
  surface: string,
  reads?: ReadWatch,
): Promise<{ outcome: 'card' | 'ended' | 'neither'; cardHeld: boolean | null }> {
  const outcome = await page
    .waitForFunction(
      ({ s, card }) => {
        const p = (window as unknown as { __arrivalProbe?: Probe }).__arrivalProbe;
        if (p?.ended.some((e) => e.detail.surface === s)) return 'ended';
        const h = document.querySelector(card);
        if (h && h.getBoundingClientRect().height > 0) return 'card';
        return false;
      },
      { s: surface, card: CARD_SELECTOR },
      { timeout: 30_000, polling: 50 },
    )
    .then((h) => (h.jsonValue() as Promise<'card' | 'ended'>))
    .catch(() => 'neither' as const);
  let cardHeld: boolean | null = null;
  if (outcome === 'card') {
    if (reads) cardHeld = await dwellOnCard(page, reads);
    if (cardHeld !== false) await page.locator(SKIP_SELECTOR).click();
    await page
      .waitForFunction(
        (s) =>
          (window as unknown as { __arrivalProbe?: Probe }).__arrivalProbe?.ended.some(
            (e) => e.detail.surface === s,
          ),
        surface,
        { timeout: 10_000 },
      )
      .catch(() => undefined);
  }
  return { outcome, cardHeld };
}

/** Declined runs still earn ready later; wait for it so rootToReadyMs is measured, not guessed. */
async function awaitReady(page: Page, surface: string): Promise<void> {
  await page
    .waitForFunction(
      (s) =>
        (window as unknown as { __arrivalProbe?: Probe }).__arrivalProbe?.surfaces[s]?.readyAt != null,
      surface,
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  // Trailing commits after ready (the quiet window's restarts, late answers) settle into the count.
  await page.waitForTimeout(3_000);
}

type Req = { path: string; start: number; end: number };

async function snapshot(page: Page): Promise<{ probe: Probe; reqs: Req[] }> {
  return page.evaluate(() => {
    const probe = (window as unknown as { __arrivalProbe: Probe }).__arrivalProbe;
    const reqs = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((e) => /\/(rest|auth|functions|storage)\/v1\//.test(e.name))
      .map((e) => {
        const u = new URL(e.name);
        return { path: u.pathname, start: Math.round(e.startTime), end: Math.round(e.responseEnd) };
      });
    return { probe: JSON.parse(JSON.stringify(probe)) as Probe, reqs };
  });
}

/** Longest chain of requests where each starts after the previous one ended: a
 *  timing-derived upper bound on the serial round trips between two instants. */
function criticalRounds(reqs: Req[]): number {
  const sorted = [...reqs].sort((a, b) => a.start - b.start);
  const depth: number[] = [];
  let best = 0;
  sorted.forEach((r, i) => {
    let d = 1;
    for (let j = 0; j < i; j += 1) {
      if (sorted[j].end <= r.start) d = Math.max(d, depth[j] + 1);
    }
    depth[i] = d;
    best = Math.max(best, d);
  });
  return best;
}

const rel = (a: number | null | undefined, b: number | null | undefined): number | null =>
  a == null || b == null ? null : Math.round(a - b);

function surfaceCell(probe: Probe, surface: string, entryAt: number) {
  const r = probe.surfaces[surface];
  const ended = probe.ended.filter((e) => e.detail.surface === surface);
  return {
    ended: ended.map((e) => e.detail),
    endedCount: ended.length,
    entryToRootMs: rel(r?.firstSeenAt, entryAt),
    entryToReadyMs: rel(r?.readyAt, entryAt),
    entryToEndMs: rel(r?.endedAt, entryAt),
    rootToReadyMs: rel(r?.readyAt, r?.firstSeenAt),
    rootToEndMs: rel(r?.endedAt, r?.firstSeenAt),
    rootNodes: r?.rootNodes ?? 0,
    readyLost: r?.readyLost ?? 0,
    mutationsAfterReadyBeforeEnd: r?.mutationsAfterReadyBeforeEnd ?? 0,
    mutationsAfterReady: r?.mutationsAfterReady ?? 0,
    lastMutationAfterReadyMs: rel(r?.lastMutationAfterReadyAt, r?.readyAt),
  };
}

function writeMatrix(key: string, cell: Record<string, unknown>): void {
  const out = process.env.LATENCY_PROBE_OUT ?? test.info().outputPath('latency-probe.json');
  const run = process.env.LATENCY_PROBE_RUN ?? 'adhoc';
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let doc: { runs: Record<string, Record<string, unknown>> } = { runs: {} };
  try {
    doc = JSON.parse(fs.readFileSync(out, 'utf8'));
  } catch {
    /* first cell */
  }
  doc.runs ??= {};
  doc.runs[run] ??= {};
  doc.runs[run][key] = cell;
  fs.writeFileSync(out, `${JSON.stringify({ ...doc, updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

test.describe('Arrival under emulated latency', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP network emulation is Chromium-only');

  test.beforeAll(() => {
    seedWorkflowGateFixture();
    settleDeskWalkthrough();
  });

  for (const latency of LATENCIES) {
    for (const mode of MODES) {
      test(`${mode} Document entry at +${latency} ms per request`, async ({ authenticatedPage: page }, info) => {
        test.setTimeout(150_000);
        await armE2EOptIn(page);
        await installArrivalInstruments(page);
        await installLatencyProbe(page);
        const reads = watchReads(page);
        const cdp = await page.context().newCDPSession(page);
        await emulate(cdp, latency);

        // supabase-js serialises every auth.getUser() behind one navigator lock, so each costs a full
        // round trip in turn; past 5 s the lock is stolen and the losing reads fail. Counted, because
        // that failure (not the arrival) is what empties a page at high latency.
        const lock = { notReleased: 0, broken: 0 };
        page.on('console', (m) => {
          const t = m.text();
          if (t.includes('was not released within')) lock.notReleased += 1;
          if (t.includes('Lock broken by another request')) lock.broken += 1;
        });

        let deskOutcome: string | null = null;
        let deskCell: ReturnType<typeof surfaceCell> | null = null;
        let deskRetries = 0;
        let docOutcome: 'card' | 'ended' | 'neither' | 'unreached' = 'unreached';
        let cardHeld: boolean | null = null;
        let entryAt = 0;
        try {
          if (mode === 'hard') {
            await page.goto(`/doc/${ARRIVAL_PROJECT_ID}`, { waitUntil: 'domcontentloaded' });
            await emulate(cdp, latency);
          } else {
            await page.goto('/desk', { waitUntil: 'domcontentloaded' });
            await emulate(cdp, latency);
            deskOutcome = (await settleSurface(page, 'desk')).outcome;
            await page.locator(CARD_SELECTOR).waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
            await awaitReady(page, 'desk');
            // The Desk is only the way in: an unreadable Desk is retried, never the cell's result.
            const deskError = page.getByText('The desk could not be read.');
            for (;;) {
              const shown = await page
                .locator(NAME_LINK)
                .waitFor({ state: 'visible', timeout: 15_000 })
                .then(() => true)
                .catch(() => false);
              if (shown || deskRetries >= 3 || !(await deskError.isVisible())) break;
              deskRetries += 1;
              await page.getByRole('button', { name: 'Try again' }).first().click();
            }
          }

          if (mode === 'hard' || (await page.locator(NAME_LINK).isVisible())) {
            if (mode === 'soft') {
              await page.locator(NAME_LINK).click();
              await page.waitForURL(new RegExp(`/doc/${ARRIVAL_PROJECT_ID}`), { timeout: 30_000 });
            }
            ({ outcome: docOutcome, cardHeld } = await settleSurface(page, 'document', reads));
            await awaitReady(page, 'document');
          }
          const { probe, reqs } = await snapshot(page);
          if (mode === 'soft') {
            entryAt = probe.nameClickAt ?? 0;
            deskCell = surfaceCell(probe, 'desk', 0);
          }
          const doc = surfaceCell(probe, 'document', entryAt);
          const readyAt = probe.surfaces.document?.readyAt ?? null;
          const toReady = reqs.filter((r) => r.start >= entryAt && (readyAt === null || r.end <= readyAt));
          const last = doc.ended.at(-1) as { how?: string; cause?: string } | undefined;
          const pageState = await page.evaluate(() => {
            const text = document.body.innerText;
            return {
              url: location.pathname,
              pickingUp: text.includes('Picking up…'),
              docError: text.includes('This document could not be picked up'),
              deskError: text.includes('The desk could not be read'),
            };
          });
          const cell = {
            project: info.project.name,
            latencyMs: latency,
            mode,
            outcome: docOutcome,
            cardHeld,
            how: last?.how ?? null,
            cause: last?.cause ?? null,
            ...doc,
            desk: deskCell ? { outcome: deskOutcome, retries: deskRetries, ...deskCell } : null,
            pageState,
            authLock: lock,
            authUserCalls: reqs.filter((r) => r.path === '/auth/v1/user').length,
            authUserCallsEntryToReady: toReady.filter((r) => r.path === '/auth/v1/user').length,
            requestsEntryToReady: toReady.length,
            criticalRoundsEntryToReady: criticalRounds(toReady),
            requestsAfterRoot: reqs.filter(
              (r) =>
                probe.surfaces.document?.firstSeenAt != null &&
                r.start >= probe.surfaces.document.firstSeenAt &&
                (readyAt === null || r.end <= readyAt),
            ).length,
          };
          const line = JSON.stringify(cell);
          console.log(`LATENCY-PROBE ${line}`);
          info.annotations.push({ type: 'latency-probe', description: line });
          writeMatrix(`${info.project.name}|${mode}|${latency}`, {
            ...cell,
            requests: toReady.map((r) => ({ ...r, start: r.start - Math.round(entryAt), end: r.end - Math.round(entryAt) })),
          });

          // The Document plays: its card showed, stayed up through the dwell (no late read cut it
          // `how: 'mutation'`), and Skip (pressed by settleSurface) ended it.
          expect(docOutcome, `the Document's card at +${latency} ms (${mode}): ${line}`).toBe('card');
          expect(cardHeld, `the Document's card through the dwell at +${latency} ms (${mode}): ${line}`).toBe(true);
          expect(last?.how, `the Document's end at +${latency} ms (${mode}): ${line}`).toBe('skip');
        } finally {
          await emulate(cdp, 0).catch(() => undefined);
          await cdp.detach().catch(() => undefined);
        }
      });
    }
  }
});
