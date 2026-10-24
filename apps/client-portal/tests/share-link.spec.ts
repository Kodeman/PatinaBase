import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

// Schedule & Boards Wave 2 · C2 — the guest share window is VIEW-ONLY, resolved
// server-side by token hash, honoring the per-field visibility matrix and
// dying instantly on revoke. This drives the real /share/[token] route against
// the LOCAL stack (never Strata). Verdict flows are SQL-proven (see the migration
// proofs) rather than driven here — a client-account login is out of scope for a
// chromium single-actor spec.

const LOCAL_URL = 'http://127.0.0.1:54321';
// Supplied from the local CLI status, never a committed credential.
const SERVICE_JWT = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const PROPOSAL_ID = 'b0000000-0000-0000-0000-000000000002';
const PROPOSAL_TITLE = 'Aspen Loft — Living Room Refresh';
const AN_ITEM = 'Walnut sectional sofa'; // itemDetails ON → present
const A_VENDOR = 'Lawson'; // supplierIdentity OFF → absent

const admin = createClient(LOCAL_URL, SERVICE_JWT, { auth: { persistSession: false } });

// Insert an active share row directly (service role bypasses RLS) with a known
// raw token; the guest route resolves it by sha256(token) exactly like a real
// mint. This stands in for "the designer created a share".
async function mintShare(visibility: Record<string, boolean>, proposalId = PROPOSAL_ID) {
  const token = randomBytes(32).toString('hex');
  const token_hash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await admin
    .from('document_shares')
    .insert({ proposal_id: proposalId, token_hash, label: 'e2e', visibility, status: 'active' })
    .select('id')
    .single();
  if (error) throw error;
  return { token, id: data!.id as string };
}

const BOARD_NAME = 'Guest Board (e2e)';
const BOARD_PIN_NAME = 'Guest Board Sofa';

// Author the board on a disposable draft, never on the immutable sent seed.
async function seedBoard() {
  const { data: source, error: sourceError } = await admin.from('proposals')
    .select('designer_id,client_id,designer_client_id,project_id,title').eq('id', PROPOSAL_ID).single();
  if (sourceError) throw sourceError;
  const proposalId = randomUUID();
  const { error: draftError } = await admin.from('proposals').insert({
    ...source, id: proposalId, status: 'draft', document_kind: 'legacy',
  });
  if (draftError) throw draftError;
  const { data: board, error: boardErr } = await admin
    .from('proposal_boards')
    .insert({ proposal_id: proposalId, name: BOARD_NAME, status: 'active', sort_order: 999 })
    .select('id')
    .single();
  if (boardErr) throw boardErr;
  const boardId = board!.id as string;
  const { error: itemErr } = await admin.from('proposal_board_items').insert({
    board_id: boardId,
    type: 'product',
    x: 40,
    y: 40,
    width: 220,
    height: 260,
    z_index: 0,
    data: { name: BOARD_PIN_NAME, price_cents: 250000 },
  });
  if (itemErr) throw itemErr;
  return { proposalId, cleanup: async () => {
    const { error } = await admin.from('proposals').delete().eq('id', proposalId);
    if (error) throw error;
  } };
}

test.describe('guest share link (C2)', () => {
  test('renders the doc under the visibility matrix, then dies on revoke', async ({ page }) => {
    const { token, id } = await mintShare({
      pricing: false,
      roomBudgets: false,
      paymentSchedule: true,
      supplierIdentity: false,
      sourceUrls: false,
      itemDetails: true,
      leadTimes: true,
      feedbackEnabled: false,
    });

    // ── Guest opens the link (no auth) ──
    await page.goto(`/share/${token}`);
    await expect(page.getByRole('heading', { name: PROPOSAL_TITLE })).toBeVisible({ timeout: 20000 });
    // The quiet "shared by" letterhead.
    await expect(page.getByText(/Shared by/i)).toBeVisible();
    // itemDetails ON → the piece shows.
    await expect(page.getByText(AN_ITEM)).toBeVisible();
    // supplierIdentity OFF → the vendor name is nowhere on the page.
    await expect(page.getByText(A_VENDOR, { exact: false })).toHaveCount(0);
    // View-only: no sign / verdict affordances.
    await expect(page.getByText('Sign proposal')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Approve/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Flag/i })).toHaveCount(0);

    // ── Revoke → the link is dead (no existence leak) ──
    const { error: revokeErr } = await admin
      .from('document_shares')
      .update({ status: 'revoked' })
      .eq('id', id);
    expect(revokeErr).toBeNull();

    await page.goto(`/share/${token}`);
    await expect(page.getByText(/isn.t available/i)).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('heading', { name: PROPOSAL_TITLE })).toHaveCount(0);
  });

  test('a garbage token is a calm dead link', async ({ page }) => {
    await page.goto('/share/deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    await expect(page.getByText(/isn.t available/i)).toBeVisible({ timeout: 20000 });
  });

  // B3 — a share WITH a board renders it read-only for a guest, and carries NO
  // verdict affordances (feedback is forced off on a guest share).
  test('a share with a board renders it view-only for a guest (B3)', async ({ page }) => {
    const { proposalId, cleanup } = await seedBoard();
    try {
      const { token } = await mintShare({
        pricing: true,
        roomBudgets: false,
        paymentSchedule: true,
        supplierIdentity: false,
        sourceUrls: false,
        itemDetails: true, // the gate that lets boards through
        leadTimes: true,
        feedbackEnabled: false,
      }, proposalId);

      await page.goto(`/share/${token}`);
      await expect(page.getByRole('heading', { name: PROPOSAL_TITLE })).toBeVisible({ timeout: 20000 });
      // The board section + its pin render (name shows on the pin + featured list).
      await expect(page.getByText(BOARD_NAME).first()).toBeVisible();
      await expect(page.getByText(BOARD_PIN_NAME).first()).toBeVisible();
      // Guest: pins carry NO verdict affordances.
      await expect(page.getByRole('button', { name: /Approve/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Flag/i })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Note/i })).toHaveCount(0);
    } finally {
      await cleanup();
    }
  });
});
