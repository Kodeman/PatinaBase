/**
 * D-B31 — the fling census: pre-first-region paper is not blank paper (R127
 * Wave 4, R4's gate).
 *
 * THE FALSIFIABLE SENTENCE: a real wheel fling from s0 to s3 — `mouse.wheel`
 * ticks totalling >=3000px in under 300ms wall-clock, never `scrollTo` (one
 * JS-driven jump is a single frame of layout and never exercises the 240px
 * lookahead the way a real fling's many frames do) — crosses whatever the
 * lens has not yet promoted with AT MOST ONE blank frame, and the frame the
 * fling lands on reads `full` for whatever stop is under its centre.
 *
 * WHAT "BLANK" MEANS (D-B31, amending the plan's original instrument): the
 * plan's gate was "blank paper >1 frame -> lookahead grows", but the first
 * measurement (chromium, `…d5`, 3200px in 257ms, 104 sampled frames) found
 * 2 frames whose centre sat over the LETTERHEAD/BAND PAPER — above the first
 * region root entirely — before the wheel had even moved the page. That is
 * not blank paper: the letterhead, its ledger and the band print at every
 * state and velocity, and no lookahead setting could change what stands
 * there. Counting it measures nothing about L-4. The corrected instrument
 * (`blankPaperCensus`, `e2e/helpers/lens.ts` — the same code the design
 * lead's walk quotes) separates that "pre-region" paper, and "post-region"
 * paper below the last root, from the one thing L-4 actually promises:
 * nothing between the first and last root is ever un-painted ahead of a
 * settled reading position. Under the corrected instrument the ORIGINAL run
 * read 0 blank frames of 104, and `LENS_LOOKAHEAD_PX = 240` stands — this
 * spec is what proves that on every future run, not just the one probe.
 *
 * `pre-region` and `post-region` counts are printed every run and never
 * gated — they are the paper's own frame, not the lens's promise.
 *
 * BROWSERS: chromium + webkit. Firefox is skipped with its reason, the
 * repo's own idiom (`e2e/header/global-header.spec.ts:28-32`).
 */
import { test, expect } from '../fixtures/auth';
import { scrollTo, settle, blankPaperCensus } from '../helpers/lens';
import { LONG_PAPER_ID, assertLongPaper } from './lens-fixtures';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName === 'firefox',
  'the lens specs run chromium + webkit (test-impact, "Browser ruling"); Firefox is not a shipped target for this portal and its sub-pixel box model would make an exact frame-by-frame classification a coin-toss',
);

/** D-B31: "two is a pattern" — one frame is one 16ms miss at the lookahead
 *  line, which the instrument's own rAF granularity cannot fully close. */
const MAX_BLANK_FRAMES = 1;

/** D-B31's own probe: 3200px in 257ms is what a real trackpad fling does. */
const FLING_DELTA_Y = 3200;

test.describe('the fling census (D-B31) — pre-first-region paper is not blank paper', () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  test('a wheel fling s0→s3 crosses the lookahead with at most one blank frame, and lands full', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/doc/${LONG_PAPER_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-document-shell]')).toBeVisible({
      timeout: 30_000,
    });
    await settle(page);
    await scrollTo(page, 0);
    await settle(page);

    const census = await blankPaperCensus(page, { deltaY: FLING_DELTA_Y });

    const lines = census.samples
      .map(
        (s) =>
          `  t=${s.tMs.toFixed(0)}ms y=${s.scrollY} ${s.classification}` +
          `${s.regionKey ? ` (${s.regionKey})` : ''}`,
      )
      .join('\n');
    console.log(
      `D-B31 fling census (${census.samples.length} frames): ` +
        `content=${census.counts.content} blank=${census.counts.blank} ` +
        `pre-region=${census.counts['pre-region']} post-region=${census.counts['post-region']}\n` +
        lines,
    );

    expect(
      census.counts.blank,
      `blank frame(s) — paper the lens should have promoted stood un-painted under the reader:\n${lines}`,
    ).toBeLessThanOrEqual(MAX_BLANK_FRAMES);

    expect(
      census.landing.regionKey,
      `the fling landed with no [data-index-region] under the frame centre:\n${lines}`,
    ).not.toBeNull();
    expect(
      census.landing.density,
      `the landing stop ("${census.landing.regionKey}") is not full:\n${lines}`,
    ).toBe('full');
  });
});
