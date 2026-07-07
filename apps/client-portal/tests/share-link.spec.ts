import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

// Schedule & Boards Wave 2 · C2 — the guest share window is VIEW-ONLY, resolved
// server-side by token hash, honoring the per-field visibility matrix and
// dying instantly on revoke. This drives the real /share/[token] route against
// the LOCAL stack (never Strata). Verdict flows are SQL-proven (see the migration
// proofs) rather than driven here — a client-account login is out of scope for a
// chromium single-actor spec.

const LOCAL_URL = 'http://127.0.0.1:54321';
// Well-known supabase-demo service-role JWT (LOCAL only).
const SERVICE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const PROPOSAL_ID = 'b0000000-0000-0000-0000-000000000002';
const PROPOSAL_TITLE = 'Aspen Loft — Living Room Refresh';
const AN_ITEM = 'Walnut sectional sofa'; // itemDetails ON → present
const A_VENDOR = 'Lawson'; // supplierIdentity OFF → absent

const admin = createClient(LOCAL_URL, SERVICE_JWT, { auth: { persistSession: false } });

// Insert an active share row directly (service role bypasses RLS) with a known
// raw token; the guest route resolves it by sha256(token) exactly like a real
// mint. This stands in for "the designer created a share".
async function mintShare(visibility: Record<string, boolean>) {
  const token = randomBytes(32).toString('hex');
  const token_hash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await admin
    .from('document_shares')
    .insert({ proposal_id: PROPOSAL_ID, token_hash, label: 'e2e', visibility, status: 'active' })
    .select('id')
    .single();
  if (error) throw error;
  return { token, id: data!.id as string };
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
});
