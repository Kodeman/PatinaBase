-- ═══════════════════════════════════════════════════════════════════════════
-- claim_time_entries atomicity (migration 00595, HT-5)
--
-- The bug this pins: the portal's claim read-modify-wrote, and on a partial
-- conflict it ran `update({invoice_id:null}).eq('invoice_id', invoiceId)` —
-- detaching EVERY entry the invoice already carried. The RPC stamps one
-- statement and returns the ids it actually claimed; the caller compares the
-- count and rolls back. Nothing detaches, ever.
--
-- Covers:
--   (a) a partial claim (one id already billed elsewhere) stamps only the free
--       row, returns one id, and leaves BOTH the invoice's pre-existing entry
--       and the rival invoice's entry carrying their original invoice_id.
--   (b) re-claiming an already-claimed id to the SAME invoice returns nothing
--       and stamps nothing (idempotent).
--   (c) an invoiced row cannot be re-claimed to a SECOND invoice.
--   (d) a RUNNING timer (duration_minutes IS NULL) is never claimed — claiming
--       one would wedge the member's single running-timer slot for good.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/billing/time_claim_atomicity_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('a7100000-0000-4000-8000-000000000001', 'claim-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a7100000-0000-4000-8000-000000000002', 'claim-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('a7100000-0000-4000-8000-000000000001', 'claim-designer@test.invalid', 'Claim Designer', true,  NOW(), NOW()),
  ('a7100000-0000-4000-8000-000000000002', 'claim-client@test.invalid',   'Claim Client',   false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by, client_id)
VALUES ('a7100000-0000-4000-8000-0000000000e1', 'Claim House',
        'a7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000001',
        'a7100000-0000-4000-8000-000000000002');

-- Two draft invoices on the same project: the one being composed, and a rival.
INSERT INTO invoices (id, project_id, designer_id, client_id, status, currency, memo)
VALUES
  ('a7100000-0000-4000-8000-0000000000a1', 'a7100000-0000-4000-8000-0000000000e1',
   'a7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000002', 'draft', 'USD', 'Composing'),
  ('a7100000-0000-4000-8000-0000000000a2', 'a7100000-0000-4000-8000-0000000000e1',
   'a7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000002', 'draft', 'USD', 'Rival'),
  ('a7100000-0000-4000-8000-0000000000a3', 'a7100000-0000-4000-8000-0000000000e1',
   'a7100000-0000-4000-8000-000000000001', 'a7100000-0000-4000-8000-000000000002', 'draft', 'USD', 'Third');

-- E1 already belongs to the invoice being composed (the row the old rollback
-- detached). E2 is free. E3 was just claimed by the rival invoice.
INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, hourly_rate_cents, source)
VALUES
  ('a7100000-0000-4000-8000-0000000000b1', 'a7100000-0000-4000-8000-0000000000e1',
   'a7100000-0000-4000-8000-000000000001', NOW() - INTERVAL '3 days', 60, true, 20000, 'manual_entry'),
  ('a7100000-0000-4000-8000-0000000000b2', 'a7100000-0000-4000-8000-0000000000e1',
   'a7100000-0000-4000-8000-000000000001', NOW() - INTERVAL '2 days', 30, true, 20000, 'manual_entry'),
  ('a7100000-0000-4000-8000-0000000000b3', 'a7100000-0000-4000-8000-0000000000e1',
   'a7100000-0000-4000-8000-000000000001', NOW() - INTERVAL '1 day', 45, true, 20000, 'manual_entry');

UPDATE project_time_entries SET invoice_id = 'a7100000-0000-4000-8000-0000000000a1'
 WHERE id = 'a7100000-0000-4000-8000-0000000000b1';
UPDATE project_time_entries SET invoice_id = 'a7100000-0000-4000-8000-0000000000a2'
 WHERE id = 'a7100000-0000-4000-8000-0000000000b3';

-- ─── helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
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

-- ─── (a) a partial claim detaches nothing ──────────────────────────────────
DO $$
DECLARE
  v_claimed UUID[];
BEGIN
  PERFORM pg_temp.assume_user('a7100000-0000-4000-8000-000000000001');

  SELECT array_agg(id) INTO v_claimed
  FROM public.claim_time_entries(
    'a7100000-0000-4000-8000-0000000000a1',
    ARRAY['a7100000-0000-4000-8000-0000000000b2',
          'a7100000-0000-4000-8000-0000000000b3']::uuid[]
  ) AS id;

  PERFORM pg_temp.reset_role();

  ASSERT v_claimed = ARRAY['a7100000-0000-4000-8000-0000000000b2']::uuid[],
    'FAIL a1: a partial claim must return only the free entry, got ' || COALESCE(v_claimed::text, 'NULL');

  ASSERT (SELECT invoice_id FROM project_time_entries WHERE id = 'a7100000-0000-4000-8000-0000000000b1')
         = 'a7100000-0000-4000-8000-0000000000a1',
    'FAIL a2: the invoice''s pre-existing entry was detached — the 00595 bug is back';

  ASSERT (SELECT invoice_id FROM project_time_entries WHERE id = 'a7100000-0000-4000-8000-0000000000b3')
         = 'a7100000-0000-4000-8000-0000000000a2',
    'FAIL a3: the rival invoice''s entry must keep its invoice_id';

  ASSERT (SELECT invoice_id FROM project_time_entries WHERE id = 'a7100000-0000-4000-8000-0000000000b2')
         = 'a7100000-0000-4000-8000-0000000000a1',
    'FAIL a4: the free entry should be stamped with the composing invoice';

  RAISE NOTICE 'time_claim_atomicity: case (a) passed.';
END
$$;

-- ─── (b) idempotent on an already-claimed id ───────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a7100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_count
  FROM public.claim_time_entries(
    'a7100000-0000-4000-8000-0000000000a1',
    ARRAY['a7100000-0000-4000-8000-0000000000b2']::uuid[]
  );

  PERFORM pg_temp.reset_role();

  ASSERT v_count = 0,
    'FAIL b1: re-claiming an already-claimed id must return nothing, got ' || v_count;
  ASSERT (SELECT invoice_id FROM project_time_entries WHERE id = 'a7100000-0000-4000-8000-0000000000b2')
         = 'a7100000-0000-4000-8000-0000000000a1',
    'FAIL b2: a no-op claim must not restamp the row';

  RAISE NOTICE 'time_claim_atomicity: case (b) passed.';
END
$$;

-- ─── (c) an invoiced row cannot move to a second invoice ───────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a7100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_count
  FROM public.claim_time_entries(
    'a7100000-0000-4000-8000-0000000000a3',
    ARRAY['a7100000-0000-4000-8000-0000000000b2']::uuid[]
  );

  PERFORM pg_temp.reset_role();

  ASSERT v_count = 0,
    'FAIL c1: a claimed entry must not be claimable by a second invoice, got ' || v_count;
  ASSERT (SELECT invoice_id FROM project_time_entries WHERE id = 'a7100000-0000-4000-8000-0000000000b2')
         = 'a7100000-0000-4000-8000-0000000000a1',
    'FAIL c2: the entry must still belong to the first invoice';

  RAISE NOTICE 'time_claim_atomicity: case (c) passed.';
END
$$;

-- ─── (d) a RUNNING timer is never claimed ──────────────────────────────────
-- A running row on a non-services project is billable and billing_state
-- 'authorized' (00578:2648-2650), so only `duration_minutes IS NOT NULL` keeps it
-- out. Claim one and the invoiced lock (00177:51-84) freezes duration_minutes:
-- the timer can then neither be stopped nor discarded, and the per-user running
-- index (00177:37-41) ignores invoice_id, so the member can never start another.
DO $$
DECLARE
  v_count   INTEGER;
  v_state   TEXT;
  v_billable BOOLEAN;
BEGIN
  PERFORM pg_temp.assume_user('a7100000-0000-4000-8000-000000000001');
  INSERT INTO project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('a7100000-0000-4000-8000-0000000000b4', 'a7100000-0000-4000-8000-0000000000e1',
          'a7100000-0000-4000-8000-000000000001', NOW() - INTERVAL '10 minutes', NULL, true, 'timer_auto');
  PERFORM pg_temp.reset_role();

  -- Precondition: the ONLY thing that can exclude this row is its NULL duration.
  SELECT billing_state, billable INTO v_state, v_billable
  FROM project_time_entries WHERE id = 'a7100000-0000-4000-8000-0000000000b4';
  ASSERT v_billable, 'FAIL d0a: the running fixture must be billable for this case to mean anything';
  ASSERT v_state IS NULL OR v_state = 'authorized',
    'FAIL d0b: the running fixture must pass the billing_state clause, got ' || COALESCE(v_state, 'NULL');

  PERFORM pg_temp.assume_user('a7100000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count
  FROM public.claim_time_entries(
    'a7100000-0000-4000-8000-0000000000a3',
    ARRAY['a7100000-0000-4000-8000-0000000000b4']::uuid[]
  );
  PERFORM pg_temp.reset_role();

  ASSERT v_count = 0,
    'FAIL d1: a running timer must never be claimed, got ' || v_count;
  ASSERT (SELECT invoice_id IS NULL FROM project_time_entries
           WHERE id = 'a7100000-0000-4000-8000-0000000000b4'),
    'FAIL d2: a running timer must be left unstamped — invoicing it wedges the member''s timer slot';

  RAISE NOTICE 'time_claim_atomicity: case (d) passed.';
  RAISE NOTICE 'All time_claim_atomicity assertions passed.';
END
$$;

ROLLBACK;
