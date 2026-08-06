import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

// Plan Room (00429) — /plans/[token] is a login-less, view-only window onto
// ONE issued set for ONE recipient, resolved server-side by sha256(token).
// This drives the real route against the LOCAL stack (never Strata),
// following share-link.spec.ts / field-link.spec.ts:
//   - sheets + prints are minted honestly through the designer RPCs
//     (file_plan_prints demands a real storage object and the sheet pointer
//     moves only under the RPC's maintenance GUC — direct pointer writes are
//     guard-blocked by design);
//   - the issue, its snapshot rows, the transmittal and the token are
//     direct service-role INSERTs (INSERTs are unguarded; only
//     UPDATE/DELETE are frozen), with the raw token known to the test.
//
// Cleanup: the plan-room record tables are immutable (UPDATE/DELETE raise)
// and every FK out of them is RESTRICT, so minted rows CANNOT be deleted —
// deliberately. Everything is created under a throwaway project and left in
// place; this is the LOCAL stack, and `supabase db reset` is the broom.

const LOCAL_URL = 'http://127.0.0.1:54321';
// Well-known supabase-demo service-role + anon JWTs (LOCAL only) — same
// constants share-link.spec.ts / field-link.spec.ts already use.
const SERVICE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

// Seeded dev accounts (supabase/seed/dev-accounts.sql).
const DESIGNER_ID = 'a0000000-0000-0000-0000-000000000004';
const CLIENT_ID = 'a0000000-0000-0000-0000-000000000005';

const admin = createClient(LOCAL_URL, SERVICE_JWT, { auth: { persistSession: false } });

const TINY_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

const hex64 = () => randomBytes(32).toString('hex');

interface MintedSet {
  projectId: string;
  projectName: string;
  token: string;
  tokenId: string;
  sheets: Array<{ printId: string; sheetId: string; number: string }>;
}

async function mintTransmittal(): Promise<MintedSet> {
  const suffix = randomUUID().slice(0, 8);
  const projectId = randomUUID();
  const projectName = `Plans E2E ${suffix}`;

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

  // The RPC refuses paths outside the project's own storage prefix and
  // demands the object actually exist, so upload first (service role).
  const sheetSpecs = [
    { number: 'A-101', title: 'First Floor Plan', discipline: 'architectural' },
    { number: 'E-201', title: 'Lighting Plan', discipline: null },
  ];
  const uploads = sheetSpecs.map((spec, index) => ({
    spec,
    path: `${projectId}/plans/${suffix}-${index}.pdf`,
    sha256: hex64(),
  }));
  for (const upload of uploads) {
    const { error } = await admin.storage
      .from('project-documents')
      .upload(upload.path, TINY_PDF, { contentType: 'application/pdf' });
    if (error) throw error;
  }

  // File + share the sheets as the seeded designer — the honest path.
  const designer = createClient(LOCAL_URL, ANON_JWT, { auth: { persistSession: false } });
  const { error: signInErr } = await designer.auth.signInWithPassword({
    email: 'designer@patina.dev',
    password: 'password123',
  });
  if (signInErr) throw signInErr;

  const { data: filed, error: fileErr } = await designer.rpc('file_plan_prints', {
    p_project_id: projectId,
    p_idempotency_key: `plans-e2e-${suffix}`,
    p_entries: uploads.map((upload) => ({
      kind: 'new_sheet',
      sheet: {
        number: upload.spec.number,
        title: upload.spec.title,
        discipline: upload.spec.discipline,
      },
      print: {
        storage_path: upload.path,
        sha256: upload.sha256,
        size_bytes: TINY_PDF.byteLength,
      },
    })),
  });
  if (fileErr) throw fileErr;
  const prints = (filed as { prints: Array<{ sheetId: string; printId: string; sheetNumber: string; revLetter: string }> }).prints;
  expect(prints).toHaveLength(2);

  for (const print of prints) {
    const { error } = await designer.rpc('set_plan_sheet_state', {
      p_sheet_id: print.sheetId,
      p_state: 'shared',
    });
    if (error) throw error;
  }
  await designer.auth.signOut();

  // Issue + snapshot + transmittal + token: direct INSERTs (unguarded).
  const issueId = randomUUID();
  const { error: issueErr } = await admin.from('plan_issues').insert({
    id: issueId,
    project_id: projectId,
    issue_number: 1,
    name: 'Pricing Set',
    idempotency_key: `plans-e2e-issue-${suffix}`,
    request_hash: hex64(),
    set_checksum: hex64(),
    sheet_count: prints.length,
  });
  if (issueErr) throw issueErr;

  for (const print of prints) {
    const upload = uploads.find((u) => u.spec.number === print.sheetNumber)!;
    const { error } = await admin.from('plan_issue_prints').insert({
      issue_id: issueId,
      sheet_id: print.sheetId,
      print_id: print.printId,
      sheet_number: upload.spec.number,
      sheet_title: upload.spec.title,
      rev_letter: print.revLetter,
      sha256: upload.sha256,
    });
    if (error) throw error;
  }

  const transmittalId = randomUUID();
  const { error: transmittalErr } = await admin.from('plan_transmittals').insert({
    id: transmittalId,
    project_id: projectId,
    issue_id: issueId,
    party_display_name: 'Sal Reyes',
    party_company: `Reyes Tile Co. ${suffix}`,
    purpose: 'pricing',
  });
  if (transmittalErr) throw transmittalErr;

  const token = randomBytes(32).toString('hex');
  const { data: tokenRow, error: tokenErr } = await admin
    .from('plan_transmittal_tokens')
    .insert({
      transmittal_id: transmittalId,
      project_id: projectId,
      token_hash: createHash('sha256').update(token).digest('hex'),
      status: 'active',
    })
    .select('id')
    .single();
  if (tokenErr) throw tokenErr;

  return {
    projectId,
    projectName,
    token,
    tokenId: tokenRow!.id as string,
    sheets: prints.map((print) => ({
      printId: print.printId,
      sheetId: print.sheetId,
      number: print.sheetNumber,
    })),
  };
}

test.describe('plan transmittal guest link (Plan Room 00429)', () => {
  test('renders the set for the holder, signs prints, and dies on revoke', async ({ page }) => {
    const minted = await mintTransmittal();

    // ── The holder opens the link (no auth) ──
    await page.goto(`/plans/${minted.token}`);
    await expect(
      page.getByRole('heading', { name: new RegExp(`Reyes Tile Co\\.`) }),
    ).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/You were sent/)).toBeVisible();
    await expect(page.getByText(/Pricing Set for pricing on/)).toBeVisible();
    // The vitals line names the project and counts the sheets.
    await expect(page.getByText(new RegExp(`${minted.projectName} · Pricing Set · 2 sheets`))).toBeVisible();
    // Sheet rows with their numbers.
    await expect(page.getByText('A-101')).toBeVisible();
    await expect(page.getByText('First Floor Plan')).toBeVisible();
    await expect(page.getByText('E-201')).toBeVisible();
    // Nothing was superseded: the current-set foot shows, no amber band.
    await expect(page.getByText('This set is current as of today.')).toBeVisible();
    await expect(page.getByTestId('plans-superseded-band')).toHaveCount(0);
    // No storage URL leaks into the DOM — Open goes through the print route.
    const firstOpen = page.getByRole('link', { name: 'Open' }).first();
    await expect(firstOpen).toHaveAttribute(
      'href',
      new RegExp(`/plans/${minted.token}/print/`),
    );

    // ── The print route signs and redirects (307), privately ──
    const printResponse = await page.request.get(
      `/plans/${minted.token}/print/${minted.sheets[0].printId}`,
      { maxRedirects: 0 },
    );
    expect(printResponse.status()).toBe(307);
    expect(printResponse.headers()['location']).toContain('/storage/v1/object/sign/');
    expect(printResponse.headers()['cache-control']).toBe('private, no-store, max-age=0');
    // next.config.js pins a global Referrer-Policy (strict-origin-when-cross-
    // origin) over every response, overriding the route's own no-referrer on
    // the live path — either value keeps the token path out of cross-origin
    // referrers, so assert the set rather than one spelling.
    expect(['no-referrer', 'strict-origin-when-cross-origin']).toContain(
      printResponse.headers()['referrer-policy'],
    );
    expect(printResponse.headers()['x-robots-tag']).toBe('noindex, nofollow');

    // ── A print the transmittal does not carry bounces to the dead link (303) ──
    const wrongPrint = await page.request.get(
      `/plans/${minted.token}/print/${randomUUID()}`,
      { maxRedirects: 0 },
    );
    expect(wrongPrint.status()).toBe(303);
    expect(wrongPrint.headers()['location']).toContain(`/plans/${minted.token}?unavailable=1`);

    // ── Revoke → the link is dead (tokens are the one mutable table) ──
    const { error: revokeErr } = await admin
      .from('plan_transmittal_tokens')
      .update({ status: 'revoked' })
      .eq('id', minted.tokenId);
    expect(revokeErr).toBeNull();

    await page.goto(`/plans/${minted.token}`);
    await expect(page.getByTestId('plans-dead-link')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/isn.t available/)).toBeVisible();
    await expect(page.getByText('First Floor Plan')).toHaveCount(0);

    // And the revoked link's print route dies the same way.
    const revokedPrint = await page.request.get(
      `/plans/${minted.token}/print/${minted.sheets[0].printId}`,
      { maxRedirects: 0 },
    );
    expect(revokedPrint.status()).toBe(303);
  });

  test('a garbage token is a calm dead link', async ({ page }) => {
    await page.goto(`/plans/${'0'.repeat(64)}`);
    await expect(page.getByTestId('plans-dead-link')).toBeVisible({ timeout: 20000 });
  });

  test('a malformed token is the same calm dead link', async ({ page }) => {
    await page.goto('/plans/not-a-token');
    await expect(page.getByTestId('plans-dead-link')).toBeVisible({ timeout: 20000 });
  });
});
