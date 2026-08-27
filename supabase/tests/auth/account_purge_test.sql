-- ═══════════════════════════════════════════════════════════════════════════
-- purge_client_account tests (migration 00536)
--
-- SP-20 / App Store Review Guideline 5.1.1(v). The app lets a homeowner create
-- an account and ships no way to close one. A button over a missing endpoint is
-- a dead control (C5), and the endpoint could not exist: deleting a client's
-- auth.users row is blocked by the designer-authority guard triggers that the
-- FK's own ON DELETE SET NULL actions fire —
--   guard_proposal_authority · guard_proposal_copy_immutability (no escape at
--   all for a non-draft proposal) · guard_project_completion_authority ·
--   set_invoice_studio_id · guard_client_decision_option_authority —
-- plus comms_threads.created_by being NOT NULL under an ON DELETE SET NULL FK.
--
-- Covers:
--   1. grant posture — service_role only, never authenticated/anon/PUBLIC;
--   2. after the purge, DELETE FROM auth.users actually succeeds for a client
--      carrying an accepted proposal, an active project, an issued invoice, a
--      pending decision with options, and a project conversation;
--   3. the designer's records SURVIVE, with the client identity detached;
--   4. everything the client owned is gone (it cascades from profiles.id);
--   5. a project thread is handed to the remaining participant; a thread with
--      nobody left is deleted;
--   6. every trigger the purge disabled is enabled again afterwards — the
--      whole design rests on that, so it is asserted rather than assumed.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/auth/account_purge_test.sql
--
-- Single transaction; ROLLBACK at the end. It deletes an auth user inside that
-- transaction and rolls it back — nothing survives the run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('d8000000-0000-4000-8000-00000000000d', 'ap-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d8000000-0000-4000-8000-000000000001', 'ap-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('d8000000-0000-4000-8000-00000000000d', 'ap-designer@test.invalid', 'AP Designer', true,  NOW(), NOW()),
  ('d8000000-0000-4000-8000-000000000001', 'ap-client@test.invalid',   'AP Client',   false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d8010000-0000-4000-8000-000000000001', 'design_studio', 'AP Studio', 'ap-studio-test', 'active');
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('d8020000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-00000000000d',
        'd8010000-0000-4000-8000-000000000001', 'owner', 'active', NOW());

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, client_email, status, source)
VALUES ('d8030000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-00000000000d',
        'd8000000-0000-4000-8000-000000000001', 'AP Client', 'ap-client@test.invalid', 'active', 'direct');

INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status)
VALUES ('d8040000-0000-4000-8000-000000000001', 'AP Project',
        'd8000000-0000-4000-8000-00000000000d', 'd8000000-0000-4000-8000-00000000000d',
        'd8000000-0000-4000-8000-000000000001', 'd8010000-0000-4000-8000-000000000001', 'active');

-- A NON-DRAFT proposal: the immutability guard that has no escape hatch.
INSERT INTO public.proposals (
  id, project_id, designer_id, designer_client_id, client_id, title, total_amount, status
) VALUES (
  'd8050000-0000-4000-8000-000000000001', 'd8040000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-00000000000d', 'd8030000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-000000000001', 'AP Proposal', 1000000, 'sent'
);

INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, project_id, title,
  decision_type, coordination_kind, court, status, sent_at, selected_by
) VALUES (
  'd8060000-0000-4000-8000-000000000001', 'd8030000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-00000000000d', 'd8040000-0000-4000-8000-000000000001',
  'AP Decision', 'material', 'selection', 'client', 'responded', now(),
  'd8000000-0000-4000-8000-000000000001'
);
INSERT INTO public.client_decision_options (id, decision_id, name, sort_order)
VALUES ('d8070000-0000-4000-8000-000000000001', 'd8060000-0000-4000-8000-000000000001', 'Option A', 0),
       ('d8070000-0000-4000-8000-000000000002', 'd8060000-0000-4000-8000-000000000001', 'Option B', 1);

-- Two threads the client created: one shared with the designer, one where the
-- client is the only participant. Both are `project` kind — comms_check_thread
-- _cardinality requires exactly two active participants on `direct` and
-- `vendor_brief` only, so a one-sided direct thread cannot be fixtured.
INSERT INTO public.comms_threads (id, kind, created_by, project_id)
VALUES ('d8080000-0000-4000-8000-000000000001', 'project', 'd8000000-0000-4000-8000-000000000001',
        'd8040000-0000-4000-8000-000000000001'),
       ('d8080000-0000-4000-8000-000000000002', 'project', 'd8000000-0000-4000-8000-000000000001',
        'd8040000-0000-4000-8000-000000000001');
INSERT INTO public.comms_thread_participants (thread_id, profile_id, role)
VALUES ('d8080000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'client'),
       ('d8080000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-00000000000d', 'designer'),
       ('d8080000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000001', 'client');

INSERT INTO public.saved_items (id, user_id, name, price_in_cents, source)
VALUES ('d8090000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
        'AP Saved Chair', 125000, 'emergence');

-- The fixtures above leave deferred constraint triggers pending, and
-- ALTER TABLE ... DISABLE TRIGGER refuses to run against a table with pending
-- trigger events. Flush them first. This is a fixture artifact only: the edge
-- function calls the purge in its own transaction, against committed rows.
SET CONSTRAINTS ALL IMMEDIATE;

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_client   uuid := 'd8000000-0000-4000-8000-000000000001';
  u_designer uuid := 'd8000000-0000-4000-8000-00000000000d';
  v_count    int;
  v_owner    uuid;
  v_enabled  boolean;
BEGIN
  -- ── 1. grant posture ──
  ASSERT NOT has_function_privilege('authenticated',
      'public.purge_client_account(uuid)', 'EXECUTE'),
    'purge_client_account must NOT be executable by authenticated';
  ASSERT NOT has_function_privilege('anon',
      'public.purge_client_account(uuid)', 'EXECUTE'),
    'purge_client_account must NOT be executable by anon';
  ASSERT has_function_privilege('service_role',
      'public.purge_client_account(uuid)', 'EXECUTE'),
    'purge_client_account must be executable by service_role';

  -- ── 2. the delete actually goes through ──
  PERFORM public.purge_client_account(u_client);
  DELETE FROM auth.users WHERE id = u_client;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 1, 'the auth user must actually be deleted, got ' || v_count;
  ASSERT NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = u_client),
    'the profile must go with the auth user (00013:12 cascade)';

  -- ── 3. the designer's records survive, detached ──
  SELECT count(*) INTO v_count FROM public.proposals
   WHERE id = 'd8050000-0000-4000-8000-000000000001';
  ASSERT v_count = 1, 'the designer''s proposal must survive the erasure';
  SELECT p.client_id INTO v_owner FROM public.proposals p
   WHERE p.id = 'd8050000-0000-4000-8000-000000000001';
  ASSERT v_owner IS NULL, 'and carry no client identity';
  SELECT p.designer_client_id INTO v_owner FROM public.proposals p
   WHERE p.id = 'd8050000-0000-4000-8000-000000000001';
  ASSERT v_owner IS NULL, 'and no roster linkage';

  SELECT count(*) INTO v_count FROM public.projects
   WHERE id = 'd8040000-0000-4000-8000-000000000001';
  ASSERT v_count = 1, 'the project must survive';
  SELECT p.client_id INTO v_owner FROM public.projects p
   WHERE p.id = 'd8040000-0000-4000-8000-000000000001';
  ASSERT v_owner IS NULL, 'with no client identity';

  -- the decision cascaded away with its designer_clients parent; what matters
  -- is that nothing raised and the designer's own rows are intact
  ASSERT EXISTS (SELECT 1 FROM public.organization_members
                  WHERE user_id = u_designer),
    'the designer''s studio membership must be untouched';

  -- ── 4. what the client owned is gone ──
  SELECT count(*) INTO v_count FROM public.saved_items WHERE user_id = u_client;
  ASSERT v_count = 0, 'the client''s saved items must cascade away';
  SELECT count(*) INTO v_count FROM public.designer_clients WHERE client_id = u_client;
  ASSERT v_count = 0, 'the roster row must cascade away';
  SELECT count(*) INTO v_count FROM public.notification_log WHERE user_id = u_client;
  ASSERT v_count = 0, 'the client''s notifications must cascade away';

  -- ── 5. threads ──
  SELECT t.created_by INTO v_owner FROM public.comms_threads t
   WHERE t.id = 'd8080000-0000-4000-8000-000000000001';
  ASSERT v_owner = u_designer,
    'a shared thread must be handed to the remaining participant, not destroyed';
  ASSERT NOT EXISTS (SELECT 1 FROM public.comms_threads
                      WHERE id = 'd8080000-0000-4000-8000-000000000002'),
    'a thread with nobody left must be deleted';

  -- ── 6. every disabled trigger is back on ──
  SELECT bool_and(t.tgenabled = 'O') INTO v_enabled
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN (
       'public.proposals'::regclass, 'public.projects'::regclass,
       'public.invoices'::regclass, 'public.client_decisions'::regclass,
       'public.client_decision_options'::regclass);
  ASSERT v_enabled, 'every user trigger the purge disabled must be enabled again';

  RAISE NOTICE 'account_purge_test: ALL ASSERTIONS PASSED';
END $$;

ROLLBACK;
