-- ═══════════════════════════════════════════════════════════════════════════
-- purge_client_account tests (migration 00538, lineage 00536 → 00538)
--
-- SP-20 / App Store Review Guideline 5.1.1(v), under Fable's W1b ruling 2:
-- "Anonymize and detach; never cascade designer-owned records."
--
-- 00536 cleared the road for a HARD auth delete, which — because profiles.id
-- cascades from auth.users (00013:12) — meant NULLing every designer-owned leg
-- and disabling five tables' triggers under ACCESS EXCLUSIVE to get past
-- guard_proposal_copy_immutability, and it took the designer's decision record
-- with it. 00538 detaches the auth user with GoTrue's SOFT delete instead. The
-- profile survives as the tombstone, so every designer-owned leg still names
-- it and NOTHING is written to proposals, projects, invoices, client_decisions
-- or designer_clients.
--
-- Covers:
--   1. grant posture — service_role only, never authenticated/anon/PUBLIC;
--   2. the purge REFUSES a designer id outright (review B-D3), before writing;
--   3. the designer's records SURVIVE **and still name the client** — proposal
--      (non-draft, the immutable edition), project, issued invoice, roster row,
--      and the decision with its two options, which 00536 destroyed;
--   4. the client's PII is gone from profiles, replaced by a tombstone;
--   5. what the client owned is gone — rooms, room scans, saved items,
--      notifications, push tokens, and the threads the client started in which
--      no designer ever spoke (a shared one included: the designer sitting in
--      a thread is not the same as her having written in it);
--   6. the narrowing Fable ruled (integration.md §7 item 3, from
--      waves/w2/d-notes.md §3): a thread the client started that carries a
--      DESIGNER-AUTHORED message is KEPT whole, messages and all, and the
--      client's own messages in it name the tombstone rather than being
--      scrubbed; and a thread the DESIGNER started survives, with the client's
--      participant row intact and naming the tombstone;
--   7. NO trigger was disabled — the assertion 00536 needed because it broke
--      them and put them back; 00538 must pass it trivially. An ENABLE ALWAYS
--      trigger is still ALWAYS;
--   8. the journal (review M-D4) records what was deleted, retains NO email,
--      stays open until mark_client_account_purge_complete closes it, and is
--      unreadable to anon/authenticated;
--   9. a SECOND purge of the same id succeeds and reuses the open journal row
--      — the purge and the auth detach are two round trips, so a retry is
--      expected and must not read as a second interrupted closure — and the
--      retry MERGES into that row: the second sweep finds nothing left to
--      delete, so an overwrite would erase the tally of what the first pass
--      actually removed, which is what an operator reconciles from (D-1).
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/auth/account_purge_test.sql
--
-- Single transaction; ROLLBACK at the end. Nothing survives the run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('d8000000-0000-4000-8000-00000000000d', 'ap-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d8000000-0000-4000-8000-000000000001', 'ap-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, display_name, full_name, phone, city, is_designer, created_at, updated_at)
VALUES
  ('d8000000-0000-4000-8000-00000000000d', 'ap-designer@test.invalid', 'AP Designer', 'AP Designer', NULL, NULL, true,  NOW(), NOW()),
  ('d8000000-0000-4000-8000-000000000001', 'ap-client@test.invalid',   'AP Client',   'AP Client',   '+15555550123', 'Portland', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  is_designer   = EXCLUDED.is_designer,
  email         = EXCLUDED.email,
  display_name  = EXCLUDED.display_name,
  full_name     = EXCLUDED.full_name,
  phone         = EXCLUDED.phone,
  city          = EXCLUDED.city;

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

-- A NON-DRAFT proposal: the immutability guard that has no escape hatch. 00536
-- could only get past it by disabling the trigger; 00538 never writes here.
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

-- Four threads, chosen so the narrowed clause is exercised on both sides.
--   …0001  the CLIENT started, the DESIGNER wrote in it   → KEPT
--   …0002  the CLIENT started, nobody else in it          → deleted
--   …0004  the CLIENT started, the designer sits in it but never wrote → deleted
--   …0003  the DESIGNER started, the client in it         → survives
-- All `project` kind — comms_check_thread_cardinality requires exactly two
-- active participants on `direct` and `vendor_brief` only, so a one-sided
-- direct thread cannot be fixtured.
INSERT INTO public.comms_threads (id, kind, created_by, project_id)
VALUES ('d8080000-0000-4000-8000-000000000001', 'project', 'd8000000-0000-4000-8000-000000000001',
        'd8040000-0000-4000-8000-000000000001'),
       ('d8080000-0000-4000-8000-000000000002', 'project', 'd8000000-0000-4000-8000-000000000001',
        'd8040000-0000-4000-8000-000000000001'),
       ('d8080000-0000-4000-8000-000000000003', 'project', 'd8000000-0000-4000-8000-00000000000d',
        'd8040000-0000-4000-8000-000000000001'),
       ('d8080000-0000-4000-8000-000000000004', 'project', 'd8000000-0000-4000-8000-000000000001',
        'd8040000-0000-4000-8000-000000000001');
INSERT INTO public.comms_thread_participants (thread_id, profile_id, role)
VALUES ('d8080000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001', 'client'),
       ('d8080000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-00000000000d', 'designer'),
       ('d8080000-0000-4000-8000-000000000002', 'd8000000-0000-4000-8000-000000000001', 'client'),
       ('d8080000-0000-4000-8000-000000000003', 'd8000000-0000-4000-8000-000000000001', 'client'),
       ('d8080000-0000-4000-8000-000000000003', 'd8000000-0000-4000-8000-00000000000d', 'designer'),
       ('d8080000-0000-4000-8000-000000000004', 'd8000000-0000-4000-8000-000000000001', 'client'),
       ('d8080000-0000-4000-8000-000000000004', 'd8000000-0000-4000-8000-00000000000d', 'designer');

-- Who actually spoke. This is the whole difference between …0001 and …0004:
-- the designer sits in both, and wrote in only one.
INSERT INTO public.comms_messages (id, thread_id, sender_id, body)
VALUES ('d80f0000-0000-4000-8000-000000000001', 'd8080000-0000-4000-8000-000000000001',
        'd8000000-0000-4000-8000-000000000001', 'AP client message in the shared thread'),
       ('d80f0000-0000-4000-8000-000000000002', 'd8080000-0000-4000-8000-000000000001',
        'd8000000-0000-4000-8000-00000000000d', 'AP designer reply — her record'),
       ('d80f0000-0000-4000-8000-000000000003', 'd8080000-0000-4000-8000-000000000002',
        'd8000000-0000-4000-8000-000000000001', 'AP client message, nobody listening'),
       ('d80f0000-0000-4000-8000-000000000004', 'd8080000-0000-4000-8000-000000000004',
        'd8000000-0000-4000-8000-000000000001', 'AP client message the designer never answered');

-- An ISSUED invoice: set_invoice_studio_id is one of the guards 00536 had to
-- disable. 00538 never writes here either.
INSERT INTO public.invoices (
  id, project_id, designer_id, client_id, studio_id, invoice_number, status,
  subtotal_cents, total_cents
) VALUES (
  'd80a0000-0000-4000-8000-000000000001', 'd8040000-0000-4000-8000-000000000001',
  'd8000000-0000-4000-8000-00000000000d', 'd8000000-0000-4000-8000-000000000001',
  'd8010000-0000-4000-8000-000000000001', 'AP-INV-0001', 'sent', 425000, 425000
);

-- What the client owns.
INSERT INTO public.saved_items (id, user_id, name, price_in_cents, source)
VALUES ('d8090000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
        'AP Saved Chair', 125000, 'emergence');
INSERT INTO public.rooms (id, user_id, name, type, budget_cents)
VALUES ('d80b0000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
        'AP Living Room', 'living_room', 900000);
INSERT INTO public.room_scans (id, user_id, room_id, name, status)
VALUES ('d80c0000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
        'd80b0000-0000-4000-8000-000000000001', 'AP Scan', 'ready');
INSERT INTO public.notification_log (id, user_id, type, channel, status)
VALUES ('d80d0000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
        'invoice_attention', 'in_app', 'delivered');
INSERT INTO public.device_push_tokens (id, user_id, token, platform, environment)
VALUES ('d80e0000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
        'ap-token-0001', 'ios', 'sandbox');

-- Flush deferred constraint triggers so the thread deletes below are checked
-- here rather than at a COMMIT this test never reaches.
SET CONSTRAINTS ALL IMMEDIATE;

-- One trigger promoted to ENABLE ALWAYS, so assertion 7 can prove 00538 left
-- the trigger estate exactly as it found it.
ALTER TABLE public.invoices ENABLE ALWAYS TRIGGER set_invoices_updated_at;

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_client   uuid := 'd8000000-0000-4000-8000-000000000001';
  u_designer uuid := 'd8000000-0000-4000-8000-00000000000d';
  v_count    int;
  v_owner    uuid;
  v_text     text;
  v_enabled  boolean;
  v_purge    uuid;
  v_again    uuid;
  v_detached jsonb;
  v_tgstate  "char";
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

  -- ── 2. a designer id is refused before anything moves (B-D3) ──
  BEGIN
    PERFORM public.purge_client_account(u_designer);
    ASSERT false, 'purge_client_account must refuse a designer account';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected
  END;
  ASSERT EXISTS (SELECT 1 FROM public.projects
                  WHERE id = 'd8040000-0000-4000-8000-000000000001'),
    'and must not have touched anything on the way to refusing';
  SELECT display_name INTO v_text FROM public.profiles WHERE id = u_designer;
  ASSERT v_text = 'AP Designer', 'nor tombstoned the designer';

  -- ── the purge ──
  v_purge := public.purge_client_account(u_client);
  ASSERT v_purge IS NOT NULL, 'the purge must return its journal row id';

  -- ── 3. the designer's records survive AND still name the client ──
  -- This is ruling 2. Under 00536 every one of these was NULL.
  SELECT count(*) INTO v_count FROM public.proposals
   WHERE id = 'd8050000-0000-4000-8000-000000000001';
  ASSERT v_count = 1, 'the designer''s non-draft proposal must survive the erasure';
  SELECT p.client_id INTO v_owner FROM public.proposals p
   WHERE p.id = 'd8050000-0000-4000-8000-000000000001';
  ASSERT v_owner = u_client, 'and still name the client, now a tombstone';
  SELECT p.designer_client_id INTO v_owner FROM public.proposals p
   WHERE p.id = 'd8050000-0000-4000-8000-000000000001';
  ASSERT v_owner = 'd8030000-0000-4000-8000-000000000001',
    'and keep its roster linkage';

  SELECT p.client_id INTO v_owner FROM public.projects p
   WHERE p.id = 'd8040000-0000-4000-8000-000000000001';
  ASSERT v_owner = u_client, 'the project must survive, still naming the client';

  SELECT i.client_id INTO v_owner FROM public.invoices i
   WHERE i.id = 'd80a0000-0000-4000-8000-000000000001';
  ASSERT v_owner = u_client, 'the issued invoice must survive, still naming the client';
  SELECT i.studio_id INTO v_owner FROM public.invoices i
   WHERE i.id = 'd80a0000-0000-4000-8000-000000000001';
  ASSERT v_owner = 'd8010000-0000-4000-8000-000000000001',
    'with its studio untouched';

  SELECT count(*) INTO v_count FROM public.designer_clients WHERE client_id = u_client;
  ASSERT v_count = 1,
    'the roster row must SURVIVE — it is what keeps the decision record alive (ruling 2)';

  -- the finding that produced ruling 2: under 00536 the decision and its
  -- options were deleted outright with their roster parent.
  ASSERT EXISTS (SELECT 1 FROM public.client_decisions
                  WHERE id = 'd8060000-0000-4000-8000-000000000001'),
    'the designer''s decision record must survive the erasure';
  SELECT d.selected_by INTO v_owner FROM public.client_decisions d
   WHERE d.id = 'd8060000-0000-4000-8000-000000000001';
  ASSERT v_owner = u_client, 'and still record who answered it, as a tombstone';
  SELECT count(*) INTO v_count FROM public.client_decision_options
   WHERE decision_id = 'd8060000-0000-4000-8000-000000000001';
  ASSERT v_count = 2, 'and keep both options, got ' || v_count;

  ASSERT EXISTS (SELECT 1 FROM public.organization_members
                  WHERE user_id = u_designer),
    'the designer''s studio membership must be untouched';

  -- ── 4. the client's PII is gone ──
  SELECT display_name INTO v_text FROM public.profiles WHERE id = u_client;
  ASSERT v_text = 'Former client',
    'the profile must read as a tombstone, got ' || COALESCE(v_text, '<null>');
  SELECT count(*) INTO v_count FROM public.profiles
   WHERE id = u_client
     AND (email IS NOT NULL OR full_name IS NOT NULL OR phone IS NOT NULL
       OR avatar_url IS NOT NULL OR city IS NOT NULL OR state IS NOT NULL
       OR zip IS NOT NULL OR stripe_customer_id IS NOT NULL
       OR posthog_distinct_id IS NOT NULL OR ios_device_id IS NOT NULL);
  ASSERT v_count = 0, 'no personal field may survive on the tombstone';
  ASSERT EXISTS (SELECT 1 FROM public.profiles WHERE id = u_client),
    'and the row itself must remain — it is what the designer''s documents point at';

  -- ── 5. what the client owned is gone ──
  SELECT count(*) INTO v_count FROM public.saved_items WHERE user_id = u_client;
  ASSERT v_count = 0, 'the client''s saved items must be deleted';
  SELECT count(*) INTO v_count FROM public.rooms WHERE user_id = u_client;
  ASSERT v_count = 0, 'her rooms must be deleted';
  SELECT count(*) INTO v_count FROM public.room_scans WHERE user_id = u_client;
  ASSERT v_count = 0, 'her scans must be deleted';
  SELECT count(*) INTO v_count FROM public.notification_log WHERE user_id = u_client;
  ASSERT v_count = 0, 'her notifications must be deleted';
  SELECT count(*) INTO v_count FROM public.device_push_tokens WHERE user_id = u_client;
  ASSERT v_count = 0, 'her push tokens must be deleted';
  ASSERT NOT EXISTS (SELECT 1 FROM public.comms_threads
                      WHERE id = 'd8080000-0000-4000-8000-000000000002'),
    'a thread with nobody else in it must be deleted';
  ASSERT NOT EXISTS (SELECT 1 FROM public.comms_threads
                      WHERE id = 'd8080000-0000-4000-8000-000000000004'),
    'and a thread the client started in which the designer never wrote, even '
    || 'though she sits in it — presence is not authorship';
  SELECT count(*) INTO v_count FROM public.comms_messages
   WHERE thread_id = 'd8080000-0000-4000-8000-000000000002';
  ASSERT v_count = 0, 'their messages cascade with them, got ' || v_count;

  -- ── 6. the narrowing: a thread the designer wrote in is KEPT ──
  -- integration.md §7 item 3. Deleting this one would cascade the designer's
  -- own words away, which is what ruling 2 exists to prevent.
  ASSERT EXISTS (SELECT 1 FROM public.comms_threads
                  WHERE id = 'd8080000-0000-4000-8000-000000000001'),
    'a thread the client started that carries a designer-authored message must be KEPT';
  SELECT count(*) INTO v_count FROM public.comms_messages
   WHERE thread_id = 'd8080000-0000-4000-8000-000000000001';
  ASSERT v_count = 2,
    'whole — both messages, hers and the client''s, got ' || v_count;
  SELECT m.sender_id INTO v_owner FROM public.comms_messages m
   WHERE m.id = 'd80f0000-0000-4000-8000-000000000001';
  ASSERT v_owner = u_client,
    'the client''s message keeps its author, because that author is now a tombstone';
  SELECT p.display_name INTO v_text FROM public.profiles p WHERE p.id = v_owner;
  ASSERT v_text = 'Former client',
    'and reading that author gives the tombstone, not a person, got ' || COALESCE(v_text, '<null>');
  SELECT count(*) INTO v_count FROM public.comms_thread_participants
   WHERE thread_id = 'd8080000-0000-4000-8000-000000000001';
  ASSERT v_count = 2,
    'with both participants still on it, got ' || v_count;

  -- and a thread the DESIGNER started survives, as it always did
  ASSERT EXISTS (SELECT 1 FROM public.comms_threads
                  WHERE id = 'd8080000-0000-4000-8000-000000000003'),
    'a thread the designer started must survive';
  SELECT count(*) INTO v_count FROM public.comms_thread_participants
   WHERE thread_id = 'd8080000-0000-4000-8000-000000000003';
  ASSERT v_count = 2,
    'with both participants intact — the leaver now names a tombstone, got ' || v_count;

  -- ── 7. no trigger was disabled ──
  SELECT bool_and(t.tgenabled <> 'D') INTO v_enabled
    FROM pg_trigger t
   WHERE NOT t.tgisinternal
     AND t.tgrelid IN (
       'public.proposals'::regclass, 'public.projects'::regclass,
       'public.invoices'::regclass, 'public.client_decisions'::regclass,
       'public.client_decision_options'::regclass);
  ASSERT v_enabled IS NOT FALSE,
    'no user trigger may be left disabled — 00538 disables none at all';
  SELECT t.tgenabled INTO v_tgstate FROM pg_trigger t
   WHERE t.tgrelid = 'public.invoices'::regclass
     AND t.tgname = 'set_invoices_updated_at';
  ASSERT v_tgstate = 'A',
    'and an ENABLE ALWAYS trigger is still ALWAYS, got ' || v_tgstate;

  -- ── 8. the journal (M-D4) ──
  SELECT p.detached INTO v_detached FROM public.client_account_purges p
   WHERE p.id = v_purge;
  ASSERT v_detached IS NOT NULL, 'the purge must journal what it did';
  ASSERT v_detached->'deleted'->>'public.saved_items' = '1',
    'the journal must count the saved item it deleted';
  ASSERT v_detached->'deleted'->>'public.rooms' = '1',
    'and the room';
  ASSERT v_detached->'deleted'->>'public.comms_threads' = '2',
    'and both threads it was allowed to delete — not the one the designer wrote in';
  ASSERT v_detached->'tombstoned_profile' = to_jsonb(u_client),
    'and name the profile it tombstoned';
  SELECT p.email INTO v_text FROM public.client_account_purges p WHERE p.id = v_purge;
  ASSERT v_text IS NULL,
    'an erasure ledger must not retain the address it erased';
  ASSERT EXISTS (SELECT 1 FROM public.client_account_purges
                  WHERE id = v_purge AND auth_deleted_at IS NULL),
    'and stay open until the edge function stamps it';
  ASSERT NOT has_table_privilege('authenticated', 'public.client_account_purges', 'SELECT'),
    'the erasure ledger must not be readable by authenticated';
  ASSERT NOT has_table_privilege('anon', 'public.client_account_purges', 'SELECT'),
    'nor by anon';

  -- ── 9. a retry reuses the open row ──
  v_again := public.purge_client_account(u_client);
  ASSERT v_again = v_purge,
    'a retry must reuse the open journal row, not open a second closure';
  SELECT count(*) INTO v_count FROM public.client_account_purges WHERE user_id = u_client;
  ASSERT v_count = 1, 'exactly one journal row for this account, got ' || v_count;
  SELECT display_name INTO v_text FROM public.profiles WHERE id = u_client;
  ASSERT v_text = 'Former client', 'and leave the tombstone as it was';

  -- and it must not erase what the first pass recorded (review D-1). This
  -- second sweep deleted nothing — everything was already gone — so an
  -- overwrite would empty the journal precisely when it is needed.
  SELECT p.detached INTO v_detached FROM public.client_account_purges p
   WHERE p.id = v_purge;
  ASSERT v_detached->'deleted'->>'public.rooms' = '1',
    'a retry must MERGE into the journal, not overwrite it: the room count reads '
      || COALESCE(v_detached->'deleted'->>'public.rooms', '<absent>');
  ASSERT v_detached->'deleted'->>'public.saved_items' = '1',
    'and the saved-item count must survive the retry';
  ASSERT v_detached->'deleted'->>'public.comms_threads' = '2',
    'and both thread deletions must survive it';
  ASSERT jsonb_array_length(v_detached->'threads_deleted') = 2,
    'and the journal must still name both threads it deleted, got '
      || jsonb_array_length(COALESCE(v_detached->'threads_deleted', '[]'::jsonb));
  ASSERT v_detached->'tombstoned_profile' = to_jsonb(u_client),
    'and still name the profile it tombstoned';

  PERFORM public.mark_client_account_purge_complete(v_purge);
  ASSERT EXISTS (SELECT 1 FROM public.client_account_purges
                  WHERE id = v_purge AND auth_deleted_at IS NOT NULL),
    'and close when the auth detach lands';

  RAISE NOTICE 'account_purge_test: ALL ASSERTIONS PASSED';
END $$;

ROLLBACK;
