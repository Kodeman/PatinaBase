import fs from "fs";
import path from "path";
import { expect, type AuthenticatedPage } from "../fixtures/auth";
import { psqlRun, psqlScalar } from "../helpers/psql";
import { adminDb } from "../helpers/supabase-admin";

/**
 * Shared seeding and reading for the SQ-364 deck-import e2e suite. Every
 * spec owns its own board id (e2e00000-…-0000000016xx) so the specs never
 * share rows with lay-it-out / review-to-schedule (15xx).
 */

export const FLAG_ON = (process.env.NEXT_PUBLIC_FLAG_OVERRIDES ?? "").includes(
  "board-deck-import:true",
);
export const FLAG_OFF = (process.env.NEXT_PUBLIC_FLAG_OVERRIDES ?? "").includes(
  "board-deck-import:false",
);

/**
 * project-review-media only accepts RFC 4122 ids (version 1–5, variant 8–b),
 * and the seeded projects (b0000000-0000-0000-…) are not, so a deck laid out
 * on a seeded project board fails at the picture prepare with `invalid_body`.
 * The suite works on its own copy of the Aspen Loft project with a v4-shaped
 * id; `ensureDeckProject` creates it once and leaves it for the next run.
 */
const SEED_PROJECT_ID = "b0000000-0000-0000-0000-0000000000d1";
export const PROJECT_ID = "e2e00000-0000-4000-8000-0000000016e0";
export const PROPOSAL_ID = "d0c10000-0000-0000-0000-0000000000b2";

export function ensureDeckProject(): void {
  psqlRun(`
DO $$
DECLARE cols text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = '${PROJECT_ID}'::uuid) THEN RETURN; END IF;
  SELECT string_agg(quote_ident(attname), ',') INTO cols FROM pg_attribute
   WHERE attrelid = 'public.projects'::regclass AND attnum > 0 AND NOT attisdropped
     AND attgenerated = '' AND attname NOT IN ('id', 'name');
  EXECUTE format(
    'INSERT INTO public.projects (id, name, %s) SELECT %L::uuid, %L, %s FROM public.projects WHERE id = %L',
    cols, '${PROJECT_ID}', 'Deck Import Residence', cols, '${SEED_PROJECT_ID}');
END $$;
`);
}

const FIXTURES = path.resolve(__dirname, "../../src/lib/deck-import/__fixtures__");
/** SQ-356 tickets.pptx plus a notes-only "Reading Chair" slide (fixtures/generate.py). */
export const FULL_CHAIN_DECK = path.resolve(__dirname, "fixtures/full-chain.pptx");
export const STRUCTURE_DECK = path.join(FIXTURES, "structure.pptx");
export const LEGACY_PPT = path.join(FIXTURES, "legacy.ppt");
export const NOTES_ONLY_URL = "https://www.burkedecor.com/products/reading-chair";

export const FIXTURE_BASE = `http://127.0.0.1:${process.env.DECK_FIXTURE_PORT ?? "4599"}`;

export interface Board {
  id: string;
  name: string;
  owner: "project" | "proposal";
}

export function seedEmptyBoard(board: Board): void {
  if (board.owner === "project") ensureDeckProject();
  const ownerColumns =
    board.owner === "project" ? `NULL, '${PROJECT_ID}'::uuid` : `'${PROPOSAL_ID}'::uuid, NULL`;
  psqlRun(`
BEGIN;
DELETE FROM public.proposal_boards WHERE id = '${board.id}'::uuid;
INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES (
  '${board.id}'::uuid, ${ownerColumns}, '${board.name}',
  1200, 800, '#F7F1E8', '[]'::jsonb, 'active', 990
);
COMMIT;
`);
}

/** Board, its pins' FF&E lines (project) or schedule lines (proposal), its POs. */
export async function cleanupBoard(board: Board): Promise<void> {
  const ffeIds = await boardFfeIds(board).catch(() => [] as string[]);
  const poIds = await purchaseOrderIds(ffeIds).catch(() => [] as string[]);
  const scheduleIds = board.owner === "proposal" ? await boardScheduleLineIds(board).catch(() => []) : [];
  psqlRun(`DELETE FROM public.proposal_boards WHERE id = '${board.id}'::uuid`);
  if (ffeIds.length > 0) await adminDb.from("project_ffe_items").delete().in("id", ffeIds);
  if (poIds.length > 0) await adminDb.from("purchase_orders").delete().in("id", poIds);
  if (scheduleIds.length > 0) await adminDb.from("proposal_items").delete().in("id", scheduleIds);
}

export async function purchaseOrderIds(ffeIds: readonly string[]): Promise<string[]> {
  if (ffeIds.length === 0) return [];
  const { data, error } = await adminDb
    .from("project_ffe_items")
    .select("purchase_order_id")
    .in("id", ffeIds as string[])
    .not("purchase_order_id", "is", null);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => row.purchase_order_id as string))];
}

export async function boardFfeIds(board: Board): Promise<string[]> {
  const { data, error } = await adminDb
    .from("proposal_board_items")
    .select("project_ffe_item_id")
    .eq("board_id", board.id)
    .not("project_ffe_item_id", "is", null);
  if (error) throw error;
  return (data ?? []).map((row) => row.project_ffe_item_id as string);
}

/** Schedule lines a proposal board's deck pins were sent to (source_url match). */
export async function boardScheduleLineIds(board: Board): Promise<string[]> {
  return (await scheduleLinesFromDeck(board)).map((line) => line.id);
}

export interface ScheduleLine {
  id: string;
  name: string;
  vendor_id: string | null;
  vendor_name: string | null;
  source_url: string | null;
}

export async function scheduleLinesFromDeck(board: Board): Promise<ScheduleLine[]> {
  const urls = (await deckPieces(board))
    .map((piece) => piece.chosenSourceUrl)
    .filter((url): url is string => Boolean(url));
  if (urls.length === 0) return [];
  const { data, error } = await adminDb
    .from("proposal_items")
    .select("id, name, vendor_id, vendor_name, custom_fields")
    .eq("proposal_id", PROPOSAL_ID);
  if (error) throw error;
  return (data ?? [])
    .map((row) => ({
      id: row.id as string,
      name: row.name as string,
      vendor_id: (row.vendor_id as string | null) ?? null,
      vendor_name: (row.vendor_name as string | null) ?? null,
      source_url: ((row.custom_fields as Record<string, unknown> | null)?.source_url as string | undefined) ?? null,
    }))
    .filter((line) => line.source_url != null && urls.includes(line.source_url));
}

export interface DeckPiece {
  id: string;
  state: string;
  foundBy: string | null;
  boardItemId: string | null;
  slideTitle: string | null;
  elementKey: string;
  linkUrl: string | null;
  topSource: string | null;
  topBand: string | null;
  pageRead: boolean;
  priceCents: number | null;
  chosenSourceUrl: string | null;
}

export async function deckImport(board: Board): Promise<{ id: string; status: string } | null> {
  const { data, error } = await adminDb
    .from("board_deck_imports")
    .select("id, status")
    .eq("board_id", board.id)
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; status: string } | null) ?? null;
}

export async function deckPieces(board: Board): Promise<DeckPiece[]> {
  const deck = await deckImport(board);
  if (!deck) return [];
  const { data, error } = await adminDb
    .from("board_deck_import_items")
    .select("id, state, found_by, board_item_id, slide_title, element_key, extracted, candidates")
    .eq("import_id", deck.id)
    .eq("role", "product")
    .is("merged_into_item_id", null);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const candidates = Array.isArray(row.candidates) ? (row.candidates as Array<Record<string, any>>) : [];
    const top = candidates[0] ?? null;
    const links = Array.isArray(row.extracted?.links) ? row.extracted.links : [];
    return {
      id: row.id as string,
      state: row.state as string,
      foundBy: (row.found_by as string | null) ?? null,
      boardItemId: (row.board_item_id as string | null) ?? null,
      slideTitle: (row.slide_title as string | null) ?? null,
      elementKey: row.element_key as string,
      linkUrl: (links[0]?.url as string | undefined) ?? null,
      topSource: (top?.source as string | undefined) ?? null,
      topBand: (top?.band as string | undefined) ?? null,
      pageRead: top?.evidence?.page_read === true,
      priceCents: typeof top?.extracted?.price_cents === "number" ? top.extracted.price_cents : null,
      chosenSourceUrl: (top?.extracted?.source_url as string | undefined) ?? null,
    };
  });
}

/** Every piece has left `pending` (the resolver finished its pass). */
export async function waitForResolution(board: Board, timeout = 120_000): Promise<DeckPiece[]> {
  await expect
    .poll(
      async () => {
        const pieces = await deckPieces(board);
        return pieces.length > 0 && pieces.every((piece) => piece.state !== "pending");
      },
      { timeout, intervals: [2_000, 3_000, 5_000] },
    )
    .toBe(true);
  return deckPieces(board);
}

export function deckPinCount(board: Board): number {
  return Number(
    psqlScalar(
      `SELECT count(*) FROM public.proposal_board_items WHERE board_id = '${board.id}'::uuid AND data->>'provenance' = 'imported_deck' AND type IN ('capture', 'image')`,
    ),
  );
}

/** Pins whose section is not named after the slide they came from. */
export function mismatchedSlideSections(board: Board): number {
  return Number(
    psqlScalar(`
SELECT count(*)
FROM public.proposal_board_items i
JOIN public.proposal_boards b ON b.id = i.board_id
LEFT JOIN LATERAL jsonb_array_elements(b.sections) s ON s->>'id' = i.data->>'section_id'
WHERE i.board_id = '${board.id}'::uuid
  AND i.data->>'provenance' = 'imported_deck'
  AND i.type IN ('capture', 'image')
  AND s->>'name' IS DISTINCT FROM i.data->'deck_import'->>'slide_title'`),
  );
}

export function sectionCount(board: Board): number {
  return Number(
    psqlScalar(`SELECT jsonb_array_length(sections) FROM public.proposal_boards WHERE id = '${board.id}'::uuid`),
  );
}

export async function openBoard(page: AuthenticatedPage, board: Board): Promise<void> {
  await page.goto(`/board/${board.id}?from=%2Fdesk&source=recent_boards`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("main", { name: `${board.name} mood board room` })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("board-room-canvas")).toBeVisible();
}

/** Choose the deck, wait for the sheet, lay it out. */
export async function layOutDeck(page: AuthenticatedPage, deckPath: string): Promise<void> {
  await page.locator("[data-deck-import-input]").setInputFiles(deckPath);
  const sheet = page.locator("[data-deck-import-sheet]");
  await expect(sheet).toBeVisible();
  const layOut = sheet.getByRole("button", { name: "Lay it out" });
  await expect(layOut).toBeEnabled({ timeout: 30_000 });
  await layOut.click();
  await expect(sheet).toBeHidden();
}

export async function openLedger(page: AuthenticatedPage) {
  await page.locator("[data-deck-room-head]").getByRole("button", { name: "Review" }).click();
  const ledger = page.locator("[data-deck-import-ledger]");
  await expect(ledger).toBeVisible();
  return ledger;
}

/**
 * Open a schedule line on the project's Document. The Pieces section starts
 * folded ("N lines · not yet on the paper"), so press Pieces on the index.
 */
export async function openDocLine(page: AuthenticatedPage, lineName: string): Promise<void> {
  await page.goto(`/doc/${PROJECT_ID}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /^Pieces \d+ lines?$/i }).first().click();
  await page.getByText(lineName, { exact: true }).first().click();
}

/** Drop a file onto the board canvas the way the OS does. */
export async function dropFileOnCanvas(
  page: AuthenticatedPage,
  board: Board,
  filePath: string,
  type: string,
): Promise<void> {
  const bytes = fs.readFileSync(filePath).toString("base64");
  const name = path.basename(filePath);
  const dataTransfer = await page.evaluateHandle(
    ({ bytes: b64, name: fileName, type: mime }) => {
      const raw = atob(b64);
      const buffer = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) buffer[i] = raw.charCodeAt(i);
      const transfer = new DataTransfer();
      transfer.items.add(new File([buffer], fileName, { type: mime }));
      return transfer;
    },
    { bytes, name, type },
  );
  try {
    const target = page.getByRole("application", { name: `${board.name} mood board` });
    await target.dispatchEvent("dragenter", { dataTransfer });
    await target.dispatchEvent("dragover", { dataTransfer });
    await target.dispatchEvent("drop", { dataTransfer });
  } finally {
    await dataTransfer.dispose();
  }
}

/** Non-2xx edge-function answers seen by the page, with their bodies (diagnostics). */
export function watchFunctionFailures(page: AuthenticatedPage): string[] {
  const failures: string[] = [];
  page.on("response", (response) => {
    const url = response.url();
    const watched = url.includes("/functions/v1/") || url.includes("/rest/v1/rpc/");
    if (!watched || response.ok() || response.request().method() === "OPTIONS") return;
    void response
      .text()
      .catch(() => "")
      .then((body) => failures.push(`${response.status()} ${new URL(url).pathname} ${body.slice(0, 300)}`));
  });
  return failures;
}

export interface FixtureHit {
  method: string;
  path: string;
}

export async function clearFixtureLog(): Promise<void> {
  await fetch(`${FIXTURE_BASE}/__log`, { method: "DELETE" });
}

export async function fixtureLog(): Promise<FixtureHit[]> {
  const response = await fetch(`${FIXTURE_BASE}/__log`);
  return (await response.json()) as FixtureHit[];
}

/** The fixture server's path for a product URL (test_fetch_base.ts rewrite). */
export function fixturePath(url: string): string {
  const parsed = new URL(url);
  return `/${parsed.host}${parsed.pathname}`;
}
