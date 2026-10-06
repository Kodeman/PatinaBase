import path from "path";
import { test, expect, type AuthenticatedPage } from "../fixtures/auth";
import { psqlRun } from "../helpers/psql";
import { adminDb } from "../helpers/supabase-admin";
import { PROJECT_ID, ensureDeckProject, openDocLine } from "./deck-helpers";

/**
 * US-15 W3 — review → schedule on a project board: lay a fixture deck out,
 * stand in for the resolver by recording a strong "found by its link"
 * candidate for every product piece (record_board_deck_import_resolution
 * under the service-role client), then in the ledger keep every link row and
 * put the kept pieces on the schedule as her selections. The FF&E lines must
 * carry a vendor and the `selected` disposition, and the line's Order act
 * (the order paper) must be enabled. Nothing is sent to a vendor.
 *
 * Fail-closed flag: runs only against a server started with
 * NEXT_PUBLIC_FLAG_OVERRIDES containing `board-deck-import:true`.
 */

const FLAG_ON = (process.env.NEXT_PUBLIC_FLAG_OVERRIDES ?? "").includes(
  "board-deck-import:true",
);
const DECK_PATH = path.resolve(
  __dirname,
  "../../src/lib/deck-import/__fixtures__/structure.pptx",
);
const BOARD_ID = "e2e00000-0000-4000-8000-0000000015c1";
const BOARD_NAME = "Deck review project board";

function seedEmptyBoard(): void {
  ensureDeckProject();
  psqlRun(`
BEGIN;
DELETE FROM public.proposal_boards WHERE id = '${BOARD_ID}'::uuid;
INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES (
  '${BOARD_ID}'::uuid, NULL, '${PROJECT_ID}'::uuid, '${BOARD_NAME}',
  1200, 800, '#F7F1E8', '[]'::jsonb, 'active', 997
);
COMMIT;
`);
}

async function pinFfeIds(): Promise<string[]> {
  const { data, error } = await adminDb
    .from("proposal_board_items")
    .select("project_ffe_item_id")
    .eq("board_id", BOARD_ID)
    .not("project_ffe_item_id", "is", null);
  if (error) throw error;
  return (data ?? []).map((row) => row.project_ffe_item_id as string);
}

async function cleanup(): Promise<void> {
  const ffeIds = await pinFfeIds().catch(() => [] as string[]);
  psqlRun(`DELETE FROM public.proposal_boards WHERE id = '${BOARD_ID}'::uuid`);
  if (ffeIds.length > 0) {
    await adminDb.from("project_ffe_items").delete().in("id", ffeIds);
  }
}

async function importPieces(): Promise<Array<{ id: string; state: string }>> {
  const { data: deck, error } = await adminDb
    .from("board_deck_imports")
    .select("id")
    .eq("board_id", BOARD_ID)
    .maybeSingle();
  if (error) throw error;
  if (!deck) return [];
  const { data: items, error: itemsError } = await adminDb
    .from("board_deck_import_items")
    .select("id, state")
    .eq("import_id", deck.id)
    .eq("role", "product")
    .not("board_item_id", "is", null);
  if (itemsError) throw itemsError;
  return (items ?? []) as Array<{ id: string; state: string }>;
}

async function openBoard(page: AuthenticatedPage): Promise<void> {
  await page.goto(`/board/${BOARD_ID}?from=%2Fdesk&source=recent_boards`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("main", { name: `${BOARD_NAME} mood board room` }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("board-room-canvas")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("Bring in a deck — review to schedule", () => {
  test.skip(!FLAG_ON, "board-deck-import is not in NEXT_PUBLIC_FLAG_OVERRIDES.");
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The deterministic fixtures own shared board rows.",
  );

  test("project board: keep link rows → put on schedule as selections → orderable lines", async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(180_000);
    seedEmptyBoard();
    try {
      await openBoard(page);
      await page.locator("[data-deck-import-input]").setInputFiles(DECK_PATH);
      const sheet = page.locator("[data-deck-import-sheet]");
      const layOut = sheet.getByRole("button", { name: "Lay it out" });
      await expect(layOut).toBeEnabled({ timeout: 15_000 });
      await layOut.click();

      // Pins attached → the pieces exist server side.
      await expect.poll(async () => (await importPieces()).length, { timeout: 30_000 })
        .toBeGreaterThan(0);
      const pieces = await importPieces();

      // Stand in for the resolver: a strong link candidate per piece. A
      // record needs the piece's lease (00678), so take it first — the real
      // resolver may be serving locally too, and the stand-in records last.
      for (const [index, piece] of pieces.entries()) {
        psqlRun(`UPDATE public.board_deck_import_items
  SET lease_owner = 'e2e-review-stand-in', lease_until = now() + interval '5 minutes'
  WHERE id = '${piece.id}'::uuid`);
        const { error } = await adminDb.rpc("record_board_deck_import_resolution", {
          p_lease_owner: "e2e-review-stand-in",
          p_item_id: piece.id,
          p_state: "found",
          p_found_by: "link",
          p_candidates: [
            {
              source: "link",
              band: "strong",
              rank: 1,
              evidence: { page_read: true, link_on_picture: true },
              extracted: {
                name: `Deck review piece ${index + 1}`,
                brand: "Four Hands",
                price_cents: 120000 + index,
                images: ["https://cdn.example.com/deck-review.jpg"],
                source_url: `https://www.fourhands.com/products/deck-review-${index + 1}`,
              },
            },
          ],
        });
        if (error) throw error;
      }

      await expect(page.getByText(/pieces? from the deck · \d+ to confirm/)).toBeVisible({
        timeout: 20_000,
      });
      await page.locator("[data-deck-room-head]").getByRole("button", { name: "Review" }).click();
      const ledger = page.locator("[data-deck-import-ledger]");
      await expect(ledger).toBeVisible();
      await expect(ledger.locator('[data-deck-row-state="to_confirm"]')).toHaveCount(pieces.length);

      await ledger.locator("[data-deck-bulk-keep]").click();
      await expect.poll(
        async () => (await importPieces()).filter((piece) => piece.state === "kept").length,
        { timeout: 30_000 },
      ).toBe(pieces.length);
      await expect(ledger.locator('[data-deck-row-state="kept"]')).toHaveCount(pieces.length);

      const put = ledger.getByRole("button", { name: /^Put \d+ pieces? on the schedule$/ });
      await expect(ledger.getByLabel("These are her selections")).toBeChecked();
      await put.click();
      await expect(ledger.getByRole("link", { name: "Order from the schedule" })).toBeVisible({
        timeout: 30_000,
      });

      await expect.poll(async () => (await pinFfeIds()).length, { timeout: 30_000 })
        .toBe(pieces.length);
      const { data: lines, error } = await adminDb
        .from("project_ffe_items")
        .select("id, name, vendor_id, design_disposition")
        .in("id", await pinFfeIds());
      if (error) throw error;
      expect(lines).toHaveLength(pieces.length);
      for (const line of lines ?? []) {
        expect(line.design_disposition).toBe("selected");
        expect(line.vendor_id).not.toBeNull();
      }

      // The line's Order act, which opens the order paper, is reachable and enabled.
      await openDocLine(page, (lines ?? [])[0]?.name as string);
      await expect(
        page.getByRole("button", { name: "Order", exact: true }).first(),
      ).toBeEnabled({ timeout: 15_000 });
    } finally {
      await cleanup();
    }
  });
});
