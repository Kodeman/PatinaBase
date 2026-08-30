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
          expect(
            await layoutHeight(band),
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

  // D-B30 / W5-R1: the letterhead `MobileMarginChips` block that used to
  // stand between the band and the first region at 390 is gone (a Margin
  // sheet off the mobile bar's More menu replaces it — mobile-margin-sheet
  // .spec.ts covers that door), and so is the line-anchored mount below 980.
  // The W3-fix chips allowance is deleted from this file at the W5
  // integration: every 390 first-head assertion is now GROSS against
  // W3-R7's own ≤435 (W5-R1: "the 390 first head gross ≤ 435 — D-B26's
  // W3-R7 number, now without the chips subtraction").
  test('D-B30 — at 390 no margin-chips block prints and the first region head stands at or above 435px gross', async ({
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
    console.log(
      `D-B30 · first [data-region-head] top at 390, rest, gross: ${box!.y}px`,
    );
    expect(box!.y).toBeLessThanOrEqual(FIRST_HEAD_MAX_Y_390);
  });
});

/**
 * The letterhead grid (findings D-B26 / B1, budgets per W3-R7).
 *
 * THE FALSIFIABLE SENTENCE: with the title given its own row across both
 * tracks, the ledger confined to `minmax(18rem,24rem)` and printing `SHARING`
 * alone at every width, the letterhead measures ≤205px at 1440 and ≤265px at
 * 390 (W3-R7, asserted on both chromium and webkit), its title <input> is
 * never clipped, its vitals are one row, its ledger is ONE row at both
 * widths, and the first region head at 390 stands at or above y 435 of an
 * 844px frame once the margin-chips block is discounted.
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

    // The title takes the whole measure, so nothing of it is hidden.
    const title = page.locator(`${LETTERHEAD} input[aria-label="Project title"]`);
    await expect(title).toBeVisible();
    const measure = await title.evaluate((el) => ({
      scroll: (el as HTMLInputElement).scrollWidth,
      client: (el as HTMLInputElement).clientWidth,
      value: (el as HTMLInputElement).value,
    }));
    console.log(
      `W3-R5 · title "${measure.value}": scrollWidth ${measure.scroll}, clientWidth ${measure.client}`,
    );
    expect(measure.scroll).toBe(measure.client);

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
 *   390 first head, gross — chromium 423.17 · webkit 430.25 (measured net of the
 *                            now-retired chips block) → gate ≤ 435 (engine allowance +5)
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

  test(`letterhead is ≤${LETTERHEAD_MAX_390}px at 390 (chromium 255.17 · webkit 262.25, engine allowance +5)`, async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 390, 844);
    await scrollTo(page, 0);
    const box = await page.locator(LETTERHEAD).boundingBox();
    console.log(`W3-R7 · letterhead height at 390: ${box!.height}px (chromium measured 255.17, webkit 262.25)`);
    expect(box!.height).toBeLessThanOrEqual(LETTERHEAD_MAX_390);
  });

  test(`first [data-region-head] is ≤${FIRST_HEAD_MAX_Y_390}px at 390, gross (chromium 423.17 · webkit 430.25, engine allowance +5)`, async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 390, 844);
    await scrollTo(page, 0);
    // W5-R1 — the chips block no longer prints at 390, so there is nothing to
    // subtract: the count is asserted 0 and the head is gated gross.
    await expect(page.locator(CHIPS_BLOCK)).toHaveCount(0);
    const head = page.locator('[data-document-paper] [data-region-head]').first();
    await expect(head).toBeVisible({ timeout: 20_000 });
    const headBox = await head.boundingBox();
    console.log(
      `W3-R7 · first head at 390: gross ${headBox!.y}px (chromium measured 423.17, webkit 430.25 net of the retired chips block)`,
    );
    expect(headBox!.y).toBeLessThanOrEqual(FIRST_HEAD_MAX_Y_390);
  });
});
