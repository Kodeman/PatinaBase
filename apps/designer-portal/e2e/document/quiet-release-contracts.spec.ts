import type { Locator } from "@playwright/test";
import { test, expect, type AuthenticatedPage } from "../fixtures/auth";

const SENT_PROPOSAL_ID = "b0000000-0000-0000-0000-000000000002";
/**
 * The Drafting Room is for DRAFTS. `draftingEditability` (lib/document/
 * drafting-editability.ts) evicts any proposal whose `status !== "draft"` to
 * `/doc/<id>` — "already been issued. Returning to its read-only document" —
 * which is R42/R43"s own rule, not a defect. Every `/drafting/…` step below
 * therefore drives the seeded DRAFT; `/doc/…` steps keep the sent proposal,
 * whose read-only document is what they are actually about.
 */
const DRAFT_PROPOSAL_ID = "d0c10000-0000-0000-0000-0000000000b2";

const SEEDED_PROJECT_ID = "b0000000-0000-0000-0000-0000000000d1";

test.describe.configure({ mode: "serial" });

async function expectNoHorizontalOverflow(page: AuthenticatedPage) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    )
    .toBe(true);
}

async function expectHorizontalBounds(
  locator: Locator,
  minLeft: number,
  maxRight: number,
) {
  await expect(locator).toBeVisible();
  await expect
    .poll(async () => (await locator.boundingBox())?.x ?? -10_000)
    .toBeGreaterThanOrEqual(minLeft - 1);
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      return box ? box.x + box.width : 10_000;
    })
    .toBeLessThanOrEqual(maxRight + 1);
}

async function expectVerticalBounds(
  locator: Locator,
  minTop: number,
  maxBottom: number,
) {
  await expect(locator).toBeVisible();
  await expect
    .poll(async () => (await locator.boundingBox())?.y ?? -10_000)
    .toBeGreaterThanOrEqual(minTop - 1);
  await expect
    .poll(async () => {
      const box = await locator.boundingBox();
      return box ? box.y + box.height : 10_000;
    })
    .toBeLessThanOrEqual(maxBottom + 1);
}

async function openProposalDocument(page: AuthenticatedPage, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/doc/${SENT_PROPOSAL_ID}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("[data-document-shell]")).toBeVisible();
}

test.describe("Quiet Work release browser contracts", () => {
  test("holds the paper and chrome inside every exact responsive transition", async ({
    authenticatedPage: page,
  }) => {
    await openProposalDocument(page, 320);

    const shell = page.locator("[data-document-shell]");
    const paper = page.locator("[data-document-paper]");
    const spine = page.locator("[data-document-spine]");
    const margin = page.locator("[data-margin-panel]");
    const marginTrigger = page.locator("[data-margin-trigger]");
    const mobileBar = page.getByTestId("mobile-bar");

    for (const width of [320, 1179]) {
      await test.step(`${width}px keeps one paper canvas and one mobile edge`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await expect(spine).toBeHidden();
        await expect(marginTrigger).toBeHidden();
        await expect(margin).toHaveAttribute("aria-hidden", "true");
        await expect(page.locator("[data-mobile-edge-owner]")).toHaveCount(1);
        await expectHorizontalBounds(shell, 0, width);
        await expectHorizontalBounds(paper, 0, width);
        await expectHorizontalBounds(mobileBar, 0, width);
        await expectNoHorizontalOverflow(page);
      });
    }

    for (const width of [1180, 1439]) {
      await test.step(`${width}px keeps compact chrome outside the paper`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await expect(mobileBar).toBeHidden();
        await expect(spine).toBeVisible();
        // W1 — the rail earns its column: 136px, not the old 56px strip
        // (L4 flagged this poll as the last place the retired width was
        // asserted). The pair of polls keeps the 2px tolerance.
        await expect
          .poll(async () => (await spine.boundingBox())?.width ?? 0)
          .toBeGreaterThanOrEqual(135);
        await expect
          .poll(async () => (await spine.boundingBox())?.width ?? 1000)
          .toBeLessThanOrEqual(137);
        await expect(marginTrigger).toBeVisible();
        await expect(margin).toHaveAttribute("data-margin-mode", "sheet");
        await expect(margin).toHaveAttribute("aria-hidden", "true");
        await expectHorizontalBounds(shell, 0, width);
        await expectHorizontalBounds(spine, 0, 136);
        await expectHorizontalBounds(paper, 136, width);
        await expectHorizontalBounds(marginTrigger, 136, width);
        await expectNoHorizontalOverflow(page);
      });
    }

    await test.step("1280px compact margin owns and restores body scroll", async () => {
      await page.setViewportSize({ width: 1280, height: 900 });
      const originalBodyOverflow = await page.evaluate(
        () => document.body.style.overflow,
      );
      expect(originalBodyOverflow).not.toBe("hidden");

      const trigger = page.locator("[data-margin-trigger]");
      await trigger.click();
      await expect(margin).toHaveAttribute("role", "dialog");
      await expect(margin).toHaveAttribute("data-margin-mode", "sheet");
      await expect(page.locator("[data-margin-close]")).toBeFocused();
      await expect
        .poll(() => page.evaluate(() => document.body.style.overflow))
        .toBe("hidden");

      await page.keyboard.press("Escape");
      await expect(margin).toHaveAttribute("aria-hidden", "true");
      await expect(trigger).toBeFocused();
      await expect
        .poll(() => page.evaluate(() => document.body.style.overflow))
        .toBe(originalBodyOverflow);
    });

    await test.step("1440px keeps the settled rails outside the paper", async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(mobileBar).toBeHidden();
      await expect(marginTrigger).toBeHidden();
      await expect(margin).toHaveAttribute("data-margin-mode", "rail");
      await expect(margin).toHaveAttribute("aria-hidden", "false");
      await expect
        .poll(async () => (await spine.boundingBox())?.width ?? 0)
        .toBeGreaterThanOrEqual(199);
      await expectHorizontalBounds(shell, 0, 1440);
      await expectHorizontalBounds(spine, 0, 200);
      await expectHorizontalBounds(paper, 200, 1208);
      await expectHorizontalBounds(margin, 1208, 1440);
      await expectNoHorizontalOverflow(page);
    });
  });

  test.describe("compact project controls", () => {
    test.skip(
      ({ browserName }) => browserName !== "chromium",
      "the held-project timer writes one shared seeded-designer row",
    );

    test("the drawer / mobile bar is the sole timer doorway at every width", async ({
      authenticatedPage: page,
    }) => {
      // OD-16 (Wave 1): `spine-timer.tsx` — `SpineTimer` and
      // `CompactSpineTimerDoorway` — is deleted outright. There is no longer
      // a document-scoped timer doorway on the rail at any width; the
      // studio-wide drawer (>=1180) and the mobile bar's own fallback slot
      // (<1180) are the only printings of "time in hand" left, and neither
      // ever carries `[data-spine-timer-regime]`.
      await page.goto(`/doc/${SEEDED_PROJECT_ID}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("[data-document-shell]")).toBeVisible();

      const drawer = page.getByRole("navigation", { name: "Studio drawer" });
      const mobileBar = page.getByTestId("mobile-bar");

      for (const width of [1440, 1280]) {
        await test.step(`${width}px: the drawer is the sole timer doorway`, async () => {
          await page.setViewportSize({ width, height: 900 });
          await expect(mobileBar).toBeHidden();
          await expect(drawer).toBeVisible();
          await expect(
            drawer.getByText(/In hand today|Hands free/),
          ).toBeVisible();
          await expect(page.locator("[data-spine-timer-regime]")).toHaveCount(
            0,
          );
        });
      }

      await test.step("390px: the mobile bar's More is the sole timer doorway", async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(drawer).toBeHidden();
        await expect(mobileBar).toBeVisible();
        await expect(page.locator("[data-spine-timer-regime]")).toHaveCount(0);

        // The bar's centre slot holds the elected LIFECYCLE act on this
        // document, so the `In hand`/`Today` block — the slot's fallback when
        // nothing is registered (OD-11) — does not print here. At 390 the
        // timer's doorway is the More menu's `Time in hand` row, and it opens
        // the same sheet the studio drawer's clock opens from 1180 up.
        await mobileBar
          .getByRole("button", { name: "More studio actions" })
          .click();
        const timerRow = page.getByRole("button", { name: /Time in hand/ });
        await expect(timerRow).toBeVisible();
        await timerRow.click();
        await expect(
          page.getByRole("dialog", { name: "Time in hand" }),
        ).toBeVisible();
      });
    });
  });

  test("keeps mobile-only share and Orders escape hatches reachable", async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/drafting/${DRAFT_PROPOSAL_ID}`, {
      waitUntil: "domcontentloaded",
    });

    const desktopDraftingActions = page.getByRole("group", {
      name: "Drafting actions",
      includeHidden: true,
    });
    await expect(desktopDraftingActions).toHaveCount(1);
    await expect(desktopDraftingActions).toBeHidden();
    // Let the fetched proposal replace the initial route shell before opening
    // More; that hydration step also settles the primary/secondary registries.
    // Waited on the mobile bar's own context line: `Send as-is` has not
    // rendered on ANY proposal since the legacy-send retirement (f74e20b88 —
    // action-visibility.spec.ts records the same ruling), so it could no
    // longer serve as the barrier it was written to be.
    await expect(page.getByTestId("mobile-bar")).toContainText("Drafting");

    const more = page.getByRole("button", { name: "More studio actions" });
    await more.click();
    const moreMenu = page.getByRole("group", { name: "More studio actions" });
    const shareClientCopy = moreMenu.getByRole("button", {
      name: "Share client copy",
    });
    await expect(shareClientCopy).toHaveAttribute(
      "data-mobile-secondary-key",
      "share-proposal",
    );
    await shareClientCopy.click();

    const shareDialog = page.getByRole("dialog", { name: "Share links" });
    await expect(shareDialog).toBeVisible();
    await expect(shareDialog.locator("[data-overlay-share]")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(shareDialog).toBeHidden();
    await expect(more).toBeFocused();

    await page.setViewportSize({ width: 1179, height: 844 });
    await page.goto(`/doc/${SENT_PROPOSAL_ID}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("[data-document-shell]")).toBeVisible();
    await page.waitForLoadState("networkidle");

    const mobileMore = page.getByRole("button", {
      name: "More studio actions",
      includeHidden: true,
    });
    const originalBodyOverflow = await page.evaluate(
      () => document.body.style.overflow,
    );
    await mobileMore.click();
    await page
      .getByRole("group", { name: "More studio actions" })
      .getByRole("button", { name: "Ledgers" })
      .click();
    let drawer = page.locator('[data-mobile-sheet-kind="drawer"]');
    await expect(drawer).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe("hidden");

    await page.setViewportSize({ width: 1180, height: 844 });
    await expect(drawer).toHaveCount(0);
    await expect(page.locator("[data-studio-books-doorway]")).toBeFocused();
    await expect(mobileMore).toBeHidden();
    await expect(mobileMore).not.toBeFocused();
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe(originalBodyOverflow);

    await page.setViewportSize({ width: 1179, height: 844 });
    await expect(drawer).toHaveCount(0);

    await page.setViewportSize({ width: 320, height: 480 });
    await mobileMore.click();
    await page
      .getByRole("group", { name: "More studio actions" })
      .getByRole("button", { name: "Ledgers" })
      .click();
    drawer = page.locator('[data-mobile-sheet-kind="drawer"]');
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(mobileMore).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe(originalBodyOverflow);

    await mobileMore.click();
    await page
      .getByRole("group", { name: "More studio actions" })
      .getByRole("button", { name: "Ledgers" })
      .click();
    drawer = page.locator('[data-mobile-sheet-kind="drawer"]');
    await expect(drawer).toBeVisible();
    await drawer.getByRole("button", { name: /^Orders/ }).click();

    const ordersDialog = page.getByRole("dialog", { name: "Orders" });
    await expect(ordersDialog).toBeVisible();
    await expect(ordersDialog).toHaveAttribute(
      "data-doc-sheet-scroll-region",
      "true",
    );
    const layer = page.locator("[data-doc-sheet-layer]");
    const headControl = ordersDialog.getByRole("button", {
      name: "Put back · Esc",
    });
    await expectHorizontalBounds(layer, 0, 320);
    await expectVerticalBounds(layer, 0, 480);
    await expectHorizontalBounds(ordersDialog, 15, 305);
    await expectVerticalBounds(ordersDialog, 15, 465);
    await expectVerticalBounds(headControl, 15, 465);
    await expect(ordersDialog.locator("[data-doc-sheet-title]")).toHaveText(
      "Orders",
    );
    await expect
      .poll(() =>
        ordersDialog
          .locator("[data-doc-sheet-title-line]")
          .evaluate((title) => title.scrollWidth <= title.clientWidth),
      )
      .toBe(true);
    await expect
      .poll(() =>
        layer.evaluate((surface) => getComputedStyle(surface).overflowY),
      )
      .toBe("hidden");
    await expect
      .poll(
        () =>
          ordersDialog.evaluate((panel) => ({
            bounded:
              panel.getBoundingClientRect().top >= 0 &&
              panel.getBoundingClientRect().bottom <= window.innerHeight,
            overflowY: window.getComputedStyle(panel).overflowY,
            scrollable: panel.scrollHeight > panel.clientHeight,
          })),
        { timeout: 30_000 },
      )
      .toEqual({ bounded: true, overflowY: "auto", scrollable: true });

    await ordersDialog.evaluate((panel) => {
      panel.scrollTop = 100;
    });
    await expect
      .poll(() => ordersDialog.evaluate((panel) => panel.scrollTop))
      .toBeGreaterThan(0);
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    await expect(ordersDialog).toHaveCount(0);
    await expect(mobileMore).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => document.body.style.overflow))
      .toBe(originalBodyOverflow);
  });
});
