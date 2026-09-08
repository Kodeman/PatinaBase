import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// The Agreement, Composed · Wave 3 · P14 / R16 — /trade/[token] is a
// login-less page a SUBCONTRACTOR opens from the link their studio sends, and
// signs on. This drives the real route against the LOCAL stack (never
// Strata), following plans-link.spec.ts / field-link.spec.ts / pay-link.spec.ts.
//
// Every fixture is minted the honest way:
//   - the agreement is INSERTed (INSERTs are unguarded; the content freeze
//     trigger refuses UPDATEs once state <> 'draft'), already at 'sent',
//     because send_trade_agreement is an `authenticated` studio RPC and this
//     spec has no studio session;
//   - the token is minted through `mint_trade_agreement_token`, which is
//     service_role-only and is the ONLY place the raw token ever exists —
//     the table stores sha256(token) alone, so a test cannot fabricate one;
//   - the sub browses in a FRESH BrowserContext with no Patina cookies at all,
//     which is the whole claim being tested: no login, ever.
//
// NOTE on HTTP status: this app's App Router + streaming metadata shell means
// notFound() lands the correct not-found UI while the wire-level status the
// server already flushed stays 200 — see field-link.spec.ts's note. Content
// assertions only, matching that convention.
//
// Cleanup: rows are left in place under a throwaway project. This is the
// LOCAL stack and `supabase db reset` is the broom.

const LOCAL_URL = 'http://127.0.0.1:54321';
// Well-known supabase-demo service-role JWT (LOCAL only), read from the
// environment the way playwright.config.ts explains: the repo's secret scan
// rejects any file carrying a service_role JWT, demo key included.
const SERVICE_JWT = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// Seeded dev accounts (supabase/seed/dev-accounts.sql).
const DESIGNER_ID = 'a0000000-0000-0000-0000-000000000004';
const CLIENT_ID = 'a0000000-0000-0000-0000-000000000005';

const admin = () => {
  expect(
    SERVICE_JWT,
    'export SUPABASE_SERVICE_ROLE_KEY from `supabase status` before running this spec',
  ).toBeTruthy();
  return createClient(LOCAL_URL, SERVICE_JWT, { auth: { persistSession: false } });
};

interface MintedAgreement {
  agreementId: string;
  projectId: string;
  projectName: string;
  contactCompany: string;
  token: string;
}

/** The designer's active design studio, resolved the way the resolver does. */
async function designerStudioId(): Promise<string> {
  const { data, error } = await admin().rpc('resolve_studio_identity', {
    p_designer_id: DESIGNER_ID,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const studioId = (row as { studio_id?: string } | null)?.studio_id;
  expect(studioId, 'the seeded designer must belong to an active design studio').toBeTruthy();
  return studioId as string;
}

/**
 * The Halvorsen cabinetry sub: $38,000, 21 days, 5% retainage, pay-when-paid
 * 7 days, insurance required, conditional-then-unconditional waivers — the
 * walk script's own numbers, so a drift in what the sub is shown fails here.
 */
async function mintTradeAgreement(options: { state?: 'sent' | 'void' } = {}): Promise<MintedAgreement> {
  const { state = 'sent' } = options;
  const db = admin();
  const suffix = randomUUID().slice(0, 8);
  const studioId = await designerStudioId();
  const projectId = randomUUID();
  // The project name is minted deliberately client-shaped: the assertion below
  // is that it NEVER reaches the sub's page (R13 — a project name carries the
  // client's surname).
  const projectName = `The Halvorsen Residence ${suffix}`;
  const contactCompany = `Halloran Cabinet Co. ${suffix}`;

  const { error: projectErr } = await db.from('projects').insert({
    id: projectId,
    name: projectName,
    status: 'active',
    budget_cents: 0,
    design_fee_cents: 0,
    client_visibility_tier: 'milestone',
    client_id: CLIENT_ID,
    designer_id: DESIGNER_ID,
    created_by: DESIGNER_ID,
    // The seeded designer owns TWO active studios, so the stamp is explicit —
    // set_project_studio_id cannot discover a single candidate (pay-link.spec.ts).
    studio_id: studioId,
  });
  if (projectErr) throw projectErr;

  const { data: contact, error: contactErr } = await db
    .from('studio_contacts')
    .insert({
      organization_id: studioId,
      entity_kind: 'company',
      contact_kind: 'sub',
      company_name: contactCompany,
      email: `cabinetry+${suffix}@example.test`,
      specialties: ['millwork'],
      created_by: DESIGNER_ID,
    })
    .select('id')
    .single();
  if (contactErr) throw contactErr;

  const agreementId = randomUUID();
  const { error: agreementErr } = await db.from('studio_trade_agreements').insert({
    id: agreementId,
    project_id: projectId,
    studio_id: studioId,
    contact_id: contact!.id,
    contact_display_name: contactCompany,
    contact_company_name: contactCompany,
    contact_email: `cabinetry+${suffix}@example.test`,
    trade: 'millwork',
    title: 'Cabinetry & millwork',
    scope: 'Build and install the kitchen and mudroom casework as drawn.',
    price_cents: 3_800_000,
    currency: 'USD',
    schedule: { startOn: '2026-10-12', durationDays: 21, sequencing: 'After rough-in inspection.' },
    retainage_bps: 500,
    pay_when_paid_days: 7,
    insurance_certificate_required: true,
    lien_waiver_policy: 'conditional_then_unconditional',
    // R46 — MINT AT 'sent', ALWAYS. `mint_trade_agreement_token` refuses an
    // agreement whose state is not `sent` or `signed` ("trade agreement % is
    // not sent and cannot be linked", 00579), so a fixture that inserted the
    // row at `void` threw before the browser ever opened — which is why the
    // fourth case had never run. The withdrawal happens after the mint, out of
    // band as service_role, which is also the path production takes:
    // `guard_trade_agreement_authored` freezes the content columns at `sent`
    // but leaves `state`, `voided_at` and `void_reason` alone.
    state: 'sent',
    sent_at: new Date().toISOString(),
    created_by: DESIGNER_ID,
  });
  if (agreementErr) throw agreementErr;

  // The raw token exists exactly once, here, and never again — the table
  // stores only sha256(token).
  const { data: minted, error: mintErr } = await db.rpc('mint_trade_agreement_token', {
    p_agreement_id: agreementId,
  });
  if (mintErr) throw mintErr;

  if (state === 'void') {
    const { error: voidErr } = await db
      .from('studio_trade_agreements')
      .update({ state: 'void', voided_at: new Date().toISOString(), void_reason: 'withdrawn' })
      .eq('id', agreementId);
    if (voidErr) throw voidErr;
  }
  const mintedRow = (Array.isArray(minted) ? minted[0] : minted) as { token?: string } | null;
  expect(mintedRow?.token, 'mint_trade_agreement_token must return the raw token once').toBeTruthy();

  return {
    agreementId,
    projectId,
    projectName,
    contactCompany,
    token: mintedRow!.token as string,
  };
}

test.describe('trade agreement guest link (Wave 3 · P14, R16)', () => {
  test('the sub signs with no session, sees only their own terms, and the link is spent', async ({
    browser,
  }) => {
    const minted = await mintTradeAgreement();

    // A FRESH context: the sub has no Patina account and must never borrow one.
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const response = await page.goto(`/trade/${minted.token}`);
      // The middleware stamps the bearer-URL HTML itself uncacheable and
      // unindexable — a cached copy would keep serving a spent link's form.
      expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');

      const cookies = await context.cookies();
      expect(cookies.filter((cookie) => cookie.name.startsWith('sb-'))).toHaveLength(0);

      // THEIR price and their terms.
      await expect(page.getByText('Cabinetry & millwork').first()).toBeVisible({ timeout: 20000 });
      await expect(page.getByText('$38,000')).toBeVisible();
      await expect(page.getByText(/5% of each payment is held back/)).toBeVisible();
      await expect(page.getByText(/within 7 days of being paid/)).toBeVisible();
      await expect(page.getByText(/certificate of insurance is required/)).toBeVisible();

      // R13: not the client's money, not the client's house, not a bid.
      const body = await page.locator('body').innerText();
      expect(body).not.toContain('Halvorsen');
      expect(body).not.toContain('$84,134');
      expect(body).not.toContain('84134');

      // Sign: type the name, then HOLD the act — a tap is deliberately not
      // enough for a terminal act (P-18).
      await page.getByTestId('trade-agreement-signed-name').fill('Dana Hall');
      const signAct = page.getByRole('button', { name: /sign this agreement/i });
      await expect(signAct).toBeEnabled();
      await signAct.hover();
      await page.mouse.down();
      // The hold's own length plus a beat, awaited on the OUTCOME rather than
      // the clock: the receipt is what proves the act was taken.
      await expect(page.getByTestId('trade-agreement-receipt')).toBeVisible({ timeout: 20000 });
      await page.mouse.up();

      await expect(page.getByText('Signed.')).toBeVisible();
      await expect(page.getByText(/Dana Hall/)).toBeVisible();

      // The database is the authority, not the receipt on screen.
      await expect
        .poll(
          async () => {
            const { data } = await admin()
              .from('studio_trade_agreements')
              .select('state')
              .eq('id', minted.agreementId)
              .single();
            return (data as { state?: string } | null)?.state ?? null;
          },
          { timeout: 20000 },
        )
        .toBe('signed');

      const { data: signatures } = await admin()
        .from('studio_trade_agreement_signatures')
        .select('party, signed_name, evidence_fingerprint')
        .eq('agreement_id', minted.agreementId);
      expect(signatures).toHaveLength(1);
      expect(signatures![0].party).toBe('sub');
      expect(signatures![0].signed_name).toBe('Dana Hall');
      expect(String(signatures![0].evidence_fingerprint)).toHaveLength(64);

      // The link is spent in the same transaction as the signature.
      const { data: tokens } = await admin()
        .from('studio_trade_agreement_tokens')
        .select('status')
        .eq('agreement_id', minted.agreementId);
      expect(tokens?.every((row) => (row as { status: string }).status === 'revoked')).toBe(true);

      // R46 — A SPENT TOKEN CANNOT RE-OPEN. `sign_trade_agreement_by_token`
      // revokes the token in the signing transaction and
      // `resolve_trade_agreement_link` requires `status = 'active'`, so the
      // same URL is a dead link on the second load. Build-sheet §8 step 16
      // said "a fresh load of the same URL still shows the receipt"; that
      // sentence is corrected — a RE-SENT link shows the receipt, the spent
      // one does not.
      const second = await context.newPage();
      await second.goto(`/trade/${minted.token}`);
      await expect(second.getByText(/page not found/i)).toBeVisible({ timeout: 20000 });
      await expect(second.getByTestId('trade-agreement-receipt')).toHaveCount(0);
      await expect(second.getByTestId('trade-agreement-signed-name')).toHaveCount(0);
      await expect(second.getByRole('button', { name: /sign this agreement/i })).toHaveCount(0);
      await second.close();
    } finally {
      await context.close();
    }
  });

  test('a well-formed token with no matching agreement is a calm dead link', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`/trade/${'deadbeef'.repeat(8)}`);
      await expect(page.getByText(/page not found/i)).toBeVisible({ timeout: 20000 });
    } finally {
      await context.close();
    }
  });

  test('a malformed token never reaches the DB and is also a dead link', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto('/trade/not-a-real-token');
      await expect(page.getByText(/page not found/i)).toBeVisible({ timeout: 20000 });
    } finally {
      await context.close();
    }
  });

  test('a withdrawn agreement resolves to nothing, not to a form', async ({ browser }) => {
    const minted = await mintTradeAgreement({ state: 'void' });
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`/trade/${minted.token}`);
      await expect(page.getByText(/page not found/i)).toBeVisible({ timeout: 20000 });
      const body = await page.locator('body').innerText();
      expect(body).not.toContain('$38,000');
    } finally {
      await context.close();
    }
  });
});
