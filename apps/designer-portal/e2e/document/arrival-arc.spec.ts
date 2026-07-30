import path from 'path';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { test, expect, type AuthenticatedPage } from '../fixtures/auth';
import { getDesignerId, setTourCompleted } from '../helpers/help-state';
import { psqlRun, psqlScalar, psqlRow, psqlAsUser } from '../helpers/psql';

/**
 * Arrival Arc (R106, Wave 2) — the full arc, end to end.
 *
 * Prereqs (house pattern, playwright.config.ts): local Supabase up + seeded
 * (designer@patina.dev / password123), flags `design-request-pool` and
 * `arrival-arc` on (NEXT_PUBLIC_FLAG_OVERRIDES). `the-document-pilot` is gone —
 * the R21 dissolve (I109) made the Document unconditional.
 *
 * The regression suite for the arc's Phase 2 acceptance walk: accept a pooled
 * request → the Match Ceremony (send-gate, put-down/resume) → the threshold
 * send → the Discovery fold, honest → the client's pick (simulated via psql
 * impersonation — there is no second browser actor here) → the 48h nudge and
 * stale-slots chips (clock-manipulated via psql) → the re-offer.
 *
 * Chromium-pinned: this spec mutates the seeded designer's own Desk state
 * (accept, ceremony sends, desk reads) through a long serial narrative —
 * cross-browser correctness isn't the concern, and running it three times in
 * parallel against the same designer row would race itself (mirrors
 * desk-error-state.spec.ts's rationale).
 *
 * DB assertions go through raw `psql` (see ../helpers/psql.ts), not the
 * service-role JS client — several of the arc's RPCs (`client_pick`,
 * `accept_design_request`, `ceremony_complete`, `refresh_offered_slots`) read
 * `auth.uid()` internally, and only the `request.jwt.claims` GUC (set via
 * `SET LOCAL` inside a psql session) can impersonate a specific caller.
 */
test.describe.configure({ mode: 'serial' });

const SHOT_DIR = path.resolve(
  '/private/tmp/claude-501/-Users-kody-Code-patina-merged/7f4ef141-35f6-45fe-adf8-33cf5f23db13/scratchpad/arrival-arc-screenshots',
);
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (page: AuthenticatedPage, name: string) =>
  page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true });

const DESIGNER_ID = 'a0000000-0000-0000-0000-000000000004'; // designer@patina.dev (dev-accounts.sql)
const RUN = Date.now();

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

// ─── Fixture identities (fresh throwaway homeowners + pooled leads) ─────────
const homeownerA = randomUUID(); // "Marisol Ferreira" — walked live through the UI
const leadA = randomUUID();
const homeownerB = randomUUID(); // "Owen Castellano" — seeded pre-sent for the clock-manipulation beats
const leadB = randomUUID();

const emailA = `arrival-arc-a-${RUN}@e2e.patina.test`;
const emailB = `arrival-arc-b-${RUN}@e2e.patina.test`;
const nameA = 'Marisol Ferreira';
const nameB = 'Owen Castellano';
const introA = "Marisol, I love how you're thinking about the primary bedroom — here are a few times to talk it through.";
const introB = 'Owen, thanks for sharing your living room vision — a few times that could work for an intro chat.';

/** One throwaway homeowner + one pooled ('new', unassigned) lead — the
 *  W2-mig fixtures' style: auth.users + auth.identities + profiles, then a
 *  bare leads row with client_request_id set (so the generic
 *  notify_design_request_status_change trigger WOULD fire the "accepted"
 *  letter if the 00332 ceremony guard didn't suppress it — the absence
 *  assertion in 2.3 is only meaningful if this is non-null). */
function seedHomeownerAndLeadSql(opts: {
  homeownerId: string;
  leadId: string;
  email: string;
  fullName: string;
  projectType: string;
  description: string;
  budgetRange: string;
}): string {
  const { homeownerId, leadId, email, fullName, projectType, description, budgetRange } = opts;
  return `
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000', '${homeownerId}', 'authenticated', 'authenticated',
  ${sqlStr(email)}, crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  ${sqlStr(JSON.stringify({ full_name: fullName }))}::jsonb,
  now(), now(), '', '', '', ''
);

INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) VALUES (
  gen_random_uuid(), '${homeownerId}', '${homeownerId}',
  jsonb_build_object('sub', '${homeownerId}', 'email', ${sqlStr(email)}),
  'email', now(), now(), now()
);

INSERT INTO public.profiles (id, email, full_name, display_name, role, created_at, updated_at)
VALUES ('${homeownerId}', ${sqlStr(email)}, ${sqlStr(fullName)}, ${sqlStr(fullName)}, 'homeowner', now(), now())
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name, display_name = EXCLUDED.display_name, role = EXCLUDED.role;

INSERT INTO public.leads (
  id, homeowner_id, designer_id, project_type, project_description,
  budget_range, timeline, status, source, client_request_id, created_at, updated_at
) VALUES (
  '${leadId}', '${homeownerId}', NULL, ${sqlStr(projectType)}, ${sqlStr(description)},
  ${sqlStr(budgetRange)}, 'asap', 'new', 'Patina app', gen_random_uuid(), now(), now()
);
`;
}

/** future ISO instants, `days` out at 10:00 local server time — comfortably
 *  future for ceremony_complete's slot validation. */
function futureIso(days: number): string {
  const d = new Date(Date.now() + days * 24 * 3600 * 1000);
  d.setUTCHours(16, 0, 0, 0); // 10:00 America/Chicago-ish, UTC-6 — not asserted on, just future
  return d.toISOString();
}

/**
 * Idempotent re-run safety: a previous run's fixtures (fresh `randomUUID()`s
 * every time, so nothing here is a stable id to `ON CONFLICT` against) would
 * otherwise accumulate — a second "Primary Bedroom" open request, a second
 * "Marisol Ferreira" chip — and make the desk-strip/chip locators ambiguous.
 * Sweeps anything tagged by the stable markers (the fixture email domain, the
 * fixture project_description prefix) before seeding fresh ones. FK cascades
 * (verified against local pg_constraint) handle the rest: comms_threads →
 * comms_messages, designer_clients → client_discovery, leads →
 * match_ceremonies, auth.users → profiles → notification_log.
 */
function cleanupPriorFixturesSql(): string {
  return `
DO $$
DECLARE
  v_homeowner_ids uuid[];
  v_lead_ids      uuid[];
  v_dc_ids        uuid[];
  v_thread_ids    uuid[];
BEGIN
  SELECT array_agg(id) INTO v_homeowner_ids FROM auth.users
   WHERE email LIKE 'arrival-arc-%@e2e.patina.test';

  SELECT array_agg(id) INTO v_lead_ids FROM public.leads
   WHERE project_description LIKE 'Arrival Arc e2e fixture%'
      OR homeowner_id = ANY(COALESCE(v_homeowner_ids, ARRAY[]::uuid[]));

  SELECT array_agg(id) INTO v_dc_ids FROM public.designer_clients
   WHERE lead_id = ANY(COALESCE(v_lead_ids, ARRAY[]::uuid[]))
      OR client_id = ANY(COALESCE(v_homeowner_ids, ARRAY[]::uuid[]));

  SELECT array_agg(thread_id) INTO v_thread_ids FROM public.match_ceremonies
   WHERE lead_id = ANY(COALESCE(v_lead_ids, ARRAY[]::uuid[])) AND thread_id IS NOT NULL;

  -- Designer-bound notifications (accept_design_request's held-state letter
  -- is homeowner-bound and dies with the profile cascade below, but
  -- client_pick's "{Client} chose ..." and ceremony_complete's own rows are
  -- keyed off the SEEDED DESIGNER's constant id — a homeowner-scoped cleanup
  -- never reaches them, and a re-run would otherwise pile up a fresh
  -- "chose"/"introduced" row every time against the same designer. There is
  -- no FK from notification_log to leads (it's a jsonb metadata blob), so
  -- purge by the lead_id carried in metadata while v_lead_ids is still live.
  IF v_lead_ids IS NOT NULL THEN
    DELETE FROM public.notification_log
     WHERE (metadata->>'lead_id')::uuid = ANY(v_lead_ids);
  END IF;

  IF v_thread_ids IS NOT NULL THEN
    DELETE FROM public.comms_threads WHERE id = ANY(v_thread_ids);
  END IF;
  IF v_dc_ids IS NOT NULL THEN
    DELETE FROM public.designer_clients WHERE id = ANY(v_dc_ids);
  END IF;
  IF v_lead_ids IS NOT NULL THEN
    DELETE FROM public.leads WHERE id = ANY(v_lead_ids);
  END IF;
  IF v_homeowner_ids IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY(v_homeowner_ids);
  END IF;
END $$;
`;
}

test.beforeAll(async () => {
  const id = await getDesignerId();
  await setTourCompleted(id);

  psqlRun(cleanupPriorFixturesSql());

  // Fixture A: pooled, unassigned — walked live through Accept → Ceremony → Send.
  psqlRun(
    seedHomeownerAndLeadSql({
      homeownerId: homeownerA,
      leadId: leadA,
      email: emailA,
      fullName: nameA,
      projectType: 'primary_bedroom',
      description: 'Arrival Arc e2e fixture — primary bedroom refresh.',
      budgetRange: '15k_50k',
    }),
  );

  // Fixture B: pooled, then immediately accepted + completed via RPC (as the
  // designer) — "a second sent ceremony you seed" for the clock-manipulation
  // beats (2.7). Two comfortably-future slots at seed time.
  psqlRun(
    seedHomeownerAndLeadSql({
      homeownerId: homeownerB,
      leadId: leadB,
      email: emailB,
      fullName: nameB,
      projectType: 'living_room',
      description: 'Arrival Arc e2e fixture — living room, second ceremony.',
      budgetRange: '5k_15k',
    }),
  );
  psqlAsUser(DESIGNER_ID, `SELECT accept_design_request('${leadB}'::uuid);`);
  const slotsB = JSON.stringify([
    { starts_at: futureIso(5), duration_minutes: 45 },
    { starts_at: futureIso(6), duration_minutes: 45 },
  ]);
  psqlAsUser(
    DESIGNER_ID,
    `SELECT ceremony_complete('${leadB}'::uuid, ${sqlStr(introB)}, '${slotsB}'::jsonb, 'America/Chicago', NULL, NULL);`,
  );
});

test.beforeEach(async ({ page }) => {
  test.skip(test.info().project.name !== 'chromium', 'single-browser sweep is enough here');
  await page.setViewportSize({ width: 1440, height: 900 });
});

test.describe('Arrival Arc — the full arc (R106, Wave 2)', () => {
  test('accept → ceremony (gate, put-down, resume) → send → discovery fold → client pick → nudge/stale/re-offer', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(300_000);

    let designerClientA = '';
    let ceremonyA = '';
    let threadA = '';

    await test.step('2.1 — the desk strip shows the pooled request; Accept routes to the ceremony', async () => {
      await page.goto('/desk', { waitUntil: 'domcontentloaded' });

      // "Accept" (exact) is the Open-requests-strip's button — TriageBar's
      // folder-card equivalent is labeled "Accept · begin", so an exact match
      // is unambiguous even if other Desk folders are mid-triage.
      await expect(page.getByRole('heading', { name: 'Primary Bedroom' })).toBeVisible({ timeout: 20_000 });
      const acceptBtn = page.getByRole('button', { name: 'Accept', exact: true });
      await expect(acceptBtn).toBeVisible();
      await shot(page, '01-desk-open-request.png');
      await acceptBtn.click();

      await page.waitForURL(new RegExp(`/ceremony/${leadA}$`), { timeout: 20_000 });
      await shot(page, '02-ceremony-arrived.png');

      // psql-assert: claimed, status still 'new', ceremony stub 'draft',
      // client held-notification exists, NO designer_clients row yet.
      const [designerId, status] = psqlRow(`SELECT designer_id, status FROM leads WHERE id = '${leadA}';`);
      expect(designerId).toBe(DESIGNER_ID);
      expect(status).toBe('new');

      const ceremonyState = psqlScalar(
        `SELECT state FROM match_ceremonies WHERE lead_id = '${leadA}';`,
      );
      expect(ceremonyState).toBe('draft');
      ceremonyA = psqlScalar(`SELECT id FROM match_ceremonies WHERE lead_id = '${leadA}';`);
      expect(ceremonyA).toMatch(/^[0-9a-f-]{36}$/);

      const heldCount = psqlScalar(
        `SELECT count(*) FROM notification_log WHERE user_id = '${homeownerA}' AND type = 'design_request_held';`,
      );
      expect(heldCount).toBe('1');

      const dcCount = psqlScalar(`SELECT count(*) FROM designer_clients WHERE lead_id = '${leadA}';`);
      expect(dcCount).toBe('0');
    });

    await test.step('2.2 — the send gate: asleep empty, asleep at one slot, wakes at two', async () => {
      const sendBtn = page.getByRole('button', { name: /Send.*begin the Document/ });
      await expect(sendBtn).toBeVisible({ timeout: 20_000 });
      await expect(sendBtn).toBeDisabled(); // empty: no intro, no slots

      await page.getByLabel('Your introduction').fill(introA);
      await expect(sendBtn).toBeDisabled(); // intro alone, still 0 slots

      await page.getByRole('button', { name: /Add a time/ }).click();
      await expect(page.getByText(/1 of 3 offered · offer at least two/)).toBeVisible();
      await expect(sendBtn).toBeDisabled(); // 1 slot — still asleep
      await shot(page, '03-ceremony-one-slot-still-asleep.png');
    });

    await test.step('2.4 — put down; the desk shows the parked card; resume; the draft survives reload', async () => {
      await page.getByRole('button', { name: 'Put down for now' }).click();
      await page.waitForURL(/\/desk$/, { timeout: 20_000 });

      // The put-down mutation fires on unmount, not awaited by the navigation —
      // poll the DB rather than trust the client-side push landed first.
      await expect
        .poll(() => psqlScalar(`SELECT intro_text FROM match_ceremonies WHERE id = '${ceremonyA}';`), {
          timeout: 10_000,
        })
        .toBe(introA);

      // The Desk's own document-state/ceremonies queries aren't invalidated by
      // a put-down (only a completed send does that) — the SPA nav that just
      // landed here can carry a query snapshot taken before the flush above
      // resolved. A fresh navigation forces a read that reflects it.
      await page.reload({ waitUntil: 'domcontentloaded' });

      const parkedCard = page.getByRole('link', { name: new RegExp(`Introduce yourself to Marisol`) });
      await expect(parkedCard).toBeVisible({ timeout: 20_000 });
      // The draft-preview sub-line (need.sub) carries a truncated echo of the intro.
      await expect(page.getByText(/Marisol, I love how/)).toBeVisible();
      await shot(page, '04-desk-parked-card.png');

      await parkedCard.click();
      await page.waitForURL(new RegExp(`/ceremony/${leadA}$`), { timeout: 20_000 });
      await expect(page.getByLabel('Your introduction')).toHaveValue(introA);
      await expect(page.getByText(/1 of 3 offered/)).toBeVisible();

      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByLabel('Your introduction')).toHaveValue(introA, { timeout: 20_000 });
      await expect(page.getByText(/1 of 3 offered/)).toBeVisible();
      await shot(page, '05-ceremony-draft-intact-after-reload.png');

      // ── Mobile pass (390×844): the parked card + the resumed ceremony ──
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByLabel('Your introduction')).toHaveValue(introA, { timeout: 20_000 });
      await shot(page, '06-ceremony-mobile-390x844.png');

      await page.goto('/desk', { waitUntil: 'domcontentloaded' });
      await expect(
        page.getByRole('link', { name: /Introduce yourself to Marisol/ }),
      ).toBeVisible({ timeout: 20_000 });
      await shot(page, '07-desk-mobile-390x844.png');

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/ceremony/${leadA}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByLabel('Your introduction')).toHaveValue(introA, { timeout: 20_000 });
    });

    await test.step('2.3 — the second slot wakes the send; the threshold act', async () => {
      await page.getByRole('button', { name: /Add a time/ }).click();
      await expect(page.getByText(/2 of 3 offered · offer two or three/)).toBeVisible();
      const sendBtn = page.getByRole('button', { name: /Send.*begin the Document/ });
      await expect(sendBtn).toBeEnabled();
      await shot(page, '08-ceremony-two-slots-awake.png');

      await sendBtn.click();
      await page.waitForURL(/\/doc\/[0-9a-f-]{36}/, { timeout: 20_000 });
      const m = page.url().match(/\/doc\/([0-9a-f-]{36})/);
      expect(m).not.toBeNull();
      designerClientA = m![1]!;
      await shot(page, '09-doc-landed-discovery.png');

      // psql-assert the full seed: dc status='lead' + lead_id, client_discovery
      // row, thread + head message, ceremony sent + stamped, generic
      // design_request_accepted row ABSENT (00332 guard).
      const [dcId, dcStatus, dcLeadId, clientName] = psqlRow(
        `SELECT id, status, lead_id, client_name FROM designer_clients WHERE lead_id = '${leadA}';`,
      );
      expect(dcId).toBe(designerClientA);
      expect(dcStatus).toBe('lead');
      expect(dcLeadId).toBe(leadA);
      expect(clientName).toBe(nameA);

      const cdCount = psqlScalar(
        `SELECT count(*) FROM client_discovery WHERE designer_client_id = '${designerClientA}';`,
      );
      expect(cdCount).toBe('1');
      const [budgetMin, budgetMax] = psqlRow(
        `SELECT budget_min_cents, budget_max_cents FROM client_discovery WHERE designer_client_id = '${designerClientA}';`,
      );
      expect(budgetMin).toBe('1500000');
      expect(budgetMax).toBe('5000000');

      const [ceremonyState, offeredAt, dcFromCeremony] = psqlRow(
        `SELECT state, offered_at, designer_client_id FROM match_ceremonies WHERE id = '${ceremonyA}';`,
      );
      expect(ceremonyState).toBe('sent');
      expect(offeredAt).not.toBe('');
      expect(dcFromCeremony).toBe(designerClientA);

      threadA = psqlScalar(`SELECT thread_id FROM match_ceremonies WHERE id = '${ceremonyA}';`);
      expect(threadA).toMatch(/^[0-9a-f-]{36}$/);
      const headBody = psqlScalar(
        `SELECT body FROM comms_messages WHERE thread_id = '${threadA}' ORDER BY created_at ASC LIMIT 1;`,
      );
      expect(headBody).toBe(introA);

      const genericAccepted = psqlScalar(
        `SELECT count(*) FROM notification_log WHERE user_id = '${homeownerA}' AND type = 'design_request_accepted';`,
      );
      expect(genericAccepted).toBe('0'); // suppressed by the 00332 ceremony guard

      const introDelivered = psqlScalar(
        `SELECT count(*) FROM notification_log WHERE user_id = '${homeownerA}' AND type = 'match_introduction';`,
      );
      expect(introDelivered).toBe('1');
    });

    await test.step('2.5 — the Discovery fold, honest: times offered + the intro thread + carried facts', async () => {
      await expect(page.getByText(/Times offered · 2 slot/)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/awaiting Marisol.s pick/)).toBeVisible();

      const threadLink = page.getByRole('link', { name: /view the thread/ });
      await expect(threadLink).toBeVisible();
      await expect(threadLink).toHaveAttribute('href', `/people?thread=${threadA}`);

      // Carried facts: client_discovery.budget_{min,max}_cents seeded from
      // ceremony_complete's budget-range mapping (15k_50k → $15,000–$50,000).
      await expect(page.getByText('$15,000–$50,000')).toBeVisible();
      await shot(page, '10-doc-discovery-fold-offered.png');
    });

    await test.step('2.6 — the client picks (simulated via psql); the chip, The Post, and the fold all agree', async () => {
      const offeredSlotsRaw = psqlScalar(
        `SELECT offered_slots::text FROM match_ceremonies WHERE id = '${ceremonyA}';`,
      );
      const offeredSlots = JSON.parse(offeredSlotsRaw) as { id: string; starts_at: string }[];
      expect(offeredSlots.length).toBe(2);
      const pickedSlot = offeredSlots[0]!;

      psqlAsUser(homeownerA, `SELECT client_pick('${ceremonyA}'::uuid, '${pickedSlot.id}'::uuid);`);

      const [pickedState, pickedSlotId] = psqlRow(
        `SELECT state, picked_slot_id FROM match_ceremonies WHERE id = '${ceremonyA}';`,
      );
      expect(pickedState).toBe('picked');
      expect(pickedSlotId).toBe(pickedSlot.id);

      await page.goto('/desk', { waitUntil: 'domcontentloaded' });
      // The chip's inter-span dash is aria-hidden, so accessible-name matching
      // can't see it — filter on textContent substrings instead (order-
      // independent, immune to JSX's inter-element whitespace collapsing).
      const pickedChip = page
        .getByRole('link')
        .filter({ hasText: nameA })
        .filter({ hasText: 'Discovery ·' });
      await expect(pickedChip).toBeVisible({ timeout: 20_000 });
      await expect(pickedChip).toHaveAttribute('href', `/doc/${designerClientA}#discovery`);
      await shot(page, '11-desk-picked-chip.png');

      // The Post — the "{Name} chose {time}" letter, deep-linked. The drawer's
      // bell carries an unread count in its aria-label ("The Post, N unread");
      // a bare-text match also hits the Studio index's registry shortcut, so
      // pin to the unread-count form to land on the bell specifically.
      await page.getByRole('button', { name: /The Post, \d+ unread/ }).click();
      const pickedRecordRow = page.getByTestId('post-record-row').filter({
        hasText: `${nameA} chose`,
      });
      await expect(pickedRecordRow).toBeVisible({ timeout: 20_000 });
      await shot(page, '12-the-post-picked-letter.png');
      await pickedRecordRow.click();
      await page.waitForURL(new RegExp(`/doc/${designerClientA}`), { timeout: 20_000 });

      // The fold now reads "booked".
      await expect(page.getByText(/Discovery call ·.*booked/)).toBeVisible({ timeout: 20_000 });
      await shot(page, '13-doc-discovery-fold-booked.png');
    });

    let ceremonyB = '';
    let designerClientB = '';
    let threadB = '';

    await test.step('2.7 — quiet 48h nudges; stale offered times; the re-offer replaces them', async () => {
      [ceremonyB, designerClientB, threadB] = psqlRow(
        `SELECT id, designer_client_id, thread_id FROM match_ceremonies WHERE lead_id = '${leadB}';`,
      );
      expect(ceremonyB).toMatch(/^[0-9a-f-]{36}$/);

      // Rewind the clock: offered 49h ago (past the 48h nudge threshold).
      psqlRun(`UPDATE match_ceremonies SET offered_at = now() - interval '49 hours' WHERE id = '${ceremonyB}';`);

      await page.goto('/desk', { waitUntil: 'domcontentloaded' });
      const nudgeChip = page
        .getByRole('link')
        .filter({ hasText: nameB })
        .filter({ hasText: 'quiet 48h' });
      await expect(nudgeChip).toBeVisible({ timeout: 20_000 });
      await expect(nudgeChip).toHaveAttribute('href', `/people?thread=${threadB}`);
      await shot(page, '14-desk-nudge-chip.png');

      // Now push both offered slots into the past — the chip goes stale.
      psqlRun(`
        UPDATE match_ceremonies
           SET offered_slots = jsonb_build_array(
             jsonb_build_object('id', gen_random_uuid(), 'starts_at', to_jsonb((now() - interval '3 days')::timestamptz), 'duration_minutes', 45),
             jsonb_build_object('id', gen_random_uuid(), 'starts_at', to_jsonb((now() - interval '2 days')::timestamptz), 'duration_minutes', 45)
           )
         WHERE id = '${ceremonyB}';
      `);

      await page.goto('/desk', { waitUntil: 'domcontentloaded' });
      const staleChip = page
        .getByRole('link')
        .filter({ hasText: nameB })
        .filter({ hasText: 'offered times went by' });
      await expect(staleChip).toBeVisible({ timeout: 20_000 });
      await expect(staleChip).toHaveAttribute('href', `/doc/${designerClientB}#discovery`);
      await shot(page, '15-desk-stale-chip.png');

      await page.goto(`/doc/${designerClientB}`, { waitUntil: 'domcontentloaded' });
      await expect(page.getByText('The offered times went by')).toBeVisible({ timeout: 20_000 });
      await shot(page, '16-doc-discovery-fold-stale.png');

      const preOfferedAt = psqlScalar(`SELECT offered_at::text FROM match_ceremonies WHERE id = '${ceremonyB}';`);

      await page.getByRole('button', { name: /Offer fresh times/ }).click();
      await expect(page.getByRole('button', { name: /Send fresh times/ })).toBeEnabled({ timeout: 10_000 });
      await shot(page, '17-doc-discovery-fold-reoffer-open.png');
      await page.getByRole('button', { name: /Send fresh times/ }).click();

      await expect(page.getByText(/Times offered · 2 slot/)).toBeVisible({ timeout: 20_000 });
      await shot(page, '18-doc-discovery-fold-reoffered-fresh.png');

      // psql-assert: offered_at reset (later than the pre-reoffer stamp) and
      // both slots replaced with fresh, future starts_at values.
      const postOfferedAt = psqlScalar(`SELECT offered_at::text FROM match_ceremonies WHERE id = '${ceremonyB}';`);
      expect(new Date(postOfferedAt).getTime()).toBeGreaterThan(new Date(preOfferedAt).getTime());

      const newSlotsRaw = psqlScalar(`SELECT offered_slots::text FROM match_ceremonies WHERE id = '${ceremonyB}';`);
      const newSlots = JSON.parse(newSlotsRaw) as { id: string; starts_at: string }[];
      expect(newSlots.length).toBe(2);
      const now = Date.now();
      for (const s of newSlots) {
        expect(new Date(s.starts_at).getTime()).toBeGreaterThan(now);
      }
    });
  });
});
