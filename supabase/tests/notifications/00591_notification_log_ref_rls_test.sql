-- ═══════════════════════════════════════════════════════════════════════════
-- 00591 — notification_log ref_type-scoped SELECT RLS
--
-- 00591 adds four ref_type-scoped SELECT policies to public.notification_log
-- so a designer can read a notification_log row about a document they can
-- already see (invoice / client_invitation / client_review / proposal),
-- without widening the table's general per-user visibility. This file proves
-- the invoice leg end to end:
--
--   1. A studio-A designer sees a notification_log row stamped ref_type =
--      'invoice' / ref_id = <studio A's invoice> — even though the row's
--      user_id is the CLIENT, not the designer, so only the new ref-scoped
--      policy (not 00041's owner policy) can be granting this.
--   2. The same designer does NOT see the equivalent row for studio B's
--      invoice (is_studio_comember fails the invoices EXISTS subquery).
--   3. The same designer does NOT see an unstamped row (ref_type IS NULL)
--      that belongs to a client user — none of the four new policies match a
--      NULL ref_type, and 00041's owner policy only matches the row's own
--      user_id.
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Plain psql script — BEGIN,
-- fixtures (written as postgres, RLS-exempt), pg_temp role-assumption
-- helpers (copied from rls/00584_studio_comember_rls_sweep.test.sql), a DO
-- block of ASSERTs, ROLLBACK. Single transaction, rerunnable, no side
-- effects.
--
-- Fixture, reused from the seeded stack (see 00584's own fixture note):
--   designer A   a0000000-…-0004  Leah Hartwell, owner of Local Dev Studio
--   client A     a0000000-…-0005  the designer's engaged homeowner
--   project A    b0000000-…-00d1  Aspen Loft Refresh, designer_id = …0004
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
INSERT INTO public.invoices (id, project_id, designer_id, client_id, status)
VALUES
  ('e9030000-0000-4000-8000-00000000000a', 'b0000000-0000-0000-0000-0000000000d1',
   'a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', 'draft'),
  ('e9030000-0000-4000-8000-00000000000b', 'e9040000-0000-4000-8000-000000000001',
   'cf100000-0000-4000-8000-000000000001', 'e9050000-0000-4000-8000-000000000001', 'draft')
ON CONFLICT (id) DO NOTHING;

-- Three notification_log rows: studio-A invoice (addressed to the CLIENT, so
-- only the new ref-scoped policy — not 00041's owner policy — can grant
-- designer A visibility), studio-B invoice, and an unstamped row addressed to
-- client A.
INSERT INTO public.notification_log (id, user_id, type, channel, status, ref_type, ref_id)
VALUES
  ('e9060000-0000-4000-8000-00000000000a', 'a0000000-0000-0000-0000-000000000005',
   'invoice_sent', 'email', 'sent', 'invoice', 'e9030000-0000-4000-8000-00000000000a'),
  ('e9060000-0000-4000-8000-00000000000b', 'e9050000-0000-4000-8000-000000000001',
   'invoice_sent', 'email', 'sent', 'invoice', 'e9030000-0000-4000-8000-00000000000b'),
  ('e9060000-0000-4000-8000-00000000000c', 'a0000000-0000-0000-0000-000000000005',
   'onboarding_step', 'email', 'sent', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

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

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00591 ref-scoped notification_log RLS: PASSED';
END $$;

ROLLBACK TO SAVEPOINT s_ref_rls;

ROLLBACK;
