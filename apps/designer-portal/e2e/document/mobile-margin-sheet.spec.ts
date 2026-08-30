/**
 * The 390 Margin sheet — the WHOLE margin (D-B30, W5-R1).
 *
 * At 390 the letterhead's margin chips (`MobileMarginChips anchorKind=
 * "letterhead"`) no longer print between the band and the first region, and
 * (W5-R1) the FF&E line's own chips (`anchorKind="line"`) retire below 980
 * too — they all yield to one Margin sheet opened from the mobile bar's
 * More menu, first row of "In this document", above Plan room.
 * `use-margin-sheet.ts`'s `useMarginSheet` is the one derivation the sheet
 * lists from; it is the RAIL'S grouping (margin-rail.tsx `anchorGroups`) —
 * "THE WHOLE JOB" (letterhead/section-anchored) printed first, then one
 * "BESIDE <region>" group per region with a line-anchored member.
 *
 * THE COUNT: `the-document-lens-seed.sql`'s own §9 comment states the split
 * for `…d5` explicitly — 4 letterhead-anchored items (the overdue rug/
 * nightstands decision, 2 approved decisions, the outstanding invoice) and
 * 3 line-anchored items (the COM reading-chair-fabric decision, the console
 * thread, the PO-chase thread) — 4 + 3 = 7, the whole margin. W5-R1's ruling
 * (reconciliation.md, "the 390 Margin sheet is the whole margin") lists all
 * seven; only two of the four decisions/invoice are overdue as the
 * derivation counts it — the rug/nightstands decision (whole job) and the
 * COM decision (beside Pieces); money is never counted.
 */
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { settle } from '../helpers/lens';
import { LONG_PAPER_ID, assertLongPaper } from './lens-fixtures';

test.skip(
  ({ browserName }) => browserName === 'firefox',
  'the lens specs run chromium + webkit (test-impact, "Browser ruling"); Firefox is not a shipped target for this portal',
);

/** THE WHOLE JOB (4, letterhead-anchored) then BESIDE PIECES (3, line-
 *  anchored) — the seed's own §9 comment, in the rail's print order. */
const WHOLE_JOB_TITLES = [
  'Primary bedroom — rug and nightstands',
  'Dining room — finish sample',
  'Whole-house hardware',
  'INV-2026-114',
] as const;
const BESIDE_PIECES_TITLES = [
  'Living room — fabric for the reading chair',
  'Console — damage photos',
  'PO-2026-0418 follow-up',
] as const;
const ALL_TITLES = [...WHOLE_JOB_TITLES, ...BESIDE_PIECES_TITLES] as const;

async function openPaperAt390(page: AuthenticatedPage): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/doc/${LONG_PAPER_ID}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-document-shell]')).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
}

function moreDoor(page: AuthenticatedPage) {
  return page.getByRole('button', { name: 'More studio actions' });
}

async function openMargin(page: AuthenticatedPage) {
  await moreDoor(page).click();
  await page
    .getByRole('group', { name: 'In this document' })
    .getByRole('button', { name: 'Margin · 7' })
    .click();
  return page.getByRole('dialog', { name: 'The margin' });
}

test.describe('the Margin sheet at 390 — the whole margin (D-B30 / W5-R1)', () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  test('More leads with "Margin · 7" on the long paper, above Plan room', async ({
    authenticatedPage: page,
  }) => {
    await openPaperAt390(page);

    // The letterhead chips block, and (W5-R1) the line-anchored chips below
    // 980, never mount — the sheet carries all of it now.
    await expect(
      page.locator('[data-mobile-margin-chips="letterhead"]'),
    ).toHaveCount(0);
    await expect(
      page.locator('[data-mobile-margin-chips="line"]'),
    ).toHaveCount(0);

    await moreDoor(page).click();
    const menu = page.getByRole('group', { name: 'More studio actions' });
    const inThisDocument = menu.getByRole('group', {
      name: 'In this document',
    });
    const margin = inThisDocument.getByRole('button', { name: 'Margin · 7' });
    await expect(margin).toBeVisible();

    const rows = inThisDocument.locator('a, button');
    const first = await rows.first().textContent();
    expect(first?.replace('→', '')).toBe('Margin · 7');
  });

  test('opens the Margin sheet grouped THE WHOLE JOB above BESIDE PIECES, all seven rows, each with one inline act', async ({
    authenticatedPage: page,
  }) => {
    await openPaperAt390(page);
    const sheet = await openMargin(page);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Margin')).toBeVisible();
    // The rug/nightstands decision (whole job) and the COM decision (beside
    // Pieces) are the two the derivation counts overdue; the invoice — money
    // — never counts.
    await expect(sheet.getByText('2 overdue')).toBeVisible();

    const wholeJobHeading = sheet.getByText('THE WHOLE JOB · 4');
    const besidePiecesHeading = sheet.getByText('BESIDE PIECES · 3');
    await expect(wholeJobHeading).toBeVisible();
    await expect(besidePiecesHeading).toBeVisible();
    const wholeJobBox = await wholeJobHeading.boundingBox();
    const besideBox = await besidePiecesHeading.boundingBox();
    expect(wholeJobBox).not.toBeNull();
    expect(besideBox).not.toBeNull();
    // W5-R1 prints THE WHOLE JOB first (the rail prints it last).
    expect(wholeJobBox!.y).toBeLessThan(besideBox!.y);

    const rows = sheet.locator('[data-margin-row]');
    await expect(rows).toHaveCount(ALL_TITLES.length);

    for (const title of ALL_TITLES) {
      const row = rows.filter({ hasText: title });
      await expect(row).toHaveCount(1);
      await expect(row.locator('[data-margin-row-act]')).toHaveCount(1);
    }
  });

  test('a line-anchored row names its line, jumps to it, and opens the margin-item sheet', async ({
    authenticatedPage: page,
  }) => {
    await openPaperAt390(page);
    const sheet = await openMargin(page);

    const comRow = sheet
      .locator('[data-margin-row]')
      .filter({ hasText: 'Living room — fabric for the reading chair' });
    await expect(comRow).toHaveCount(1);
    // The row names its FF&E line — room · item — on a second line.
    await expect(
      comRow.locator('[data-margin-row-line]'),
    ).toHaveText(/Living Room · .+/);

    const scrollYBefore = await page.evaluate(() => window.scrollY);
    await comRow.getByText('Living room — fabric for the reading chair').click();

    await expect(
      page.getByRole('dialog', { name: 'Margin item' }),
    ).toBeVisible();
    // The row asked the PAGE to land (D-B46: unfold → promote → scroll), and
    // the paper moved under the sheet that now covers it. POLLED, not read
    // once: `scrollIntoView` is smooth outside the reduce register, so the
    // offset arrives over several frames — and at 390 the press now mounts
    // FF&E's 62 lines first, which is exactly the work that used to make a
    // single read win this race by accident.
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 })
      .not.toBe(scrollYBefore);
  });

  test('Escape returns focus to the More door', async ({
    authenticatedPage: page,
  }) => {
    await openPaperAt390(page);
    const door = moreDoor(page);
    const sheet = await openMargin(page);
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    // Selecting any More row focuses the More button before its action runs
    // (mobile-bar.tsx `closeThen`) — the same mechanic every door-opened
    // sheet (spine, margin-item, drawer, timer) already relies on, so the
    // captured focus `restoreSheetFocus` returns is that button, not the
    // row (which unmounts with the menu the moment it is chosen).
    await expect(door).toBeFocused();
  });
});
