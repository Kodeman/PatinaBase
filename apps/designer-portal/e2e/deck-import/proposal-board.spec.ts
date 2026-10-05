import { test, expect } from "../fixtures/auth";
import {
  FLAG_ON,
  FULL_CHAIN_DECK,
  cleanupBoard,
  deckPieces,
  layOutDeck,
  openBoard,
  openLedger,
  scheduleLinesFromDeck,
  seedEmptyBoard,
  waitForResolution,
  watchFunctionFailures,
  type Board,
} from "./deck-helpers";

/**
 * US-15 W6 — the same deck on a proposal board: the resolver reads the links
 * from the fixture server, she keeps the link rows and sends them to the
 * schedule. Each proposal_items line carries the vendor and the product's
 * source_url, and a second press adds no duplicates.
 */

const BOARD: Board = {
  id: "e2e00000-0000-4000-8000-0000000016b1",
  name: "Deck proposal board",
  owner: "proposal",
};

test.describe.configure({ mode: "serial" });

test.describe("Bring in a deck — proposal board to schedule", () => {
  test.skip(!FLAG_ON, "board-deck-import is not in NEXT_PUBLIC_FLAG_OVERRIDES.");
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The deterministic fixtures own shared board rows.",
  );

  test("keep link rows → send to schedule → vendor + source_url, no duplicates on a second press", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(300_000);
    const functionFailures = watchFunctionFailures(page);
    await cleanupBoard(BOARD);
    seedEmptyBoard(BOARD);
    try {
      await openBoard(page, BOARD);
      await layOutDeck(page, FULL_CHAIN_DECK);
      const resolved = await waitForResolution(BOARD, 180_000);
      const linkRows = resolved.filter((piece) => piece.foundBy === "link" && piece.boardItemId != null);
      expect(linkRows.length, `functions: ${functionFailures.join(" | ")}`).toBeGreaterThan(0);

      const ledger = await openLedger(page);
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
      const kept = (await deckPieces(BOARD)).filter((piece) => piece.state === "kept");
      expect(kept.length).toBe(linkRows.length);

      // No selections/options choice on a proposal board: straight to the schedule.
      await expect(ledger.getByLabel("These are her selections")).toHaveCount(0);
      const put = ledger.getByRole("button", { name: /^Put \d+ pieces? on the schedule$/ });
      await expect(put).toHaveText(`Put ${kept.length} ${kept.length === 1 ? "piece" : "pieces"} on the schedule`);
      await put.click();
      await expect(ledger.getByRole("link", { name: "Order from the schedule" })).toBeVisible({ timeout: 60_000 });
      await expect(ledger.getByRole("alert")).toHaveCount(0);

      await expect.poll(async () => (await scheduleLinesFromDeck(BOARD)).length, { timeout: 30_000 })
        .toBe(kept.length);
      const lines = await scheduleLinesFromDeck(BOARD);
      const expectedUrls = kept.map((piece) => piece.chosenSourceUrl).sort();
      expect(lines.map((line) => line.source_url).sort()).toEqual(expectedUrls);
      for (const line of lines) {
        expect(line.vendor_id ?? line.vendor_name, line.name).toBeTruthy();
      }

      // A second press: nothing new lands. The batch button only offers pins
      // not yet on the schedule, so press it if it is still offered, then
      // send one pin again from the inspector — the room finds its twin.
      if (await put.isVisible()) await put.click();
      await page.keyboard.press("Escape");
      const pinId = kept[0].boardItemId as string;
      await page.locator(`[data-board-item-id="${pinId}"]`).click();
      const send = page.getByRole("button", { name: "Send to the schedule" });
      if (await send.isVisible()) {
        await send.click();
        await expect(page.getByText(/Already on the schedule/).first()).toBeVisible({ timeout: 20_000 });
      }
      await expect.poll(async () => (await scheduleLinesFromDeck(BOARD)).length, { timeout: 10_000 })
        .toBe(kept.length);
      const after = await scheduleLinesFromDeck(BOARD);
      expect(new Set(after.map((line) => line.source_url)).size).toBe(after.length);
    } finally {
      await cleanupBoard(BOARD);
    }
  });
});
