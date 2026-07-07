/**
 * End-to-end spec: proposal mood boards (scope builder ?tab=boards)
 *
 *   seed draft proposal (service role) → open the Boards tab → create the
 *   first board → add a note item (sidebar form) → add a product item via
 *   the ProductPickerModal (same testid-driven pattern as
 *   proposal-build.spec.ts) → assert both render on the canvas + survive a
 *   reload → suggestions-rail empty path (no embeddings locally → rail must
 *   stay hidden without crashing) → flip the proposal to sent and assert the
 *   board rows persist.
 *
 * Drag/rotate pointer choreography isn't asserted — @dnd-kit-style dragging
 * is brittle headless. The debounced layout-save path (useSaveBoardLayout)
 * is still covered via the inspector's real Bring forward / Send back
 * buttons (step 3b), which flush through the exact same batch upsert a drag
 * does — that step is the regression guard for the RLS rejection where the
 * upsert omitted board_id and every layout edit was silently lost.
 *
 * Designer-side only by design: the client-portal board-block half would
 * need a second portal session, and :3000/:3002 share one localhost Supabase
 * cookie (signing into one logs the other out) — a cross-portal spec belongs
 * in its own isolated-context suite.
 *
 * Requires:
 *   - Local Supabase running with seed data (designer@patina.dev + products)
 *   - Designer portal at :3000
 *   - SUPABASE_SERVICE_ROLE_KEY in apps/designer-portal/.env.local
 */

import { test, expect } from '../fixtures/auth';
import {
  adminDb,
  deleteProposalCascade,
  cloneProposalViaRpc,
} from '../helpers/supabase-admin';

// Deterministic dev-seed UUIDs — see supabase/seed/dev-accounts.sql.
const DEV_DESIGNER_ID = 'a0000000-0000-0000-0000-000000000004';
// Seeded published product the picker search will hit.
const SEED_PRODUCT_VELVET_CHAIR = 'a0000000-0000-0000-0000-000000000012';
const SEED_PRODUCT_NAME = 'Velvet Club Chair';

const NOTE_TEXT = 'QA board note — sienna velvet accents';

// Module-level shared state (safe because describe.serial is sequential).
let proposalId: string;
let boardId: string;

async function getBoards() {
  const { data, error } = await adminDb
    .from('proposal_boards')
    .select('id, name, proposal_id')
    .eq('proposal_id', proposalId);
  if (error) throw error;
  return data ?? [];
}

async function getBoardItems() {
  const { data, error } = await adminDb
    .from('proposal_board_items')
    .select('id, type, product_id, content, data, x, y, z_index')
    .eq('board_id', boardId);
  if (error) throw error;
  return data ?? [];
}

test.describe.serial('proposal boards: create → add items → persist', () => {
  test.beforeAll(async () => {
    // Seed a bare draft proposal directly — the boards surface doesn't need
    // template sections, and the UI create path is already covered by
    // proposal-build.spec.ts.
    const { data, error } = await adminDb
      .from('proposals')
      .insert({
        designer_id: DEV_DESIGNER_ID,
        title: 'QA Boards Proposal (e2e)',
        status: 'draft',
      })
      .select('id')
      .single();
    if (error) throw new Error(`seed proposal failed: ${error.message}`);
    proposalId = data.id as string;
  });

  test.afterAll(async () => {
    if (process.env.KEEP_TEST_PROPOSAL === 'true') {
      // eslint-disable-next-line no-console
      console.log(`[KEEP_TEST_PROPOSAL] preserving proposal: ${proposalId}`);
      return;
    }
    if (proposalId) {
      // Boards + items CASCADE off the proposal.
      await deleteProposalCascade(proposalId).catch((err) => {
        console.error('[proposal-boards] afterAll cleanup failed:', err);
      });
    }
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 1: Create the first board from the empty state
  // ────────────────────────────────────────────────────────────────────────
  test('create the first board', async ({ authenticatedPage: page }) => {
    await page.goto(`/portal/proposals/${proposalId}/scope?tab=boards`, {
      waitUntil: 'networkidle',
    });

    await expect(page.getByText('Mood Boards').first()).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /create your first board/i }).click();

    // The new board's tab chip renders with its default name, and the editor
    // sidebar appears (the add-product section is its stable marker).
    await expect(page.getByText('Board 1').first()).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole('button', { name: /add product or capture/i }),
    ).toBeVisible({ timeout: 15_000 });

    // DB: exactly one board row.
    const boards = await getBoards();
    expect(boards, 'expected exactly 1 board').toHaveLength(1);
    expect(boards[0].name).toBe('Board 1');
    boardId = boards[0].id as string;
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 2: Add a note item (cheapest non-modal add path)
  // ────────────────────────────────────────────────────────────────────────
  test('add a note item from the sidebar', async ({ authenticatedPage: page }) => {
    await page.goto(`/portal/proposals/${proposalId}/scope?tab=boards`, {
      waitUntil: 'networkidle',
    });

    const noteInput = page.getByPlaceholder(/jot a styling note/i);
    await noteInput.waitFor({ state: 'visible', timeout: 20_000 });
    await noteInput.fill(NOTE_TEXT);
    await page.getByRole('button', { name: /\+\s*add note/i }).click();

    // The optimistic insert renders the note card on the canvas.
    await expect(page.getByText(NOTE_TEXT).first()).toBeVisible({ timeout: 15_000 });

    // DB: one note item with the content persisted.
    await expect
      .poll(async () => (await getBoardItems()).length, {
        message: 'note item row should land',
        timeout: 15_000,
      })
      .toBe(1);
    const [note] = await getBoardItems();
    expect(note.type).toBe('note');
    expect(note.content).toBe(NOTE_TEXT);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 3: Add a product via the ProductPickerModal
  //
  // Same testid-driven pattern proposal-build.spec.ts uses for FF&E. The board
  // editor mounts the SAME modal with scope="library" (full 3-layer picker);
  // typing "chair" runs the cross-layer ilike search, which still surfaces the
  // seeded catalog product, and the Captures/draft tabs are unchanged. If this
  // ever turns flaky, fall back to seeding the proposal_board_items row via
  // adminDb and keeping the render assertions.
  // ────────────────────────────────────────────────────────────────────────
  test('add a product item via the picker', async ({ authenticatedPage: page }) => {
    await page.goto(`/portal/proposals/${proposalId}/scope?tab=boards`, {
      waitUntil: 'networkidle',
    });

    const addBtn = page.getByRole('button', { name: /add product or capture/i });
    await addBtn.waitFor({ state: 'visible', timeout: 20_000 });
    await addBtn.click();

    const pickerModal = page.getByTestId('product-picker-modal');
    await pickerModal.waitFor({ state: 'visible', timeout: 10_000 });

    const searchInput = pickerModal.locator('input[type="search"]').first();
    await searchInput.waitFor({ state: 'visible', timeout: 10_000 });
    await searchInput.fill('chair');

    const firstResult = pickerModal.getByTestId('product-picker-result').first();
    await firstResult.waitFor({ state: 'visible', timeout: 15_000 });
    await firstResult.click();

    // Picker closes itself on pick; the product card then renders on the
    // canvas with the snapshot name.
    await pickerModal.waitFor({ state: 'hidden', timeout: 10_000 });
    await expect(page.getByText(SEED_PRODUCT_NAME).first()).toBeVisible({ timeout: 15_000 });

    // DB: poll for the second item (the add mutation races networkidle).
    await expect
      .poll(async () => (await getBoardItems()).length, {
        message: 'product item row should land after the picker closes',
        timeout: 15_000,
      })
      .toBe(2);

    const product = (await getBoardItems()).find((i) => i.type === 'product');
    expect(product, 'product item should exist').toBeDefined();
    expect(product!.product_id).toBe(SEED_PRODUCT_VELVET_CHAIR);
    // The editor snapshots display fields into data JSONB so the board
    // renders even if the catalog row changes later.
    expect((product!.data as { name?: string }).name).toBe(SEED_PRODUCT_NAME);
    // Stacking: the product (added second) sits above the note.
    const note = (await getBoardItems()).find((i) => i.type === 'note');
    expect(product!.z_index).toBeGreaterThan(note!.z_index);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 3b: Z-order buttons persist through the debounced layout flush
  //
  // Bring forward / Send back merge into local state and flush through
  // useSaveBoardLayout (600ms debounce) — the same batch upsert drags use.
  // Asserting the DB row changed is the direct regression for the
  // missing-board_id RLS rejection; the z >= 0 floor is the Send back
  // renormalization contract (negative z renders behind the canvas
  // background and the item vanishes).
  // ────────────────────────────────────────────────────────────────────────
  test('z-order buttons persist layout through the debounced flush', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`/portal/proposals/${proposalId}/scope?tab=boards`, {
      waitUntil: 'networkidle',
    });

    // Select the note on the canvas. Click its top-left corner — the product
    // card sits above it in z and cascades 32px down-right, so that corner is
    // the note's reliably exposed region.
    const noteCard = page.getByText(NOTE_TEXT).first();
    await noteCard.waitFor({ state: 'visible', timeout: 20_000 });
    await noteCard.click({ position: { x: 2, y: 5 } });
    await expect(page.getByText(/^Selected note$/i)).toBeVisible({ timeout: 10_000 });

    const zOf = async (type: string) =>
      (await getBoardItems()).find((i) => i.type === type)?.z_index;
    const productZBefore = await zOf('product');
    expect(productZBefore).toBeGreaterThan((await zOf('note'))!);

    // Bring forward → the note's persisted z must rise above the product's.
    await page.getByRole('button', { name: /bring forward/i }).click();
    await expect
      .poll(async () => (await zOf('note'))! > (await zOf('product'))!, {
        message: 'bring-forward z change should persist through the layout flush',
        timeout: 15_000,
      })
      .toBe(true);

    // Send back → note drops below the product again. The inspector floor is
    // 0, so this exercises the renormalization path (others shift up instead
    // of the note going negative).
    await page.getByRole('button', { name: /send back/i }).click();
    await expect
      .poll(async () => (await zOf('note'))! < (await zOf('product'))!, {
        message: 'send-back z change should persist through the layout flush',
        timeout: 15_000,
      })
      .toBe(true);
    for (const item of await getBoardItems()) {
      expect(item.z_index, `${item.type} z_index must stay >= 0`).toBeGreaterThanOrEqual(0);
    }

    // Server truth renders after a reload: both items still on the canvas.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText(NOTE_TEXT).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(SEED_PRODUCT_NAME).first()).toBeVisible({ timeout: 20_000 });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 4: Suggestions rail — empty path must degrade silently
  //
  // Local dev products have no embeddings (find_products_similar_to returns
  // an empty set), so the rail must simply not mount — no crash, no empty
  // shell. If embeddings ARE present in this environment, the rail rendering
  // is also acceptable; the invariant under test is "no runtime error either
  // way".
  // ────────────────────────────────────────────────────────────────────────
  test('suggestions rail degrades silently without embeddings', async ({
    authenticatedPage: page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));

    await page.goto(`/portal/proposals/${proposalId}/scope?tab=boards`, {
      waitUntil: 'networkidle',
    });

    // Board canvas is up (the product card is the readiness signal).
    await expect(page.getByText(SEED_PRODUCT_NAME).first()).toBeVisible({ timeout: 20_000 });

    // Does the anchor product have an embedding? Decide the expectation from
    // the data instead of hardcoding the local-dev assumption.
    const { data: anchor, error } = await adminDb
      .from('products')
      .select('embedding_updated_at')
      .eq('id', SEED_PRODUCT_VELVET_CHAIR)
      .single();
    if (error) throw error;

    const rail = page.getByTestId('board-suggestions-rail');
    if (!anchor.embedding_updated_at) {
      // Give the similarity query a beat to settle, then assert the rail
      // never mounted.
      await page.waitForLoadState('networkidle');
      await expect(rail).toHaveCount(0);
    } else {
      // Embeddings exist — the rail may render (only if the RPC found
      // similar products not already on the board). Either state is fine.
      await page.waitForLoadState('networkidle');
    }

    expect(pageErrors, `page errors: ${pageErrors.join(' | ')}`).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 5: Persistence — items survive a reload
  // ────────────────────────────────────────────────────────────────────────
  test('items persist across reload', async ({ authenticatedPage: page }) => {
    await page.goto(`/portal/proposals/${proposalId}/scope?tab=boards`, {
      waitUntil: 'networkidle',
    });

    await expect(page.getByText(NOTE_TEXT).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(SEED_PRODUCT_NAME).first()).toBeVisible({ timeout: 20_000 });

    // The board-list chip reflects the item count.
    await expect(page.getByText('2 items').first()).toBeVisible({ timeout: 15_000 });

    // And again after an explicit reload (server data, not optimistic state).
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByText(NOTE_TEXT).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(SEED_PRODUCT_NAME).first()).toBeVisible({ timeout: 20_000 });
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 6: Sent proposal — board rows persist (designer-side contract)
  //
  // The client-portal board-block render is out of scope here (localhost
  // cookie collision — see file header); the designer-side contract is that
  // sending never mutates or drops board data.
  // ────────────────────────────────────────────────────────────────────────
  test('board and items persist after the proposal is sent', async () => {
    const { error } = await adminDb
      .from('proposals')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', proposalId);
    if (error) throw error;

    const boards = await getBoards();
    expect(boards, 'board row must survive send').toHaveLength(1);

    const items = await getBoardItems();
    expect(items, 'both items must survive send').toHaveLength(2);
    expect(new Set(items.map((i) => i.type))).toEqual(new Set(['note', 'product']));
    const product = items.find((i) => i.type === 'product');
    expect(product!.product_id).toBe(SEED_PRODUCT_VELVET_CHAIR);
  });

  // ────────────────────────────────────────────────────────────────────────
  // Step 7: Revising (cloning) the proposal carries the board + items forward
  //
  // Direct regression for the 00176→00260 gap: clone_proposal used to deep-copy
  // every child table EXCEPT proposal_boards / proposal_board_items, so revising
  // a sent proposal silently dropped its boards. 00260 adds the boards carry.
  // clone_proposal is invoked via its RPC (service role → executes + bypasses
  // RLS for the assertion reads) exactly as useEnterRevision drives it in-app.
  // ────────────────────────────────────────────────────────────────────────
  test('revising (cloning) the proposal carries the board + items forward', async () => {
    const newProposalId = await cloneProposalViaRpc(proposalId, 'revision', 'carry boards e2e');
    expect(newProposalId, 'clone returned a new proposal id').toBeTruthy();
    expect(newProposalId).not.toBe(proposalId);

    try {
      // The clone carries exactly one board — a NEW row, not the source board.
      const { data: clonedBoards, error: bErr } = await adminDb
        .from('proposal_boards')
        .select('id, name, canvas_width, canvas_height, background_color')
        .eq('proposal_id', newProposalId);
      if (bErr) throw bErr;
      expect(clonedBoards, 'clone carries exactly one board').toHaveLength(1);
      expect(clonedBoards![0].name).toBe('Board 1');
      const clonedBoardId = clonedBoards![0].id as string;
      expect(clonedBoardId, 'cloned board is a fresh row').not.toBe(boardId);

      // Both items carried with their snapshots intact, remapped onto the clone.
      const { data: clonedItems, error: iErr } = await adminDb
        .from('proposal_board_items')
        .select('type, content, data, product_id')
        .eq('board_id', clonedBoardId);
      if (iErr) throw iErr;
      expect(clonedItems, 'clone carries both items').toHaveLength(2);
      expect(new Set(clonedItems!.map((i) => i.type))).toEqual(new Set(['note', 'product']));

      const clonedNote = clonedItems!.find((i) => i.type === 'note');
      expect(clonedNote!.content).toBe(NOTE_TEXT);

      const clonedProduct = clonedItems!.find((i) => i.type === 'product');
      expect(clonedProduct!.product_id).toBe(SEED_PRODUCT_VELVET_CHAIR);
      expect((clonedProduct!.data as { name?: string }).name).toBe(SEED_PRODUCT_NAME);
    } finally {
      // The source proposal cleans up in afterAll; tidy the clone here.
      if (process.env.KEEP_TEST_PROPOSAL !== 'true') {
        await deleteProposalCascade(newProposalId).catch((err) => {
          console.error('[proposal-boards] clone cleanup failed:', err);
        });
      }
    }
  });
});
