import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

// Field Coordination Wave 4 — the /field/[token] guest page is a login-less,
// mobile-first surface for a contractor to tap through their open work. This
// drives the real route against the LOCAL stack (never Strata), mirroring the
// share-link.spec.ts guest-page pattern: seed real rows via the service
// client, mint a raw token + its sha256 hash directly into field_link_tokens
// (bypassing create_field_link(), which requires an authenticated designer
// session — not available to a Node test script), then exercise the page
// exactly as a contractor would.

const LOCAL_URL = 'http://127.0.0.1:54321';
// Well-known supabase-demo service-role JWT (LOCAL only) — same constant
// share-link.spec.ts / wave2-screenshots.spec.ts already use against this stack.
const SERVICE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

// Seeded project also used by the designer-portal decision e2e specs
// (apps/designer-portal/e2e/decisions/edges.spec.ts): "Aspen Loft Refresh",
// designer a0000000-…-004, client a0000000-…-005, with a real
// designer_clients row (apply_field_effect's flag_blocker/punch_report path
// needs one) — reused rather than seeding a whole project from scratch.
const PROJECT_ID = 'b0000000-0000-0000-0000-0000000000d1';
const PROJECT_NAME = 'Aspen Loft Refresh';

const admin = createClient(LOCAL_URL, SERVICE_JWT, { auth: { persistSession: false } });

async function seedFieldLink() {
  const suffix = randomUUID().slice(0, 8);
  const { data: party, error: partyErr } = await admin
    .from('project_parties')
    .insert({
      project_id: PROJECT_ID,
      party_kind: 'sub',
      display_name: `Sal Reyes ${suffix}`,
      trade: 'tile',
      phone: '5555550100',
    })
    .select('id')
    .single();
  if (partyErr) throw partyErr;
  const partyId = party!.id as string;

  const taskTitle = `E2E set the tile — ${suffix}`;
  const { data: task, error: taskErr } = await admin
    .from('project_tasks')
    .insert({
      project_id: PROJECT_ID,
      title: taskTitle,
      owner: 'sub',
      owner_party_id: partyId,
      status: 'todo',
      due_date: '2026-08-01',
    })
    .select('id')
    .single();
  if (taskErr) throw taskErr;
  const taskId = task!.id as string;

  const token = randomBytes(32).toString('hex');
  const token_hash = createHash('sha256').update(token).digest('hex');
  const { data: linkRow, error: linkErr } = await admin
    .from('field_link_tokens')
    .insert({ party_id: partyId, project_id: PROJECT_ID, token_hash, status: 'active' })
    .select('id')
    .single();
  if (linkErr) throw linkErr;

  async function cleanup() {
    await admin.from('field_link_tokens').delete().eq('id', linkRow!.id as string);
    await admin.from('project_tasks').delete().eq('id', taskId);
    await admin.from('project_parties').delete().eq('id', partyId);
  }

  return { token, partyId, taskId, taskTitle, cleanup };
}

test.describe('field guest link (Field Coordination Wave 4)', () => {
  test('renders open work, Done flips the task, and the row updates', async ({ page }) => {
    const { token, taskId, taskTitle, cleanup } = await seedFieldLink();
    try {
      await page.goto(`/field/${token}`);
      await expect(page.getByRole('heading', { name: PROJECT_NAME })).toBeVisible({ timeout: 20000 });
      await expect(page.getByText('Sal', { exact: false })).toBeVisible();
      await expect(page.getByText('Tile', { exact: true })).toBeVisible(); // trade chip
      await expect(page.getByText(taskTitle)).toBeVisible();

      const doneButton = page.getByRole('button', { name: 'Done' });
      await expect(doneButton).toBeVisible();
      await doneButton.click();

      // Row flips to a done state carrying the RPC's confirmation summary text
      // (which itself quotes the title — .first() picks the struck-through title,
      // not the "Marked "…" done." summary line below it).
      await expect(page.getByText(/Marked/i)).toBeVisible({ timeout: 15000 });
      await expect(page.getByText(taskTitle).first()).toHaveClass(/line-through/);

      const { data: taskRow } = await admin
        .from('project_tasks')
        .select('status, completed_at')
        .eq('id', taskId)
        .single();
      expect(taskRow?.status).toBe('done');
      expect(taskRow?.completed_at).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  // NOTE on HTTP status: this app's App Router + streaming metadata shell
  // means notFound() lands the correct not-found UI (client-rendered) but the
  // wire-level status the server already flushed stays 200 — confirmed in
  // both `next dev` and a production standalone build, and true for every
  // notFound() caller in this app (verified against
  // src/app/projects/[projectId]/page.tsx too). This is exactly why
  // src/app/share/[token]/page.tsx deliberately renders a custom <DeadLink>
  // instead of calling notFound() — same tradeoff, and arguably a WASH for
  // the "no existence leak" goal (a real 404 vs a 200 would itself be an
  // oracle; staying 200 either way matches share's own security posture).
  // So: content assertions only here, matching share-link.spec.ts's own
  // convention (it never asserts response.status() either).
  test('an invalid/expired token is a calm dead link, not a leak', async ({ page }) => {
    await page.goto(`/field/${'deadbeef'.repeat(8)}`); // well-formed 64-hex shape, no matching row
    await expect(page.getByText(/page not found/i)).toBeVisible({ timeout: 20000 });
  });

  test('a malformed token never reaches the DB and is also a dead link', async ({ page }) => {
    await page.goto('/field/not-a-real-token');
    await expect(page.getByText(/page not found/i)).toBeVisible({ timeout: 20000 });
  });
});
