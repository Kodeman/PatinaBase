-- ═══════════════════════════════════════════════════════════════════════════
-- 00591 — notification_log ref-scoped SELECT RLS + the anon write lockdown
--
-- 00591 adds ONE studio-scoped SELECT policy
-- (notification_log_ref_studio_select) to public.notification_log so a STUDIO
-- member can read an email notification_log row about a document their studio
-- owns (invoice / client_invitation / client_review / proposal), and closes
-- 00041's anon write hole. This file proves both, end to end:
--
--   1. A studio-A designer sees a notification_log row stamped ref_type =
--      'invoice' / ref_id = <studio A's invoice> — even though the row's
--      user_id is the CLIENT, not the designer, so only the new ref-scoped
--      policy (not 00041's owner policy) can be granting this.
--   2. The same designer does NOT see the equivalent row for studio B's
--      invoice (is_studio_comember fails the invoices EXISTS subquery).
--   3. The same designer does NOT see an unstamped row (ref_type IS NULL)
--      that belongs to a client user — the ref policy does not match a NULL
--      ref_type, and 00041's owner policy only matches the row's own user_id.
--   4. The invoice's own CLIENT — who CAN read the invoice itself, because it
--      is non-draft and invoices_household_select grants that — does NOT see
--      a DESIGNER-addressed row stamped to it (invoice_ar_flagged). This is
--      the asymmetry the policy exists for: a symmetric "can you see the
--      document" test would have leaked the studio's back office into the
--      homeowner's view.
--   5. A studio CO-MEMBER who is not the owning designer (…0003, admin of the
--      same org) DOES see that same back-office row.
--   6. anon sees zero rows and can neither UPDATE nor INSERT (42501). This is
--      the F1 hole: 00041's "Service role can …" policies test only
--      `auth.uid() IS NULL` (true for anon) and named no role, while anon
--      held table-wide INSERT/UPDATE/DELETE — so an unfiltered anon UPDATE
--      could have repointed every row's ref at one readable invoice.
--   7. The proposal leg stamps itself: _sync_proposal_send_email_log and
--      sync_proposal_send_in_app_log both write ref_type/ref_id, the studio
--      co-member sees the email row, and an unrelated designer does not.
--   8. An unrelated authenticated user (the outsider studio's owner) sees
--      none of it.
--   9. 00591 also drops NOT NULL on user_id, so a letter to a recipient with
--      no Patina account can be logged at all. Cases 3b / 4d / 6a2 carry that
--      row: the studio sees it through the ref policy, the addressee-by-email
--      does not (the owner policy's auth.uid() = user_id is NULL, never
--      TRUE), and anon does not.
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Plain psql script — BEGIN,
-- fixtures (written as postgres, RLS-exempt), pg_temp role-assumption
-- helpers (copied from rls/00584_studio_comember_rls_sweep.test.sql), a DO
-- block of ASSERTs, ROLLBACK. Single transaction, rerunnable, no side
-- effects.
--
-- Fixture, reused from the seeded stack (see 00584's own fixture note):
--   designer A   a0000000-…-0004  Leah Hartwell, owner of Local Dev Studio
--   co-member    a0000000-…-0003  Studio Manager, ADMIN of the SAME studio
--   client A     a0000000-…-0005  the designer's engaged homeowner
--   project A    b0000000-…-00d1  Aspen Loft Refresh, designer_id = …0004
--   proposal A   b0000000-…-0001  designer …0004 → client …0005
--   outsider     cf100000-…-0001  owner of Phase One Synthetic Studio,
--                                 shares no org with designer A
--
-- Run (single file, for iteration):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/notifications/00591_notification_log_ref_rls_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ─── helpers (same shape as rls/00584_studio_comember_rls_sweep.test.sql) ──

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── fixture preconditions ─────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.projects
                  WHERE id = 'b0000000-0000-0000-0000-0000000000d1'
                    AND designer_id = 'a0000000-0000-0000-0000-000000000004'),
    'FIXTURE: seeded project b0000000-…-00d1 must belong to designer …0004';
  ASSERT EXISTS (SELECT 1 FROM public.proposals
                  WHERE id = 'b0000000-0000-0000-0000-000000000001'
                    AND designer_id = 'a0000000-0000-0000-0000-000000000004'),
    'FIXTURE: seeded proposal b0000000-…-0001 must belong to designer …0004';
  ASSERT EXISTS (SELECT 1 FROM public.organization_members
                  WHERE user_id = 'a0000000-0000-0000-0000-000000000003'
                    AND organization_id = 'b0000000-0000-0000-0000-000000000001'
                    AND status = 'active' AND role <> 'guest'),
    'FIXTURE: co-member …0003 must be an active non-guest of studio b0000000-…-0001';
  ASSERT EXISTS (SELECT 1 FROM public.organizations
                  WHERE id = 'cf120000-0000-4000-8000-000000000001'),
    'FIXTURE: outsider studio cf120000-…-0001 must exist';
END $$;

-- ─── fixtures (written as postgres — RLS-exempt) ────────────────────────────

-- A fresh project + client for the outsider studio (00584 seeds no project
-- for cf100000-…-0001, only its org membership).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('e9050000-0000-4000-8000-000000000001', '00591-outsider-client@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('e9050000-0000-4000-8000-000000000001', '00591-outsider-client@test.invalid', '00591 Outsider Client', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;

INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status)
VALUES ('e9040000-0000-4000-8000-000000000001', '00591 Outsider Project',
        'cf100000-0000-4000-8000-000000000001', 'cf100000-0000-4000-8000-000000000001',
        'e9050000-0000-4000-8000-000000000001', 'cf120000-0000-4000-8000-000000000001', 'active')
ON CONFLICT (id) DO NOTHING;

-- Studio-A invoice (project b0000000-…-00d1 / designer …0004) and
-- studio-B invoice (project e9040000-…-0001 / designer cf100000-…-0001).
-- Studio A's is status 'sent', NOT draft, precisely so its client can read the
-- invoice itself (invoices_household_select) — that is what makes case 4 a
-- real test rather than a vacuous one. 'sent' requires an invoice_number
-- (chk_invoices_number_when_issued).
INSERT INTO public.invoices (id, project_id, designer_id, client_id, status, invoice_number)
VALUES
  ('e9030000-0000-4000-8000-00000000000a', 'b0000000-0000-0000-0000-0000000000d1',
   'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'sent', '00591-A'),
  ('e9030000-0000-4000-8000-00000000000b', 'e9040000-0000-4000-8000-000000000001',
   'cf100000-0000-4000-8000-000000000001', 'e9050000-0000-4000-8000-000000000001', 'sent', '00591-B')
ON CONFLICT (id) DO NOTHING;

-- Four notification_log rows: studio-A invoice addressed to the CLIENT (so
-- only the ref policy can grant designer A visibility), studio-B invoice, an
-- unstamped row addressed to client A, and the back-office row addressed to
-- the DESIGNER but stamped to studio A's invoice.
INSERT INTO public.notification_log (id, user_id, type, channel, status, ref_type, ref_id)
VALUES
  ('e9060000-0000-4000-8000-00000000000a', 'a0000000-0000-0000-0000-000000000005',
   'invoice_sent', 'email', 'sent', 'invoice', 'e9030000-0000-4000-8000-00000000000a'),
  ('e9060000-0000-4000-8000-00000000000b', 'e9050000-0000-4000-8000-000000000001',
   'invoice_sent', 'email', 'sent', 'invoice', 'e9030000-0000-4000-8000-00000000000b'),
  ('e9060000-0000-4000-8000-00000000000c', 'a0000000-0000-0000-0000-000000000005',
   'onboarding_step', 'email', 'sent', NULL, NULL),
  ('e9060000-0000-4000-8000-00000000000d', 'a0000000-0000-0000-0000-000000000004',
   'invoice_ar_flagged', 'email', 'sent', 'invoice', 'e9030000-0000-4000-8000-00000000000a'),
  -- the account-less recipient (00591 drops NOT NULL on user_id): a letter to
  -- a homeowner who never signed up, identified only by ref_type/ref_id.
  ('e9060000-0000-4000-8000-00000000000e', NULL,
   'invoice_sent', 'email', 'sent', 'invoice', 'e9030000-0000-4000-8000-00000000000a')
ON CONFLICT (id) DO NOTHING;

-- The proposal leg: a dispatch row (00388) whose two sync functions are the
-- SQL writers 00591 teaches to stamp ref_type/ref_id.
INSERT INTO public.proposal_send_dispatches (
  id, proposal_id, sent_at, designer_id, client_id, project_id, proposal_title,
  recipient_email, designer_name, sender_name, client_portal_path, state,
  provider_idempotency_key, email_log_id, in_app_log_id, delivered_at
) VALUES (
  'e9070000-0000-4000-8000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  NOW(),
  'a0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000005',
  'b0000000-0000-0000-0000-0000000000d1',
  '00591 Proposal Title',
  '00591-client@test.invalid',
  'Leah Hartwell',
  'Leah Hartwell',
  '/proposals/b0000000-0000-0000-0000-000000000001',
  'delivered',
  '00591-idempotency-key',
  'e9080000-0000-4000-8000-00000000000e',
  'e9080000-0000-4000-8000-00000000000f',
  NOW()
) ON CONFLICT (id) DO NOTHING;

-- ─── assertions ──────────────────────────────────────────────────────────────

SAVEPOINT s_ref_rls;

DO $$
DECLARE
  v_seen boolean;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');  -- designer A

  -- 1. designer A sees studio A's invoice-stamped row, though it is not theirs
  SELECT EXISTS (
    SELECT 1 FROM public.notification_log
     WHERE id = 'e9060000-0000-4000-8000-00000000000a'
  ) INTO v_seen;
  ASSERT v_seen,
    'FAIL 1: designer A must see the ref-scoped row for studio A''s invoice';

  -- 2. designer A must NOT see studio B's invoice-stamped row
  SELECT EXISTS (
    SELECT 1 FROM public.notification_log
     WHERE id = 'e9060000-0000-4000-8000-00000000000b'
  ) INTO v_seen;
  ASSERT NOT v_seen,
    'FAIL 2: designer A must NOT see the ref-scoped row for studio B''s invoice';

  -- 3. designer A must NOT see the unstamped row addressed to client A
  SELECT EXISTS (
    SELECT 1 FROM public.notification_log
     WHERE id = 'e9060000-0000-4000-8000-00000000000c'
  ) INTO v_seen;
  ASSERT NOT v_seen,
    'FAIL 3: designer A must NOT see an unstamped (ref_type IS NULL) row addressed to a client';

  -- 3b. the null-user row is reachable through the ref policy alone
  SELECT EXISTS (
    SELECT 1 FROM public.notification_log
     WHERE id = 'e9060000-0000-4000-8000-00000000000e'
  ) INTO v_seen;
  ASSERT v_seen,
    'FAIL 3b: designer A must see the account-less (user_id IS NULL) row stamped to their invoice';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00591 ref-scoped notification_log RLS: PASSED';
END $$;

ROLLBACK TO SAVEPOINT s_ref_rls;

-- ─── the asymmetry: the client of a readable invoice is NOT a studio reader ─

SAVEPOINT s_client_asymmetry;

DO $$
DECLARE
  v_seen boolean;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');  -- client A

  -- 4a. the premise: client A really can read studio A's invoice itself, so
  --     the next assertion is about the log policy, not about invoice access.
  SELECT EXISTS (
    SELECT 1 FROM public.invoices
     WHERE id = 'e9030000-0000-4000-8000-00000000000a'
  ) INTO v_seen;
  ASSERT v_seen,
    'FAIL 4a: client A must be able to read the non-draft invoice (invoices_household_select) '
    'or case 4 proves nothing';

  -- 4b. …and still must NOT see the DESIGNER-addressed row stamped to it
  SELECT EXISTS (
    SELECT 1 FROM public.notification_log
     WHERE id = 'e9060000-0000-4000-8000-00000000000d'
  ) INTO v_seen;
  ASSERT NOT v_seen,
    'FAIL 4b: client A must NOT see the designer-addressed invoice_ar_flagged row '
    'stamped to their own invoice';

  -- 4c. the client keeps 00041''s own-rows read
  SELECT EXISTS (
    SELECT 1 FROM public.notification_log
     WHERE id = 'e9060000-0000-4000-8000-00000000000a'
  ) INTO v_seen;
  ASSERT v_seen,
    'FAIL 4c: client A must still see the row addressed to them (00041 owner policy)';

  -- 4d. …and must NOT see the account-less row stamped to their invoice: the
  --     owner policy's `auth.uid() = user_id` is NULL, never TRUE, and the
  --     studio policy is the only other grantor.
  SELECT EXISTS (
    SELECT 1 FROM public.notification_log
     WHERE id = 'e9060000-0000-4000-8000-00000000000e'
  ) INTO v_seen;
  ASSERT NOT v_seen,
    'FAIL 4d: client A must NOT see the account-less (user_id IS NULL) row stamped to their invoice';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00591 client asymmetry: PASSED';
END $$;

ROLLBACK TO SAVEPOINT s_client_asymmetry;

-- ─── a studio CO-MEMBER (not the owner) reads the back office ───────────────

SAVEPOINT s_comember;

DO $$
DECLARE
  v_seen boolean;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');  -- co-member

  -- 5. the co-member is neither the row's user_id nor the invoice's
  --    designer_id, so only is_studio_comember can be granting this
  SELECT EXISTS (
    SELECT 1 FROM public.notification_log
     WHERE id = 'e9060000-0000-4000-8000-00000000000d'
  ) INTO v_seen;
  ASSERT v_seen,
    'FAIL 5: studio co-member …0003 must see the back-office row stamped to studio A''s invoice';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00591 studio co-member read: PASSED';
END $$;

ROLLBACK TO SAVEPOINT s_comember;

-- ─── anon: no rows, no writes (F1) ──────────────────────────────────────────

SAVEPOINT s_anon;

DO $$
DECLARE
  v_count integer;
  v_outcome text;
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  EXECUTE 'SET LOCAL ROLE anon';

  -- 6a. anon reads nothing: the ref policy is TO authenticated, and 00041's
  --     own-rows / admin policies both dead-end on a NULL auth.uid()
  --     (this whole-table count also covers the account-less row: a NULL
  --     user_id must not become a NULL-matches-NULL loophole)
  SELECT count(*) INTO v_count FROM public.notification_log;
  ASSERT v_count = 0,
    'FAIL 6a: anon must see zero notification_log rows, saw ' || v_count;

  SELECT count(*) INTO v_count
    FROM public.notification_log
   WHERE id = 'e9060000-0000-4000-8000-00000000000e';
  ASSERT v_count = 0,
    'FAIL 6a2: anon must not see the account-less (user_id IS NULL) row';

  -- 6b. the exact attack the review found: an UNFILTERED repoint of every row
  v_outcome := 'no error';
  BEGIN
    UPDATE public.notification_log
       SET ref_type = 'invoice',
           ref_id = 'e9030000-0000-4000-8000-00000000000a';
  EXCEPTION WHEN insufficient_privilege THEN
    v_outcome := 'denied';
  END;
  ASSERT v_outcome = 'denied',
    'FAIL 6b: an unfiltered anon UPDATE on notification_log must be permission denied, got: '
    || v_outcome;

  -- 6c. and no forged rows either
  v_outcome := 'no error';
  BEGIN
    INSERT INTO public.notification_log (user_id, type, channel, status, ref_type, ref_id)
    VALUES ('a0000000-0000-0000-0000-000000000005', 'invoice_sent', 'email', 'sent',
            'invoice', 'e9030000-0000-4000-8000-00000000000a');
  EXCEPTION WHEN insufficient_privilege THEN
    v_outcome := 'denied';
  END;
  ASSERT v_outcome = 'denied',
    'FAIL 6c: an anon INSERT into notification_log must be permission denied, got: '
    || v_outcome;

  EXECUTE 'RESET ROLE';
  RAISE NOTICE '00591 anon write lockdown: PASSED';
END $$;

ROLLBACK TO SAVEPOINT s_anon;

-- ─── the proposal leg stamps itself ─────────────────────────────────────────

SAVEPOINT s_proposal;

-- Both sync functions are REVOKEd from every role (00388/00534 posture); they
-- are reached by PERFORM from other definers in 00388. The fixture calls them
-- as postgres, which the ACL does not bind. sync_proposal_send_in_app_log
-- additionally gates on auth.role() = 'service_role'.
SELECT public._sync_proposal_send_email_log('e9070000-0000-4000-8000-000000000001');

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT public.sync_proposal_send_in_app_log('e9070000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claims', NULL, true);

DO $$
DECLARE
  v_type text;
  v_id uuid;
  v_seen boolean;
BEGIN
  -- 7a. the email row carries the stamp
  SELECT ref_type, ref_id INTO v_type, v_id
    FROM public.notification_log
   WHERE id = 'e9080000-0000-4000-8000-00000000000e';
  ASSERT v_type = 'proposal',
    'FAIL 7a: _sync_proposal_send_email_log must stamp ref_type=proposal, got: '
    || COALESCE(v_type, 'NULL');
  ASSERT v_id = 'b0000000-0000-0000-0000-000000000001',
    'FAIL 7a: _sync_proposal_send_email_log must stamp ref_id = the proposal id, got: '
    || COALESCE(v_id::text, 'NULL');

  -- 7b. so does the in-app row (F5)
  SELECT ref_type, ref_id INTO v_type, v_id
    FROM public.notification_log
   WHERE id = 'e9080000-0000-4000-8000-00000000000f';
  ASSERT v_type = 'proposal',
    'FAIL 7b: sync_proposal_send_in_app_log must stamp ref_type=proposal, got: '
    || COALESCE(v_type, 'NULL');
  ASSERT v_id = 'b0000000-0000-0000-0000-000000000001',
    'FAIL 7b: sync_proposal_send_in_app_log must stamp ref_id = the proposal id, got: '
    || COALESCE(v_id::text, 'NULL');

  -- 7c. the studio co-member reads the stamped email row (it is addressed to
  --     the client, so 00041's owner policy cannot be the grantor)
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  SELECT EXISTS (
    SELECT 1 FROM public.notification_log
     WHERE id = 'e9080000-0000-4000-8000-00000000000e'
  ) INTO v_seen;
  ASSERT v_seen,
    'FAIL 7c: studio co-member …0003 must see the proposal-stamped email row';
  PERFORM pg_temp.reset_role();

  -- 7d. the outsider designer does not
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  SELECT EXISTS (
    SELECT 1 FROM public.notification_log
     WHERE id = 'e9080000-0000-4000-8000-00000000000e'
  ) INTO v_seen;
  ASSERT NOT v_seen,
    'FAIL 7d: the outsider designer must NOT see the proposal-stamped email row';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '00591 proposal leg stamping: PASSED';
END $$;

ROLLBACK TO SAVEPOINT s_proposal;

-- ─── an unrelated authenticated user sees none of it ────────────────────────

SAVEPOINT s_outsider;

DO $$
DECLARE
  v_count integer;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');  -- outsider

  -- 8. the outsider owns studio B, so their own row …000b is legitimately
  --    visible; none of studio A's four rows may be.
  SELECT count(*) INTO v_count
    FROM public.notification_log
   WHERE id IN ('e9060000-0000-4000-8000-00000000000a',
                'e9060000-0000-4000-8000-00000000000c',
                'e9060000-0000-4000-8000-00000000000d',
                'e9060000-0000-4000-8000-00000000000e');
  ASSERT v_count = 0,
    'FAIL 8: an unrelated authenticated user must see none of studio A''s rows, saw ' || v_count;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00591 unrelated reader: PASSED';
END $$;

ROLLBACK TO SAVEPOINT s_outsider;

DO $$ BEGIN RAISE NOTICE '00591 notification_log ref RLS + anon lockdown: ALL PASSED'; END $$;

ROLLBACK;
