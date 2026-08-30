/**
 * The band's declared height, in all eighteen cells (R127 Wave 3, proposal §9).
 *
 * THE FALSIFIABLE SENTENCE: `[data-lens-band]`'s layout height is
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
import type { Locator } from '@playwright/test';
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { scrollTo, settle } from '../helpers/lens';
import {
  LONG_PAPER_ID,
  ONE_LINE_PAPER_ID,
  PRE_WORK_ID,
  assertLongPaper,
} from './lens-fixtures';

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ browserName }) => browserName === 'firefox',
  'the lens specs run chromium + webkit (test-impact, "Browser ruling"); Firefox is not a shipped target for this portal and its sub-pixel box model would make an exact 56 a coin-toss',
);

/** The declared height, once, in one place — `globals.css` `--doc-band-height`
 *  (C-7). The spec asserts the token AND the measured box, because a token that
 *  says 56 while the box measures 61 is exactly the defect this catches. */
const BAND_HEIGHT = 56;

/**
 * The LAYOUT height, not the composited one.
 *
 * W4 items 14/16: `locator.boundingBox()` reads quads out of the compositor
 * (`DOM.getBoxModel`), and for a `position: sticky` element — the band, and the
 * line-2 act inside it — those quads carry the compositor's own fractional
 * sticky offset. It read 55.7204 for the band at 1280 and 43.9895/43.6648 for
 * the act while `getBoundingClientRect().height`, `offsetHeight` and the
 * computed `height` were all EXACTLY 56 and 44 in chromium AND webkit at
 * 1440/1280/390. There is nothing in the CSS to correct: the box is the
 * declared constant, and the instrument was the thing that was wrong. Measured
 * this way the contract holds as written — `toBe(56)`, `>= 44`, no engine
 * allowance and no `44.5px` floor papering over a box that is already right.
 */
async function layoutHeight(locator: Locator): Promise<number> {
  return locator.evaluate((el) => el.getBoundingClientRect().height);
}

/**
 * The band's box, with everything needed to tell a BROKEN BOX from a SCALED
 * READ — so a recurrence names its own cause instead of printing a bare
 * `55.9755 !== 56`.
 *
 * The W4-int PROD run recorded 55.9754638671875 for the pre-work paper at 390
 * in an unsharded 122-test basket. It did not reproduce: 56 exactly in every
 * one of thirty-odd measured cells — both papers × 390/1280/1440 × scrollY
 * 0/400/1200, on the production server AND on dev, chromium AND webkit,
 * standalone AND in that same full basket on that same server — with
 * `height: 56px`, `box-sizing: border-box`, `transform: none` on the box and on
 * every ancestor, and `--doc-band-height: 56px` at `:root` and on the band. It
 * is not line 1 either: removing D-B38's `min-h-[15.4px]` leaves the box at
 * exactly 56, because the height is DECLARED and the children cannot change it.
 * And 55.9754638671875 / 56 = 0.999562 — a rendering-scale ratio, not any sum
 * of margins, borders or line boxes.
 *
 * So `offsetHeight` (layout, integer, immune to rendering scale) and the CSS
 * `height` are captured beside the rect. If they ever disagree the box is fine
 * and the READ is scaled — D-B35's finding, one level deeper.
 */
async function bandBox(locator: Locator): Promise<{
  rect: number;
  offset: number;
  css: string;
  boxSizing: string;
  transforms: string;
}> {
  return locator.evaluate((el) => {
    const cs = getComputedStyle(el);
    const transforms: string[] = [];
    let n: Element | null = el;
    while (n && transforms.length < 8) {
      const t = getComputedStyle(n).transform;
      if (t && t !== 'none') transforms.push(`${n.tagName}:${t}`);
      n = n.parentElement;
    }
    return {
      rect: el.getBoundingClientRect().height,
      offset: (el as HTMLElement).offsetHeight,
      css: cs.height,
      boxSizing: cs.boxSizing,
      transforms: transforms.length ? transforms.join(' | ') : 'none',
    };
  });
}

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
          // W5-C3 — measure a STILL box. The read landed mid-`doc-raise`
          // (globals.css, "D12 pick-up: raise-to-fill (~270ms)", `transform:
          // scale(0.986)` → `none`) and reported 55.9854736328125 for a box
          // whose `offsetHeight` and computed `height` were both exactly 56;
          // 56 × 0.99974 = 55.98544, and the failure message printed the
          // matrix. `getBoundingClientRect()` is the COMPOSITED rect, so a
          // scaled ancestor scales the read.
          //
          // Waiting here rather than in `settle()`: a global "no finite
          // animation is running" precondition slowed every settle in the
          // basket (8.3m → 11.2m) and moved the ladder-budget baseline into
          // the data-arrival window, turning D-B37 red. This is the one
          // measurement that needs the page to be geometrically still, so it
          // is the one place that waits for it.
          await expect
            .poll(async () => (await bandBox(band)).transforms, {
              timeout: 5_000,
            })
            .toBe('none');
          const box = await bandBox(band);
          expect(
            box.rect,
            `${paper.label} · ${size.label} · scrollY ${offset} — ` +
              `rect ${box.rect}, offsetHeight ${box.offset}, css ${box.css}, ` +
              `box-sizing ${box.boxSizing}, transforms ${box.transforms}. ` +
              'If offsetHeight and css are 56 and only rect is not, the BOX is ' +
              'right and the READ is scaled (D-B35), not a layout break.',
          ).toBe(BAND_HEIGHT);
        }
      });
    }
  }

  /**
   * D-B38 — line 2 sits at the same y whether line 1 prints or not.
   *
   * At s0 the letterhead 60px above is saying the household, the stage and the
   * date, so both of line 1's halves yield; on a spread with no money figure
   * the `<p>` then holds nothing at all. Without a declared minimum it collapses
   * to zero height, and the band — a 56px `flex-col justify-center` — lifts line
   * 2 by half the lost line (7.7px) as the reader pins it. That is the band's
   * own text moving with nothing behind it, which is what D-B34's cause gate
   * reported. `min-h-[15.4px]` is one line of 11px mono at `leading-[1.4]`.
   */
  for (const size of WIDTHS) {
    test(`D-B38 — line 2 holds its y across the pin at ${size.label}`, async ({
      authenticatedPage: page,
    }) => {
      await openPaper(page, LONG_PAPER_ID, size.width, size.height);
      await scrollTo(page, 0);

      const line2 = page.locator('[data-lens-line="2"]');
      await expect(line2).toBeVisible({ timeout: 20_000 });
      const band = page.locator('[data-lens-band]');

      // Measured against the band's own top, not the viewport: the band is
      // sticky, so its viewport y is the scroll's business and not this claim's.
      const offsetInBand = async () =>
        page.evaluate(() => {
          const b = document
            .querySelector('[data-lens-band]')!
            .getBoundingClientRect();
          const l = document
            .querySelector('[data-lens-line="2"]')!
            .getBoundingClientRect();
          return Math.round((l.top - b.top) * 100) / 100;
        });

      await expect(band).toHaveAttribute('data-lens-open', 'true');
      const atRest = await offsetInBand();

      await scrollTo(page, 800);
      await expect(band).toHaveAttribute('data-lens-open', 'false');
      const pinned = await offsetInBand();

      console.log(
        `D-B38 · line 2 offset inside the band at ${size.label}: s0 ${atRest}px, pinned ${pinned}px`,
      );
      expect(pinned).toBe(atRest);
    });
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

  // D-B30 / W5-R1: the letterhead `MobileMarginChips` block that used to
  // stand between the band and the first region at 390 is gone (a Margin
  // sheet off the mobile bar's More menu replaces it — mobile-margin-sheet
  // .spec.ts covers that door), and so is the line-anchored mount below 980.
  // The W3-fix chips allowance is deleted from this file at the W5
  // integration: every 390 first-head assertion is now GROSS against
  // W3-R7's own ≤435 (W5-R1: "the 390 first head gross ≤ 435 — D-B26's
  // W3-R7 number, now without the chips subtraction").
  test('D-B30/D-B45 — at 390 no margin-chips block prints, and the first region head is inside the gate its title\'s line count names', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 390, 844);
    await scrollTo(page, 0);

    await expect(
      page.locator('[data-mobile-margin-chips="letterhead"]'),
    ).toHaveCount(0);
    await expect(page.locator(CHIPS_BLOCK)).toHaveCount(0);

    const firstHead = page
      .locator('[data-document-paper] [data-region-head]')
      .first();
    await expect(firstHead).toBeVisible({ timeout: 20_000 });
    const box = await firstHead.boundingBox();
    expect(box).not.toBeNull();
    // D-B48 — `…d5`'s name WRAPS to two lines at 390 now that it is text, so
    // the head sits a line lower than W3-R7's one-line 435 and the gate is the
    // one its measured line count names.
    const lines = await titleLines(page);
    console.log(
      `D-B30 · first [data-region-head] top at 390, rest, gross: ${box!.y}px (title lines ${lines}, gate ${FIRST_HEAD_MAX_390_BY_LINES[lines]})`,
    );
    expect(box!.y).toBeLessThanOrEqual(FIRST_HEAD_MAX_390_BY_LINES[lines]);
  });
});

/**
 * The letterhead grid (findings D-B26 / B1, budgets per W3-R7).
 *
 * THE FALSIFIABLE SENTENCE: with the title given its own row across both
 * tracks, the ledger confined to `minmax(18rem,24rem)` and printing `SHARING`
 * alone at every width, the letterhead measures ≤205px at 1440 and ≤265px at
 * 390 (W3-R7, asserted on both chromium and webkit) for a ONE-LINE name, its
 * title is never clipped, its vitals are one row, its ledger is ONE row at both
 * widths, and the first region head at 390 stands at or above y 435 of an
 * 844px frame (gross — the margin-chips block is deleted, D-B45).
 *
 * D-B48 INVERTS the rationale that stood here. It read: "Why an <input> and
 * not a heading: the title cannot wrap, so a starved track does not stack it,
 * it AMPUTATES it — `Aspen Lo` at 149.9px was the defect. `scrollWidth ===
 * clientWidth` is the only honest witness that nothing is hidden past the
 * right edge." That had it exactly backwards: an `<input>` is the ONE element
 * that cannot wrap, so it was the amputation, not the guard — at 390 `…d5`
 * printed `Aspen Loft — the long p`, and an overflowed input SATISFIES
 * `scrollWidth === clientWidth`, so the witness was blind to the defect it was
 * chosen for. The name is now `<h1>` TEXT that wraps at word boundaries; the
 * input appears only in edit mode, in the same box. `scrollWidth <=
 * clientWidth` on the `<h1>` is an honest witness, because a wrapping element
 * that overflows really has failed.
 *
 * Ledger rows are counted, not divided: the number of DISTINCT rounded
 * `getBoundingClientRect().top` values among the action region's children. A
 * height ÷ row-height division would call a 44px row with a wrapped 12px tail
 * "one row"; distinct tops cannot.
 */

/**
 * W3-R7 — one number per width, asserted on BOTH chromium and webkit, with
 * the engine allowance stated rather than hidden in the gate itself.
 *
 * Measured on `document-lens/w4` @ `8545739eb` (after W3-R6's `CALL SHEET` +
 * `gap-[9px]` wiring below 1180):
 *
 *   1440 letterhead        — chromium 192.06 · webkit 201     → gate ≤ 205 (chromium +12.94 / webkit +4 headroom; engine allowance +10 over chromium's own 192.06→202 ceiling, rounded to 205)
 *   390 letterhead         — chromium 255.17 · webkit 262.25  → gate ≤ 265 (engine allowance +5)
 *   390 first head, net    — chromium 423.17 · webkit 430.25  → gate ≤ 435 (engine allowance +5)
 *
 * WebKit's own numbers run +6 / +2.25 / +0.25 over chromium's — the same
 * engine that lays out 1431px at a 1440 viewport (font metrics and rounding,
 * not a print difference: the same elements print in the same rows on both
 * engines). A chromium-only gate would leave the promise unverified where
 * the phones are; the gate is ONE number, read against the measurement
 * named beside it, not against the slack.
 *
 * The 390 figure is for the seed's ONE-line 32px title. A two-line title adds
 * 35.5px (≤ 300); stated here, deliberately not asserted, because `…d5`'s
 * title prints on one line at 390 and a gate that allowed 300 would stop
 * catching a two-row ledger.
 */
const LETTERHEAD_MAX_1440 = 205;
/**
 * D-B48 — the 390 gates are chosen by the MEASURED line count of the paper's
 * name, not per seed. A second 32px line at `leading-[1.08]` adds 34.56px:
 * W3-R7's measured 255.17 (chromium) / 262.25 (webkit) → 289.7 / 296.8 for a
 * two-line name, gate 300; first head 423.17 / 430.25 → 457.7 / 464.8, gate
 * 470. Same +5 engine allowance as W3-R7's one-line numbers.
 *
 * Reading the count keeps ONE number per line count. Per-name cases would
 * double every 390 row and still assert the wrong gate the day a seed's name
 * changes. Three lines is a seed defect, not a budget, and fails.
 */
const TITLE_LINE_PX = 32 * 1.08;
const LETTERHEAD_MAX_390_BY_LINES: Record<number, number> = { 1: 265, 2: 300 };
const FIRST_HEAD_MAX_390_BY_LINES: Record<number, number> = { 1: 435, 2: 470 };

/** The `<h1>`'s own line count — D-B48's read. */
async function titleLines(page: AuthenticatedPage): Promise<number> {
  return page.evaluate(
    (linePx) => {
      const h1 = document.querySelector(
        '[data-document-letterhead] h1, header h1',
      ) as HTMLElement | null;
      if (!h1) return 0;
      return Math.round(h1.getBoundingClientRect().height / linePx);
    },
    TITLE_LINE_PX,
  );
}

const LETTERHEAD_MAX_390 = 265;
/** W3-R6 — one row of 44 at 390, with the 4px the row's own box can carry. */
const LEDGER_MAX_HEIGHT_390 = 48;
/** The vitals are ONE row at 1440 — 11px of mono, never a second line. */
const VITALS_MAX_HEIGHT = 24;
/** W3-R5 §1/§2 — `SHARING` alone at every width and the 11px floor below 1180
 *  are what make one row reachable; two rows now means one of them regressed. */
const LEDGER_MAX_ROWS = 1;
/**
 * At 390 the first head must be reachable inside the 844px frame — GROSS
 * (W3-R7: chromium 423.17 · webkit 430.25 net of the chips → gate ≤ 435,
 * engine allowance +5). W5-L3 retired `MobileMarginChips` at 390 (D-B30 /
 * W5-R1 — the mockup prints nothing between the band and the first region;
 * its seven margin items live in the 390 Margin sheet, which now exists),
 * so gross and net are the same number and the W3-fix allowance line is
 * deleted. `CHIPS_BLOCK` survives as the falsifier: the count is 0.
 */
const FIRST_HEAD_MAX_Y_390 = 435;
const CHIPS_BLOCK = '[data-document-paper] [data-mobile-margin-chips]';

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

  test('prints an unclipped title, one-row vitals and a one-row ledger at 1440', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 1440, 900);
    await scrollTo(page, 0);

    const letterhead = page.locator(LETTERHEAD);
    await expect(letterhead).toBeVisible({ timeout: 20_000 });
    const box = await letterhead.boundingBox();
    expect(box).not.toBeNull();
    console.log(`W3-R5 · letterhead height at 1440, rest: ${box!.height}px`);

    // D-B48 — the title is `<h1>` TEXT at rest, not an `<input>`: an input is
    // the one element that cannot wrap, so it was the amputation rather than
    // the guard. At 1440 the name is one line on both seeds; `scrollWidth <=
    // clientWidth` on the `<h1>` is the honest witness now, because a wrapping
    // element that still overflows really has failed.
    const title = page.locator(`${LETTERHEAD} h1`).first();
    await expect(title).toBeVisible();
    const measure = await title.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
      value: el.textContent?.trim() ?? '',
      lines: Math.round(el.getBoundingClientRect().height / (40 * 1.08)),
    }));
    console.log(
      `W3-R5 · title "${measure.value}": scrollWidth ${measure.scroll}, clientWidth ${measure.client}, lines ${measure.lines}`,
    );
    expect(measure.scroll).toBeLessThanOrEqual(measure.client);
    expect(measure.value).toContain('Aspen Loft — the long paper');
    expect(measure.lines).toBe(1);

    const vitals = page.locator(`${LETTERHEAD} [data-letterhead-vitals]`);
    await expect(vitals).toBeVisible();
    const vitalsBox = await vitals.boundingBox();
    expect(vitalsBox).not.toBeNull();
    console.log(`W3-R5 · vitals height at 1440: ${vitalsBox!.height}px`);
    expect(vitalsBox!.height).toBeLessThanOrEqual(VITALS_MAX_HEIGHT);

    await expect(page.locator(LEDGER)).toBeVisible();
    const rows = await ledgerRows(page);
    console.log(`W3-R5 · ledger rows at 1440: ${rows}`);
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThanOrEqual(LEDGER_MAX_ROWS);
  });

  test('keeps every element at 390 and records the header stack', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 390, 844);
    await scrollTo(page, 0);

    const letterhead = page.locator(LETTERHEAD);
    await expect(letterhead).toBeVisible({ timeout: 20_000 });
    const box = await letterhead.boundingBox();
    expect(box).not.toBeNull();
    console.log(`W3-R5 · letterhead height at 390, rest: ${box!.height}px`);

    // D-B20 — nothing is dropped at 390: the mark, the chip and the ledger all
    // stand, the ledger stacked under the vitals by the single column.
    await expect(page.locator(`${LETTERHEAD} .strata-mark`)).toBeVisible();
    await expect(page.locator(LEDGER)).toBeVisible();
    const rows = await ledgerRows(page);
    const ledgerBox = await page.locator(LEDGER).boundingBox();
    console.log(
      `W3-R6 · ledger at 390: ${rows} row(s), ${ledgerBox!.height}px`,
    );
    expect(rows).toBeGreaterThan(0);
    // W3-R6 — ONE row, after `CALL SHEET` lost its count and the gap dropped to
    // 9px below 1180. Two rows again means one of those two regressed.
    expect(rows).toBeLessThanOrEqual(LEDGER_MAX_ROWS);
    expect(ledgerBox!.height).toBeLessThanOrEqual(LEDGER_MAX_HEIGHT_390);

    // W5-R1 — the chips block is gone at 390, so the first head is reported
    // gross and its count is the falsifier for the retirement.
    await expect(page.locator(CHIPS_BLOCK)).toHaveCount(0);
    const firstHead = page
      .locator('[data-document-paper] [data-region-head]')
      .first();
    await expect(firstHead).toBeVisible({ timeout: 20_000 });
    const headBox = await firstHead.boundingBox();
    expect(headBox).not.toBeNull();
    console.log(
      `W5-R1 · first [data-region-head] at 390, gross (no chips block): ${headBox!.y}px`,
    );
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
    const height = await layoutHeight(act.first());
    console.log(
      `line 2 act box at 390: ${box!.width}×${height}px (layout) · ` +
        `${box!.height}px (composited)`,
    );
    expect(height).toBeGreaterThanOrEqual(44);

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

/**
 * D-B24's ratified 390 falsifier (NF-01) — the two forms, on the real paper.
 *
 * THE FALSIFIABLE SENTENCE: at 390 the band prints the worst standing item's
 * SHORT form — `OVERDUE <N>D · INV-2026-114`, its act's verb, and a whole
 * `+N MORE` door — with no ellipsis; at 1440 the same item prints its long
 * form. This is the one assertion that catches the trigger being width-blind:
 * `LENS_LINE2_MAX_CHARS` was calibrated for the 900px measure and never fired
 * before CSS ellipsis at 327, so a 76-character sentence lied about itself.
 *
 * It also pins N-01: the day count in `OVERDUE 7D` can only come from the
 * invoice's `dueOn`, because the sentence the desk prints ("— oldest due Aug
 * 22") states no day count for a regex to find.
 */
test.describe('line 2’s two forms on the seeded paper (D-B24, NF-01)', () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  test('prints the short form at 390, whole, with its verb and its door', async ({
    authenticatedPage: page,
    browserName,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 390, 844);
    await scrollTo(page, 0);

    const line2 = page.locator('[data-lens-line="2"]');
    await expect(line2).toHaveAttribute('data-lens-line2-kind', 'standing');
    await expect(line2).toHaveAttribute('data-lens-line2-form', 'short');

    const sentence = page.locator('[data-lens-sentence]');
    const text = (await sentence.textContent())?.trim() ?? '';
    console.log(`NF-01 · line 2 at 390: "${text}"`);
    expect(text).toMatch(/^OVERDUE \d+D · INV-2026-114$/);

    // The whole point of the short form: it FITS, so nothing is elided. The
    // assertion above already proves no WORDS were lost (the DOM text is
    // complete either way); this one proves the ellipsis never engages.
    //
    // WebKit lays out a 9px classic scrollbar and measures the paper's run
    // against the layout viewport, so the same 390 frame gives ~4px less
    // measure than chromium (the same gutter behind `docClientWidth 1431` at a
    // 1440 viewport in `e2e-baseline.md`). The allowance is that gutter, not
    // slack in the budget.
    const gutter = browserName === 'webkit' ? 9 : 0;
    const measure = await sentence.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
    }));
    console.log(
      `NF-01 · sentence ${measure.scroll} / ${measure.client} (gutter allowance ${gutter})`,
    );
    expect(measure.scroll).toBeLessThanOrEqual(measure.client + gutter);

    // The act shortens to its VERB and the door prints whole.
    const act = line2.locator('[data-action-key^="lens-band-"]');
    await expect(act).toBeVisible();
    await expect(act).toHaveText(/^send$/i);
    await expect(page.locator('[data-lens-more]')).toBeVisible();
  });

  test('prints the same item’s long form at 1440', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 1440, 900);
    await scrollTo(page, 0);

    const line2 = page.locator('[data-lens-line="2"]');
    await expect(line2).toHaveAttribute('data-lens-line2-form', 'long');
    const text = (await page.locator('[data-lens-sentence]').textContent())?.trim() ?? '';
    console.log(`NF-01 · line 2 at 1440: "${text}"`);
    expect(text).toContain('INV-2026-114');
    expect(text.length).toBeGreaterThan(30);
  });
});

/**
 * W3-R7's three BUDGET numbers — ordinary cases on BOTH engines, and they
 * pass. (Supersedes W3-R6's chromium-only 185/250/400: those stood as
 * `test.fail()` through Wave 3 while the numbers were priced against an
 * idealised stack; W3-R6 accepted the shipped chrome's own arithmetic and
 * this ruling — reconciliation.md W3-R7 — moves the gate to one number
 * verified on both engines, with the engine allowance named beside each
 * case rather than folded silently into the ceiling.)
 *
 *   1440 letterhead     — chromium 192.06 · webkit 201     → gate ≤ 205 (engine allowance +10 over chromium's 192.06→~195 own-engine ceiling)
 *   390 letterhead      — chromium 255.17 · webkit 262.25  → gate ≤ 265 (engine allowance +5)
 *                          for a ONE-LINE name; ≤ 300 for a two-line one (D-B48:
 *                          a second 32px line at leading-1.08 adds 34.56px)
 *   390 first head, gross — chromium 423.17 · webkit 430.25 (measured net of the
 *                            now-retired chips block) → gate ≤ 435 one-line,
 *                            ≤ 470 two-line (D-B48)
 *
 * WebKit's own figures run higher for the same reason `quiet-responsive-
 * shell.spec.ts` measures a 1431px layout viewport at a 1440 window (font
 * metrics and rounding) — not a print difference: the same elements print
 * in the same rows on both engines.
 */
test.describe("W3-R7's budget numbers, across engines", () => {

  test(`letterhead is ≤${LETTERHEAD_MAX_1440}px at 1440 (chromium 192.06 · webkit 201, engine allowance +10)`, async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 1440, 900);
    await scrollTo(page, 0);
    const box = await page.locator(LETTERHEAD).boundingBox();
    console.log(`W3-R7 · letterhead height at 1440: ${box!.height}px (chromium measured 192.06, webkit 201)`);
    expect(box!.height).toBeLessThanOrEqual(LETTERHEAD_MAX_1440);
  });

  // D-B48 — ONE 390 letterhead case and ONE 390 first-head case, each run on
  // both seeded papers: `…d5`'s name wraps to two lines, `…d4`'s does not.
  for (const paper of [
    { label: 'the two-line name (…d5)', id: LONG_PAPER_ID, lines: 2 },
    { label: 'the one-line name (…d4)', id: ONE_LINE_PAPER_ID, lines: 1 },
  ]) {
    test(`letterhead at 390 is within the gate its title's line count names — ${paper.label}`, async ({
      authenticatedPage: page,
    }) => {
      await openPaper(page, paper.id, 390, 844);
      await scrollTo(page, 0);

      const lines = await titleLines(page);
      const box = await page.locator(LETTERHEAD).boundingBox();
      console.log(
        `D-B48 · ${paper.label}: title lines ${lines}, letterhead ${box!.height}px, gate ${LETTERHEAD_MAX_390_BY_LINES[lines]}`,
      );
      expect(
        lines,
        `the title measured ${lines} lines — 3+ is a seed defect, not a budget`,
      ).toBe(paper.lines);
      expect(box!.height).toBeLessThanOrEqual(
        LETTERHEAD_MAX_390_BY_LINES[lines],
      );
    });

    test(`first [data-region-head] at 390 is within the gate its title's line count names, gross — ${paper.label}`, async ({
      authenticatedPage: page,
    }) => {
      await openPaper(page, paper.id, 390, 844);
      await scrollTo(page, 0);
      // D-B45 — the chips block prints at no width now, so there is nothing to
      // subtract: the count is asserted 0 and the head is gated gross.
      await expect(page.locator(CHIPS_BLOCK)).toHaveCount(0);

      const lines = await titleLines(page);
      const head = page.locator('[data-document-paper] [data-region-head]').first();
      await expect(head).toBeVisible({ timeout: 20_000 });
      const headBox = await head.boundingBox();
      console.log(
        `D-B48 · ${paper.label}: title lines ${lines}, first head ${headBox!.y}px gross, gate ${FIRST_HEAD_MAX_390_BY_LINES[lines]}`,
      );
      expect(lines).toBe(paper.lines);
      expect(headBox!.y).toBeLessThanOrEqual(
        FIRST_HEAD_MAX_390_BY_LINES[lines],
      );
    });
  }

  test('D-B48 — the name is TEXT that wraps, and never clips', async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 390, 844);
    await scrollTo(page, 0);
    const h1 = page.locator('[data-document-paper] h1').first();
    // The whole name, not `Aspen Loft — the long p`.
    await expect(h1).toContainText('Aspen Loft — the long paper');
    const fits = await h1.evaluate(
      (el) => el.scrollWidth <= el.clientWidth + 1,
    );
    expect(fits, 'the title overflowed its own box').toBe(true);
    // And at rest it is text with a rename affordance, never a bare input.
    await expect(page.locator('[data-letterhead-title-edit]')).toHaveCount(1);
    await expect(page.getByLabel('Project title')).toHaveCount(0);
  });
});
