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
import { test, expect, type AuthenticatedPage } from "../fixtures/auth";
import { scrollTo, settle } from "../helpers/lens";
import { LONG_PAPER_ID, PRE_WORK_ID, assertLongPaper } from "./lens-fixtures";

test.describe.configure({ mode: "serial" });
test.skip(
  ({ browserName }) => browserName === "firefox",
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
  { label: "1440", width: 1440, height: 900 },
  { label: "1280", width: 1280, height: 900 },
  { label: "390", width: 390, height: 844 },
] as const;

const PAPERS = [
  { label: "the long paper", id: LONG_PAPER_ID },
  { label: "the pre-work paper", id: PRE_WORK_ID },
] as const;

async function openPaper(
  page: AuthenticatedPage,
  id: string,
  width: number,
  height: number,
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto(`/doc/${id}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-document-shell]")).toBeVisible({
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

test.describe("the lens band’s declared height", () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  for (const paper of PAPERS) {
    for (const size of WIDTHS) {
      test(`is exactly ${BAND_HEIGHT}px on ${paper.label} at ${size.label}, at every offset`, async ({
        authenticatedPage: page,
      }) => {
        await openPaper(page, paper.id, size.width, size.height);

        const band = page.locator("[data-lens-band]");
        await expect(band).toBeVisible({ timeout: 20_000 });

        // The token is declared once and lengths only (C-7): if it drifts, the
        // sticky `top`, the landing clearance and SC1 all drift with it.
        expect(await tokenPx(page, "--doc-band-height")).toBe(BAND_HEIGHT);

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

  test("SC1 — the first region head stands at or above 405px at rest, at 1440", async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 1440, 900);
    await scrollTo(page, 0);

    const firstHead = page
      .locator("[data-document-paper] [data-region-head]")
      .first();
    await expect(firstHead).toBeVisible({ timeout: 20_000 });
    const box = await firstHead.boundingBox();
    expect(box).not.toBeNull();
    // Printed on every run: the threshold is a ceiling, the number is the
    // measurement §6 actually claims.
    console.log(
      `SC1 · first [data-region-head] top at 1440, rest: ${box!.y}px`,
    );
    expect(box!.y).toBeLessThanOrEqual(SC1_MAX_Y);
  });

  test("SC2 — the band’s bottom edge is at or above 108px at scrollY 400", async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 1440, 900);
    await scrollTo(page, 400);

    const box = await page.locator("[data-lens-band]").boundingBox();
    expect(box).not.toBeNull();
    const bottom = box!.y + box!.height;
    console.log(`SC2 · band bottom at 1440, scrollY 400: ${bottom}px`);
    expect(bottom).toBeLessThanOrEqual(SC2_MAX_BOTTOM);
  });

  // D-B30 (W5-L3): the letterhead `MobileMarginChips` block that used to
  // stand between the band and the first region at 390 is gone (a Margin
  // sheet off the mobile bar's More menu replaces it — mobile-margin-sheet
  // .spec.ts covers that door). D-B26's 390 first-head budget (≤400) was
  // measured NET of that block on `document-lens/w3-fix`; that allowance
  // line (`// D-B30: net of MobileMarginChips until W5-L3`) never reached
  // this branch, so there is nothing to delete here — this is the GROSS
  // assertion D-B30 promotes it to. If a future merge brings the W3-fix
  // allowance line into this file, delete it in favour of this case.
  test("D-B30 — at 390 the letterhead chips block is gone and the first region head stands at or above 400px gross", async ({
    authenticatedPage: page,
  }) => {
    await openPaper(page, LONG_PAPER_ID, 390, 844);
    await scrollTo(page, 0);

    await expect(
      page.locator('[data-mobile-margin-chips="letterhead"]'),
    ).toHaveCount(0);

    const firstHead = page
      .locator("[data-document-paper] [data-region-head]")
      .first();
    await expect(firstHead).toBeVisible({ timeout: 20_000 });
    const box = await firstHead.boundingBox();
    expect(box).not.toBeNull();
    console.log(
      `D-B30 · first [data-region-head] top at 390, rest, gross: ${box!.y}px`,
    );
    expect(box!.y).toBeLessThanOrEqual(400);
  });
});
