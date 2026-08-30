/**
 * The lens's density invariant, in the exact form D-B16 states it (R127
 * Wave 4, W4-L4).
 *
 * THE FALSIFIABLE SENTENCES (deviations.md D-B16; technical-design.md §6
 * sentence (b)): at scrollY 0, 400 and 1200, and on a deep-landed load —
 *   (i)   no `[data-density="quiet"]` root has `rect.top <= innerHeight + 240`
 *         (`LENS_LOOKAHEAD_PX`, restated here — e2e cannot import the app's
 *         TS constants module);
 *   (ii)  every `[data-passed]` root is `full` (passing never demotes, and a
 *         passed-but-quiet root is exactly the bug D-B16 closes);
 *   (iii) `full` count >= 1 whenever any root is in the frame — never `=== 1`
 *         (the earlier form "full === intersecting ∪ passed" is retired).
 *
 * PRE-WAVE-4 REALITY: `data-density` and `data-passed` do not exist on this
 * branch yet (`use-lens-density.ts` is a separate, uncommitted lane — W4-L1).
 * Every `[data-index-region]` root already exists (Wave 2/3), so queries for
 * "quiet" or "passed" roots correctly return EMPTY sets today, which makes
 * (i) and (ii) pass VACUOUSLY — that is not a false green, it is "nothing to
 * falsify yet". Sentence (iii) is written so it CANNOT pass vacuously: it
 * asserts `full >= 1` whenever a root is in the frame, which is currently
 * true for every offset on the long paper and currently FALSE for `full`
 * (no root ever carries `data-density="full"`) — that is this wave's honest
 * red, and it turns green the moment W4-L1/L2/L3 attach the observer.
 */
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { quiet, scrollTo, scrollSteps, settle } from '../helpers/lens';
import {
  LONG_PAPER_ID,
  PRE_WORK_ID,
  FOURTH_STOP_HEADING_ID,
  assertLongPaper,
} from './lens-fixtures';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName === 'firefox',
  'the lens specs run chromium + webkit (test-impact, "Browser ruling"); Firefox is not a shipped target for this portal',
);

/** OD-3 `LENS_LOOKAHEAD_PX` — restated (CSS/e2e cannot import `lens-constants.ts`). */
const LOOKAHEAD_PX = 240;

const OFFSETS = [0, 400, 1200] as const;

interface RegionRect {
  key: string | null;
  density: string | null;
  passed: boolean;
  top: number;
  offsetTop: number;
}

async function openPaper(
  page: AuthenticatedPage,
  path = `/doc/${LONG_PAPER_ID}`,
): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-document-shell]')).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
}

async function regionRects(page: AuthenticatedPage): Promise<RegionRect[]> {
  return page.evaluate(() =>
    Array.from(
      document.querySelectorAll('[data-document-paper] [data-index-region]'),
    ).map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        key: el.getAttribute('data-index-region'),
        density: el.getAttribute('data-density'),
        passed: el.hasAttribute('data-passed'),
        top: rect.top,
        offsetTop: (el as HTMLElement).offsetTop,
      };
    }),
  );
}

test.describe('the lens density — one direction (D-B16)', () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  for (const offset of OFFSETS) {
    test(`at scrollY ${offset}: no quiet root is inside the lookahead, every passed root is full, full >= 1 while a root is in frame`, async ({
      authenticatedPage: page,
    }) => {
      await openPaper(page);
      await scrollTo(page, offset);
      const innerHeight = await page.evaluate(() => window.innerHeight);
      const rects = await regionRects(page);
      expect(
        rects.length,
        'no [data-index-region] roots found on the long paper',
      ).toBeGreaterThan(0);

      const quietTooClose = rects.filter(
        (r) => r.density === 'quiet' && r.top <= innerHeight + LOOKAHEAD_PX,
      );
      expect(
        quietTooClose,
        `(i) quiet roots inside the lookahead line: ${JSON.stringify(quietTooClose)}`,
      ).toEqual([]);

      const passedNotFull = rects.filter((r) => r.passed && r.density !== 'full');
      expect(
        passedNotFull,
        `(ii) passed roots that are not full: ${JSON.stringify(passedNotFull)}`,
      ).toEqual([]);

      const inFrame = rects.filter((r) => r.top < innerHeight);
      const fullCount = rects.filter((r) => r.density === 'full').length;
      expect(
        inFrame.length,
        'no region is in frame at all at this offset — the invariant has nothing to check',
      ).toBeGreaterThan(0);
      expect(
        fullCount,
        `(iii) full count is ${fullCount} while ${inFrame.length} region(s) are in frame — ` +
          'expected until the density observer (W4-L1/L2/L3) attaches `data-density`',
      ).toBeGreaterThanOrEqual(1);
    });
  }

  test('on a deep-landed load (native #-anchor to the fourth stop), the same invariant holds at first settle', async ({
    authenticatedPage: page,
  }) => {
    // D-B16's own scenario: a root discovered already at or above the
    // lookahead line must be promoted in the SAME commit as discovery — no
    // app-level deep-link mechanism exists, so the browser's OWN fragment
    // scroll (no JS needed) is what produces "discovered already in frame".
    await openPaper(page, `/doc/${LONG_PAPER_ID}#${FOURTH_STOP_HEADING_ID}`);
    const innerHeight = await page.evaluate(() => window.innerHeight);
    const rects = await regionRects(page);

    const quietTooClose = rects.filter(
      (r) => r.density === 'quiet' && r.top <= innerHeight + LOOKAHEAD_PX,
    );
    expect(quietTooClose, JSON.stringify(quietTooClose)).toEqual([]);

    // W4-C19: D-B16 names invariant (ii) as part of the set asserted "at 0 /
    // 400 / 1200 AND on a deep-landed load" — and the deep landing is the one
    // scenario where a passed-but-quiet root is actually reachable, because
    // everything above the frame is discovered and marked in the same commit.
    const passedNotFull = rects.filter((r) => r.passed && r.density !== 'full');
    expect(
      passedNotFull,
      `(ii) passed roots that are not full: ${JSON.stringify(passedNotFull)}`,
    ).toEqual([]);

    const inFrame = rects.filter((r) => r.top < innerHeight);
    const fullCount = rects.filter((r) => r.density === 'full').length;
    expect(inFrame.length).toBeGreaterThan(0);
    expect(
      fullCount,
      'D-B16: a region discovered already in view must be promoted at once, not left quiet-with-data-passed',
    ).toBeGreaterThanOrEqual(1);
  });

  test("region-top invariant: scrolling down past three stops and back up moves no root's offsetTop", async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    await scrollTo(page, 0);
    // The origin is the SETTLED, QUIET s0 — D-B28's own ruled precondition
    // (`openPaper → settle → scrollTo(0) → settle → quiet`), and the same
    // origin the forward-walk invariant below and `lens-cls.spec.ts` already
    // take.
    //
    // WHY, measured against the production build on :3000 (`48758d597`),
    // chromium, 1440×900, `…d5`: `money`'s offsetTop reads 7739 immediately
    // after `settle()` and 7715 after `quiet()` — the whole −24px, WITH NO
    // SCROLLING BETWEEN THE TWO READS. From the quiet origin the round trip is
    // 7715 → 7715. So the lens is not what moves it.
    //
    // What moves it is one element: `<SectionLoadingLine label="Checking
    // readiness" className="mb-2" />` (`ffe-section.tsx`), a `role="status"`
    // skeleton gated on `readinessQuery.isLoading`, sitting inside
    // `#project-ffe`. Its box is 17.25px of content + a 4.5px top margin
    // (`my-1` at this route's 18px root), its 9px bottom margin collapsing
    // into the next sibling's 18px; it unmounts when the dependent readiness
    // fan-out resolves, and `#ffe-region-body` → `#project-ffe` →
    // `#doc-section-project` → `main` each lose exactly 24.000px. FF&E reads
    // `data-density="full"` at BOTH ends, so no promotion is involved — and
    // `region-box-signature.ts` holds the quiet-vs-full box in jest besides.
    //
    // D-B28 already ruled this exact query: the fan-out is "the last thing the
    // initial load does", `__lensSettled()` "is a scroll-velocity settle … it
    // says nothing about the network", and the remedy it ships is `quiet()`.
    // The 24px is a coincidence of arithmetic, not `--doc-region-gap`.
    await quiet(page);
    await settle(page);
    const before = await regionRects(page);

    await scrollSteps(page, 2400);
    await scrollSteps(page, 0);
    const after = await regionRects(page);

    for (const b of before) {
      const a = after.find((r) => r.key === b.key);
      expect(a, `region "${b.key}" missing after the round trip`).toBeTruthy();
      expect(
        a!.offsetTop,
        `region "${b.key}" offsetTop moved: ${b.offsetTop} -> ${a!.offsetTop}`,
      ).toBe(b.offsetTop);
    }
  });

  test('scrollHeight never shrinks, and no root above the frame top ever moves, across a full forward walk', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    await scrollTo(page, 0);
    // The origin is the SETTLED, QUIET s0 — D-B29's own origin. `settle()`
    // answers only for the lens; the paper's own queries can still be landing
    // after it, and a late 11px arriving above the first region between the
    // baseline read and the first step is a DATA arrival, not the lens moving
    // a root above the frame. (Measured: the anchor read 315 immediately after
    // the first settle and 326 from the next step on, with the letterhead
    // 192.06px and the band 56px unchanged at both.) With the quiet origin the
    // walk measures what the invariant is about.
    await quiet(page);
    await settle(page);
    const anchorKey = (await regionRects(page))[0]?.key ?? null;
    expect(anchorKey, 'no first region to anchor on').not.toBeNull();

    let lastScrollHeight = 0;
    let lastAnchorOffsetTop: number | null = null;

    for (let y = 0; y <= 2000; y += 200) {
      await scrollTo(page, y);
      const scrollHeight = await page.evaluate(
        () => document.documentElement.scrollHeight,
      );
      const anchorOffsetTop = await page.evaluate((key) => {
        // W4-C4: PAPER-scoped. The rail ladder's stops carry the same
        // `data-index-region` (C-4) and precede `<main>` in document order, so
        // an unscoped query reads a `sticky` button that cannot move whatever
        // the paper does — the assertion below would be true by construction.
        const el = document.querySelector(
          `[data-document-paper] [data-index-region="${key}"]`,
        );
        return el ? (el as HTMLElement).offsetTop : null;
      }, anchorKey);

      expect(
        scrollHeight,
        `scrollHeight shrank at scrollY ${y}: ${lastScrollHeight} -> ${scrollHeight}`,
      ).toBeGreaterThanOrEqual(lastScrollHeight);
      if (lastAnchorOffsetTop !== null) {
        expect(
          anchorOffsetTop,
          `the first region's offsetTop moved at scrollY ${y}: ${lastAnchorOffsetTop} -> ${anchorOffsetTop}`,
        ).toBe(lastAnchorOffsetTop);
      }
      lastScrollHeight = scrollHeight;
      lastAnchorOffsetTop = anchorOffsetTop;
    }
  });

  test('the first quiet→full boundary is crossed exactly once, in one direction (40px settled steps, ±24px around the crossing)', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    await quiet(page);
    await scrollTo(page, 0);
    const innerHeight = await page.evaluate(() => window.innerHeight);
    const rects = await regionRects(page);

    // A target that starts OUTSIDE the initial lookahead window AND IS STILL
    // QUIET, so it has a real quiet->full crossing ahead of it. Distance alone
    // is not enough: `data-density` is the FOLD's answer, and the lens is only
    // its fourth voice — a region whose own data opens it (D-B27's FF&E
    // install/care `forceOpen`, a default-open posture) prints `full` at s0
    // however far down the paper it sits, and bisecting for a crossing it will
    // never make is a test that cannot pass for a reason that is not a defect.
    const candidate = rects
      .filter((r) => r.top > innerHeight + LOOKAHEAD_PX && r.density !== 'full')
      .sort((a, b) => a.top - b.top)[0];
    expect(
      candidate,
      `no region starts outside the initial lookahead window AND quiet at this viewport — nothing to bisect. rects: ${JSON.stringify(
        rects.map((r) => ({ key: r.key, top: Math.round(r.top), density: r.density })),
      )}`,
    ).toBeTruthy();
    const target = candidate!.key!;

    const totalHeight = await page.evaluate(
      () => document.documentElement.scrollHeight - window.innerHeight,
    );

    async function densityAt(y: number): Promise<string | null> {
      await scrollTo(page, y);
      return page.evaluate(
        (key) =>
          // W4-C2: paper-scoped — the ladder stop carries no `data-density`,
          // so an unscoped read is always `null` and can never reach 'full'.
          document
            .querySelector(`[data-document-paper] [data-index-region="${key}"]`)
            ?.getAttribute('data-density') ?? null,
        target,
      );
    }

    // A FORWARD walk, not a bisection. The lens never demotes (D-B16), so a
    // bisection that scrolls back up re-reads a root its own earlier probe
    // already promoted and every later reading is `full` — the instrument
    // destroys the state it is measuring. (Measured: the bisection's ±24px
    // sweep returned `[{y:0,full},{y:40,full},{y:80,full}]` on a target the
    // same test had just asserted was quiet at scrollY 0.) One walk down the
    // paper at the reader's own 40px pace answers the sentence directly: the
    // boundary is crossed exactly once, and never back.
    const readings: { y: number; density: string | null }[] = [];
    let sawFull = false;
    let after = 0;
    for (let y = 0; y <= totalHeight; y += 40) {
      const density = await densityAt(y);
      readings.push({ y, density });
      if (density === 'full') {
        sawFull = true;
        after += 1;
        // Three steps past the crossing is enough to catch a flap back.
        if (after >= 3) break;
      }
    }
    expect(
      sawFull,
      `"${target}" never turned full over the whole paper: ${JSON.stringify(readings)}`,
    ).toBe(true);

    let transitions = 0;
    let sawFullToQuiet = false;
    for (let i = 1; i < readings.length; i += 1) {
      const prevFull = readings[i - 1]!.density === 'full';
      const curFull = readings[i]!.density === 'full';
      if (prevFull !== curFull) {
        transitions += 1;
        if (prevFull && !curFull) sawFullToQuiet = true;
      }
    }

    expect(transitions, `readings: ${JSON.stringify(readings)}`).toBe(1);
    expect(sawFullToQuiet, 'the boundary was crossed in the wrong direction (full -> quiet)').toBe(
      false,
    );
  });

  test('data-reading-index on the shell and rail names the full region; at 390 the mobile bar carries it', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    await scrollTo(page, 1200);

    const shellIndex = await page
      .locator('[data-document-shell]')
      .getAttribute('data-reading-index');
    expect(shellIndex, 'the shell publishes no data-reading-index while in view').not.toBeNull();

    const railIndex = await page
      .getByRole('navigation', { name: 'This paper' })
      .getAttribute('data-reading-index');
    expect(railIndex).toBe(shellIndex);

    const density = await page.evaluate(
      (key) =>
        // W4-C2: paper-scoped, as above.
        document
          .querySelector(`[data-document-paper] [data-index-region="${key}"]`)
          ?.getAttribute('data-density') ?? null,
      shellIndex,
    );
    expect(
      density,
      `the reading stop ("${shellIndex}") is not marked full`,
    ).toBe('full');

    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    const barIndex = await page
      .getByRole('navigation', { name: 'Document bar' })
      .getAttribute('data-reading-index');
    expect(barIndex).toBe(shellIndex);
  });

  test('D-B36 — opening and closing the standing sheet at s2 changes neither the density map nor the lens state', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page);
    await scrollTo(page, 400);

    const readState = () =>
      page
        .locator('[data-document-shell]')
        .getAttribute('data-lens-state');
    const readMap = async () =>
      (await regionRects(page)).map(
        (region) => `${region.key}:${region.density}:${region.passed ? 'passed' : '-'}`,
      );

    const before = await readMap();
    const stateBefore = await readState();

    const door = page.locator('[data-lens-more]');
    if ((await door.count()) === 0) {
      // The sheet's door only prints when a second standing item is withheld.
      // On a seed where it does not, there is no sheet to open and nothing to
      // assert — say so rather than passing quietly.
      test.skip(true, 'no [data-lens-more] door on this paper — no standing sheet to open');
    }
    await door.first().click();
    await expect(
      page.locator('[data-doc-sheet-kind="standing"]'),
    ).toBeVisible();
    await settle(page);

    // A sheet is an overlay over the paper, not a move of it: the lens neither
    // freezes (its state is unchanged) nor re-reads (the map is unchanged).
    expect(await readState()).toBe(stateBefore);
    expect(await readMap()).toEqual(before);

    await page.keyboard.press('Escape');
    await expect(
      page.locator('[data-doc-sheet-kind="standing"]'),
    ).toHaveCount(0);
    await settle(page);

    expect(await readState()).toBe(stateBefore);
    expect(await readMap()).toEqual(before);
  });

  // W5 — the pre-work paper (`…d6`, a sent/unopened proposal with no
  // project behind it). D-B16's invariant is restated on it (a paper with
  // four stops instead of six or seven is still one density direction), and
  // W4-R1 is asserted directly: none of the six project-only stop keys ever
  // mount here — this paper's own regions (`proposal`, `scope`, `vision`,
  // `investment`) and the `record` stop are the whole set.
  test('the pre-work paper (…d6): D-B16 holds on the proposal spread, and none of the six project keys ever mount', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, `/doc/${PRE_WORK_ID}`);
    const innerHeight = await page.evaluate(() => window.innerHeight);
    const rects = await regionRects(page);
    expect(rects.length, 'no [data-index-region] roots found on the pre-work paper').toBeGreaterThan(0);

    // W4-R1 — a quiet Pieces or Money head on a brief/proposal spread would
    // be a fiction; the spec asserts zero of the six stop bodies mount here.
    const PROJECT_KEYS = ['approvals', 'schedule', 'ffe', 'money', 'care'];
    const mountedKeys = rects.map((r) => r.key);
    for (const key of PROJECT_KEYS) {
      expect(
        mountedKeys,
        `"${key}" must never mount on the pre-work paper (W4-R1): ${JSON.stringify(mountedKeys)}`,
      ).not.toContain(key);
    }
    // `record` mounts on every pre-work spread (OD-2); the proposal spread's
    // own four stops are re-parented under it (W5-R2 item 1).
    expect(mountedKeys).toEqual(
      expect.arrayContaining(['proposal', 'scope', 'vision', 'investment', 'record']),
    );

    // D-B16, the same three sentences the long-paper cases assert, at rest —
    // scoped to `[data-document-paper]` from the start (`regionRects` already
    // does; the C2 unscoped-rail-selector defect this file's review note
    // warns about lives in the rail, not in this paper-scoped query).
    const quietTooClose = rects.filter(
      (r) => r.density === 'quiet' && r.top <= innerHeight + LOOKAHEAD_PX,
    );
    expect(
      quietTooClose,
      `(i) quiet roots inside the lookahead line: ${JSON.stringify(quietTooClose)}`,
    ).toEqual([]);

    const passedNotFull = rects.filter((r) => r.passed && r.density !== 'full');
    expect(
      passedNotFull,
      `(ii) passed roots that are not full: ${JSON.stringify(passedNotFull)}`,
    ).toEqual([]);

    const inFrame = rects.filter((r) => r.top < innerHeight);
    const fullCount = rects.filter((r) => r.density === 'full').length;
    expect(inFrame.length, 'no region is in frame at all on the pre-work paper').toBeGreaterThan(0);
    expect(
      fullCount,
      `(iii) full count is ${fullCount} while ${inFrame.length} region(s) are in frame`,
    ).toBeGreaterThanOrEqual(1);
  });
});

/**
 * D-B46 — the cold load, which is the only state the defect ever appeared in.
 *
 * The lead's probe: on a fresh load the first five roots mount into a ~2,600px
 * skeleton (schedule 89px, FF&E 282px against 923 / 5,780 settled), so `money`
 * and `record` sit inside `innerHeight + 240` AT MOUNT. The layout-effect pass
 * promoted them, and one direction meant `record` stood `full` 9,033px below
 * the frame for the rest of the session. Every other case in this file scrolls
 * first and so measures a paper that has long since resolved — which is why
 * they were all green while this was true.
 *
 * The acceptance map is the lead's, verbatim (`w4-review-design.md` §1).
 */
test.describe('the cold load — the lens waits for the paper (D-B46)', () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  const CELLS = [
    {
      width: 1440,
      height: 900,
      full: ['approvals', 'schedule'],
      quiet: ['ffe', 'money', 'care', 'record'],
    },
    {
      width: 390,
      height: 844,
      full: ['approvals'],
      quiet: ['schedule', 'ffe', 'money', 'care', 'record'],
    },
  ] as const;

  for (const cell of CELLS) {
    test(`at ${cell.width}: only the stops at the lookahead line are full, and nothing below it is`, async ({
      authenticatedPage: page,
    }) => {
      await page.setViewportSize({ width: cell.width, height: cell.height });

      // Cold by construction: the query cache lives in memory, so a full
      // navigation starts with an empty one. The storage clear takes the
      // remembered folds with it, so no explicit choice can stand in for a
      // density the lens is supposed to be deciding.
      await page.goto('/desk', { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        try {
          window.localStorage.clear();
        } catch {
          /* private mode — nothing was remembered anyway */
        }
      });
      await page.goto(`/doc/${LONG_PAPER_ID}`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-document-shell]')).toBeVisible({
        timeout: 30_000,
      });

      // No scroll anywhere in this case: what is asserted is the state the
      // lens arrives at on its own.
      await settle(page);
      await quiet(page);
      await settle(page);

      const innerHeight = await page.evaluate(() => window.innerHeight);
      const rects = await regionRects(page);
      const map = Object.fromEntries(
        rects.map((r) => [r.key, `${r.density}@${Math.round(r.top)}`]),
      );

      for (const key of cell.full) {
        const region = rects.find((r) => r.key === key);
        expect(region, `no [data-index-region="${key}"] root on the paper`).toBeTruthy();
        expect(
          region!.density,
          `${key} should be full at the cold load — map: ${JSON.stringify(map)}`,
        ).toBe('full');
      }
      for (const key of cell.quiet) {
        const region = rects.find((r) => r.key === key);
        if (!region) continue;
        expect(
          region.density,
          `${key} sits ${Math.round(region.top)}px down and must be quiet on a cold load — ` +
            `map: ${JSON.stringify(map)}`,
        ).toBe('quiet');
      }

      // D-B16's invariants, at this settle too.
      const quietTooClose = rects.filter(
        (r) => r.density === 'quiet' && r.top <= innerHeight + LOOKAHEAD_PX,
      );
      expect(
        quietTooClose,
        `(i) quiet roots inside the lookahead line: ${JSON.stringify(quietTooClose)}`,
      ).toEqual([]);
      const passedNotFull = rects.filter((r) => r.passed && r.density !== 'full');
      expect(
        passedNotFull,
        `(ii) passed roots that are not full: ${JSON.stringify(passedNotFull)}`,
      ).toEqual([]);
      const fullCount = rects.filter((r) => r.density === 'full').length;
      expect(fullCount, '(iii) full count while roots are in frame').toBeGreaterThanOrEqual(1);
    });
  }

  test('a warm second navigation arrives with the first stop already full', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/doc/${LONG_PAPER_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-document-shell]')).toBeVisible({
      timeout: 30_000,
    });
    await settle(page);
    await quiet(page);

    await page.goto(`/doc/${LONG_PAPER_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-document-shell]')).toBeVisible({
      timeout: 30_000,
    });
    await settle(page);

    const shell = page.locator('[data-document-shell]');
    await expect(shell).toHaveAttribute('data-lens-resolved', 'true');
    const approvals = await page.evaluate(() =>
      document
        .querySelector('[data-document-paper] [data-index-region="approvals"]')
        ?.getAttribute('data-density'),
    );
    expect(approvals).toBe('full');
  });
});
