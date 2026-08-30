/**
 * The 390 Margin sheet (D-B30, lane W5-L3).
 *
 * At 390 the letterhead's margin chips (`MobileMarginChips anchorKind=
 * "letterhead"`) no longer print between the band and the first region —
 * they yield to a Margin sheet opened from the mobile bar's More menu, first
 * row of "In this document", above Plan room. `use-letterhead-margin.ts` is
 * the one derivation both the (now-unmounted-in-product) chips component and
 * this sheet read, so the sheet lists exactly what that block used to print:
 * items anchored to the letterhead or a section, never a Pieces line (those
 * keep their own chips under `ffe-section.tsx`'s per-line mount).
 *
 * THE COUNT: `the-document-lens-seed.sql`'s own §9 comment states the split
 * for `…d5` explicitly — "beside Pieces (anchor_kind='line')" 3 items (the
 * COM decision, the console thread, the PO-chase thread) and "whole job
 * (anchor_kind='letterhead')" 4 items (the overdue rug/nightstands decision,
 * 2 approved decisions, the outstanding invoice) — 3 + 4 = 7 in the margin
 * as a whole. D-B30's Margin sheet is scoped to the letterhead (+ section)
 * subset only — the same scope `MobileMarginChips anchorKind="letterhead"`
 * always had — so it lists 4, not 7: the "MARGIN · 7" figure that appears in
 * the design docs describes the mockup's combined sheet (both anchor groups
 * printed together); the shipped sheet deliberately narrows to what the
 * deleted chips block printed, per D-B30 item 2 ("the sheet lists exactly
 * what the block printed").
 */
import { test, expect, type AuthenticatedPage } from "../fixtures/auth";
import { settle } from "../helpers/lens";
import { LONG_PAPER_ID, assertLongPaper } from "./lens-fixtures";

test.skip(
  ({ browserName }) => browserName === "firefox",
  'the lens specs run chromium + webkit (test-impact, "Browser ruling"); Firefox is not a shipped target for this portal',
);

/** The four letterhead-anchored margin rows on `…d5`, per the seed's own §9
 *  comment — not the whole margin (7), which includes the 3 Pieces-line-
 *  anchored items this sheet does not list (D-B30). */
const EXPECTED_TITLES = [
  "Primary bedroom — rug and nightstands",
  "Dining room — finish sample",
  "Whole-house hardware",
  "INV-2026-114",
] as const;

async function openPaperAt390(page: AuthenticatedPage): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/doc/${LONG_PAPER_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-document-shell]")).toBeVisible({
    timeout: 30_000,
  });
  await settle(page);
}

function moreDoor(page: AuthenticatedPage) {
  return page.getByRole("button", { name: "More studio actions" });
}

test.describe("the Margin sheet at 390 (D-B30)", () => {
  test.beforeAll(() => {
    assertLongPaper();
  });

  test('More leads with "Margin · 4" on the long paper, above Plan room', async ({
    authenticatedPage: page,
  }) => {
    await openPaperAt390(page);

    // The letterhead chips block D-B30 retires never mounts.
    await expect(
      page.locator('[data-mobile-margin-chips="letterhead"]'),
    ).toHaveCount(0);

    await moreDoor(page).click();
    const menu = page.getByRole("group", { name: "More studio actions" });
    const inThisDocument = menu.getByRole("group", {
      name: "In this document",
    });
    const margin = inThisDocument.getByRole("button", { name: "Margin · 4" });
    await expect(margin).toBeVisible();

    const rows = inThisDocument.locator("a, button");
    const first = await rows.first().textContent();
    expect(first?.replace("→", "")).toBe("Margin · 4");
  });

  test("opens the Margin sheet listing the four letterhead-anchored items, each with one inline act", async ({
    authenticatedPage: page,
  }) => {
    await openPaperAt390(page);
    await moreDoor(page).click();
    await page
      .getByRole("group", { name: "In this document" })
      .getByRole("button", { name: "Margin · 4" })
      .click();

    const sheet = page.getByRole("dialog", { name: "The margin" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Margin")).toBeVisible();
    // The overdue rug/nightstands decision (state=overdue, six days) is the
    // one letterhead item the derivation counts as overdue.
    await expect(sheet.getByText("1 overdue")).toBeVisible();

    const rows = sheet.locator("[data-margin-row]");
    await expect(rows).toHaveCount(EXPECTED_TITLES.length);

    for (const title of EXPECTED_TITLES) {
      const row = rows.filter({ hasText: title });
      await expect(row).toHaveCount(1);
      await expect(row.locator("[data-margin-row-act]")).toHaveCount(1);
    }
  });

  test("Escape returns focus to the More door", async ({
    authenticatedPage: page,
  }) => {
    await openPaperAt390(page);
    const door = moreDoor(page);
    await door.click();
    await page
      .getByRole("group", { name: "In this document" })
      .getByRole("button", { name: "Margin · 4" })
      .click();

    const sheet = page.getByRole("dialog", { name: "The margin" });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    // Selecting any More row focuses the More button before its action runs
    // (mobile-bar.tsx `closeThen`) — the same mechanic every door-opened
    // sheet (spine, margin-item, drawer, timer) already relies on, so the
    // captured focus `restoreSheetFocus` returns is that button, not the
    // row (which unmounts with the menu the moment it is chosen).
    await expect(door).toBeFocused();
  });
});
