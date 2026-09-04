import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The Threshold (spec §7) — the homeowner's project page as ONE chrome-less
 * page, driven against the LOCAL stack and the fixture that
 * supabase/seed/the-client-page.sql lays on `client@patina.dev`'s house.
 *
 * Everything asserted below is a figure that seed put in the database, not a
 * number copied out of the mockup: the authorization total, the maker whose
 * finished work is waiting, the draw her acceptance releases, the invoice
 * balance and its due day, and the chapter the house stands in. The unit
 * suite's five facts come from ITS OWN fixture and are different numbers on
 * purpose — a spec that reused them would be testing the mockup, not the seed.
 *
 * LOCAL ONLY. Export the local service-role key before running — the seed
 * reshaping below needs it, and it is read from the environment rather than
 * written here because the repo's pre-commit scan rejects any file whose
 * content carries a service_role JWT, the well-known demo key included:
 *
 *   export SUPABASE_SERVICE_ROLE_KEY="$(cd supabase && supabase status -o json \
 *     | python3 -c 'import json,sys; print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')"
 */

const LOCAL_URL = 'http://127.0.0.1:54321';
// The Supabase CLI's fixed local demo anon key (`supabase status`). Signed with
// the public demo secret; authorizes nothing outside a local stack.
const ANON_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const PROJECT_ID = 'b0000000-0000-0000-0000-0000000000d1';
const CLIENT_ID = 'a0000000-0000-0000-0000-000000000005';

/* ── The five facts, read off the seed ──────────────────────────────────────
   1 · Authorization No. 1, signed — the FROZEN client figure on
       furnishing_authorization_items (940000c), not the studio's live
       project_ffe_items row (905000c)                          → $9,400
   2 · the maker whose finished work waits: trade_scope_terms
       .party_display_name                                      → Ray Corbin
   3 · the draw held back until she accepts: the trade scope's
       client_price_cents (385000c)                             → $3,850
   4 · invoice INV-2026-0142, sent and unpaid: 425000c due 2026-09-09
   5 · the chapter the house stands in — the spine's normalization of the
       seeded project_phases, not a raw phase name                → Discovery
   ────────────────────────────────────────────────────────────────────────── */
const AUTHORIZATION_TOTAL = '$9,400';
const MAKER = 'Ray Corbin';
const HELD_DRAW_SENTENCE = 'Paintwork and plaster — $3,850, held back until you accept it.';
const LETTERBOX_SENTENCE = 'Balance $4,250, due September 9.';
const CHAPTER = 'Discovery';

const STANDING_NOTE_BODY =
  'The dining table is cut and on the bench in Dayton. Sign the next authorization and the console and the pair of lamps go on the same truck.';

/** Rooms the drawing must key, in the order the seed gives them. */
const SEEDED_ROOMS = ['Dining Room', 'Living Room'];

/**
 * Signed in as the studio that owns all three houses. A project's client
 * identity is guarded — a direct UPDATE raises "project client identity may
 * only change through set_document_client" — so the parking below goes
 * through that RPC, which is the studio's own door.
 */
async function asTheStudio(): Promise<SupabaseClient> {
  const studio = createClient(LOCAL_URL, ANON_JWT, { auth: { persistSession: false } });
  const { error } = await studio.auth.signInWithPassword({
    email: 'designer@patina.dev',
    password: 'password123',
  });
  if (error) throw error;
  return studio;
}

async function setProjectClient(
  studio: SupabaseClient,
  projectId: string,
  clientId: string | null,
): Promise<void> {
  const { error } = await studio.rpc('set_document_client', {
    p_engagement_kind: 'project',
    p_target_id: projectId,
    p_client_id: clientId,
  });
  if (error) throw error;
}

function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not exported — this suite reshapes local seed ' +
        'data and cannot run without it. See the header of this file.',
    );
  }
  return createClient(LOCAL_URL, key, { auth: { persistSession: false } });
}

/**
 * The chrome gate and the route collapse both require a client with exactly
 * ONE project — the Threshold is one project's story, and a client with two
 * or more keeps the header because it is the only project switcher there is.
 * The seed gives `client@patina.dev` three houses, so the other two are
 * unassigned for the length of this file and handed back in teardown.
 *
 * Two seeded conditions make that a two-step move rather than one UPDATE:
 *   · a project's client identity may only change through
 *     `set_document_client`, so the parking is done as the studio, not as an
 *     admin reaching past the guard;
 *   · every seeded project carries `studio_id` NULL, and the seed designer
 *     owns TWO active design studios, so `set_project_studio_id` cannot
 *     derive one and fails closed on the ambiguity. Naming the studio first
 *     is what lets the RPC through.
 *
 * `studio_id` is NOT put back in teardown: restoring it to NULL re-enters the
 * same ambiguous derivation and raises. It is left naming Local Dev Studio —
 * on the LOCAL stack, where `supabase db reset` is the broom. Client identity,
 * the thing this file actually borrows, is fully handed back.
 */
const LOCAL_DEV_STUDIO_ID = 'b0000000-0000-0000-0000-000000000001';
let parkedProjectIds: string[] = [];

test.beforeAll(async () => {
  const studio = await asTheStudio();

  const { data, error } = await studio
    .from('projects')
    .select('id')
    .eq('client_id', CLIENT_ID)
    .neq('id', PROJECT_ID);
  if (error) throw error;

  parkedProjectIds = (data ?? []).map((row) => row.id as string);
  if (parkedProjectIds.length === 0) return;

  const { error: studioErr } = await adminClient()
    .from('projects')
    .update({ studio_id: LOCAL_DEV_STUDIO_ID })
    .in('id', parkedProjectIds)
    .is('studio_id', null);
  if (studioErr) throw studioErr;

  for (const id of parkedProjectIds) await setProjectClient(studio, id, null);
});

test.afterAll(async () => {
  if (parkedProjectIds.length === 0) return;
  const studio = await asTheStudio();
  for (const id of parkedProjectIds) await setProjectClient(studio, id, CLIENT_ID);
});

/**
 * Signs in as the seeded household. The golden-hour restyle made sign-in
 * email-first: the password leg sits behind a disclosure, and submitting
 * without opening it sends a six-digit passcode instead. Same shape as
 * tests/gate-ceremony.spec.ts.
 */
async function signInAsClient(page: Page): Promise<void> {
  await page.goto('/auth/signin');
  const disclosure = page.getByRole('button', {
    name: /sign in with email|use email and password instead/i,
  });
  await disclosure.first().waitFor({ state: 'visible', timeout: 60_000 });
  await disclosure.first().click();
  await page.getByLabel(/email/i).first().fill('client@patina.dev');
  await page.getByLabel(/password/i).first().fill('password123');
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/signin'), {
    timeout: 60_000,
  });
}

async function openTheHouse(page: Page): Promise<void> {
  await page.goto(`/projects/${PROJECT_ID}`);
  await expect(page.getByTestId('doorplate')).toBeVisible({ timeout: 60_000 });
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('The Threshold — the client page', () => {
  test('opens chrome-less, with the house named on the doorplate', async ({ page }) => {
    await signInAsClient(page);
    await openTheHouse(page);

    // The global client header is gone entirely. It has no single testid, so
    // this asserts on the whole family it renders (nav links, the more menu,
    // the user menu) — every one of them absent.
    await expect(page.locator('[data-testid^="header-"]')).toHaveCount(0);

    await expect(page.getByTestId('doorplate-title')).toHaveText('Aspen Loft Refresh');
  });

  test('prints the five facts the seed put in the house', async ({ page }) => {
    await signInAsClient(page);
    await openTheHouse(page);

    const body = page.locator('body');

    // 1 · what she authorized, at the figure she put her name to (the frozen
    //     snapshot, 940000c — NOT the studio's live 905000c working row).
    await expect(body).toContainText(AUTHORIZATION_TOTAL);
    await expect(body).not.toContainText('$9,050');
    // 2 · the maker whose finished work is waiting on her word
    await expect(body).toContainText(MAKER);
    // 3 · the draw held back until she accepts it
    await expect(body).toContainText(HELD_DRAW_SENTENCE);
    // 4 · the balance, and the day it falls due
    await expect(page.getByTestId('letterbox-body')).toContainText(LETTERBOX_SENTENCE);
    // 5 · the chapter the house stands in
    await expect(page.getByTestId('doorplate-sub')).toContainText(CHAPTER);
    // The client's page never carries the studio's cost of the work.
    await expect(body).not.toContainText('$6,200');
  });

  test('draws the key with one link per seeded room', async ({ page }) => {
    await signInAsClient(page);
    await openTheHouse(page);

    const key = page.locator('svg[role="group"]');
    await expect(key).toHaveCount(1);

    for (const room of SEEDED_ROOMS) {
      await expect(key.locator(`a[href^="#room-"]`, { hasText: room })).toHaveCount(1);
    }
    // One anchor per room, plus the road — and nothing else.
    await expect(key.locator('a[href^="#room-"]')).toHaveCount(SEEDED_ROOMS.length);
  });

  test('stands the standing note on the page, in the designer’s own words', async ({
    page,
  }) => {
    await signInAsClient(page);
    await openTheHouse(page);

    await expect(page.getByTestId('note-body')).toHaveText(STANDING_NOTE_BODY);
  });

  test('collapses /invoices onto the letterbox on the one project page', async ({
    page,
  }) => {
    await signInAsClient(page);
    await page.goto('/invoices');

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 30_000 })
      .toBe(`/projects/${PROJECT_ID}`);
    await expect.poll(() => new URL(page.url()).hash).toBe('#letterbox');
    await expect(page.getByTestId('letterbox')).toBeVisible();
  });
});
