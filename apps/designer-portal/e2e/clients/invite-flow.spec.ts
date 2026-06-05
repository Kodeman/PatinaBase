/**
 * Client Invite Flow E2E Tests
 *
 * Tests for the "Add Client" dialog's invite functionality.
 *
 * Requires:
 *  - Local dev server running at http://localhost:3000
 *  - Local Supabase running (Postgres at port 54322, Studio at 54323)
 *  - Seeded user: designer@patina.dev / password123
 *
 * The tests do NOT rely on Inbucket/email delivery. Instead they assert
 * database state directly via the Supabase service-role Admin API or
 * by querying Postgres.
 */

import { test, expect } from '../fixtures/auth';
import { createClient } from '@supabase/supabase-js';

// ──────────────────────────────────────────────────────────────────────────────
// Supabase admin client for database assertions
// ──────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function getAdminClient() {
  if (!SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY env var is required for invite-flow e2e tests',
    );
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function randEmail() {
  return `test+invite-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@patina.dev`;
}

async function deleteAuthUserByEmail(email: string) {
  const admin = getAdminClient();
  const { data } = await admin.auth.admin.listUsers();
  const user = data?.users?.find((u) => u.email === email);
  if (user) {
    await admin.auth.admin.deleteUser(user.id);
  }
}

async function deleteDesignerClientByEmail(email: string) {
  const admin = getAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (admin as any)
    .from('designer_clients')
    .delete()
    .eq('client_email', email);
}

// Navigate to the clients page and open the Add Client form
async function openAddClientDialog(page: import('@playwright/test').Page) {
  await page.goto('/portal/clients', { waitUntil: 'networkidle' });

  // Look for the page-header button that opens the add-client form. Scope to
  // <main> — the SubNav chrome also renders a "+ Add Client" zone action, so
  // an unscoped role/text union resolves to 2 elements (strict-mode failure).
  const addBtn = page
    .getByRole('main')
    .getByRole('button', { name: /add client/i })
    .first();
  await addBtn.click();

  // Wait for the form to appear
  await page.waitForSelector('label:has-text("Email")', { timeout: 5_000 });
}

async function fillAndSubmit(
  page: import('@playwright/test').Page,
  opts: { email: string; name?: string; invite?: boolean },
) {
  await page.fill('input[type="email"]', opts.email);
  if (opts.name) {
    const nameInput = page.getByLabel(/full name/i);
    await nameInput.fill(opts.name);
  }

  // Toggle invite checkbox
  const inviteCheckbox = page.locator('#send-invite-toggle');
  const isChecked = await inviteCheckbox.isChecked();
  if (opts.invite === false && isChecked) {
    await inviteCheckbox.uncheck();
  } else if (opts.invite !== false && !isChecked) {
    await inviteCheckbox.check();
  }

  await page.getByRole('button', { name: /^add client$/i }).click();
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────
test.describe('Client invite flow', () => {
  // ── Golden path: invite ON ──────────────────────────────────────────────────
  test('golden path — invite=true creates auth user + activity log row', async ({
    authenticatedPage: page,
  }) => {
    const email = randEmail();
    const admin = getAdminClient();

    // Cleanup: remove any stale test user before we start
    await deleteAuthUserByEmail(email);

    try {
      await openAddClientDialog(page);
      await fillAndSubmit(page, { email, name: 'E2E Invite User', invite: true });

      // Success message should appear
      await expect(page.getByRole('status')).toBeVisible({ timeout: 8_000 });
      const statusText = await page.getByRole('status').textContent();
      expect(statusText).toMatch(/invited/i);

      // ── Assert: auth user created ─────────────────────────────────────────
      const { data: authList } = await admin.auth.admin.listUsers();
      const authUser = authList?.users?.find((u) => u.email === email);
      expect(authUser).toBeDefined();

      // ── Assert: designer_clients row with client_id ───────────────────────
      const { data: dcRows } = await (admin as any)
        .from('designer_clients')
        .select('id, client_id, client_email')
        .eq('client_id', authUser!.id);
      expect(dcRows?.length).toBeGreaterThan(0);
      const dcRow = dcRows![0];

      // ── Assert: activity log row ──────────────────────────────────────────
      const { data: logRows } = await (admin as any)
        .from('client_activity_log')
        .select('activity_type, title, metadata')
        .eq('designer_client_id', dcRow.id);
      expect(logRows?.length).toBeGreaterThan(0);
      const logRow = logRows![0];
      expect((logRow.metadata as Record<string, unknown>)?.invited).toBe(true);
    } finally {
      await deleteAuthUserByEmail(email);
    }
  });

  // ── No-invite path ─────────────────────────────────────────────────────────
  test('no-invite toggle — skips auth invite, stores client_email directly', async ({
    authenticatedPage: page,
  }) => {
    const email = randEmail();
    const admin = getAdminClient();

    try {
      await openAddClientDialog(page);
      await fillAndSubmit(page, { email, name: 'E2E No-Invite User', invite: false });

      // Success message
      await expect(page.getByRole('status')).toBeVisible({ timeout: 8_000 });
      const statusText = await page.getByRole('status').textContent();
      // Dialog toast says "Client added without invite."; the API route's
      // message variant says "Client added (no invite)". Accept either.
      expect(statusText).toMatch(/without invite|no invite/i);

      // ── Assert: NO auth user created ──────────────────────────────────────
      const { data: authList } = await admin.auth.admin.listUsers();
      const authUser = authList?.users?.find((u) => u.email === email);
      expect(authUser).toBeUndefined();

      // ── Assert: designer_clients row with client_email, client_id=null ────
      const { data: dcRows } = await (admin as any)
        .from('designer_clients')
        .select('id, client_id, client_email')
        .eq('client_email', email);
      expect(dcRows?.length).toBeGreaterThan(0);
      const dcRow = dcRows![0];
      expect(dcRow.client_id).toBeNull();

      // ── Assert: activity log row ──────────────────────────────────────────
      const { data: logRows } = await (admin as any)
        .from('client_activity_log')
        .select('activity_type, title, metadata')
        .eq('designer_client_id', dcRow.id);
      expect(logRows?.length).toBeGreaterThan(0);
      const logRow = logRows![0];
      expect((logRow.metadata as Record<string, unknown>)?.invited).toBe(false);
    } finally {
      await deleteDesignerClientByEmail(email);
    }
  });

  // ── Already-exists path ────────────────────────────────────────────────────
  test('already-exists — links to existing profile without sending email', async ({
    authenticatedPage: page,
  }) => {
    // Use an existing seeded designer account as the "client" being added
    const existingEmail = 'designer@patina.dev';
    const admin = getAdminClient();

    // Idempotence: prior runs leave a designer_clients link for this profile,
    // and re-adding an already-linked client makes the invite route error
    // ("unexpected error" toast) instead of the already-exists path. Remove
    // any existing link first so each run exercises the link-creation branch.
    {
      const { data: profile } = await (admin as any)
        .from('profiles')
        .select('id')
        .eq('email', existingEmail)
        .maybeSingle();
      if (profile) {
        await (admin as any)
          .from('designer_clients')
          .delete()
          .eq('client_id', profile.id);
      }
    }

    await openAddClientDialog(page);
    await fillAndSubmit(page, { email: existingEmail, invite: true });

    // Success message should indicate link (not invite)
    await expect(page.getByRole('status')).toBeVisible({ timeout: 8_000 });
    const statusText = await page.getByRole('status').textContent();
    // Should say "already on Patina" or similar, not "invited"
    expect(statusText).toMatch(/already|linked|existing/i);

    // ── Assert: designer_clients row links to existing profile ─────────────
    const { data: profile } = await (admin as any)
      .from('profiles')
      .select('id')
      .eq('email', existingEmail)
      .maybeSingle();

    if (profile) {
      const { data: dcRows } = await (admin as any)
        .from('designer_clients')
        .select('id, client_id')
        .eq('client_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1);
      expect(dcRows?.length).toBeGreaterThan(0);

      // Activity log should say alreadyExists=true
      const dcRow = dcRows![0];
      const { data: logRows } = await (admin as any)
        .from('client_activity_log')
        .select('metadata')
        .eq('designer_client_id', dcRow.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (logRows?.length) {
        const meta = logRows[0].metadata as Record<string, unknown>;
        expect(meta?.already_exists).toBe(true);
        expect(meta?.invited).toBe(false);
      }
    }
  });
});
