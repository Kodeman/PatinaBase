import { test, expect } from "../fixtures/auth";
import { adminDb } from "../helpers/supabase-admin";
import {
  FLAG_ON,
  FULL_CHAIN_DECK,
  NOTES_ONLY_URL,
  boardFfeIds,
  cleanupBoard,
  clearFixtureLog,
  deckPieces,
  deckPinCount,
  fixtureLog,
  fixturePath,
  layOutDeck,
  mismatchedSlideSections,
  openBoard,
  openDocLine,
  openLedger,
  purchaseOrderIds,
  sectionCount,
  seedEmptyBoard,
  waitForResolution,
  watchFunctionFailures,
  type Board,
} from "./deck-helpers";

/**
 * US-15 W6 — the whole chain on a project board, nothing stood in for:
 * the SQ-356 tickets deck (plus a slide whose link is only in the speaker
 * notes) → sections named after slides → the real resolver reads every link
 * from the fixture server (DECK_IMPORT_TEST_FETCH_BASE, the only seam) →
 * the ledger's link rows → keep them all → "Put N pieces on the schedule" as
 * her selections → FF&E lines `selected` with a vendor and a price → the
 * line's OrderAssistant is enabled → a PO draft is created and never sent.
 */

const BOARD: Board = {
  id: "e2e00000-0000-4000-8000-0000000016a1",
  name: "Deck full chain board",
  owner: "project",
};

test.describe.configure({ mode: "serial" });

test.describe("Bring in a deck — full chain", () => {
  test.skip(!FLAG_ON, "board-deck-import is not in NEXT_PUBLIC_FLAG_OVERRIDES.");
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The deterministic fixtures own shared board rows.",
  );

  test("deck → board → keep → schedule (selected) → OrderAssistant → PO draft, not sent", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(300_000);
    const functionFailures = watchFunctionFailures(page);
    const poSendCalls: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (/po[-_]send/i.test(url)) poSendCalls.push(`${request.method()} ${url}`);
    });

    await cleanupBoard(BOARD);
    seedEmptyBoard(BOARD);
    await clearFixtureLog();
    try {
      await openBoard(page, BOARD);
      await layOutDeck(page, FULL_CHAIN_DECK);

      // Sections named after the slides.
      await expect
        .poll(() => {
          if (functionFailures.length) throw new Error(`functions: ${functionFailures.join(" | ")}`);
          return deckPinCount(BOARD);
        }, { timeout: 60_000 })
        .toBeGreaterThan(0);
      await expect(page.getByText(/Laying out · slide/)).toBeHidden({ timeout: 60_000 });
      expect(sectionCount(BOARD)).toBeGreaterThan(0);
      expect(mismatchedSlideSections(BOARD)).toBe(0);
      await expect(page.getByRole("textbox", { name: "Rename Reading Chair section" })).toHaveValue(
        "Reading Chair",
      );

      // The real resolver read the links from the fixture server.
      const resolved = await waitForResolution(BOARD, 180_000);
      const linkRows = resolved.filter((piece) => piece.foundBy === "link");
      expect(linkRows.length).toBeGreaterThan(1);
      const read = linkRows.filter((piece) => piece.pageRead);
      expect(read.length).toBeGreaterThan(0);
      for (const piece of read) {
        expect(piece.priceCents, piece.linkUrl ?? piece.id).not.toBeNull();
        expect(piece.chosenSourceUrl).toMatch(/^https:\/\//);
      }
      const hits = (await fixtureLog()).map((hit) => hit.path);
      for (const piece of read) {
        expect(hits).toContain(fixturePath(piece.chosenSourceUrl as string));
      }

      // The notes-only link was read, and lands as its own link row.
      expect(hits).toContain(fixturePath(NOTES_ONLY_URL));
      const notesRow = resolved.find((piece) => piece.linkUrl === NOTES_ONLY_URL);
      expect(notesRow, "a row for the notes-only link").toBeTruthy();
      expect(notesRow?.pageRead).toBe(true);

      await expect(page.getByText(/pieces? from the deck/)).toBeVisible({ timeout: 30_000 });
      const ledger = await openLedger(page);
      await expect(ledger.locator("[data-deck-how]", { hasText: "From the link on the slide" }).first())
        .toBeVisible({ timeout: 20_000 });

      // The notes-only link pairs onto the slide's one picture: the picture
      // piece is found by its link, and she keeps it like any link row (SQ-384).
      expect(notesRow!.boardItemId, "the notes-only link paired onto the slide's picture").not.toBeNull();
      expect(notesRow!.foundBy).toBe("link");
      const notesRowEl = ledger.locator(`[data-deck-row="${notesRow!.id}"]`);
      await notesRowEl.locator('[data-deck-act="keep"]').click();
      await expect
        .poll(async () =>
          (await notesRowEl.getByRole("alert").count()) > 0
            ? `refused: ${functionFailures.join(" | ")}`
            : notesRowEl.getAttribute("data-deck-row-state"),
        { timeout: 30_000 })
        .toBe("kept");
      await expect(notesRowEl.locator("[data-deck-how]")).toHaveText("From the link on the slide");

      // Keep every link row: the bulk action for the strong ones, then each
      // remaining link row by hand.
      const bulk = ledger.locator("[data-deck-bulk-keep]");
      if (await bulk.isVisible()) {
        await bulk.click();
        await expect(bulk).toBeHidden({ timeout: 30_000 });
      }
      const pendingLinkRow = ledger
        .locator('[data-deck-row-state="to_confirm"]')
        .filter({ has: page.locator("[data-deck-how]", { hasText: "From the link on the slide" }) });
      for (let guard = 0; guard < 40 && (await pendingLinkRow.count()) > 0; guard++) {
        const row = pendingLinkRow.first();
        const id = await row.getAttribute("data-deck-row");
        await row.locator('[data-deck-act="keep"]').click();
        await expect(ledger.locator(`[data-deck-row="${id}"]`))
          .toHaveAttribute("data-deck-row-state", "kept", { timeout: 30_000 });
      }
      await expect(pendingLinkRow).toHaveCount(0);

      const kept = (await deckPieces(BOARD)).filter((piece) => piece.state === "kept");
      const keptLinks = kept.filter((piece) => piece.foundBy === "link");
      expect(keptLinks.length).toBe(linkRows.filter((piece) => piece.boardItemId != null || piece.id === notesRow!.id).length);

      // Put them on the schedule as her selections.
      await expect(ledger.getByLabel("These are her selections")).toBeChecked();
      const put = ledger.getByRole("button", { name: /^Put \d+ pieces? on the schedule$/ });
      const label = (await put.textContent()) ?? "";
      const count = Number(/Put (\d+)/.exec(label)?.[1] ?? 0);
      expect(count).toBe(kept.length);
      await put.click();
      await expect(ledger.getByRole("link", { name: "Order from the schedule" })).toBeVisible({
        timeout: 60_000,
      });
      await expect(ledger.getByRole("alert")).toHaveCount(0);

      await expect.poll(async () => (await boardFfeIds(BOARD)).length, { timeout: 30_000 }).toBe(count);
      const { data: lines, error } = await adminDb
        .from("project_ffe_items")
        .select("id, name, vendor_id, vendor_name, unit_price_cents, design_disposition")
        .in("id", await boardFfeIds(BOARD));
      if (error) throw error;
      expect(lines).toHaveLength(count);
      for (const line of lines ?? []) {
        expect(line.design_disposition, line.name).toBe("selected");
        expect(line.vendor_id, line.name).not.toBeNull();
      }
      // The pieces whose page was read carry its price onto the line.
      const priced = (lines ?? []).filter((line) => line.unit_price_cents != null);
      expect(priced.length).toBeGreaterThan(0);

      // The line's OrderAssistant is enabled; a PO draft is created, never sent.
      const line = priced[0];
      await openDocLine(page, line.name as string);
      const order = page.getByRole("button", { name: "Order with Assistant" }).first();
      await expect(order).toBeEnabled({ timeout: 20_000 });
      await order.click();
      const assistant = page.getByRole("dialog", { name: /Order Assistant for/ });
      await expect(assistant).toBeVisible();
      const done = assistant.getByRole("button", { name: "Done" });
      for (let step = 0; step < 6 && !(await done.isVisible()); step++) {
        const primary = assistant.getByRole("button", { name: /^(Continue|Proceed anyway|Confirm \d+ ordered)$/ });
        await primary.click();
        await expect(primary.or(done).first()).toBeVisible({ timeout: 20_000 });
      }
      await expect(done).toBeVisible({ timeout: 20_000 });

      const poIds = await purchaseOrderIds([line.id as string]);
      expect(poIds).toHaveLength(1);
      const { data: po, error: poError } = await adminDb
        .from("purchase_orders")
        .select("status, sent_at")
        .eq("id", poIds[0])
        .single();
      if (poError) throw poError;
      expect(po.status).toBe("draft");
      expect(po.sent_at).toBeNull();
      expect(poSendCalls).toEqual([]);
    } finally {
      await cleanupBoard(BOARD);
    }
  });
});
