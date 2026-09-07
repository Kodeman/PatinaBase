import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

/**
 * R30 — the ORIGIN agreement reaches a homeowner who has no house yet.
 *
 * A design-services agreement is `proposals.project_id NULL` by design until
 * the studio countersigns it: countersigning is what CREATES the project
 * (00331, 00566). So the first paper a household is ever sent arrives BEFORE
 * it has a project — and after the 2026-09-04 client-page cutover every door
 * that reads papers was project-scoped, which left that agreement unreachable
 * on the one surface it was addressed to.
 *
 * This drives the real front door against the LOCAL stack (never Strata),
 * following pay-link.spec.ts's minting discipline: every fixture is created
 * through the honest path, because every shortcut is refused by a guard that
 * exists for a reason —
 *   - the household is a REAL auth user with no project of any kind, because
 *     the whole defect only exists at zero projects and every seeded client
 *     owns houses;
 *   - the agreement is drafted through `upsert_design_services_draft` and
 *     issued through `send_commercial_document` as the signed-in designer,
 *     because `guard_commercial_proposal_authority` refuses a plain UPDATE of
 *     `commercial_state` ("commercial lifecycle may only change through its
 *     canonical RPC"), `send_proposal` refuses a commercial document outright,
 *     and the send refuses a proposal whose `designer_clients` relationship
 *     does not name this household (00423);
 *   - `project_id` is never written, which is the point: this is the origin
 *     agreement's own shape, not a project-bound one with a column blanked.
 *
 * Signing itself is proved in the unit suite (threshold.test.tsx) and against
 * the database directly; what only a browser can prove — and what was broken —
 * is that the paper is REACHABLE and drawn at `#door`. Kept read-only here so
 * the file can run beside every other spec.
 *
 * Cleanup: rows are left in place under a throwaway household. This is the
 * LOCAL stack and `supabase db reset` is the broom.
 */

const LOCAL_URL = 'http://127.0.0.1:54321';

// The local service-role key is NOT written into this file. The repo's
// pre-commit scan rejects any file whose content carries a service_role JWT,
// the Supabase CLI's public demo key included. Export it before running:
//
//   export SUPABASE_SERVICE_ROLE_KEY="$(supabase status -o json | jq -r .SERVICE_ROLE_KEY)"
//   env -u CI pnpm --filter @patina/client-portal test:e2e -- \
//     --project=chromium tests/origin-door.spec.ts
const SERVICE_JWT = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

// The Supabase CLI's fixed local demo ANON key — the one `supabase status`
// prints on every machine, and the one playwright.config.ts already pins.
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/** The seeded designer (supabase/seed/dev-accounts.sql). */
const DESIGNER_ID = 'a0000000-0000-0000-0000-000000000004';
const DESIGNER_EMAIL = 'designer@patina.dev';
const PASSWORD = 'password123';

const AGREEMENT_TITLE = 'Design services agreement — the origin door';
// Short on purpose: Previously prints one line and cuts a label past 58
// characters, and this test reads the label whole.
const SIGNED_TITLE = 'The origin door, signed';
const CONSENT_LINE =
  'I agree to these design-services terms and understand my signature alone does not authorize work until the studio countersigns.';

function service(): SupabaseClient {
  return createClient(LOCAL_URL, SERVICE_JWT, { auth: { persistSession: false } });
}

async function designer(): Promise<SupabaseClient> {
  const client = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: DESIGNER_EMAIL,
    password: PASSWORD,
  });
  if (error) throw new Error(`designer sign-in failed: ${error.message}`);
  return client;
}

/**
 * Email-first sign-in, threshold.spec.ts's helper verbatim: the password leg
 * sits behind a disclosure that is server-rendered before React attaches to
 * it, so a click landing in that window is swallowed with no error at all.
 * Press it until the leg it controls actually opens.
 */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/auth/signin', { waitUntil: 'domcontentloaded' });

  const disclosure = page
    .getByRole('button', {
      name: /sign in with email|use email and password instead/i,
    })
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

/** A throwaway household, and the origin agreement it was sent. */
interface Household {
  email: string;
  id: string;
  agreementId: string;
}

/**
 * One household with zero projects and one issued design-services agreement
 * bound to none. Minted twice — one left standing at `sent`, one signed — so
 * neither test depends on the other having run first.
 */
async function mintOriginAgreement(title: string): Promise<Household> {
  const admin = service();
  const householdEmail = `r30-origin-${randomUUID().slice(0, 8)}@patina.dev`;

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: householdEmail,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: 'Ada Vale', role: 'homeowner' },
  });
  if (userError || !created.user) {
    throw new Error(`household could not be created: ${userError?.message}`);
  }
  const householdId = created.user.id;

  // The profile trigger writes the row; this pins the role the portal gate
  // reads, rather than trusting the metadata round trip.
  const { error: profileError } = await admin
    .from('profiles')
    .update({ role: 'homeowner', full_name: 'Ada Vale' })
    .eq('id', householdId);
  if (profileError) throw new Error(`profile role: ${profileError.message}`);

  // `send_proposal` refuses a proposal whose designer_clients relationship
  // does not name this household (00423:1598-1608).
  const relationshipId = randomUUID();
  const { error: relationshipError } = await admin.from('designer_clients').insert({
    id: relationshipId,
    designer_id: DESIGNER_ID,
    client_id: householdId,
    client_email: householdEmail,
    client_name: 'Ada Vale',
    status: 'active',
  });
  if (relationshipError) {
    throw new Error(`designer relationship: ${relationshipError.message}`);
  }

  const agreementId = randomUUID();
  const studio = await designer();

  // project_id is deliberately absent — this IS the origin agreement.
  const { error: draftError } = await studio.from('proposals').insert({
    id: agreementId,
    designer_id: DESIGNER_ID,
    client_id: householdId,
    designer_client_id: relationshipId,
    title,
    status: 'draft',
    document_kind: 'design_services',
    commercial_state: 'draft',
    total_amount: 1_200_000,
  });
  if (draftError) throw new Error(`agreement draft: ${draftError.message}`);

  const { error: termsError } = await studio.rpc('upsert_design_services_draft', {
    p_proposal_id: agreementId,
    p_terms: {
      scope: 'Full-house interior design services for the Vale residence.',
      deliverables: ['Concept direction', 'Furniture plan'],
      exclusions: ['Structural engineering'],
      billingCeilingCents: 5_000_000,
      billingCadence: 'monthly',
      currency: 'USD',
      terms: 'Standard Patina terms.',
    },
    p_rates: [{ roleName: 'Principal designer', hourlyRateCents: 25_000, sortOrder: 0 }],
  });
  if (termsError) throw new Error(`agreement terms: ${termsError.message}`);

  // A commercial document issues through its OWN rail: `send_proposal` refuses
  // one outright ("commercial documents send through send_commercial_document"),
  // and that rail takes the fingerprint the studio last read, so the send
  // cannot issue a paper that moved under it.
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
  if (sendError) throw new Error(`agreement send: ${sendError.message}`);

  // The defect's precondition, asserted rather than assumed: no house, and a
  // paper bound to none.
  const { data: houses } = await admin
    .from('projects')
    .select('id')
    .eq('client_id', householdId);
  expect(houses ?? []).toHaveLength(0);
  const { data: paper } = await admin
    .from('proposals')
    .select('project_id, commercial_state')
    .eq('id', agreementId)
    .single();
  expect(paper?.project_id).toBeNull();
  expect(paper?.commercial_state).toBe('sent');

  return { email: householdEmail, id: householdId, agreementId };
}

let sent: Household;
let signed: Household;

test.beforeAll(async () => {
  test.skip(
    SERVICE_JWT.length === 0,
    'SUPABASE_SERVICE_ROLE_KEY is not exported — see the header of this file.',
  );

  sent = await mintOriginAgreement(AGREEMENT_TITLE);
  signed = await mintOriginAgreement(SIGNED_TITLE);

  // Her name goes on the second one through the rail the door itself POSTs to
  // (`app/api/proposals/[id]/sign/route.ts` calls exactly this, with exactly
  // these arguments). The RPC records the client's act and nothing else: no
  // project is created, so the paper stays bound to none — which is the state
  // this door had no way of showing.
  const { error: signError } = await service().rpc(
    'sign_design_services_agreement_with_trusted_ip',
    {
      p_proposal_id: signed.agreementId,
      p_signed_name: 'Ada Vale',
      p_client_id: signed.id,
      p_signed_ip: '127.0.0.1',
    },
  );
  if (signError) throw new Error(`agreement signature: ${signError.message}`);

  const admin = service();
  const { data: paper } = await admin
    .from('proposals')
    .select('project_id, commercial_state')
    .eq('id', signed.agreementId)
    .single();
  expect(paper?.commercial_state).toBe('client_signed');
  expect(paper?.project_id).toBeNull();
  const { data: houses } = await admin.from('projects').select('id').eq('client_id', signed.id);
  expect(houses ?? []).toHaveLength(0);
});

test.describe('R30 — the household door with no house', () => {
  test('stands the origin agreement at #door, not "no active projects yet"', async ({
    page,
  }) => {
    await signIn(page, sent.email);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const door = page.locator('#door');
    await expect(door).toBeVisible({ timeout: 20_000 });
    await expect(door.getByRole('heading', { name: AGREEMENT_TITLE })).toBeVisible();
    await expect(page.getByText('One agreement is waiting for you.')).toBeVisible();

    // The same instrument the house hangs: the typed signature and the consent
    // line, not a read-only copy.
    await expect(door.getByLabel('Type your full name')).toBeVisible();
    await expect(door.getByText(CONSENT_LINE)).toBeVisible();
    await expect(door.getByRole('button', { name: /^Sign and accept/ })).toBeVisible();

    // R135: no header, no nav — every act she has is on this page.
    await expect(page.getByRole('navigation')).toHaveCount(0);
  });

  test('lands on that door from the retired /proposals/<id> address', async ({ page }) => {
    await signIn(page, sent.email);
    await page.goto(`/proposals/${sent.agreementId}`, { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(new RegExp(`\\?proposal=${sent.agreementId}`));
    const door = page.locator('#door');
    await expect(door).toBeVisible({ timeout: 20_000 });
    await expect(door.getByRole('heading', { name: AGREEMENT_TITLE })).toBeVisible();
  });

  /* Her signature does not create the house — the studio's countersignature
     does, days later. Between the two the agreement is `client_signed` and
     still bound to no project, and only a pending paper draws a door: she
     signed, came back, and met "no active projects yet" over the paper she
     had just put her name to. The house keeps an accepted document as a line
     in Previously; so does this door now. */
  test('keeps the signed agreement on the next visit, before the countersignature', async ({
    page,
  }) => {
    await signIn(page, signed.email);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const line = page.getByTestId('previously-line');
    await expect(line).toBeVisible({ timeout: 20_000 });
    await expect(line).toContainText(`Design services agreement · ${SIGNED_TITLE}`);
    await expect(line.getByTestId('previously-state')).toHaveText('SIGNED');
    await expect(page.getByTestId('empty-state')).toHaveCount(0);
    // A record, not a second ask: the paper is not still waiting for her hand.
    await expect(page.locator('[data-threshold-unit="door"]')).toHaveCount(0);
  });
});
