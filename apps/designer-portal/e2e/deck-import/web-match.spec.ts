import { test, expect } from "../fixtures/auth";
import { psqlRun, psqlScalar } from "../helpers/psql";
import {
  FLAG_ON,
  FULL_CHAIN_DECK,
  cleanupBoard,
  clearFixtureLog,
  deckImport,
  deckPieces,
  fixtureLog,
  layOutDeck,
  openBoard,
  openLedger,
  seedEmptyBoard,
  waitForResolution,
  watchFunctionFailures,
  type Board,
} from "./deck-helpers";

/**
 * US-15 W6 — "Search the web for this piece". The Vision endpoint is the
 * fixture server (DECK_IMPORT_TEST_FETCH_BASE; GOOGLE_VISION_API_KEY is any
 * value), which answers one retailer page with a full match. The piece gains
 * a "Found on the web" row that is never preselected; with the studio's
 * month used up, the ledger says so in a plain line and Vision is not called.
 */

const BOARD: Board = {
  id: "e2e00000-0000-4000-8000-0000000016d1",
  name: "Deck web match board",
  owner: "project",
};
const VISION_PATH = "/vision/v1/images:annotate";
const WEB_FOUND_PATH = "/www.cb2.com/products/found-on-the-web-chair";

function monthStart(): string {
  return psqlScalar(`SELECT date_trunc('month', now() AT TIME ZONE 'UTC')::date::text`);
}

test.describe.configure({ mode: "serial" });

test.describe("Bring in a deck — search the web", () => {
  test.skip(!FLAG_ON, "board-deck-import is not in NEXT_PUBLIC_FLAG_OVERRIDES.");
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The deterministic fixtures own shared board rows.",
  );

  test("a not-found piece gains a 'Found on the web' row, never preselected; cap reached → the plain line", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(300_000);
    const functionFailures = watchFunctionFailures(page);
    await cleanupBoard(BOARD);
    seedEmptyBoard(BOARD);
    let studio: string | null = null;
    let savedUsage: string | null = null;
    try {
      await openBoard(page, BOARD);
      await layOutDeck(page, FULL_CHAIN_DECK);
      const resolved = await waitForResolution(BOARD, 180_000);
      const notFound = resolved.filter((piece) => piece.state === "not_found" && piece.boardItemId != null);
      expect(notFound.length, `functions: ${functionFailures.join(" | ")}`).toBeGreaterThan(1);

      const ledger = await openLedger(page);
      const [first, second] = notFound;
      const firstRow = ledger.locator(`[data-deck-row="${first.id}"]`);
      await expect(firstRow).toHaveAttribute("data-deck-row-state", "not_found");

      await clearFixtureLog();
      const webMatch = page.waitForResponse((response) => response.url().includes("/functions/v1/board-web-match"), {
        timeout: 60_000,
      });
      await firstRow.getByRole("button", { name: "Search the web for this piece" }).click();
      const webMatchBody = await (await webMatch).text();
      await expect(firstRow.locator("[data-deck-how]"), `board-web-match: ${webMatchBody}`)
        .toHaveText("Found on the web", { timeout: 60_000 });
      // Never preselected: the row waits for her, nothing is kept.
      await expect(firstRow).toHaveAttribute("data-deck-row-state", "to_confirm");
      const after = (await deckPieces(BOARD)).find((piece) => piece.id === first.id);
      expect(after?.state).toBe("found");
      expect(after?.foundBy).toBe("web");
      expect(after?.topSource).toBe("web");
      expect(
        psqlScalar(`SELECT coalesce(chosen_product_id::text, 'none') FROM public.board_deck_import_items WHERE id = '${first.id}'::uuid`),
      ).toBe("none");
      const hits = (await fixtureLog()).map((hit) => `${hit.method} ${hit.path}`);
      expect(hits).toContain(`POST ${VISION_PATH}`);
      expect(hits).toContain(`GET ${WEB_FOUND_PATH}`);

      // Cap reached: the studio's month is used up; Vision is not called.
      const deck = await deckImport(BOARD);
      studio = psqlScalar(`SELECT public.board_web_match_studio_key('${deck!.id}'::uuid)::text`);
      const month = monthStart();
      savedUsage = psqlScalar(
        `SELECT coalesce((SELECT calls::text FROM public.board_web_match_usage WHERE studio_id = '${studio}'::uuid AND month = '${month}'::date), 'none')`,
      );
      psqlRun(`
INSERT INTO public.board_web_match_usage (studio_id, month, calls)
SELECT '${studio}'::uuid, '${month}'::date, s.monthly_call_cap FROM public.board_web_match_settings s
ON CONFLICT (studio_id, month) DO UPDATE SET calls = EXCLUDED.calls`);

      await clearFixtureLog();
      const secondRow = ledger.locator(`[data-deck-row="${second.id}"]`);
      await secondRow.getByRole("button", { name: "Search the web for this piece" }).click();
      await expect(ledger.locator("[data-deck-web-foot]").getByText(/^This month's web searches are used up — resets /))
        .toBeVisible({ timeout: 30_000 });
      await expect(secondRow).toHaveAttribute("data-deck-row-state", "not_found");
      expect((await fixtureLog()).filter((hit) => hit.path === VISION_PATH)).toHaveLength(0);
    } finally {
      if (studio && savedUsage != null) {
        const month = monthStart();
        psqlRun(
          savedUsage === "none"
            ? `DELETE FROM public.board_web_match_usage WHERE studio_id = '${studio}'::uuid AND month = '${month}'::date`
            : `UPDATE public.board_web_match_usage SET calls = ${Number(savedUsage)} WHERE studio_id = '${studio}'::uuid AND month = '${month}'::date`,
        );
      }
      await cleanupBoard(BOARD);
    }
  });
});
