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
import { psqlRun } from '../helpers/psql';

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
    // D-B45 — the component is DELETED, so no chips block prints under any
    // attribute value, at any width. The old `="line"` selector could never
    // fail: the line branch wrote the attribute BARE.
    await expect(page.locator('[data-mobile-margin-chips]')).toHaveCount(0);

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

    // The origin the paper is measured against. Read HERE, immediately before
    // the press: the sheet's own open animation has finished by now, and
    // nothing else moves the page between this line and the click.
    const scrollYBefore = await page.evaluate(() => window.scrollY);

    await comRow.getByText('Living room — fabric for the reading chair').click();

    await expect(
      page.getByRole('dialog', { name: 'Margin item' }),
    ).toBeVisible();
    // BOTH signed sentences, and they compose. W5-C14's is "the line is
    // mounted": the press unfolds and promotes `ffe`, which is what brings
    // `#ffe-selection-<id>` into existence at all — before that there was
    // nothing on the page to land on, and a scroll assertion could pass off a
    // coincidence. D-B46's is "the paper moved under the sheet that now covers
    // it". POLLED, not read once: `scrollIntoView` is smooth outside the
    // reduce register, so the offset arrives over several frames — and at 390
    // the press now mounts FF&E's 62 lines first, which is exactly the work
    // that used to make a single read win this race by accident.
    await expect
      .poll(
        async () =>
          page.evaluate(
            () => document.querySelector('[id^="ffe-selection-"]') !== null,
          ),
        { timeout: 15_000 },
      )
      .toBe(true);
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

  // ── W5-R4(a) / D-B44 — CAPTURE A NOTE, text only ──────────────────────
  test.describe('the note composer', () => {
    const BODY = 'W5-fix probe — the console arrives Tuesday';

    test.afterAll(() => {
      // The seed must come back exactly as it was: the head reads `Margin · 7`
      // in every other case in this file.
      psqlRun(
        `delete from margin_notes where body = '${BODY.replace(/'/g, "''")}';`,
      );
    });

    test('files a note from the sheet: it is about the whole job at every stop (D-B44(a) / W5-R6), and the head counts it', async ({
      authenticatedPage: page,
    }) => {
      await openPaperAt390(page);
      const sheet = await openMargin(page);
      await expect(sheet).toBeVisible();

      // The head row: the count, the act, and no photo or voice anywhere.
      await expect(sheet.getByText('· 7')).toBeVisible();
      await expect(sheet.getByText('2 overdue')).toBeVisible();
      const act = sheet.locator('[data-margin-capture-note]');
      await expect(act).toBeVisible();
      // W5-R4(a) — text only. No NOTE/PHOTO/VOICE capture row. (Matched as
      // whole-word CONTROLS: a seeded row title legitimately says "damage
      // photos", which is a margin item, not a capture affordance.)
      await expect(
        sheet.getByRole('button', { name: /^photo$/i }),
      ).toHaveCount(0);
      await expect(
        sheet.getByRole('button', { name: /^voice$/i }),
      ).toHaveCount(0);
      await expect(sheet.getByRole('textbox')).toHaveCount(0);

      // D-B44 — the anchor is THE WHOLE JOB, at every stop. At s0 on this
      // paper the first region is already in frame, so `data-reading-index`
      // names it; the composer says `About the whole job` anyway, because that
      // is what it writes.
      await act.click();
      const composer = page.getByRole('dialog', {
        name: 'Note to the margin',
      });
      await expect(composer).toBeVisible();
      await expect(
        composer.locator('[data-margin-note-anchor]'),
      ).toHaveText('About the whole job');
      await expect(
        composer.getByRole('button', { name: 'Save' }),
      ).toBeDisabled();

      // Discard writes nothing and lands back on the act.
      await composer.getByRole('button', { name: 'Discard' }).click();
      await expect(composer).toBeHidden();
      await expect(act).toBeFocused();

      // Close the sheet before touching the bar: it is a modal and covers it.
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('dialog', { name: 'The margin' }),
      ).toBeHidden();

      // Land on Pieces. D-B44: the anchor does NOT follow the stop.
      await page.evaluate(() => {
        document
          .querySelector('[data-document-paper] [data-index-region="ffe"]')
          ?.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
      await settle(page);
      await moreDoor(page).click();
      await page
        .getByRole('group', { name: 'More studio actions' })
        .getByRole('button', { name: /^Margin · / })
        .click();
      const sheet2 = page.getByRole('dialog', { name: 'The margin' });
      await sheet2.locator('[data-margin-capture-note]').click();
      const composer2 = page.getByRole('dialog', {
        name: 'Note to the margin',
      });
      await expect(
        composer2.locator('[data-margin-note-anchor]'),
      ).toHaveText('About the whole job');

      // Write it, save it, and the margin comes back one longer.
      await composer2.getByRole('textbox', { name: 'Note body' }).fill(BODY);
      await composer2.getByRole('button', { name: 'Save' }).click();
      await expect(composer2).toBeHidden();

      const back = page.getByRole('dialog', { name: 'The margin' });
      await expect(back.getByText('· 8')).toBeVisible();
      await expect(back.getByText('2 overdue')).toBeVisible();
      // D-B44 — captured while reading Pieces, filed under THE WHOLE JOB, and
      // BESIDE PIECES gains nothing.
      const wholeJob = back.locator('[data-margin-group="whole-job"]');
      await expect(wholeJob.getByText(BODY)).toBeVisible();
      await expect(wholeJob).toContainText('THE WHOLE JOB · 5');
      await expect(
        back.locator('[data-margin-group="ffe"]'),
      ).toContainText('BESIDE PIECES · 3');
      await expect(
        back.locator('[data-margin-group="ffe"]').getByText(BODY),
      ).toHaveCount(0);
      await expect(
        back.locator('[data-margin-capture-note]'),
      ).toBeFocused();

      // ── and it SURVIVES a reload in the same group ──────────────────────
      // NOT `openMargin()`: that helper names the door `Margin · 7`, and the
      // margin is one longer now.
      await openPaperAt390(page);
      await moreDoor(page).click();
      await page
        .getByRole('group', { name: 'More studio actions' })
        .getByRole('button', { name: /^Margin · / })
        .click();
      const reopened = page.getByRole('dialog', { name: 'The margin' });
      await expect(reopened.getByText('· 8')).toBeVisible();
      const wholeJobAfter = reopened.locator(
        '[data-margin-group="whole-job"]',
      );
      await expect(wholeJobAfter.getByText(BODY)).toBeVisible();
      await expect(wholeJobAfter).toContainText('THE WHOLE JOB · 5');
      await expect(
        reopened.locator('[data-margin-group="ffe"]'),
      ).toContainText('BESIDE PIECES · 3');
    });
  });
});
