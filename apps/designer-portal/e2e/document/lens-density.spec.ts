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
import { scrollTo, scrollSteps, settle } from '../helpers/lens';
import {
  LONG_PAPER_ID,
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
    await scrollTo(page, 0);
    const innerHeight = await page.evaluate(() => window.innerHeight);
    const rects = await regionRects(page);

    // A target that starts OUTSIDE the initial lookahead window, so it has a
    // real quiet->full crossing ahead of it rather than being pre-promoted.
    const candidate = rects
      .filter((r) => r.top > innerHeight + LOOKAHEAD_PX)
      .sort((a, b) => a.top - b.top)[0];
    expect(
      candidate,
      'no region starts outside the initial lookahead window at this viewport — nothing to bisect',
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

    let lo = 0;
    let hi = Math.max(40, Math.floor(totalHeight / 40) * 40);
    const loDensity = await densityAt(lo);
    expect(
      loDensity,
      `"${target}" is already full at scrollY 0 — pick a target further down the paper`,
    ).not.toBe('full');
    const hiDensity = await densityAt(hi);
    expect(
      hiDensity,
      `"${target}" never becomes full even scrolled to the foot (${hi}px) — expected until the density observer is wired (W4-L1/L2/L3)`,
    ).toBe('full');

    while (hi - lo > 40) {
      const mid = Math.round((lo + hi) / 2 / 40) * 40;
      if (mid === lo || mid === hi) break;
      const midDensity = await densityAt(mid);
      if (midDensity === 'full') hi = mid;
      else lo = mid;
    }

    const from = Math.max(0, lo - 40 - 24);
    const to = hi + 40 + 24;
    const readings: { y: number; density: string | null }[] = [];
    for (let y = from; y <= to; y += 40) {
      readings.push({ y, density: await densityAt(y) });
    }

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
});
