/**
 * The band's declared height, in all eighteen cells (R127 Wave 3, proposal §9).
 *
 * THE FALSIFIABLE SENTENCE: `[data-lens-band]`'s `boundingBox().height` is
 * exactly 56 on the long paper and on the pre-work paper, at 1440×900,
 * 1280×900 and 390×844, at scrollY 0, 400 and 1200 — two documents × three
 * widths × three offsets = eighteen cells. A band whose height is a fact and
 * not an outcome is what makes `--doc-landing-clear`, the sticky organs' `top`
 * and SC1's arithmetic true; if any one cell measures something else, the
 * `nowrap` + ellipsis rule has failed somewhere and every clearance in the
 * document is wrong by that much.
 *
 * Two more numbers the same page can answer, and only Playwright can:
 *   · SC1 — the first `[data-region-head]` stands at or above y 405 at rest.
 *     The number is PRINTED on every run, because §6's 298px is a claim about
 *     the seeded paper and a regression that keeps it under the threshold
 *     while moving it 80px is still worth seeing.
 *   · SC2 — at scrollY 400 the band's bottom edge is at or above 108px, so the
 *     paper under it is never more than a band and its rule away from the
 *     frame's top.
 *
 * BROWSERS (test-impact, "Browser ruling"): chromium + webkit. Firefox is
 * skipped with its reason, the repo's own idiom.
 */
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { scrollTo, settle } from '../helpers/lens';
import { LONG_PAPER_ID, PRE_WORK_ID, assertLongPaper } from './lens-fixtures';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName === 'firefox',
  'the lens specs run chromium + webkit (test-impact, "Browser ruling"); Firefox is not a shipped target for this portal and its sub-pixel box model would make an exact 56 a coin-toss',
);

/** The declared height, once, in one place — `globals.css` `--doc-band-height`
 *  (C-7). The spec asserts the token AND the measured box, because a token that
 *  says 56 while the box measures 61 is exactly the defect this catches. */
const BAND_HEIGHT = 56;

/** SC1 — the first region head at rest, at 1440. */
const SC1_MAX_Y = 405;
/** SC2 — the band's bottom edge at scrollY 400. */
const SC2_MAX_BOTTOM = 108;

const OFFSETS = [0, 400, 1200] as const;

const WIDTHS = [
  { label: '1440', width: 1440, height: 900 },
  { label: '1280', width: 1280, height: 900 },
  { label: '390', width: 390, height: 844 },
] as const;

const PAPERS = [
  { label: 'the long paper', id: LONG_PAPER_ID },
  { label: 'the pre-work paper', id: PRE_WORK_ID },
] as const;

async function openPaper(
  page: AuthenticatedPage,
  id: string,
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(`/doc/${id}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-document-shell]')).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
}

/** The computed value of a length token on the document element, in px. */
function tokenPx(page: AuthenticatedPage, name: string): Promise<number> {
  return page.evaluate(
    (token) =>
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(token),
      ),
    name,
  );
}

test.describe('the lens band’s declared height', () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  for (const paper of PAPERS) {
    for (const size of WIDTHS) {
      test(`is exactly ${BAND_HEIGHT}px on ${paper.label} at ${size.label}, at every offset`, async ({
        authenticatedPage: page,
      }) => {
        await openPaper(page, paper.id, size.width, size.height);

        const band = page.locator('[data-lens-band]');
        await expect(band).toBeVisible({ timeout: 20_000 });

        // The token is declared once and lengths only (C-7): if it drifts, the
        // sticky `top`, the landing clearance and SC1 all drift with it.
        expect(await tokenPx(page, '--doc-band-height')).toBe(BAND_HEIGHT);

        for (const offset of OFFSETS) {
          await scrollTo(page, offset);
          const box = await band.boundingBox();
          expect(
            box,
            `${paper.label} · ${size.label} · scrollY ${offset}: the band has no box`,
          ).not.toBeNull();
          expect(
            box!.height,
            `${paper.label} · ${size.label} · scrollY ${offset}`,
          ).toBe(BAND_HEIGHT);
        }
      });
    }
  }

  test('SC1 — the first region head stands at or above 405px at rest, at 1440', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 1440, 900);
    await scrollTo(page, 0);

    const firstHead = page
      .locator('[data-document-paper] [data-region-head]')
      .first();
    await expect(firstHead).toBeVisible({ timeout: 20_000 });
    const box = await firstHead.boundingBox();
    expect(box).not.toBeNull();
    // Printed on every run: the threshold is a ceiling, the number is the
    // measurement §6 actually claims.
    console.log(`SC1 · first [data-region-head] top at 1440, rest: ${box!.y}px`);
    expect(box!.y).toBeLessThanOrEqual(SC1_MAX_Y);
  });

  test('SC2 — the band’s bottom edge is at or above 108px at scrollY 400', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 1440, 900);
    await scrollTo(page, 400);

    const box = await page.locator('[data-lens-band]').boundingBox();
    expect(box).not.toBeNull();
    const bottom = box!.y + box!.height;
    console.log(`SC2 · band bottom at 1440, scrollY 400: ${bottom}px`);
    expect(bottom).toBeLessThanOrEqual(SC2_MAX_BOTTOM);
  });
});

/**
 * The letterhead grid (W3-R4, findings D-B26 / B1 / W3-R4).
 *
 * THE FALSIFIABLE SENTENCE: with the title given its own row across both
 * tracks and the ledger confined to `minmax(18rem,24rem)`, the letterhead
 * measures ≤170px at 1440 and ≤240px at 390, its title <input> is never
 * clipped, its vitals are one row, its ledger is at most two, and the first
 * region head at 390 stands at or above y 390 of an 844px frame.
 *
 * Why an <input> and not a heading: the title cannot wrap, so a starved track
 * does not stack it, it AMPUTATES it — `Aspen Lo` at 149.9px was the defect.
 * `scrollWidth === clientWidth` is the only honest witness that nothing is
 * hidden past the right edge.
 *
 * Ledger rows are counted, not divided: the number of DISTINCT rounded
 * `getBoundingClientRect().top` values among the action region's children. A
 * height ÷ row-height division would call a 44px row with a wrapped 12px tail
 * "one row"; distinct tops cannot.
 */

/** W3-R4's budgets, superseding D-B26's 260 / 410. */
const LETTERHEAD_MAX_1440 = 170;
const LETTERHEAD_MAX_390 = 240;
/** The vitals are ONE row — 11px of mono, never a second line. */
const VITALS_MAX_HEIGHT = 24;
const LEDGER_MAX_ROWS = 2;
/** At 390 the first head must be reachable inside the 844px frame. */
const FIRST_HEAD_MAX_Y_390 = 390;

const LETTERHEAD = '#document-project-status';
// `role="group"` matters: `DocumentAction` copies `data-action-region` onto
// every button from the group's context, so the bare attribute matches the
// container AND its four acts.
const LEDGER = `${LETTERHEAD} [role="group"][data-action-region="letterhead-actions"]`;

/** How many rows the ledger's acts actually occupy. */
function ledgerRows(page: AuthenticatedPage): Promise<number> {
  return page.evaluate((sel) => {
    const group = document.querySelector(sel);
    if (!group) return -1;
    const tops = new Set(
      Array.from(group.children).map((child) =>
        Math.round(child.getBoundingClientRect().top),
      ),
    );
    return tops.size;
  }, LEDGER);
}

test.describe('the letterhead grid', () => {

  test.beforeAll(() => {
    assertLongPaper();
  });

  test('prints an unclipped title, one-row vitals and a bounded ledger at 1440', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 1440, 900);
    await scrollTo(page, 0);

    const letterhead = page.locator(LETTERHEAD);
    await expect(letterhead).toBeVisible({ timeout: 20_000 });
    const box = await letterhead.boundingBox();
    expect(box).not.toBeNull();
    console.log(`W3-R4 · letterhead height at 1440, rest: ${box!.height}px`);

    // The title takes the whole measure, so nothing of it is hidden.
    const title = page.locator(`${LETTERHEAD} input[aria-label="Project title"]`);
    await expect(title).toBeVisible();
    const measure = await title.evaluate((el) => ({
      scroll: (el as HTMLInputElement).scrollWidth,
      client: (el as HTMLInputElement).clientWidth,
      value: (el as HTMLInputElement).value,
    }));
    console.log(
      `W3-R4 · title "${measure.value}": scrollWidth ${measure.scroll}, clientWidth ${measure.client}`,
    );
    expect(measure.scroll).toBe(measure.client);

    const vitals = page.locator(`${LETTERHEAD} [data-letterhead-vitals]`);
    await expect(vitals).toBeVisible();
    const vitalsBox = await vitals.boundingBox();
    expect(vitalsBox).not.toBeNull();
    console.log(`W3-R4 · vitals height at 1440: ${vitalsBox!.height}px`);
    expect(vitalsBox!.height).toBeLessThanOrEqual(VITALS_MAX_HEIGHT);

    await expect(page.locator(LEDGER)).toBeVisible();
    const rows = await ledgerRows(page);
    console.log(`W3-R4 · ledger rows at 1440: ${rows}`);
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThanOrEqual(LEDGER_MAX_ROWS);
  });

  test('keeps every element at 390 — mark, chip, vitals and a ≤2-line ledger', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 390, 844);
    await scrollTo(page, 0);

    const letterhead = page.locator(LETTERHEAD);
    await expect(letterhead).toBeVisible({ timeout: 20_000 });
    const box = await letterhead.boundingBox();
    expect(box).not.toBeNull();
    console.log(`W3-R4 · letterhead height at 390, rest: ${box!.height}px`);

    // D-B20 — nothing is dropped at 390: the mark, the chip and the ledger all
    // stand, the ledger stacked under the vitals by the single column.
    await expect(page.locator(`${LETTERHEAD} .strata-mark`)).toBeVisible();
    await expect(page.locator(LEDGER)).toBeVisible();
    const rows = await ledgerRows(page);
    console.log(`W3-R4 · ledger rows at 390: ${rows}`);
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThanOrEqual(LEDGER_MAX_ROWS);

  });

  /**
   * The two BUDGET numbers stand apart from the four assertions above, because
   * they are a ruling and those are a defect. The defect B5 named — a title
   * amputated to `Aspen Lo`, four-line vitals, a three-row ledger — is closed
   * and asserted above. The budgets are not met, and the arithmetic says they
   * cannot be met as W3-R4 states them:
   *
   *   1440, measured: pt 14 + mark row 51.25 (40 + 11.25 mb) + title 44.1 +
   *   gap-y 9 + ledger row 101.4 (TWO rows) + pb 18 = 238.7.
   *   W3-R4 priced the mark row at 44, no grid gap, and a ONE-row ledger at 44
   *   → 170. Even with a one-row ledger the shipped chrome measures ≈185.
   *
   *   The ledger cannot be one row inside `minmax(18rem,24rem)` = 432px:
   *   `DocumentAction` prints 12px mono at `tracking-[0.1em]`, not the 11px /
   *   7.5px-per-char W3-R4's arithmetic assumed. Measured act boxes at 1440:
   *   MESSAGE 72 + PREVIEW 71 + SHARING · MILESTONES 180 + CALL SHEET · 0 130
   *   = 453px, plus 3 × 13.5px gaps = 493.5px.
   *
   *   390, measured 271.9 against 240, the same two-row ledger.
   *
   * Two levers exist and both are the DESIGN LEAD's, not this lane's: widen
   * the right track past 24rem, or shorten the labels again at 1440 the way
   * 390 already shortens them. Left failing rather than weakened, so the miss
   * is visible in the run.
   */
  test(`letterhead is ≤${LETTERHEAD_MAX_1440}px at 1440 (W3-R4 budget — OWED A RULING)`, async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 1440, 900);
    await scrollTo(page, 0);
    const box = await page.locator(LETTERHEAD).boundingBox();
    expect(box!.height).toBeLessThanOrEqual(LETTERHEAD_MAX_1440);
  });

  test(`letterhead is ≤${LETTERHEAD_MAX_390}px at 390 (W3-R4 budget — OWED A RULING)`, async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 390, 844);
    await scrollTo(page, 0);
    const box = await page.locator(LETTERHEAD).boundingBox();
    expect(box!.height).toBeLessThanOrEqual(LETTERHEAD_MAX_390);
  });

  test(`first [data-region-head] is at or above ${FIRST_HEAD_MAX_Y_390}px at 390 (W3-R4 budget — OWED A RULING)`, async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 390, 844);
    await scrollTo(page, 0);
    const firstHead = page
      .locator('[data-document-paper] [data-region-head]')
      .first();
    await expect(firstHead).toBeVisible({ timeout: 20_000 });
    const headBox = await firstHead.boundingBox();
    console.log(`W3-R4 · first [data-region-head] top at 390, rest: ${headBox!.y}px`);
    expect(headBox!.y).toBeLessThanOrEqual(FIRST_HEAD_MAX_Y_390);
  });
});

/**
 * The act's press target at 390 (finding C-02).
 *
 * THE FALSIFIABLE SENTENCE: line 2's act measures a full 44px tall at 390 and
 * is not clipped by the line it sits in.
 *
 * Why only Playwright can answer it: the band's box is fixed at 56 by
 * `h-[var(--doc-band-height)]`, so the height spec above measures 56 whatever
 * happens inside. The act is inset `my-[-12px]` into a 19.5px line, and an
 * `overflow: hidden` on that line cut 12px off its box for painting AND for
 * hit-testing. At 390, DL-05 made line 2 the ONLY printing of that act, so the
 * phone's primary act was shipping a ~20px target against a 44px contract.
 */
test.describe('line 2’s act is a whole 44px target at 390 (C-02)', () => {

  test('is not clipped by the line it stands in', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 390, 844);

    const line2 = page.locator('[data-lens-line="2"]');
    await expect(line2).toBeVisible();

    // The clip lives on the sentence, never on the flex line.
    const overflow = await line2.evaluate(
      (el) => getComputedStyle(el).overflow,
    );
    console.log(`line 2 overflow at 390: ${overflow}`);
    expect(overflow).toBe('visible');

    const act = line2.locator('[data-action-key^="lens-band-"]');
    if ((await act.count()) === 0) {
      // A paper whose worst standing item carries no act (A-11) prints none.
      // The clip assertion above is the part that must hold on every paper.
      console.log('line 2 prints no act on this paper — nothing to measure');
      return;
    }
    const box = await act.first().boundingBox();
    expect(box).not.toBeNull();
    console.log(`line 2 act box at 390: ${box!.width}×${box!.height}px`);
    expect(box!.height).toBeGreaterThanOrEqual(44);

    // And it is genuinely hittable at its own top and bottom edges: the point
    // 2px inside each edge resolves to the control, not to the clipped line.
    const hits = await page.evaluate(
      ([x, top, bottom]) => {
        const at = (y: number) =>
          document
            .elementFromPoint(x as number, y as number)
            ?.closest('[data-action-key^="lens-band-"]') !== null;
        return [at(top as number), at(bottom as number)];
      },
      [box!.x + box!.width / 2, box!.y + 2, box!.y + box!.height - 2],
    );
    expect(hits).toEqual([true, true]);
  });
});
