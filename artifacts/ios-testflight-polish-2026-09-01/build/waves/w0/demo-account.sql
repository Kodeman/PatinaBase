-- ═══════════════════════════════════════════════════════════════════════════
-- First Flight W0 · L0.2 — the demo / walk account's house  (rulings D7, D11)
--
-- ⚠ KODY-RUN. This file writes to production. No agent runs it. The runbook
--   that wraps it — including the GoTrue admin call that must happen FIRST,
--   and the Vault allow-list append that must happen AFTER — is
--   build/waves/w0/demo-account.md. Read that; do not run this file alone.
--
-- WHAT IT DOES
--   Gives firstflight@patina.cloud a real-looking house so the app opens on
--   the product rather than on an empty room: one project with Leah as the
--   designer, one decision awaiting the client, one sent proposal, one small
--   open invoice, one client-visible document, and one live message thread
--   with a message from Leah in it.
--
-- WHY A HOUSE AND NOT JUST A ROLE
--   EngagementTier does not read profiles.role at all. It is derived, in
--   Core/State/EngagementTier.swift:110-122:
--     projectCount > 0 || proposalCount > 0 || invoiceCount > 0
--       || decisionCount > 0   →  .activeProject
--   So the rows below ARE the tier. A role string on its own would leave the
--   demo account on .discovering — the marketplace pitch — which is the exact
--   screen round one is not about.
--
-- HOW TO RUN — three variables, all assigned by the runbook, never guessed:
--   :ff_client_id          resolved from auth.users by \gset (see below)
--   :designer_profile_id   Leah's profiles.id
--   :studio_id             her organizations.id
--
--   The runnable command is demo-account.md Step 5, which assigns
--   $DESIGNER_PROFILE_ID and $STUDIO_ID by query in Step 4 first. It is NOT
--   restated here, because a restated version drifts and because a usage line
--   with a fake uuid in it is copy-pasteable and wrong. Run the runbook.
--
-- IDEMPOTENT: every row carries a fixed ff-prefixed uuid and
-- ON CONFLICT (id) DO NOTHING, so a second run is a no-op, not a second house.
-- TRANSACTIONAL: one BEGIN/COMMIT. A failure anywhere leaves prod untouched.
--
-- MONEY IS INTEGER CENTS throughout. The invoice is deliberately small
-- ($42.00) because ruling D10 puts a LIVE Stripe key on Strata before build 1
-- and the device pass pays this invoice for real, with Apple Pay, on Kody's
-- phone. Do not raise the amount without re-reading D10.
--
-- COPY: every string a tester reads is written to
-- .claude/skills/patina-brand-voice/SKILL.md — plain-spoken, concrete, no
-- "journey", no "curated", no "elevated", no "bespoke", and nothing anywhere
-- that says "AI" (VISION §6).
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ── Guard 0: the auth user must already exist ──────────────────────────────
-- The runbook's GoTrue admin call creates it. If it has not run, \gset errors
-- on zero rows and ON_ERROR_STOP aborts before a single row is written. That
-- is the intended failure: this file must never invent an identity.
SELECT id AS ff_client_id
  FROM auth.users
 WHERE email = 'firstflight@patina.cloud'
\gset

-- ── Guard 1: the designer and the studio must be real ──────────────────────
-- Same shape as Guard 0, and for the same reason: a typo'd uuid would insert
-- a house whose designer does not exist, and the FKs would only catch some of
-- it. Zero rows makes \gset raise, and ON_ERROR_STOP aborts before BEGIN.
--
-- (Not a `CASE ... ELSE 1/0` guard: Postgres constant-folds the division at
-- PLAN time, so that shape fails even when the precondition holds. Verified
-- on the local stack, 2026-09-02.)
SELECT id AS designer_exists FROM public.profiles      WHERE id = :'designer_profile_id' \gset
SELECT id AS studio_exists   FROM public.organizations WHERE id = :'studio_id'           \gset

BEGIN;

-- ── 1. The person ─────────────────────────────────────────────────────────
-- handle_new_user already created this row from the admin call's metadata.
-- This is the explicit, idempotent restatement: 'homeowner' is the only role
-- string the trigger honours from client metadata (00313, kept by 00555 §a2)
-- and the only one the iOS app ever sends (AuthService.swift:437 and :563).
UPDATE public.profiles
   SET role         = 'homeowner',
       display_name = COALESCE(NULLIF(btrim(display_name), ''), 'First Flight'),
       full_name    = COALESCE(NULLIF(btrim(full_name), ''), 'First Flight Tester'),
       is_designer  = FALSE,
       updated_at   = NOW()
 WHERE id = :'ff_client_id';

-- ── 2. The relationship ───────────────────────────────────────────────────
-- designer_clients is what client_decisions hangs off: the decision's read
-- policy is is_addressed_client_decision(), which joins
-- designer_clients.client_id = auth.uid(). Without this row the decision is
-- invisible to the account and the tier loses one of its four signals.
INSERT INTO public.designer_clients
  (id, designer_id, client_id, client_name, client_email, status, created_at, updated_at)
VALUES
  ('ff200000-0000-4000-8000-000000000001'::uuid,
   :'designer_profile_id', :'ff_client_id',
   'First Flight Tester', 'firstflight@patina.cloud',
   'active', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ── 3. The project ────────────────────────────────────────────────────────
-- projects RLS for a client is `client_id = auth.uid()` ("Project
-- participants can view projects"), so client_id is the load-bearing column;
-- designer_id carries Leah so the Record can say who acted, and created_by is
-- NOT NULL. There is no `description` column on this table — the prose lives
-- in `notes`. `status` is the project_status ENUM (active, completed,
-- archived, on_hold, draft), not free text.
--
-- Two columns are deliberately NOT set:
--   lead_designer_id  — a GENERATED column. Naming it fails the statement.
--   client_profile_id — its FK (fk_projects_client_profile) points at
--                       public.client_profiles, NOT public.profiles, so a
--                       profiles uuid is rejected outright. `client_id` is
--                       the column the client-read policy uses.
INSERT INTO public.projects
  (id, name, notes, designer_id, client_id,
   created_by, studio_id, status, current_phase, client_visibility_tier,
   start_date, created_at, updated_at)
VALUES
  ('ff100000-0000-4000-8000-000000000001'::uuid,
   'Lake house, main floor',
   'Living room, dining room and the entry. Warm woods, low sheen, nothing precious.',
   :'designer_profile_id', :'ff_client_id',
   :'designer_profile_id', :'studio_id',
   'active'::project_status, 'design', 'milestone',
   (NOW() - INTERVAL '21 days')::date,
   NOW() - INTERVAL '21 days', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ── 4. The decision, awaiting the client ──────────────────────────────────
-- status='pending' is what DecisionsAPIClient.listPending filters on
-- (`status=eq.pending`), and BadgeCountService then counts the rows that are
-- not resolved. approval_contract stays NULL: the stage-2 CHECK
-- (client_decisions_stage2_shape_check) only permits the
-- 'project_artifact_v1' shape with a phase_id, which this is not.
INSERT INTO public.client_decisions
  (id, designer_client_id, designer_id, project_id, title, context,
   status, decision_type, decision_kind, coordination_kind, court,
   blocking_status, blocks_kind, due_date, created_at, updated_at)
VALUES
  ('ff300000-0000-4000-8000-000000000001'::uuid,
   'ff200000-0000-4000-8000-000000000001'::uuid,
   :'designer_profile_id',
   'ff100000-0000-4000-8000-000000000001'::uuid,
   'Dining chairs: oak or walnut',
   'Both are in stock and both hold up to a full table. Oak keeps the room light; walnut settles it down. Pick the one you want to live with.',
   'pending', 'product', 'choice', 'selection', 'client',
   'non_blocking', 'none',
   (NOW() + INTERVAL '9 days')::date, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.client_decision_options
  (id, decision_id, name, designer_note, is_recommended, sort_order, created_at)
VALUES
  ('ff310000-0000-4000-8000-000000000001'::uuid,
   'ff300000-0000-4000-8000-000000000001'::uuid,
   'White oak, natural',
   'Lighter, and it will grey a little where the sun hits it.',
   TRUE, 0, NOW() - INTERVAL '2 days'),
  ('ff310000-0000-4000-8000-000000000002'::uuid,
   'ff300000-0000-4000-8000-000000000001'::uuid,
   'Walnut, oiled',
   'Darker and warmer. Shows less, costs a little more.',
   FALSE, 1, NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- ── 5. The proposal, sent ─────────────────────────────────────────────────
-- list_client_proposals is SECURITY DEFINER and filters
-- `proposal.client_id = auth.uid() AND status IN
-- ('sent','viewed','accepted','declined','expired')`. The app then counts it
-- with isAwaitingSignature(), which needs status 'sent' or 'viewed' AND a
-- valid_until that has not passed — so valid_until is a future date, not NULL.
--
-- RULING D2-demo (Fable, 2026-09-02): client_visibility_tier = 'full'.
-- The vocabulary is three values (00084:35, 00141:28 —
-- CHECK (client_visibility_tier IN ('full','milestone','curated'))) and
-- get_client_proposal_bundle (00390:1622-1700) reads them as:
--   'curated'    items collapse to '[]' — the client sees no line items at all
--   'milestone'  items render, but unit_sell_price, line_total_cents,
--                vendor_name, budget_min/max_cents, brand, source_url and
--                price_retail are ALL forced to NULL, and
--                record_completeness_hidden is set
--   'full'       the line items carry their money
-- The demo account exists to show a tester a real house, and a proposal is
-- where the money lives; 'milestone' hands them line names with blank prices,
-- which reads as a rendering bug (L07-07), not as a designer's choice.
-- This is ONE-WAY: guard_proposal_copy_immutability (00390:1243) lists
-- client_visibility_tier among the columns a non-draft proposal may never
-- change, and this row is inserted as 'sent'.
-- The projects row at line ~125 keeps 'milestone' deliberately — that column
-- governs the project surface, not this proposal read, and nothing else in
-- this file changes.
INSERT INTO public.proposals
  (id, designer_id, client_id, project_id, designer_client_id, title, description,
   subtotal, total_amount, status, valid_until, sent_at, version,
   document_kind, client_visibility_tier, feedback_enabled, issued_on_paper,
   nudge_count, created_at, updated_at)
VALUES
  ('ff400000-0000-4000-8000-000000000001'::uuid,
   :'designer_profile_id', :'ff_client_id',
   'ff100000-0000-4000-8000-000000000001'::uuid,
   'ff200000-0000-4000-8000-000000000001'::uuid,
   'Main floor, phase one',
   'Seating, the dining table and the entry rug. Lead times are in the schedule.',
   1840000, 1840000, 'sent',
   NOW() + INTERVAL '21 days', NOW() - INTERVAL '4 days', 1,
   'legacy', 'full', TRUE, FALSE, 0,
   NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days')
ON CONFLICT (id) DO NOTHING;

-- ── 6. The invoice, open and payable ──────────────────────────────────────
-- InvoicesAPIClient.isPayable = status IN ('sent','partially_paid') AND
-- total_cents - amount_paid_cents > 0. The invoices RLS leg for a client is
-- `status <> 'draft' AND the project's client_id = auth.uid()`.
--
-- invoice_number is NOT optional here: chk_invoices_number_when_issued
-- requires one for any status other than draft/void, and
-- uniq_invoices_studio_number makes (studio_id, invoice_number) unique — so
-- 'FF-0001' must not already exist under this studio. The runbook's
-- pre-flight query checks that before you run this file.
--
-- $42.00. D10 puts a live Stripe key on Strata before build 1 and the device
-- pass pays this for real through hosted Checkout with Apple Pay.
INSERT INTO public.invoices
  (id, project_id, designer_id, client_id, studio_id, invoice_number, status,
   issue_date, due_date, payment_terms_days, currency,
   subtotal_cents, tax_rate, tax_cents, total_cents, amount_paid_cents,
   memo, sent_at, reminder_count, created_at, updated_at)
VALUES
  ('ff500000-0000-4000-8000-000000000001'::uuid,
   'ff100000-0000-4000-8000-000000000001'::uuid,
   :'designer_profile_id', :'ff_client_id', :'studio_id',
   'FF-0001', 'sent',
   (NOW() - INTERVAL '3 days')::date, (NOW() + INTERVAL '12 days')::date,
   15, 'USD',
   4200, 0, 0, 4200, 0,
   'Site visit and measure, main floor.',
   NOW() - INTERVAL '3 days', 0,
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days')
ON CONFLICT (id) DO NOTHING;

-- ── 7. The document the client can see ────────────────────────────────────
-- The client leg is "Clients can view their project documents":
-- client_visible = true AND the project's client_id = auth.uid(). Both halves
-- matter — client_visible defaults to FALSE, so a document seeded without it
-- is invisible and looks like a bug in the app.
INSERT INTO public.project_documents
  (id, project_id, title, doc_type, category, url, status, version,
   uploaded_by, client_visible, created_at, updated_at)
VALUES
  ('ff600000-0000-4000-8000-000000000001'::uuid,
   'ff100000-0000-4000-8000-000000000001'::uuid,
   'Main floor plan, marked up',
   'pdf', 'drawings',
   'https://app.patina.cloud/documents/first-flight/main-floor-plan.pdf',
   'final', 1,
   :'designer_profile_id', TRUE,
   NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days')
ON CONFLICT (id) DO NOTHING;

-- ── 8. The thread, live, with something in it ─────────────────────────────
-- kind='project' is required to carry project_id
-- (comms_threads_project_kind_link), and the participant roles are pinned by
-- comms_thread_participants_role_check to designer/client/vendor/admin.
-- left_at stays NULL on both rows: 00555's counterparty predicate admits a
-- profile through a thread only while BOTH sides are still in it, so a
-- departed participant would cost the designer's name in the app.
-- The thread's human label is `title`, not `subject`.
INSERT INTO public.comms_threads
  (id, kind, project_id, title, created_by, created_at, updated_at, last_message_at, metadata)
VALUES
  ('ff700000-0000-4000-8000-000000000001'::uuid,
   'project', 'ff100000-0000-4000-8000-000000000001'::uuid,
   'Lake house, main floor',
   :'designer_profile_id',
   NOW() - INTERVAL '6 days', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day',
   '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.comms_thread_participants
  (thread_id, profile_id, role, joined_at, last_read_at, notification_pref)
VALUES
  ('ff700000-0000-4000-8000-000000000001'::uuid, :'designer_profile_id',
   'designer', NOW() - INTERVAL '6 days', NOW() - INTERVAL '1 day', 'all'),
  ('ff700000-0000-4000-8000-000000000001'::uuid, :'ff_client_id',
   'client',   NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days', 'all')
ON CONFLICT DO NOTHING;

-- One unread message from Leah — the client's last_read_at above is older
-- than this, so the thread lands unread and the app has something to show.
INSERT INTO public.comms_messages
  (id, thread_id, sender_id, body, attachments, mentions, system, created_at)
VALUES
  ('ff800000-0000-4000-8000-000000000001'::uuid,
   'ff700000-0000-4000-8000-000000000001'::uuid,
   :'designer_profile_id',
   'Chairs are the only thing holding up the dining order — have a look at the two when you get a minute and tell me which way you lean.',
   '[]'::jsonb, ARRAY[]::uuid[], FALSE,
   NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION — read-only, run AFTER the COMMIT above.
-- Everything here is a SELECT. Nothing below writes.
-- ═══════════════════════════════════════════════════════════════════════════

-- V1. The four tier signals. EngagementTier.resolve returns .activeProject
--     when ANY of these is > 0; all four should be exactly 1.
SELECT
  (SELECT count(*) FROM public.projects
    WHERE client_id = :'ff_client_id')                                  AS projects,
  (SELECT count(*) FROM public.client_decisions d
     JOIN public.designer_clients dc ON dc.id = d.designer_client_id
    WHERE dc.client_id = :'ff_client_id' AND d.status = 'pending')      AS pending_decisions,
  (SELECT count(*) FROM public.proposals
    WHERE client_id = :'ff_client_id' AND status = 'sent')              AS sent_proposals,
  (SELECT count(*) FROM public.invoices
    WHERE client_id = :'ff_client_id' AND status = 'sent'
      AND total_cents - amount_paid_cents > 0)                          AS payable_invoices;
-- want: 1 | 1 | 1 | 1

-- V2. The document and the thread.
SELECT
  (SELECT count(*) FROM public.project_documents pd
     JOIN public.projects p ON p.id = pd.project_id
    WHERE p.client_id = :'ff_client_id' AND pd.client_visible)          AS client_visible_docs,
  (SELECT count(*) FROM public.comms_thread_participants
    WHERE profile_id = :'ff_client_id' AND left_at IS NULL)             AS live_threads,
  (SELECT count(*) FROM public.comms_messages m
     JOIN public.comms_thread_participants tp ON tp.thread_id = m.thread_id
    WHERE tp.profile_id = :'ff_client_id')                              AS messages;
-- want: 1 | 1 | 1

-- V3. The identity itself.
SELECT p.id, p.email, p.role, p.display_name, p.is_designer
  FROM public.profiles p WHERE p.id = :'ff_client_id';
-- want: role = 'homeowner', is_designer = false

-- V4. The invoice is really payable, and really small.
SELECT invoice_number, status, total_cents, amount_paid_cents,
       total_cents - amount_paid_cents AS balance_cents, currency, due_date
  FROM public.invoices WHERE id = 'ff500000-0000-4000-8000-000000000001'::uuid;
-- want: FF-0001 | sent | 4200 | 0 | 4200 | USD | (a future date)

-- V5. 00555's counterparty predicate really does admit the pair BOTH ways —
--     run this only after 00555 is applied. If either side is false the app
--     shows a nameless designer and the portal a nameless client.
--
--     This block ASSUMES EACH IDENTITY IN TURN. can_view_profile opens with
--     `(SELECT auth.uid()) IS NOT NULL`, and this file is run over
--     $STRATA_DB_URL as postgres, where auth.uid() is NULL — so calling it
--     bare would return false unconditionally, every time, and read as an
--     alarm at the one moment production has just been written. Corrected
--     2026-09-02 (review finding RL02-09).
--     It needs its own transaction, because SET LOCAL outside a transaction
--     block is a warning and a no-op — and everything above this line has
--     already COMMITted. The ROLLBACK at the end is belt-and-braces: the block
--     only reads.
BEGIN;

DO $v5$
DECLARE
  v_client_id  uuid := :'ff_client_id';
  v_designer   uuid := :'designer_profile_id';
  v_forward    boolean;
  v_reverse    boolean;
BEGIN
  -- the client looking at the designer
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_forward := public.can_view_profile(v_designer);
  EXECUTE 'RESET ROLE';

  -- the designer looking at the client
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_designer::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_reverse := public.can_view_profile(v_client_id);
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE NOTICE 'V5  client -> designer: %   designer -> client: %', v_forward, v_reverse;

  ASSERT v_forward, 'V5: the demo client CANNOT see the designer — the app will show a nameless designer';
  ASSERT v_reverse, 'V5: the designer CANNOT see the demo client — the portal will show a nameless client';
END $v5$;

ROLLBACK;
-- want: the NOTICE reads `t` both ways, and no ASSERT is raised.
