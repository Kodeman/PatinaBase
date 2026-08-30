/**
 * Reduced motion (R127 Wave 4, W4-L4) — a yield is a STATE, never an
 * animation reduced motion merely turns off.
 *
 * THE FALSIFIABLE SENTENCE (deviations.md D-B21; technical-design.md §6
 * sentence (d)): under `prefers-reduced-motion: reduce`,
 *   - no animation is still RUNNING one second after the document settles,
 *     at scrollY 0, 400 and 1200 (s0/s2/s3, `lens-band-height.spec.ts`'s own
 *     three offsets);
 *   - the VISIBLE-WORD SET (text whose nearest painted ancestor has computed
 *     `opacity > 0`, `visibility: visible`, `display !== 'none'` —
 *     `helpers/lens.ts`'s `visibleWordSet`) is IDENTICAL to the
 *     no-preference set at the same offset. Opacity itself is never the
 *     assertion (D-B21): the yielded phrase is `opacity: 0` under EITHER
 *     register, so it is excluded from both sets and the sets still match.
 *
 * `data-letterhead-in-frame` and `data-region-head-in-frame` (L-6, L-3) are
 * already wired (Wave 3, D-B23) — this file is a REAL, non-vacuous proof for
 * those two yields today; only the band's line-2 crossfade (L-1) and
 * anything gated by `data-density` remain expected-red until later W4 lanes.
 */
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { scrollTo, settle, visibleWordSet } from '../helpers/lens';
import { LONG_PAPER_ID, assertLongPaper } from './lens-fixtures';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName === 'firefox',
  'the lens specs run chromium + webkit (test-impact, "Browser ruling"); Firefox is not a shipped target for this portal',
);

/** s0, s2, s3 — the same three offsets `lens-band-height.spec.ts` measures. */
const OFFSETS = [0, 400, 1200] as const;

async function openAt(
  page: AuthenticatedPage,
  reducedMotion: 'reduce' | 'no-preference',
  offset: number,
): Promise<void> {
  await page.emulateMedia({ reducedMotion });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/doc/${LONG_PAPER_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-document-shell]')).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
  await scrollTo(page, offset);
}

test.describe('reduced motion (D-B21) — a yield holds at every motion register', () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  for (const offset of OFFSETS) {
    test(`at scrollY ${offset}: no animation is running one second after settling, under reduce`, async ({
      authenticatedPage: page,
    }) => {
      await openAt(page, 'reduce', offset);
      // The one explicit wait in this basket: the acceptance criterion IS "a
      // second later", not "eventually" — there is no attribute to poll for
      // "an animation is not about to start", so the second has to be spent.
      await page.waitForTimeout(1_000);
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === 'running')
          .map((a) => ({
            id: (a as unknown as { id?: string }).id ?? null,
            effect: a.effect?.constructor?.name ?? null,
          })),
      );
      expect(
        running,
        `animation(s) still running one second after settling, under reduce: ${JSON.stringify(running)}`,
      ).toEqual([]);
    });

    test(`at scrollY ${offset}: the visible-word set is identical between reduce and no-preference`, async ({
      authenticatedPage: page,
    }) => {
      // ONE navigation, one load of the document's own async data (the
      // approvals/schedule/etc. queries) — `emulateMedia` is toggled IN
      // PLACE rather than reloading between the two reads. Two independent
      // navigations raced the page's own data fetches against each other
      // (observed live: "Reading…" — a transient loading placeholder — vs
      // the settled count line, on the SAME region, purely because the two
      // loads' queries resolved at different wall-clock moments) — a false
      // divergence that had nothing to do with the motion register.
      //
      // A second race survived that fix: the band's standing/red-letter
      // query (the source of line 2's worst-item sentence and its act) can
      // still be in flight when `settle()` — a LENS state settle, not a data
      // settle — returns, so an immediate snapshot can catch a transient
      // short form (observed live: "Chase the approval" alone) where the
      // fully-loaded read gets the sentence, its act button and "+N MORE".
      // `waitForResponse`-per-query is fragile (the query set is data-
      // dependent); polling the word set until two consecutive reads agree
      // is the generic fix and costs nothing once the data is already in.
      async function stableWordSet(): Promise<string[]> {
        let previous = await visibleWordSet(page);
        for (let i = 0; i < 10; i += 1) {
          await page.waitForTimeout(150);
          const next = await visibleWordSet(page);
          if (JSON.stringify(next) === JSON.stringify(previous)) return next;
          previous = next;
        }
        return previous;
      }

      await openAt(page, 'no-preference', offset);
      const normal = await stableWordSet();

      await page.emulateMedia({ reducedMotion: 'reduce' });
      await settle(page);
      const reduced = await stableWordSet();

      const normalSet = new Set(normal);
      const reducedSet = new Set(reduced);
      const onlyInNormal = normal.filter((word) => !reducedSet.has(word));
      const onlyInReduced = reduced.filter((word) => !normalSet.has(word));

      expect(
        { onlyInNormal, onlyInReduced },
        'the visible-word set differs between motion registers at the same offset — D-B21 forbids opacity/visibility/display divergence between them',
      ).toEqual({ onlyInNormal: [], onlyInReduced: [] });
    });
  }
});
