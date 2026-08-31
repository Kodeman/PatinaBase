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
   * W7-R1 §2 — the stops PACK, and the nav has exactly one gap.
   *
   * Kody, on prod: "on the lens between sections there should not be giant
   * gaps, the only gap should be after 'the record'." The falsifiable
   * sentence: at 1440x900 on the long paper, no gap between consecutive stop
   * rows exceeds the rows' own `py-1` rhythm (16px), and exactly ONE gap in
   * the whole nav column exceeds 24px — the one between the last stop's row
   * and `FILED WITH THIS JOB`.
   */
  test('W7-R1 §2 — the stops pack, and the ONE gap in the nav sits after the last stop', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID);
    await quiet(page);
    await scrollTo(page, 0);

    const geometry = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>('[data-lens-ladder]');
      if (!nav) return null;
      const segments = Array.from(
        nav.querySelectorAll<HTMLElement>('[data-ladder-segment]'),
      ).map((el) => ({
        key: el.getAttribute('data-ladder-segment') ?? '?',
        top: el.getBoundingClientRect().top,
        bottom: el.getBoundingClientRect().bottom,
      }));
      const doors = nav.querySelector<HTMLElement>('[data-ladder-doors]');
      return {
        segments,
        doorsTop: doors?.getBoundingClientRect().top ?? null,
        doorsBottom: doors?.getBoundingClientRect().bottom ?? null,
        navBottom: nav.getBoundingClientRect().bottom,
      };
    });
    expect(geometry, 'the ladder did not mount at 1440').not.toBeNull();
    const { segments, doorsTop } = geometry!;
    expect(segments.length).toBeGreaterThan(1);
    expect(doorsTop).not.toBeNull();

    const stopGaps = segments.slice(1).map((segment, i) => ({
      after: segments[i].key,
      gap: Math.round((segment.top - segments[i].bottom) * 100) / 100,
    }));
    const doorsGap =
      Math.round((doorsTop! - segments[segments.length - 1].bottom) * 100) / 100;

    console.log(
      `W7-R1 §2 · stop gaps ${JSON.stringify(stopGaps)} · gap before the doors ${doorsGap}px`,
    );

    expect(
      stopGaps.filter((row) => row.gap > 16),
      'a gap between consecutive stop rows exceeded the rows own py-1 rhythm',
    ).toEqual([]);

    const wide = [
      ...stopGaps.filter((row) => row.gap > 24).map((row) => row.after),
      ...(doorsGap > 24 ? ['<the doors>'] : []),
    ];
    expect(
      wide,
      `exactly one gap over 24px is allowed, and it must sit after the last stop (${segments[segments.length - 1].key})`,
    ).toEqual(['<the doors>']);
  });

  /**
   * W7-C6 — the reading window's geometry, which had no falsifier anywhere.
   *
   * THE FALSIFIABLE SENTENCE: at a settled offset deep enough to hold a
   * reading stop, the bracket's painted box COVERS the row of the stop
   * `aria-current` names — its top is at or above that row's top, its bottom
   * at or below that row's bottom — and it is at least one rung (27px) tall.
   * D-B52 removed the extent shares the window used to map onto; this is what
   * replaced them, and until now nothing read `data-lens-window` at all.
   */
  test('W7-C6 — the reading window covers the row of the stop it names', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID);
    await quiet(page);
    await scrollTo(page, 0);
    // s2: far enough in that a stop is being read, not the letterhead.
    await scrollTo(page, 1200);
    await settle(page);

    const shape = await page.evaluate(() => {
      const track = document.querySelector<HTMLElement>('[data-lens-track]');
      const bracket = track?.querySelector<HTMLElement>('[data-lens-window]');
      const current = track?.querySelector<HTMLElement>(
        '[data-ladder-stop][aria-current="true"]',
      );
      if (!track || !bracket || !current) {
        return {
          hasBracket: Boolean(bracket),
          hasCurrent: Boolean(current),
          stamp: bracket?.getAttribute('data-lens-window') ?? null,
        };
      }
      const round = (n: number) => Math.round(n * 100) / 100;
      const b = bracket.getBoundingClientRect();
      const r = current.getBoundingClientRect();
      return {
        hasBracket: true,
        hasCurrent: true,
        stop: current.getAttribute('data-ladder-stop'),
        stamp: bracket.getAttribute('data-lens-window'),
        bracket: { top: round(b.top), bottom: round(b.bottom), height: round(b.height) },
        row: { top: round(r.top), bottom: round(r.bottom), height: round(r.height) },
      };
    });
    console.log(`W7-C6 · reading window ${JSON.stringify(shape)}`);

    expect(shape.hasCurrent, 'no stop carried aria-current at s2').toBe(true);
    expect(shape.hasBracket, 'the reading window was not printed').toBe(true);
    expect(shape.stamp, 'the bracket published no box').not.toBeNull();
    // Covers the row it names, in both directions, with a 0.5px tolerance for
    // subpixel layout.
    expect(shape.bracket!.top).toBeLessThanOrEqual(shape.row!.top + 0.5);
    expect(shape.bracket!.bottom).toBeGreaterThanOrEqual(shape.row!.bottom - 0.5);
    // The 27px floor: a short row still prints a readable bracket.
    expect(shape.bracket!.height).toBeGreaterThanOrEqual(27);
  });

  /**
   * W7-R1 §2 — a SHORT viewport: the doors still print whole, with a breath.
   *
   * `mt-auto` collapses toward zero when the column has no free space; the
   * rows own `mb-3` is what keeps that collapsed state from butting the last
   * stop against the doors rule. The ruling names 900x620; the rail is
   * `display:none` below 1180 (`data-spine-regime`), so the doors question
   * only arises where it mounts. Both are asserted: at 900 the rail is
   * absent by regime, and at 1180x620 — the narrowest tier that mounts it,
   * at the ruling's short height — the doors are whole with >= 12px above.
   */
  test('W7-R1 §2 — the doors print whole at a short viewport, with a breath above them', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID);

    await page.setViewportSize({ width: 900, height: 620 });
    await settle(page);
    expect(
      await page.locator('[data-lens-ladder]').first().isVisible(),
      'the rail must not print below 1180 — the sheet is the index there',
    ).toBe(false);

    await page.setViewportSize({ width: 1180, height: 620 });
    await settle(page);
    await quiet(page);

    const short = await page.evaluate(() => {
      const nav = document.querySelector<HTMLElement>('[data-lens-ladder]');
      const doors = nav?.querySelector<HTMLElement>('[data-ladder-doors]');
      if (!nav || !doors) return null;
      const rows = Array.from(
        doors.querySelectorAll<HTMLElement>('[data-ladder-door]'),
      );
      const track = nav.querySelector<HTMLElement>('[data-lens-track]');
      const box = doors.getBoundingClientRect();
      const round = (n: number) => Math.round(n * 100) / 100;
      // The breath is between the TRACK and the doors, not between the last
      // stop row and the doors: on a short viewport the track scrolls, so the
      // last row's own box sits below the track's visible bottom.
      const breath = track ? round(box.top - track.getBoundingClientRect().bottom) : null;
      // D-B52 (3) — can the doors sink under the Studio Drawer today?
      const inset =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--doc-shell-bottom-inset',
          ),
        ) || 60;
      return {
        doorCount: rows.length,
        clipped: rows
          .filter((row) => {
            const r = row.getBoundingClientRect();
            return r.height <= 0 || r.bottom > window.innerHeight + 0.5;
          })
          .map((row) => row.getAttribute('data-ladder-door')),
        breath,
        trackScrolls: track ? track.scrollHeight > track.clientHeight + 1 : null,
        doorsBottom: round(box.bottom),
        drawerTop: round(window.innerHeight - inset),
        viewport: window.innerHeight,
      };
    });
    expect(short, 'the rail did not mount at 1180x620').not.toBeNull();
    console.log(`W7-R1 §2 · 1180x620 doors ${JSON.stringify(short)}`);
    expect(short!.doorCount).toBeGreaterThan(0);
    expect(short!.clipped, 'a door was cut off at the short viewport').toEqual(
      [],
    );
    expect(short!.breath ?? 0).toBeGreaterThanOrEqual(12);
    // D-B52 (3) — the sticky rail's `h-screen` + `pb-[--doc-shell-floating-bottom]`
    // already stops the column above the drawer strip, so no `max-height` is
    // added. Measured, not assumed: the last door's rule sits above the
    // drawer's own top edge.
    expect(
      short!.doorsBottom,
      `the doors end at ${short!.doorsBottom} and the Studio Drawer starts at ${short!.drawerTop}`,
    ).toBeLessThanOrEqual(short!.drawerTop);
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
      const moved = Object.entries(now.heights).filter(([key, height]) => {
        const before = previous.heights[key];
        return before !== undefined && before !== height;
      });
      if (!indexChanged) {
        for (const [key, height] of moved) {
          offenders.push(
            `step ${i} · ${key}: ${String(previous.heights[key])} -> ${height} (index held at ${String(now.index)})`,
          );
        }
      } else if (moved.length > 1) {
        // D-B52's clause on D-B37: with the extent redistribution channel
        // deleted, an index change may move ONLY the segment that gains or
        // loses its room rungs. Every sibling is byte-equal — there is no
        // remainder left for the track to re-deal.
        offenders.push(
          `step ${i} · an index change moved ${moved.length} segments, not one: ${moved
            .map(
              ([key, height]) =>
                `${key} ${String(previous.heights[key])} -> ${height}`,
            )
            .join(', ')}`,
        );
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
