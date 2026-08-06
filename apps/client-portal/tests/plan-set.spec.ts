import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

// Plan Room (00429), the client's leg — /documents shows "Your drawings":
// the CURRENT print of every SHARED sheet, rev letter on the face, no
// version archaeology. This drives the signed-in client page against the
// LOCAL stack (never Strata), following wave2-screenshots.spec.ts for the
// client sign-in (client@patina.dev / password123, seeded by
// supabase/seed/dev-accounts.sql).
//
// Sheets + prints are minted honestly through the designer RPCs — the sheet
// pointer and sharing state move only through them (guard-blocked outside),
// and file_plan_prints demands a real storage object.
//
// Cleanup: plan rows are immutable (UPDATE/DELETE raise) with RESTRICT FKs,
// so nothing here can be deleted — deliberately. Everything lives under a
// throwaway project and stays; this is the LOCAL stack, and
// `supabase db reset` is the broom.

const LOCAL_URL = 'http://127.0.0.1:54321';
// Well-known supabase-demo service-role + anon JWTs (LOCAL only).
const SERVICE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const DESIGNER_ID = 'a0000000-0000-0000-0000-000000000004';
const CLIENT_ID = 'a0000000-0000-0000-0000-000000000005';

const admin = createClient(LOCAL_URL, SERVICE_JWT, { auth: { persistSession: false } });

const TINY_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

async function mintSharedAndDraftSheets() {
  const suffix = randomUUID().slice(0, 8);
  const projectId = randomUUID();
  const projectName = `Drawings E2E ${suffix}`;
  const sharedTitle = `Shared Floor Plan ${suffix}`;
  const draftTitle = `Draft Roof Plan ${suffix}`;

  const { error: projectErr } = await admin.from('projects').insert({
    id: projectId,
    name: projectName,
    status: 'active',
    budget_cents: 0,
    design_fee_cents: 0,
    client_visibility_tier: 'milestone',
    client_id: CLIENT_ID,
    designer_id: DESIGNER_ID,
    created_by: DESIGNER_ID,
  });
  if (projectErr) throw projectErr;

  const uploads = [
    { number: 'A-101', title: sharedTitle, path: `${projectId}/plans/${suffix}-a101.pdf` },
    { number: 'A-102', title: draftTitle, path: `${projectId}/plans/${suffix}-a102.pdf` },
  ];
  for (const upload of uploads) {
    const { error } = await admin.storage
      .from('project-documents')
      .upload(upload.path, TINY_PDF, { contentType: 'application/pdf' });
    if (error) throw error;
  }

  const designer = createClient(LOCAL_URL, ANON_JWT, { auth: { persistSession: false } });
  const { error: signInErr } = await designer.auth.signInWithPassword({
    email: 'designer@patina.dev',
    password: 'password123',
  });
  if (signInErr) throw signInErr;

  const { data: filed, error: fileErr } = await designer.rpc('file_plan_prints', {
    p_project_id: projectId,
    p_idempotency_key: `plan-set-e2e-${suffix}`,
    p_entries: uploads.map((upload) => ({
      kind: 'new_sheet',
      sheet: { number: upload.number, title: upload.title, discipline: 'architectural' },
      print: {
        storage_path: upload.path,
        sha256: randomBytes(32).toString('hex'),
        size_bytes: TINY_PDF.byteLength,
      },
    })),
  });
  if (fileErr) throw fileErr;
  const prints = (filed as { prints: Array<{ sheetId: string; sheetNumber: string }> }).prints;
  expect(prints).toHaveLength(2);

  // Share ONLY A-101; A-102 stays draft — the client must never see it.
  const shared = prints.find((print) => print.sheetNumber === 'A-101')!;
  const { error: shareErr } = await designer.rpc('set_plan_sheet_state', {
    p_sheet_id: shared.sheetId,
    p_state: 'shared',
  });
  if (shareErr) throw shareErr;
  await designer.auth.signOut();

  return { projectName, sharedTitle, draftTitle };
}

test.describe('client documents — Your drawings (Plan Room 00429)', () => {
  test('shows the current print of shared sheets only, once, with its rev letter', async ({ page }) => {
    const minted = await mintSharedAndDraftSheets();

    // ── Sign in as the seed client ──
    // The golden-hour auth surface is one-time-code-first; the password leg
    // sits behind the "Use email and password instead" reveal.
    await page.goto('/auth/signin');
    await page.locator('input[type="email"]').first().fill('client@patina.dev');
    await page.getByRole('button', { name: /use email and password instead/i }).click();
    await page.locator('#portal-auth-password').fill('password123');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL((url) => !url.pathname.includes('/auth/signin'), { timeout: 30000 });

    await page.goto('/documents');

    // The drawings register for the minted project.
    await expect(page.getByRole('heading', { name: minted.projectName })).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText('Your drawings').first()).toBeVisible();

    // The SHARED sheet shows: number, title, rev letter on the face (a first
    // filing is Rev A), inside a plan-sheet row.
    const sharedRow = page
      .getByTestId('plan-sheet-row')
      .filter({ hasText: minted.sharedTitle });
    await expect(sharedRow).toHaveCount(1);
    await expect(sharedRow.getByLabel('Revision A')).toBeVisible();
    await expect(sharedRow.getByText(/A-101/)).toBeVisible();
    await expect(sharedRow.getByRole('button', { name: `Open ${minted.sharedTitle}` })).toBeVisible();

    // The DRAFT sheet is nowhere on the page — sharing is the client gate.
    await expect(page.getByText(minted.draftTitle)).toHaveCount(0);

    // The drawing renders ONCE: its plan-room Folio row is excluded from the
    // papers list, so the sheet title appears only in the drawings register.
    await expect(page.getByText(minted.sharedTitle)).toHaveCount(1);
  });
});
