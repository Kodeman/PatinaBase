/**
 * The lens's e2e waits (R127 Wave 3, W3-L5).
 *
 * Every geometric claim the lens makes — the band's declared 56px, SC1's first
 * head, SC2's band bottom, the landing clearance — is a claim about the page
 * AFTER it has stopped moving. The document publishes exactly that:
 * `[data-document-shell][data-lens-settled="true"]`, written imperatively by
 * the density rAF (OD-3, §3) once velocity has been under 40px/frame for
 * 120ms.
 *
 * Until Wave 4 attaches that observer the attribute does not exist, and its
 * ABSENCE is not "unsettled" — it is "nothing publishes settling yet". So the
 * wait is: two animation frames always (the browser has laid out and painted),
 * then, only where the shell actually carries the attribute, wait for it to
 * read `true`.
 *
 * `settle`/`scrollTo`/`scrollSteps` never use `waitForTimeout`, deliberately:
 * a fixed sleep either makes the suite slow or makes it lie, and both were
 * how the earlier document specs went flaky (`e2e-baseline.md` §4). `quiet`
 * (D-B28, added W4-L4) is the one exception, and it is not a fixed sleep: it
 * polls a 100ms tick only to re-check "has a NEW Supabase request arrived",
 * debouncing until a full quiet window has passed with none — the wait
 * length is decided by the network, not guessed by the test.
 */
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const SHELL = '[data-document-shell]';

/**
 * W5-int — every running transform under the shell has finished.
 *
 * `@keyframes doc-raise` (`globals.css`, ~270ms) scales the whole shell on
 * arrival, and a `getBoundingClientRect()` taken while it runs is the scaled
 * rect: `lens-band-height.spec.ts` read `55.985` against a `56px` box with
 * `transforms DIV:matrix(0.99974,…)` and wandered between cells. Nothing else
 * waits it out — the shell is visible from its first frame, and the settle
 * gate watches scroll velocity, which at scrollY 0 was never moving.
 *
 * Loaders are excluded rather than waited on: `animate-pulse` and anything
 * else running forever would make this a timeout, and a pulsing skeleton
 * never scales the box a rect is read from.
 */
async function transformsStill(page: Page): Promise<void> {
  await page
    .waitForFunction(
      (sel) => {
        const shell = document.querySelector(sel);
        if (!shell) return true;
        const root = shell as Element & {
          getAnimations?: (opts?: { subtree?: boolean }) => Animation[];
        };
        if (typeof root.getAnimations !== 'function') return true;
        return root
          .getAnimations({ subtree: true })
          .every((animation) => {
            const timing = animation.effect?.getTiming();
            if (timing?.iterations === Infinity) return true;
            const name = (animation as Animation & { animationName?: string })
              .animationName;
            if (name && /pulse|spin/i.test(name)) return true;
            return animation.playState === 'finished' || animation.playState === 'idle';
          });
      },
      SHELL,
      { timeout: 1_500 },
    )
    .catch(() => {
      // Bounded on purpose: an animation that never ends is a finding for the
      // spec that cares, not a reason to fail every wait routed through here.
    });
}

/** One layout + one paint. `requestAnimationFrame` twice is the shortest wait
 *  that guarantees the style the second frame reads is the one the first
 *  frame's write produced. */
export async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

/**
 * D-B28(5) — a server that is not serving the Wave-4 build fails LOUDLY.
 *
 * W4-C18: `settle()` used to carry a third tier that silently returned after
 * two frames when neither publisher existed. A server serving W3 code, or a
 * W4 build whose hook throws on mount, demoted every spec routed through here
 * to a two-frame wait and they all went green measuring nothing. The hook
 * installs `window.__lensSettled` unconditionally, so its absence is a broken
 * build and nothing else.
 */
export async function assertLensBuild(page: Page): Promise<void> {
  // WAITS rather than reads once: the hook installs the publisher in a layout
  // effect, so a caller that settles immediately after `goto` can be ahead of
  // hydration. An absence that OUTLASTS the wait is the broken build.
  try {
    await page.waitForFunction(
      () =>
        typeof (window as unknown as { __lensSettled?: unknown })
          .__lensSettled === 'function',
      undefined,
      { timeout: 15_000 },
    );
  } catch {
    expect(
      false,
      'window.__lensSettled never appeared — this server is not serving the Wave-4 lens build (D-B28.5)',
    ).toBe(true);
  }
}

/**
 * The document has stopped moving, as far as it is able to say so.
 *
 * Two tiers, tried in order:
 *   1. `[data-document-shell][data-lens-settled="true"]` — the DOM's own
 *      attribute (OD-3, §3), cheapest to read.
 *   2. `window.__lensSettled()` — the Promise form §3 says is "exposed
 *      unconditionally" once the observer attaches; the path for a caller
 *      that reads the window before the shell exists, or for a build where
 *      the attribute write and the promise resolution race.
 *
 * There is no third tier: see `assertLensBuild`.
 */
export async function settle(page: Page): Promise<void> {
  await twoFrames(page);

  const publishesAttr = await page.evaluate(
    (sel) => Boolean(document.querySelector(sel)?.hasAttribute('data-lens-settled')),
    SHELL,
  );
  if (publishesAttr) {
    // D-B46: settled is not the whole of "stopped moving" any more. Until the
    // paper RESOLVES — no query fetching and `scrollHeight` held for three
    // frames, or the 3,000ms deadline — the lens has deliberately promoted
    // nothing, so a density map read at a settle alone would be read off a
    // paper whose bodies are still arriving. Both attributes, or neither
    // measurement means what it says.
    await page.waitForFunction(
      (sel) => {
        const shell = document.querySelector(sel);
        return (
          shell?.getAttribute('data-lens-settled') === 'true' &&
          shell?.getAttribute('data-lens-resolved') === 'true'
        );
      },
      SHELL,
      { timeout: 15_000 },
    );
    await transformsStill(page);
    await twoFrames(page);
    return;
  }

  await assertLensBuild(page);
  await page.evaluate(() =>
    (window as unknown as { __lensSettled: () => Promise<true> }).__lensSettled(),
  );
  await transformsStill(page);
  await twoFrames(page);
}

/** Put the window at `y` and wait for the document to settle there. */
export async function scrollTo(page: Page, y: number): Promise<void> {
  await page.evaluate((to) => window.scrollTo(0, to), y);
  await settle(page);
}

/**
 * Walk to `target` in 40px steps, settling at each — the reader's own pace, and
 * the only way to exercise the lens's velocity gate without asserting against a
 * scroll the engine coalesced into one jump.
 */
export async function scrollSteps(
  page: Page,
  target: number,
  step = 40,
): Promise<void> {
  const from = await page.evaluate(() => window.scrollY);
  const direction = target >= from ? 1 : -1;
  const stepCount = Math.floor(Math.abs(target - from) / step);
  for (let i = 1; i <= stepCount; i += 1) {
    await scrollTo(page, from + direction * step * i);
  }
  await scrollTo(page, target);
}

/**
 * The rail's own budget instrument (W4-L4, `lens-rail-budget.spec.ts`).
 *
 * `labels` is every distinct VISIBLE label on `[data-document-spine]` —
 * never a value or count line beside it — so the gate ("3 fixed head labels
 * + one per stop + one 'Filed with this job' + one per door") can compare an
 * EMPIRICAL count against its own formula rather than trust a hand-typed
 * ceiling a later wave could silently grow past. `stops` and `doors` are
 * read from the same DOM the labels came from, so the formula and the
 * measurement can never drift apart.
 *
 * W6 (audit drift 1, W3-R5 §6): labels are read by the `data-rail-label`
 * attribute rather than by structure — the rail head lines (`doc-spine.tsx`'s
 * household + stage-phrase-top spans), each stop's name, the "Filed with
 * this job" heading and each door name all carry it (`lens-ladder.tsx`,
 * `doc-spine.tsx`). A value line (a stop's fact, `NOTHING YET`, the rail
 * head's own `N OF M` count) carries `data-rail-value` instead and is never
 * counted here. Filtered to what is actually PAINTED (never `display:none`,
 * `visibility:hidden`, or `opacity:0` on the element or an ancestor) so the
 * L-6/RF-02 yields that hide a label or a value do not inflate the count.
 *
 * Deliberately excluded: the "Put down document" exit link (studio chrome,
 * not a map of the paper, and carries neither attribute), every ladder VALUE
 * span (the fact beside a stop's name — `region-head.tsx`'s own printed
 * figures are the paper's, not the rail's, per SP-08), and room sub-rungs
 * (`[data-room-chip]`, Override 2) — the rail budget's own formula is
 * "stops + doors", never rooms, and a room held open must not move this
 * gate.
 */
export interface RailCensus {
  labels: string[];
  stops: number;
  doors: number;
}

export async function railCensus(page: Page): Promise<RailCensus> {
  return page.evaluate(() => {
    const spine = document.querySelector('[data-document-spine]');
    if (!spine) return { labels: [], stops: 0, doors: 0 };

    const isPainted = (el: Element): boolean => {
      let node: Element | null = el;
      while (node) {
        const style = getComputedStyle(node);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          parseFloat(style.opacity) <= 0
        ) {
          return false;
        }
        node = node.parentElement;
      }
      return true;
    };

    const labels: string[] = [];
    spine.querySelectorAll('[data-rail-label]').forEach((el) => {
      const text = el.textContent?.replace(/\s+/g, ' ').trim();
      if (text && isPainted(el)) labels.push(text);
    });

    const ladder = spine.querySelector('[data-lens-ladder]');
    const stops = ladder?.querySelectorAll('[data-index-region]').length ?? 0;
    const doors = ladder?.querySelectorAll('[data-ladder-door]').length ?? 0;

    return { labels, stops, doors };
  });
}

/**
 * D-B21's instrument for falsifiable sentence (d): every distinct text
 * string whose nearest painted ancestor has computed `opacity > 0`,
 * `visibility: visible` and `display !== 'none'` — never a check of opacity
 * itself, because the yielded phrase is `opacity: 0` under EITHER motion
 * register and must stay excluded from the set under both (deviations.md
 * D-B21: "opacity itself is never the assertion").
 *
 * Scoped to `root` (default `[data-document-shell]`) so a caller can compare
 * just the band, just the rail, or the whole shell between motion registers
 * at the same scroll offset.
 */
export async function visibleWordSet(
  page: Page,
  root = '[data-document-shell]',
): Promise<string[]> {
  return page.evaluate((rootSelector) => {
    const rootEl = document.querySelector(rootSelector);
    if (!rootEl) return [];

    const isPainted = (el: Element): boolean => {
      let node: Element | null = el;
      while (node) {
        const style = getComputedStyle(node);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          parseFloat(style.opacity) <= 0
        ) {
          return false;
        }
        node = node.parentElement;
      }
      return true;
    };

    const words: string[] = [];
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node) {
      const text = node.textContent?.replace(/\s+/g, ' ').trim();
      const parent = node.parentElement;
      if (text && parent && isPainted(parent)) {
        words.push(text);
      }
      node = walker.nextNode();
    }
    return words;
  }, root);
}

/**
 * D-B28's network-quiet precondition — required before any "the lens fetches
 * nothing" claim (`lens-contrast.spec.ts`'s network-request assertion,
 * `lens-cls.spec.ts`'s CLS instrument).
 *
 * The paper's own initial load is a dependent-query TAIL, not a lens fetch:
 * `useProjectFfeReadiness` fires one `rpc('get_project_ffe_readiness', …)`
 * per FF&E line, at concurrency 8, only after `useProjectFFEItems` resolves
 * — 42–84 round-trips on the seeded long paper, all after `openPaper`
 * returns (D-B28's CDP probe: 0 readiness requests before the scroll, 63 at
 * steps 17–25, `scrollHeight` still climbing at the same steps). A network
 * assertion taken before that tail finishes is not measuring the lens.
 *
 * `quiet` waits for the browser's own `networkidle` state, then holds for a
 * further window with ZERO requests to the Supabase origin — the origin is
 * what the readiness fan-out (and everything else app-driven) actually hits,
 * where `networkidle` alone can be fooled by an open realtime/keepalive
 * connection. A 30s cap turns "the load never ends" into a loud failure
 * rather than a silent hang.
 */
const DEFAULT_SUPABASE_ORIGIN = 'http://127.0.0.1:54321';

function supabaseOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_ORIGIN).origin;
  } catch {
    return DEFAULT_SUPABASE_ORIGIN;
  }
}

export interface QuietResult {
  /** Every request to the Supabase origin seen while waiting for quiet. */
  supabaseRequestsSeen: number;
  /** The `get_project_ffe_readiness` fan-out specifically (D-B28's own
   *  finding) — logged by callers, never asserted against. */
  readinessRequestsSeen: number;
}

export async function quiet(
  page: Page,
  opts: { timeoutMs?: number; quietWindowMs?: number } = {},
): Promise<QuietResult> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const quietWindowMs = opts.quietWindowMs ?? 1_000;
  const origin = supabaseOrigin();

  await page.waitForLoadState('networkidle');

  let supabaseRequestsSeen = 0;
  let readinessRequestsSeen = 0;
  let lastSupabaseRequestAt = Date.now();

  const onRequest = (req: { url(): string }) => {
    const url = req.url();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (parsed.origin !== origin) return;
    supabaseRequestsSeen += 1;
    lastSupabaseRequestAt = Date.now();
    if (url.includes('get_project_ffe_readiness')) readinessRequestsSeen += 1;
  };

  page.on('request', onRequest);
  try {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (Date.now() - lastSupabaseRequestAt >= quietWindowMs) {
        return { supabaseRequestsSeen, readinessRequestsSeen };
      }
      if (Date.now() > deadline) {
        throw new Error(
          `the paper never reached network quiet — the initial load has no end ` +
            `(${supabaseRequestsSeen} Supabase-origin requests seen, ${readinessRequestsSeen} of them readiness fan-out, in ${timeoutMs}ms)`,
        );
      }
      await page.waitForTimeout(100);
    }
  } finally {
    page.off('request', onRequest);
  }
}

/**
 * D-B31's fling census — the falsifier for L-4/R4 that `scrollTo` cannot be:
 * a real fling delivers dozens of wheel deltas across many frames while the
 * lens is still catching up, which a single JS-driven jump never exercises.
 *
 * Samples every rAF from the FIRST frame where `scrollY` has changed (the
 * two pre-motion frames are not the fling) until 120ms after the LAST
 * observed movement, and at each sampled frame classifies
 * `document.elementFromPoint(innerWidth/2, innerHeight/2)`:
 *
 *   - `content`     — inside a `[data-index-region]` root that is either
 *                     `data-density="full"`, OR quiet but the point is at or
 *                     above its `[data-region-head]`'s bottom (the head+
 *                     count line print at every density, OD-13);
 *   - `blank`       — inside a quiet root BELOW its printed head (the 68/
 *                     112px reserve with nothing painted there yet), or the
 *                     point has no root ancestor, sits between two roots,
 *                     and no `[data-region-head]` on the page intersects the
 *                     viewport at all;
 *   - `pre-region`  — no root ancestor and the point is above the first
 *                     root's top (the letterhead/band paper — this prints at
 *                     every state and velocity, so it is never "blank" no
 *                     matter what the lens has or hasn't promoted, D-B31);
 *   - `post-region` — no root ancestor and the point is at or below the
 *                     last root's bottom (the colophon/foot reserve).
 *
 * `landing` reports the region key (if any) under the centre point at the
 * LAST sampled frame, and that region's `data-density` at that same moment —
 * D-B31's "the landing frame must read full `<key>`".
 */
export type BlankPaperClass = 'content' | 'blank' | 'pre-region' | 'post-region';

export interface BlankPaperSample {
  tMs: number;
  scrollY: number;
  classification: BlankPaperClass;
  regionKey: string | null;
}

export interface BlankPaperCensus {
  samples: BlankPaperSample[];
  counts: Record<BlankPaperClass, number>;
  landing: { regionKey: string | null; density: string | null };
}

type RawFlingSample = { t: number; scrollY: number; cls: BlankPaperClass; key: string | null };
type WindowWithFling = Window & {
  __flingSamples?: RawFlingSample[];
  __flingDone?: boolean;
};

export async function blankPaperCensus(
  page: Page,
  opts: { deltaY?: number; ticks?: number } = {},
): Promise<BlankPaperCensus> {
  const deltaY = opts.deltaY ?? 3200;
  const ticks = opts.ticks ?? 16;

  await page.evaluate(() => {
    const win = window as WindowWithFling;
    win.__flingSamples = [];
    win.__flingDone = false;

    const classify = (): { cls: string; key: string | null } => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const el = document.elementFromPoint(cx, cy);
      const roots = Array.from(
        document.querySelectorAll('[data-document-paper] [data-index-region]'),
      ) as HTMLElement[];
      if (roots.length === 0) return { cls: 'pre-region', key: null };

      // W4-C2: a `closest()` from the frame's centre can land on a rail
      // ladder stop (same attribute, C-4) whenever the sticky rail overlaps
      // the centre point; require the paper.
      const ownRootRaw = el ? (el.closest('[data-index-region]') as HTMLElement | null) : null;
      const ownRoot =
        ownRootRaw && ownRootRaw.closest('[data-document-paper]') ? ownRootRaw : null;
      if (ownRoot) {
        const key = ownRoot.getAttribute('data-index-region');
        const density = ownRoot.getAttribute('data-density');
        if (density === 'full') return { cls: 'content', key };
        const head = ownRoot.querySelector('[data-region-head]') as HTMLElement | null;
        // W4-C21: a quiet root with NO printed head — care's four
        // whole-paragraph branches, FF&E's install/selecting posture — has no
        // head bottom to be below. Falling back to the root's own top made
        // every point inside it read as `blank`, which is a lookahead miss the
        // lens never made. Whatever it prints, it is printing something.
        if (!head) return { cls: 'content', key };
        const headBottom = head.getBoundingClientRect().bottom;
        return { cls: cy <= headBottom ? 'content' : 'blank', key };
      }

      const firstRoot = roots[0]!;
      const lastRoot = roots[roots.length - 1]!;
      const firstTop = firstRoot.getBoundingClientRect().top;
      const lastBottom = lastRoot.getBoundingClientRect().bottom;
      if (cy < firstTop) return { cls: 'pre-region', key: null };
      if (cy >= lastBottom) return { cls: 'post-region', key: null };

      const headInFrame = roots.some((root) => {
        const head = root.querySelector('[data-region-head]');
        if (!head) return false;
        const rect = (head as HTMLElement).getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight;
      });
      return { cls: headInFrame ? 'content' : 'blank', key: null };
    };

    let lastMoveAt = performance.now();
    let lastScrollY = window.scrollY;
    let started = false;
    const start = performance.now();

    const tick = () => {
      const now = performance.now();
      const y = window.scrollY;
      if (y !== lastScrollY) {
        lastScrollY = y;
        lastMoveAt = now;
        started = true;
      }
      if (started) {
        const { cls, key } = classify();
        win.__flingSamples!.push({ t: now - start, scrollY: y, cls: cls as BlankPaperClass, key });
      }
      if (started && now - lastMoveAt > 120) {
        win.__flingDone = true;
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // The fling itself — many wheel ticks in a tight loop, ≥3000px in <300ms
  // wall-clock, which is the actual falsifier: one `scrollTo` jump is a
  // single frame of layout and never touches the lookahead line frame by
  // frame the way a real fling does.
  const perTick = Math.round(deltaY / ticks);
  for (let i = 0; i < ticks; i += 1) {
    await page.mouse.wheel(0, perTick);
  }

  await page.waitForFunction(
    () => (window as WindowWithFling).__flingDone === true,
    undefined,
    { timeout: 15_000 },
  );

  const raw = await page.evaluate(() => (window as WindowWithFling).__flingSamples ?? []);

  const counts: Record<BlankPaperClass, number> = {
    content: 0,
    blank: 0,
    'pre-region': 0,
    'post-region': 0,
  };
  for (const sample of raw) counts[sample.cls] += 1;

  const last = raw[raw.length - 1];
  const landingDensity = last?.key
    ? await page.evaluate(
        (key) =>
          // W4-C2: PAPER-scoped. The rail ladder's stops carry the same
          // `data-index-region` (C-4) and come first in document order, so an
          // unscoped read returns the ladder button — which never carries
          // `data-density`, so D-B31's landing gate could never pass.
          document
            .querySelector(`[data-document-paper] [data-index-region="${key}"]`)
            ?.getAttribute('data-density') ?? null,
        last.key,
      )
    : null;

  return {
    samples: raw.map((s) => ({
      tMs: s.t,
      scrollY: s.scrollY,
      classification: s.cls,
      regionKey: s.key,
    })),
    counts,
    landing: { regionKey: last?.key ?? null, density: landingDensity },
  };
}
