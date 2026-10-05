import { test, expect } from "../fixtures/auth";
import { psqlScalar } from "../helpers/psql";
import { adminDb } from "../helpers/supabase-admin";
import {
  FLAG_OFF,
  FLAG_ON,
  LEGACY_PPT,
  STRUCTURE_DECK,
  cleanupBoard,
  deckPinCount,
  dropFileOnCanvas,
  layOutDeck,
  openBoard,
  sectionCount,
  seedEmptyBoard,
  type Board,
} from "./deck-helpers";

/**
 * US-15 W6 guards: a to-confirm pin cannot be promoted, an old .ppt is turned
 * away with the re-save line, re-dropping the same deck resumes it, and with
 * the flag off a dropped deck gets only the plain note and nothing uploads.
 *
 * The flag-off test runs only against a server started with
 * board-deck-import:false (DECK_IMPORT_FLAGS=off, see the config header);
 * NEXT_PUBLIC_* is inlined at start, so one server cannot serve both legs.
 */

const BOARD: Board = {
  id: "e2e00000-0000-4000-8000-0000000016c1",
  name: "Deck guards board",
  owner: "project",
};
const OFF_BOARD: Board = {
  id: "e2e00000-0000-4000-8000-0000000016c2",
  name: "Deck flag off board",
  owner: "project",
};

const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

async function importCount(board: Board): Promise<number> {
  const { count, error } = await adminDb
    .from("board_deck_imports")
    .select("id", { count: "exact", head: true })
    .eq("board_id", board.id);
  if (error) throw error;
  return count ?? 0;
}

function boardItemCount(board: Board): number {
  return Number(psqlScalar(`SELECT count(*) FROM public.proposal_board_items WHERE board_id = '${board.id}'::uuid`));
}

test.describe.configure({ mode: "serial" });

test.describe("Bring in a deck — guards", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The deterministic fixtures own shared board rows.",
  );

  test.describe("flag on", () => {
    test.skip(!FLAG_ON, "board-deck-import is not in NEXT_PUBLIC_FLAG_OVERRIDES.");

    test.beforeAll(async () => {
      await cleanupBoard(BOARD);
      seedEmptyBoard(BOARD);
    });
    test.afterAll(async () => {
      await cleanupBoard(BOARD);
    });

    test("a .ppt is turned away with the re-save line, nothing registers", async ({
      authenticatedPage: page,
    }) => {
      await openBoard(page, BOARD);
      await page.locator("[data-deck-import-input]").setInputFiles(LEGACY_PPT);
      await expect(page.getByText("Re-save it as .pptx and bring it in again.")).toBeVisible();
      await expect(page.locator("[data-deck-import-sheet]")).toBeHidden();
      expect(await importCount(BOARD)).toBe(0);
      expect(boardItemCount(BOARD)).toBe(0);
    });

    test("a to-confirm pin cannot be promoted: Confirm the piece first", async ({
      authenticatedPage: page,
    }) => {
      test.setTimeout(120_000);
      await openBoard(page, BOARD);
      await layOutDeck(page, STRUCTURE_DECK);
      await expect.poll(() => deckPinCount(BOARD), { timeout: 60_000 }).toBeGreaterThan(0);
      await expect(page.getByText(/Laying out · slide/)).toBeHidden({ timeout: 60_000 });

      const pinId = psqlScalar(
        `SELECT id FROM public.proposal_board_items WHERE board_id = '${BOARD.id}'::uuid AND type = 'capture' AND data->'deck_import'->>'state' = 'to_confirm' ORDER BY id LIMIT 1`,
      );
      expect(pinId, "a product pin from the deck").toMatch(/^[0-9a-f-]{36}$/);
      await page.locator(`[data-board-item-id="${pinId}"]`).click();

      await expect(page.locator("[data-deck-pin-hold]")).toHaveText("Confirm the piece first");
      const promote = page.getByRole("button", { name: "Promote to project selection" });
      await expect(promote).toBeDisabled();
      await expect(promote).toHaveAttribute("title", "Confirm the piece first");
      expect(
        psqlScalar(`SELECT count(*) FROM public.proposal_board_items WHERE id = '${pinId}'::uuid AND project_ffe_item_id IS NOT NULL`),
      ).toBe("0");
    });

    test("re-dropping the same deck resumes it: one import, no new sections or pins", async ({
      authenticatedPage: page,
    }) => {
      await openBoard(page, BOARD);
      const sections = sectionCount(BOARD);
      const pins = deckPinCount(BOARD);
      expect(await importCount(BOARD)).toBe(1);

      await page.locator("[data-deck-import-input]").setInputFiles(STRUCTURE_DECK);
      const sheet = page.locator("[data-deck-import-sheet]");
      await expect(sheet.getByRole("status")).toHaveText("Already brought in — resume?", {
        timeout: 30_000,
      });
      await sheet.getByRole("button", { name: "Lay it out" }).click();
      await expect(sheet).toBeHidden();

      // Nothing to lay out twice; the import is the same one.
      await expect.poll(() => importCount(BOARD), { timeout: 15_000 }).toBe(1);
      expect(sectionCount(BOARD)).toBe(sections);
      expect(deckPinCount(BOARD)).toBe(pins);
    });
  });

  test.describe("flag off", () => {
    test.skip(!FLAG_OFF, "Runs only against a server with board-deck-import:false (DECK_IMPORT_FLAGS=off).");

    test("flag off: a dropped deck shows the plain note, with no upload", async ({
      authenticatedPage: page,
    }) => {
      await cleanupBoard(OFF_BOARD);
      seedEmptyBoard(OFF_BOARD);
      try {
        await openBoard(page, OFF_BOARD);
        // Every entry point is hidden.
        await expect(page.locator("[data-deck-import-input]")).toHaveCount(0);
        await expect(page.locator("[data-deck-room-head]")).toHaveCount(0);

        await dropFileOnCanvas(page, OFF_BOARD, STRUCTURE_DECK, PPTX);
        await expect(page.getByText("Decks aren't supported here yet")).toBeVisible();
        await expect(page.locator("[data-deck-import-sheet]")).toHaveCount(0);

        // Nothing uploaded, registered or placed.
        expect(await importCount(OFF_BOARD)).toBe(0);
        expect(boardItemCount(OFF_BOARD)).toBe(0);
      } finally {
        await cleanupBoard(OFF_BOARD);
      }
    });
  });
});
