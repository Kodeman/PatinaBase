/**
 * The rail's own budget (R127 Wave 4, W4-L4).
 *
 * RF-05 retired the reconciliation's original ink-coverage percentage (SC4)
 * in favour of a label-count instrument (program-plan.md, Team: "RF-05 SC4
 * -> retire 70%, instrument = <=13 rail labels"). This file reports the two
 * retired percentages for visibility — they are DIAGNOSTIC ONLY, never
 * asserted — and gates on the one instrument that survived: the count of
 * DISTINCT VISIBLE rail labels, against the formula the walker already uses
 * (three fixed head labels + one per stop + the "Filed with this job" line +
 * one per door). Measured live on the long paper at 1440/s0: 3 + 6 stops +
 * 1 + 4 doors = 14, which is where the task's stated ceiling comes from.
 *
 * The gate is computed from the SAME document it measures (`railCensus`
 * reads `stops`/`doors` off the live DOM), so a correct wave that adds a
 * seventh stop or a fifth door (OD-8's proposal-spread `clientcopy` door)
 * raises its own ceiling rather than tripping this test — only an
 * UNBUDGETED label (one the formula does not account for at all) fails it.
 */
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { quiet, scrollTo, settle, railCensus } from '../helpers/lens';
import { LONG_PAPER_ID, PRE_WORK_ID, assertLongPaper } from './lens-fixtures';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName === 'firefox',
  'the lens specs run chromium + webkit (test-impact, "Browser ruling"); Firefox is not a shipped target for this portal',
);

/** The fixed head furniture (household + the stage phrase's top/bottom
 *  spans) and the fixed "Filed with this job" doors-head line — both
 *  constants regardless of document, per the walker's own formula. */
const FIXED_HEAD_LABELS = 3;
const FIXED_DOORS_HEAD_LABEL = 1;

async function openPaper(page: AuthenticatedPage, id: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/doc/${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-document-shell]')).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
}

/** The two retired-SC4 percentages, printed for visibility only. */
async function reportInkAndSpan(page: AuthenticatedPage): Promise<void> {
  const stats = await page.evaluate(() => {
    const spine = document.querySelector('[data-document-spine]');
    const ladder = spine?.querySelector('[data-lens-ladder]');
    if (!spine || !ladder) return null;

    const spineRect = spine.getBoundingClientRect();
    const ladderRect = ladder.getBoundingClientRect();
    const spanPercent = spineRect.height > 0 ? (ladderRect.height / spineRect.height) * 100 : 0;

    // "Merged ink": the fraction of the rail's printed characters set in the
    // muted/quiet ink register (`--text-muted`) rather than the primary/
    // charcoal register — a rough proxy for how much of the rail reads as
    // background texture rather than foreground signal.
    let mutedChars = 0;
    let totalChars = 0;
    spine.querySelectorAll('*').forEach((el) => {
      const text = el.textContent?.trim();
      if (!text || el.children.length > 0) return; // leaf text nodes only
      totalChars += text.length;
      const color = getComputedStyle(el).color;
      if (/rgb\(101,\s*89,\s*78\)|rgb\(140,/.test(color)) {
        // best-effort: the muted ramp's rendered rgb() values vary by token;
        // this is a coarse signal, reported not gated.
        mutedChars += text.length;
      }
    });
    const inkPercent = totalChars > 0 ? (mutedChars / totalChars) * 100 : 0;

    return { spanPercent, inkPercent };
  });

  if (stats) {
    console.log(
      `rail span %: ${stats.spanPercent.toFixed(1)} (ladder height / spine height) · ` +
        `merged-ink % (coarse, muted-vs-total leaf characters): ${stats.inkPercent.toFixed(1)}`,
    );
  } else {
    console.log('rail span %/merged-ink %: could not measure ([data-document-spine] or the ladder missing)');
  }
}

test.describe('the rail budget', () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  test('the long paper (…d5) at 1440/s0: distinct visible rail labels <= 3 + stops + 1 + doors', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID);
    await scrollTo(page, 0);
    await reportInkAndSpan(page);

    const census = await railCensus(page);
    const distinct = new Set(census.labels);
    const ceiling = FIXED_HEAD_LABELS + census.stops + FIXED_DOORS_HEAD_LABEL + census.doors;

    console.log(
      `long paper rail census: ${distinct.size} distinct labels (${census.stops} stops, ${census.doors} doors) — ceiling ${ceiling}`,
    );
    expect(
      distinct.size,
      `labels: ${JSON.stringify([...distinct])}`,
    ).toBeLessThanOrEqual(ceiling);
  });

  test('the pre-work paper (…d6) at 1440/s0: distinct visible rail labels <= its own 3 + stops + 1 + doors', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, PRE_WORK_ID);
    await scrollTo(page, 0);
    await reportInkAndSpan(page);

    const census = await railCensus(page);
    const distinct = new Set(census.labels);
    const ceiling = FIXED_HEAD_LABELS + census.stops + FIXED_DOORS_HEAD_LABEL + census.doors;

    console.log(
      `pre-work paper rail census: ${distinct.size} distinct labels (${census.stops} stops, ${census.doors} doors) — ceiling ${ceiling}`,
    );
    // `…d6` is a sent proposal with no project: the proposal spread's own
    // four stops (proposal/scope/vision/investment) plus `record` — five,
    // never the long paper's six/seven (OD-2, W4-R1). A self-derived ceiling
    // alone would pass even if a stop went missing; this pins the count the
    // program plan states ("5 stops on the proposal spread").
    expect(
      census.stops,
      `expected 5 stops on the pre-work paper's proposal spread, saw ${census.stops}`,
    ).toBe(5);
    expect(
      distinct.size,
      `labels: ${JSON.stringify([...distinct])}`,
    ).toBeLessThanOrEqual(ceiling);
  });

  /**
   * D-B37 — the rail holds its own layout while the reader moves.
   *
   * THE FALSIFIABLE SENTENCE: over the same 30-step settled scroll the CLS spec
   * walks, every ladder segment's height is constant except on a step where the
   * reading index changed — because the only thing that may re-deal the track is
   * the index moving, never the L-6 yield. The yield used to UNRENDER the value
   * line, which took its box with it: the segment fell back toward its
   * `flex-basis` floor and `flex-grow: extent` re-dealt the freed height across
   * every sibling, so one head crossing the frame reflowed the whole rail.
   */
  test('D-B37 — every segment height is constant across a 30-step scroll except on an index change', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID);
    // The origin is the SETTLED, QUIET s0 — D-B28's ruled precondition, and
    // the same origin `lens-density`'s two region-top invariants and
    // `lens-cls` already take. A ladder segment's floor is DERIVED from its
    // value's wrapped line count (OD-14), so until the ladder's own data has
    // landed every segment sits at the 40px minimum and step 1 reads the real
    // floors as a change: `schedule: 40 -> 53.75`, `ffe: 40 -> 138.63`,
    // `care: 173 -> 44.92`. That is the initial load finishing, not a segment
    // resizing under the reader — which is what this test is about. It shows
    // up only when the spec runs late in a long basket, where the paper opens
    // against a warm server and `settle()` returns before the values do.
    await quiet(page);
    await scrollTo(page, 0);

    const read = () =>
      page.evaluate(() => ({
        index:
          document
            .querySelector('[data-document-shell]')
            ?.getAttribute('data-reading-index') ?? null,
        heights: Object.fromEntries(
          Array.from(
            document.querySelectorAll<HTMLElement>('[data-ladder-segment]'),
          ).map((el) => [
            el.getAttribute('data-ladder-segment') ?? '?',
            Math.round(el.getBoundingClientRect().height * 100) / 100,
          ]),
        ),
      }));

    const STEPS = 30;
    const TOTAL = 2400;
    let previous = await read();
    const offenders: string[] = [];
    let indexChanges = 0;

    for (let i = 1; i <= STEPS; i += 1) {
      await scrollTo(page, Math.round((TOTAL / STEPS) * i));
      const now = await read();
      const indexChanged = now.index !== previous.index;
      if (indexChanged) indexChanges += 1;
      if (!indexChanged) {
        for (const [key, height] of Object.entries(now.heights)) {
          const before = previous.heights[key];
          if (before !== undefined && before !== height) {
            offenders.push(
              `step ${i} · ${key}: ${before} -> ${height} (index held at ${String(now.index)})`,
            );
          }
        }
      }
      previous = now;
    }

    console.log(
      `D-B37 · 30 steps, ${indexChanges} index change(s), ${offenders.length} unexplained segment resize(s)`,
    );
    expect(
      offenders,
      'a ladder segment changed height on a step where the reading index held',
    ).toEqual([]);
  });
});
