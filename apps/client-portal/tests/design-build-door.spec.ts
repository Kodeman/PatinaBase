import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

import { HALVORSEN_DESIGN_BUILD_CONSENT } from '../src/components/threshold/consent-copy';

/**
 * Wave 3, P13 / R15 — SIGN, THEN OFFER. Never gate.
 *
 * Three claims only a browser against the real rails can settle, and the first
 * of them is the one an HTTP 200 cannot:
 *
 *   1. WHICH RPC RAN. The sign route's allowlist is derived from
 *      `COMMERCIAL_DOCUMENT_KINDS`, so `design_build` was ADMITTED the moment
 *      the array widened — while the routing below it was a `furnishings →
 *      trade_scope → else` chain. A turnkey signature falling into that `else`
 *      is signed as a plain design-services agreement, with no deposit and no
 *      design-build validation, and answers exactly the same 200 as the
 *      correct path. So this asserts against the DATABASE:
 *      `commercial_document_signatures.metadata->>'via'` plus a deposit draw
 *      that only the turnkey arm mints.
 *
 *   2. THE OFFER APPEARS AFTER THE SIGNATURE. Not before, not instead of it.
 *
 *   3. THE OFFER IS NOT REQUIRED. Ignore it, reload the door, and the
 *      signature still stands, the record still reads, and nothing is blocked
 *      behind an unpaid invoice — the deposit is standing in her letterbox
 *      with its own `/pay/<token>` act, which is where money lives on the
 *      next visit (walk step 13, amended round 1: the post-signature sentence
 *      is the moment of signing; the letter is what persists).
 *
 * Fixtures are minted through the honest rails, `origin-door.spec.ts`'s
 * discipline verbatim — every shortcut here is refused by a guard that exists
 * for a reason. The one difference is the attestation (R10): a design-build
 * template cannot be materialized or sent without a live
 * `studio_license_attestations` row, so this seeds one for the seeded studio
 * and removes it again afterwards.
 *
 * LOCAL STACK ONLY. Never Strata.
 *
 * Chromium is the client-portal config's only project, so no pin is needed.
 */

const LOCAL_URL = 'http://127.0.0.1:54321';

// The local service-role key is NOT written into this file — the repo's
// pre-commit scan rejects any file carrying a service_role JWT, the CLI's
// public demo key included. Export it before running:
//
//   export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o json | jq -r .SERVICE_ROLE_KEY)"
//   env -u CI pnpm --filter @patina/client-portal test:e2e -- \
//     --workers=1 tests/design-build-door.spec.ts
const SERVICE_JWT = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

/** The Supabase CLI's fixed local demo ANON key, as playwright.config.ts pins it. */
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/** The seeded designer (supabase/seed/dev-accounts.sql). */
const DESIGNER_ID = 'a0000000-0000-0000-0000-000000000004';
const DESIGNER_EMAIL = 'designer@patina.dev';
const PASSWORD = 'password123';

const AGREEMENT_TITLE = 'Halvorsen kitchen and mudroom';

/** The Halvorsen figures, `source/fixtures.json`, to the cent. */
const GMP_CENTS = 8_413_400;
const DEPOSIT_NET_CENTS = 841_340;

/** `HOLD_MS` in `components/threshold/instruments/scored-action.tsx`. */
const HOLD_MS = 900;

function service(): SupabaseClient {
  return createClient(LOCAL_URL, SERVICE_JWT, { auth: { persistSession: false } });
}

async function designer(): Promise<SupabaseClient> {
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: DESIGNER_EMAIL,
    password: PASSWORD,
  });
  if (error) throw new Error(`designer sign-in failed: ${error.message}`);
  return client;
}

/** Email-first sign-in — `origin-door.spec.ts`'s helper verbatim. */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/auth/signin', { waitUntil: 'domcontentloaded' });

  const disclosure = page
    .getByRole('button', { name: /sign in with email|use email and password instead/i })
    .first();
  const password = page.getByLabel(/password/i).first();
  await expect(async () => {
    await disclosure.waitFor({ state: 'visible', timeout: 30_000 });
    await disclosure.click();
    await password.waitFor({ state: 'visible', timeout: 5_000 });
  }).toPass({ timeout: 120_000 });

  await page.getByLabel(/email/i).first().fill(email);
  await password.fill(PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/signin'), {
    timeout: 60_000,
    waitUntil: 'domcontentloaded',
  });
}

const COST_LINES = [
  { id: 'cabinetryAndMillwork', label: 'Cabinetry & millwork', category: 'sub', basisCents: 3_800_000 },
  { id: 'electrical', label: 'Electrical', category: 'sub', basisCents: 950_000 },
  { id: 'plumbing', label: 'Plumbing', category: 'sub', basisCents: 720_000 },
  { id: 'generalConditions', label: 'General conditions / site', category: 'general_conditions', basisCents: 630_000 },
  { id: 'tile', label: 'Tile allowance', category: 'allowance', basisCents: 400_000 },
  { id: 'plumbingFixtures', label: 'Plumbing fixtures allowance', category: 'allowance', basisCents: 350_000 },
  { id: 'lighting', label: 'Lighting allowance', category: 'allowance', basisCents: 280_000 },
];

/** The cost lines, summed — and `GMP_CENTS` is this plus the 18% fee. */
const COST_BASIS_CENTS = COST_LINES.reduce((sum, line) => sum + line.basisCents, 0);

const PARTS = [
  {
    kind: 'schedule',
    variant: 'pricing_basis',
    partKey: 'patina.pricing_basis',
    title: 'Pricing basis',
    required: true,
    clientVisible: true,
    payload: {
      basis: 'cost_plus_gmp',
      feeBps: 1800,
      // The sum of COST_LINES, to the cent. `_validate_pricing_basis_payload`
      // refuses a pricing basis whose stated cost basis does not equal the
      // lines beneath it, so the fixture states it rather than leaving the
      // send door to guess ("The cost basis must equal the cost lines beneath
      // it, to the cent.").
      costBasisCents: COST_BASIS_CENTS,
      gmpCents: GMP_CENTS,
      subDisclosure: 'closed_book',
      costLines: COST_LINES,
    },
  },
  {
    kind: 'schedule',
    variant: 'draws',
    partKey: 'patina.draws',
    title: 'Draw schedule',
    required: true,
    clientVisible: true,
    payload: {
      retainageBps: 500,
      draws: [
        { key: 'deposit', label: 'Deposit at signing', sortOrder: 0, pct: 10, retainageApplies: false },
        { key: 'roughIn', label: 'Rough-in', sortOrder: 1, pct: 30, retainageApplies: true },
        { key: 'cabinetsSet', label: 'Cabinets set', sortOrder: 2, pct: 40, retainageApplies: true },
        { key: 'substantialCompletion', label: 'Substantial completion', sortOrder: 3, pct: 20, retainageApplies: true },
      ],
    },
  },
  {
    kind: 'clause',
    variant: null,
    partKey: 'patina.sub_disclosure',
    title: 'Who is doing the work',
    required: true,
    clientVisible: true,
    payload: { body: 'The studio holds each trade agreement directly.' },
  },
  {
    kind: 'clause',
    variant: null,
    partKey: 'patina.terms',
    title: 'Terms',
    required: true,
    clientVisible: true,
    payload: { body: 'Each draw is due on presentation.' },
  },
];

interface Household {
  email: string;
  id: string;
  agreementId: string;
}

/**
 * The studio's licensing attestation (R10). Patina stores it and never
 * verifies it; without a live row `send_commercial_document` refuses the
 * design-build arm, which is the gate this fixture has to satisfy rather than
 * bypass.
 */
async function attestLicense(): Promise<string | null> {
  const admin = service();
  const { data: membership } = await admin
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', DESIGNER_ID)
    .limit(1)
    .maybeSingle();
  const studioId = (membership as { organization_id?: string } | null)?.organization_id ?? null;
  if (!studioId) return null;

  const { error } = await admin.from('studio_license_attestations').upsert({
    studio_id: studioId,
    credential_type: 'WI Dwelling Contractor',
    credential_number: '1234567',
    state: 'WI',
    expires_on: '2099-03-31',
    attested_by: DESIGNER_ID,
  });
  if (error) throw new Error(`licensing attestation: ${error.message}`);
  return studioId;
}

async function mintTurnkeyAgreement(): Promise<Household> {
  const admin = service();
  const householdEmail = `w3-turnkey-${randomUUID().slice(0, 8)}@patina.dev`;

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: householdEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Ana Halvorsen', role: 'homeowner' },
  });
  if (userError || !created.user) {
    throw new Error(`household could not be created: ${userError?.message}`);
  }
  const householdId = created.user.id;

  const { error: profileError } = await admin
    .from('profiles')
    .update({ role: 'homeowner', full_name: 'Ana Halvorsen' })
    .eq('id', householdId);
  if (profileError) throw new Error(`profile role: ${profileError.message}`);

  const relationshipId = randomUUID();
  const { error: relationshipError } = await admin.from('designer_clients').insert({
    id: relationshipId,
    designer_id: DESIGNER_ID,
    client_id: householdId,
    client_email: householdEmail,
    client_name: 'Ana Halvorsen',
    status: 'active',
  });
  if (relationshipError) throw new Error(`designer relationship: ${relationshipError.message}`);

  const agreementId = randomUUID();
  const studio = await designer();

  const { error: draftError } = await studio.from('proposals').insert({
    id: agreementId,
    designer_id: DESIGNER_ID,
    client_id: householdId,
    designer_client_id: relationshipId,
    title: AGREEMENT_TITLE,
    status: 'draft',
    document_kind: 'design_build',
    commercial_state: 'draft',
    total_amount: GMP_CENTS,
  });
  if (draftError) throw new Error(`turnkey draft: ${draftError.message}`);

  const { error: partsError } = await studio.rpc('upsert_agreement_parts', {
    p_proposal_id: agreementId,
    p_parts: PARTS,
  });
  if (partsError) throw new Error(`turnkey parts: ${partsError.message}`);

  const { data: snapshot, error: snapshotError } = await studio.rpc(
    'get_commercial_document_send_snapshot',
    { p_proposal_id: agreementId },
  );
  if (snapshotError) throw new Error(`send snapshot: ${snapshotError.message}`);
  const fingerprint =
    (snapshot as { fingerprint?: string; documentFingerprint?: string } | null)
      ?.documentFingerprint ??
    (snapshot as { fingerprint?: string } | null)?.fingerprint ??
    null;

  const { error: sendError } = await studio.rpc('send_commercial_document', {
    p_proposal_id: agreementId,
    p_expected_fingerprint: fingerprint,
    p_personal_message: null,
    p_valid_until: null,
  });
  if (sendError) throw new Error(`turnkey send: ${sendError.message}`);

  const { data: paper } = await admin
    .from('proposals')
    .select('document_kind, commercial_state')
    .eq('id', agreementId)
    .single();
  expect(paper?.document_kind).toBe('design_build');
  expect(paper?.commercial_state).toBe('sent');

  return { email: householdEmail, id: householdId, agreementId };
}

let household: Household;
let studioId: string | null = null;

test.beforeAll(async () => {
  test.skip(
    SERVICE_JWT.length === 0,
    'SUPABASE_SERVICE_ROLE_KEY is not exported — see the header of this file.',
  );

  // The turnkey class is a Wave 3 migration. Skipping LOUDLY, by name, rather
  // than letting the fixture fail with a CHECK violation nobody can read: this
  // spec is a real gate the moment the migration is on the local stack.
  //
  // AND THE STEWARD CAN CLOSE THE ESCAPE. E2E-2 is a named wave gate, so a run
  // that quietly skips is indistinguishable from a run that passed. Export
  // `PATINA_W3_TURNKEY_GATE=1` at integration and the missing migration is a
  // FAILURE with the same sentence, not a skip.
  const probe = await service().from('agreement_draw_invoices').select('id').limit(1);
  const missing =
    probe.error !== null
      ? `the Wave 3 turnkey migration is not applied to this local stack (${probe.error.message}) — run pnpm supabase:reset first.`
      : null;
  if (missing && process.env.PATINA_W3_TURNKEY_GATE === '1') throw new Error(missing);
  test.skip(missing !== null, missing ?? '');

  studioId = await attestLicense();
  household = await mintTurnkeyAgreement();
});

test.afterAll(async () => {
  // The attestation is the one fixture that touches a SEEDED row's studio
  // rather than a throwaway household, so it is taken back out. Everything
  // else lives under a throwaway account and `supabase db reset` is the broom.
  if (studioId) {
    await service().from('studio_license_attestations').delete().eq('studio_id', studioId);
  }
});

test.describe('P13 — the deposit is offered after the signature, never before', () => {
  test('signs through the turnkey arm, then offers the deposit', async ({ page }) => {
    await signIn(page, household.email);
    await page.goto('/#door', { waitUntil: 'domcontentloaded' });

    const door = page.locator('[data-threshold-unit="door"]');
    await expect(door).toBeVisible({ timeout: 30_000 });
    await expect(door).toContainText(AGREEMENT_TITLE);

    // The paper reads as a turnkey paper: the price, the draws, the trades.
    await expect(page.getByTestId('door-consent-line')).toContainText('design-build terms');
    // The words BOTH halves say. The door renders `composeConsentLine` and the
    // signature row keeps `compose_agreement_consent`'s; this is the exported
    // pin (`HALVORSEN_DESIGN_BUILD_CONSENT`) the SQL test asserts against too,
    // so a browser reading a different sentence than the database filed is a
    // failure here rather than a discovery later (round 2, N1).
    await expect(page.getByTestId('door-consent-line')).toHaveText(
      HALVORSEN_DESIGN_BUILD_CONSENT,
    );
    // Never the generic fallback — that sentence is what a missed branch
    // looks like on the signing surface.
    await expect(page.getByTestId('door-consent-line')).not.toContainText(
      'the scope and investment in this proposal',
    );

    // Nothing about money before her name is on it.
    await expect(page.getByTestId('deposit-offer')).toHaveCount(0);

    await page.getByTestId('door-sign-name').fill('Ana Halvorsen');
    // This part set carries no attachment, so the consent line is the only
    // tick on the leaf. An attachment would add its own above it.
    await expect(page.getByRole('checkbox')).toHaveCount(1);
    await page.getByRole('checkbox').check();

    const act = page.getByRole('button', { name: /^Sign and accept/ });
    await expect(act).toBeEnabled();

    // A HELD act, not a tapped one. The wait below is the GESTURE'S OWN
    // DURATION — `HOLD_MS` is the component's constant and the press has to
    // outlast it — not a guess at when something will finish. Everything that
    // follows is a web-first assertion.
    const box = await act.boundingBox();
    if (!box) throw new Error('the act has no box to press');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(HOLD_MS + 400);
    await page.mouse.up();

    await expect(page.getByTestId('door-receipt')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('door-receipt')).toContainText('has your signature');

    // (2) THE OFFER, AFTER THE SIGNATURE.
    const offer = page.getByTestId('deposit-offer');
    await expect(offer).toBeVisible({ timeout: 30_000 });
    await expect(offer).toContainText('Your deposit is ready — $8,413.40');
    const pay = page.getByRole('link', { name: 'Pay the deposit' });
    await expect(pay).toHaveAttribute('href', /^\/pay\/[0-9a-f]{64}$/);

    // (1) WHICH RPC RAN — from the database, never from the HTTP status. The
    // fail-open misroute produces an identical 200 and an identical receipt.
    const admin = service();
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from('commercial_document_signatures')
            .select('party_role, metadata')
            .eq('proposal_id', household.agreementId)
            .eq('party_role', 'client')
            .maybeSingle();
          return (data as { metadata?: { via?: string } } | null)?.metadata?.via ?? null;
        },
        { timeout: 30_000 },
      )
      .toBe('sign_design_services_agreement');

    const { data: paper } = await admin
      .from('proposals')
      .select('commercial_state, document_kind, project_id')
      .eq('id', household.agreementId)
      .single();
    expect(paper?.commercial_state).toBe('client_signed');
    expect(paper?.document_kind).toBe('design_build');
    // A turnkey prime is an ORIGIN agreement: the project appears at
    // countersignature, not at her signature.
    expect(paper?.project_id).toBeNull();

    // The deposit draw the turnkey arm minted — and only the deposit. A
    // design-services signature mints none of these at all, so a row here is
    // itself proof the turnkey branch ran.
    const { data: draws } = await admin
      .from('agreement_draw_invoices')
      .select('draw_key, net_cents, invoice_id')
      .eq('proposal_id', household.agreementId)
      .not('invoice_id', 'is', null);
    expect(draws ?? []).toHaveLength(1);
    expect((draws ?? [])[0]?.draw_key).toBe('deposit');
    expect((draws ?? [])[0]?.net_cents).toBe(DEPOSIT_NET_CENTS);
  });

  test('the offer is an offer: ignore it and the signature still stands', async ({ page }) => {
    await signIn(page, household.email);
    await page.goto('/#door', { waitUntil: 'domcontentloaded' });

    // Nothing was paid in the previous test and nothing is held behind it: the
    // record of her signature is on the page, and no surface says the
    // agreement is incomplete for want of money.
    await expect(page.getByText(AGREEMENT_TITLE).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/no active projects yet/i)).toHaveCount(0);
    await expect(page.getByText(/payment required/i)).toHaveCount(0);
    await expect(page.getByText(/unavailable/i)).toHaveCount(0);

    // AND THE MONEY IS STILL REACHABLE. The deposit invoice is project-less
    // exactly as the prime is, so it stands in this door's own letterbox with
    // its own pay link — the persistent half of walk step 13. She is asked
    // for nothing: it is a letter she may open, beside a record that is
    // already complete.
    const letterbox = page.getByTestId('letterbox');
    await expect(letterbox).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Open the invoice' })).toHaveAttribute(
      'href',
      /^\/pay\/[0-9a-f]{64}$/,
    );

    const { data: paper } = await service()
      .from('proposals')
      .select('commercial_state')
      .eq('id', household.agreementId)
      .single();
    expect(paper?.commercial_state).toBe('client_signed');

    // The deposit invoice is issued and unpaid. That is the whole point: it
    // was offered, not required. Read through the draw ledger, which is what
    // links a draw to its invoice.
    const { data: draw } = await service()
      .from('agreement_draw_invoices')
      .select('invoice_id')
      .eq('proposal_id', household.agreementId)
      .eq('draw_key', 'deposit')
      .single();
    const invoiceId = (draw as { invoice_id?: string } | null)?.invoice_id ?? null;
    expect(invoiceId).not.toBeNull();
    const { data: invoice } = await service()
      .from('invoices')
      .select('status')
      .eq('id', invoiceId as string)
      .single();
    expect((invoice as { status: string } | null)?.status).toBe('sent');
  });
});
