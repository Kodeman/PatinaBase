import path from "path";
import { test, expect, type AuthenticatedPage } from "../fixtures/auth";
import { psqlRun, psqlScalar } from "../helpers/psql";
import { PROJECT_ID, ensureDeckProject } from "./deck-helpers";

/**
 * US-15 W2 — "Lay it out": a fixture deck (SQ-356) brought into an empty
 * board through the room's deck chooser lands as a section per slide, one
 * undo batch, and persists across a reload. Both owner legs: a proposal
 * board (plain table writes) and a project board (apply_board_room_state).
 *
 * The flag is fail-closed and playwright.config.ts does not set it, so this
 * suite runs only against a server started with
 * NEXT_PUBLIC_FLAG_OVERRIDES containing `board-deck-import:true` (reuse an
 * existing dev server, or extend the config's webServer env).
 */

const FLAG_ON = (process.env.NEXT_PUBLIC_FLAG_OVERRIDES ?? "").includes(
  "board-deck-import:true",
);
const DECK_PATH = path.resolve(
  __dirname,
  "../../src/lib/deck-import/__fixtures__/structure.pptx",
);
const PROPOSAL_ID = "d0c10000-0000-0000-0000-0000000000b2";

interface Leg {
  label: string;
  boardId: string;
  boardName: string;
  ownerColumns: string;
}

const LEGS: Leg[] = [
  {
    label: "proposal board",
    boardId: "e2e00000-0000-4000-8000-0000000015a1",
    boardName: "Deck import proposal board",
    ownerColumns: `'${PROPOSAL_ID}'::uuid, NULL`,
  },
  {
    label: "project board",
    boardId: "e2e00000-0000-4000-8000-0000000015b1",
    boardName: "Deck import project board",
    ownerColumns: `NULL, '${PROJECT_ID}'::uuid`,
  },
];

function seedEmptyBoard(leg: Leg): void {
  ensureDeckProject();
  psqlRun(`
BEGIN;
DELETE FROM public.proposal_boards WHERE id = '${leg.boardId}'::uuid;
INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES (
  '${leg.boardId}'::uuid, ${leg.ownerColumns}, '${leg.boardName}',
  1200, 800, '#F7F1E8', '[]'::jsonb, 'active', 998
);
COMMIT;
`);
}

function deleteBoard(leg: Leg): void {
  psqlRun(`DELETE FROM public.proposal_boards WHERE id = '${leg.boardId}'::uuid`);
}

function deckPinCount(leg: Leg): number {
  return Number(
    psqlScalar(
      `SELECT count(*) FROM public.proposal_board_items WHERE board_id = '${leg.boardId}'::uuid AND data->>'provenance' = 'imported_deck' AND type IN ('capture', 'image')`,
    ),
  );
}

function sectionNames(leg: Leg): string[] {
  const raw = psqlScalar(
    `SELECT coalesce(json_agg(s->>'name' ORDER BY s->>'name'), '[]'::json) FROM public.proposal_boards b, jsonb_array_elements(b.sections) s WHERE b.id = '${leg.boardId}'::uuid`,
  );
  return JSON.parse(raw || "[]") as string[];
}

/** Every pin's section is named after the slide it came from. */
function mismatchedSlideSections(leg: Leg): number {
  return Number(
    psqlScalar(`
SELECT count(*)
FROM public.proposal_board_items i
JOIN public.proposal_boards b ON b.id = i.board_id
JOIN LATERAL jsonb_array_elements(b.sections) s ON s->>'id' = i.data->>'section_id'
WHERE i.board_id = '${leg.boardId}'::uuid
  AND i.data->>'provenance' = 'imported_deck'
  AND i.type IN ('capture', 'image')
  AND s->>'name' IS DISTINCT FROM i.data->'deck_import'->>'slide_title'`),
  );
}

async function openBoard(page: AuthenticatedPage, leg: Leg): Promise<void> {
  await page.goto(`/board/${leg.boardId}?from=%2Fdesk&source=recent_boards`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("main", { name: `${leg.boardName} mood board room` }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("board-room-canvas")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.describe("Bring in a deck — Lay it out", () => {
  test.skip(!FLAG_ON, "board-deck-import is not in NEXT_PUBLIC_FLAG_OVERRIDES.");
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "The deterministic fixtures own shared board rows.",
  );

  for (const leg of LEGS) {
    test(`${leg.label}: sections per slide, one undo batch, persists after reload`, async ({
      authenticatedPage: page,
    }) => {
      seedEmptyBoard(leg);
      try {
        await openBoard(page, leg);

        await page.locator("[data-deck-import-input]").setInputFiles(DECK_PATH);
        const sheet = page.locator("[data-deck-import-sheet]");
        await expect(sheet).toBeVisible();
        await expect(sheet.getByText(/slides · onto this board/)).toBeVisible({
          timeout: 15_000,
        });
        const layOut = sheet.getByRole("button", { name: "Lay it out" });
        await expect(layOut).toBeEnabled();
        await layOut.click();
        // The sheet steps aside at once; the room head carries the progress.
        await expect(sheet).toBeHidden();

        await expect.poll(() => deckPinCount(leg), { timeout: 30_000 }).toBeGreaterThan(0);
        const placed = deckPinCount(leg);
        const names = sectionNames(leg);
        expect(names.length).toBeGreaterThan(0);
        expect(mismatchedSlideSections(leg)).toBe(0);
        for (const name of names) {
          await expect(page.getByRole("textbox", { name: `Rename ${name} section` })).toHaveValue(name);
        }
        await expect(page.getByText(/Laying out · slide/)).toBeHidden({ timeout: 30_000 });

        // One undo removes the whole lay-out; redo brings it back.
        const application = page.getByRole("application", {
          name: `${leg.boardName} mood board`,
        });
        await application.focus();
        await application.press("Meta+z");
        await expect.poll(() => deckPinCount(leg), { timeout: 15_000 }).toBe(0);
        await expect.poll(() => sectionNames(leg).length, { timeout: 15_000 }).toBe(0);
        await application.press("Meta+Shift+z");
        await expect.poll(() => deckPinCount(leg), { timeout: 15_000 }).toBe(placed);

        await page.reload({ waitUntil: "domcontentloaded" });
        await openBoard(page, leg);
        expect(sectionNames(leg)).toEqual(names);
        for (const name of names) {
          await expect(page.getByRole("textbox", { name: `Rename ${name} section` })).toHaveValue(name);
        }
        await expect(page.locator("[data-board-item-id]")).not.toHaveCount(0);
      } finally {
        deleteBoard(leg);
      }
    });
  }
});
