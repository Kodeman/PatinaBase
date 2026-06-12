-- ═══════════════════════════════════════════════════════════════════════════
-- PO numbering / send-columns tests (migration 00188)
--
-- Exercises assign_po_number, the per-designer partial UNIQUE index, and the
-- po_counters RLS lockout:
--   1. assign_po_number happy path: first call stamps PO-0001 and creates the
--      counter row (next_number = 1); a second PO for the same designer gets
--      PO-0002 (counter advanced to 2); an idempotent re-call on the first PO
--      returns PO-0001 unchanged and leaves the counter at 2.
--   2. Per-designer sequences: a second designer's first assignment starts at
--      PO-0001 (counters never shared).
--   3. Non-owner rejected: the rival designer calling assign_po_number on the
--      owner's PO raises 'not found or access denied' (auth-context switch
--      via request.jwt.claims — same idiom as create_po_rpc_test.sql); the
--      target PO stays unnumbered and neither counter moves.
--   4. Partial UNIQUE uniq_purchase_orders_designer_po_number: a manual
--      duplicate po_number for the SAME designer raises unique_violation;
--      the same number for a DIFFERENT designer is allowed; NULL po_number
--      rows are unconstrained (the fixtures themselves prove this).
--   5. po_counters RLS lockout: rowsecurity is ON with ZERO policies
--      (pg_class/pg_policies asserts), and under SET LOCAL ROLE authenticated
--      a direct SELECT sees zero rows (default-deny) while a direct INSERT is
--      rejected (RLS violation / permission denied).
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/procurement/po_send_columns_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects. assign_po_number is SECURITY
-- DEFINER and resolves the caller from auth.uid(), so cases 1-3 switch
-- request.jwt.claims; case 5 additionally drops to SET LOCAL ROLE
-- authenticated because the postgres superuser bypasses RLS (same split as
-- ffe_coverage_test.sql case 5).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

-- Owner designer (A), rival designer (B) auth users + profiles (profiles may
-- be auto-created by an auth.users trigger; ON CONFLICT keeps this agnostic).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('66666666-6666-4666-8666-666666666601', 'po-send-designer-a@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- u_a
  ('66666666-6666-4666-8666-666666666602', 'po-send-designer-b@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- u_b

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('66666666-6666-4666-8666-666666666601', 'po-send-designer-a@test.invalid', 'PO Send Designer A', NOW(), NOW()),
  ('66666666-6666-4666-8666-666666666602', 'po-send-designer-b@test.invalid', 'PO Send Designer B', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- One project per designer + a shared vendor.
INSERT INTO projects (id, name, designer_id, created_by)
VALUES
  ('ee000000-0000-4000-8000-000000000001', 'PO Send Test Project A', '66666666-6666-4666-8666-666666666601', '66666666-6666-4666-8666-666666666601'),
  ('ee000000-0000-4000-8000-000000000002', 'PO Send Test Project B', '66666666-6666-4666-8666-666666666602', '66666666-6666-4666-8666-666666666602');

INSERT INTO vendors (id, name)
VALUES ('ee000000-0000-4000-8000-000000000003', 'PO Send Test Vendor');

-- POs (all unnumbered drafts — po_number is assigned by the RPC or, in
-- case 4, manually). Several NULL po_number rows for the same designer also
-- prove the partial index ignores unnumbered rows.
--   po_a1 ..01  designer A — case 1 (PO-0001 + idempotent re-call)
--   po_a2 ..02  designer A — case 1 (PO-0002)
--   po_a3 ..03  designer A — case 3 non-owner target, then case 4 manual 'PO-9999'
--   po_a4 ..04  designer A — case 4 duplicate-number rejection
--   po_b1 ..05  designer B — case 2 (per-designer PO-0001)
--   po_b2 ..06  designer B — case 4 same number, different designer (allowed)
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status)
VALUES
  ('ee100000-0000-4000-8000-000000000001', '66666666-6666-4666-8666-666666666601', 'ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000003', 'net_30',      120000, 'draft'), -- po_a1
  ('ee100000-0000-4000-8000-000000000002', '66666666-6666-4666-8666-666666666601', 'ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000003', 'fifty_fifty', 240000, 'draft'), -- po_a2
  ('ee100000-0000-4000-8000-000000000003', '66666666-6666-4666-8666-666666666601', 'ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000003', 'net_30',       60000, 'draft'), -- po_a3
  ('ee100000-0000-4000-8000-000000000004', '66666666-6666-4666-8666-666666666601', 'ee000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000003', 'net_30',       80000, 'draft'), -- po_a4
  ('ee100000-0000-4000-8000-000000000005', '66666666-6666-4666-8666-666666666602', 'ee000000-0000-4000-8000-000000000002', 'ee000000-0000-4000-8000-000000000003', 'net_30',      150000, 'draft'), -- po_b1
  ('ee100000-0000-4000-8000-000000000006', '66666666-6666-4666-8666-666666666602', 'ee000000-0000-4000-8000-000000000002', 'ee000000-0000-4000-8000-000000000003', 'net_30',       90000, 'draft'); -- po_b2

-- ─── helpers ───────────────────────────────────────────────────────────────
--
-- assign_po_number resolves the caller via auth.uid() = request.jwt.claims
-- ->>'sub'. SECURITY DEFINER means the function body never depends on the
-- session role, so switching the claims GUC alone is enough for cases 1-3
-- (same claims idiom as create_po_rpc_test.sql).

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
END;
$$ LANGUAGE plpgsql;

-- ─── case 1: assign_po_number — first/second number + idempotent re-call ─────

DO $$
DECLARE
  v_po      purchase_orders;
  v_counter INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('66666666-6666-4666-8666-666666666601');

  -- 1a: first assignment stamps PO-0001.
  v_po := assign_po_number('ee100000-0000-4000-8000-000000000001');
  ASSERT v_po.po_number = 'PO-0001',
    'FAIL 1a: first assignment should stamp PO-0001, got ' || COALESCE(v_po.po_number, 'NULL');

  -- 1b: the counter row was created with next_number = 1 (row stores the
  -- LAST assigned number; the DEFAULT-1 insert assigns without incrementing).
  SELECT next_number INTO v_counter
    FROM po_counters
   WHERE designer_id = '66666666-6666-4666-8666-666666666601';
  ASSERT FOUND AND v_counter = 1,
    'FAIL 1b: counter row should exist with next_number 1, got ' || COALESCE(v_counter::text, 'no row');

  -- 1c: second PO for the same designer gets PO-0002.
  v_po := assign_po_number('ee100000-0000-4000-8000-000000000002');
  ASSERT v_po.po_number = 'PO-0002',
    'FAIL 1c: second assignment should stamp PO-0002, got ' || COALESCE(v_po.po_number, 'NULL');

  -- 1d: idempotent re-call returns the original number unchanged…
  v_po := assign_po_number('ee100000-0000-4000-8000-000000000001');
  ASSERT v_po.po_number = 'PO-0001',
    'FAIL 1d: re-call must return the original PO-0001 unchanged, got ' || COALESCE(v_po.po_number, 'NULL');

  -- 1e: …and the persisted row + counter are untouched by the re-call.
  PERFORM 1 FROM purchase_orders
   WHERE id = 'ee100000-0000-4000-8000-000000000001' AND po_number = 'PO-0001';
  ASSERT FOUND, 'FAIL 1e: persisted po_number must still be PO-0001 after re-call';

  SELECT next_number INTO v_counter
    FROM po_counters
   WHERE designer_id = '66666666-6666-4666-8666-666666666601';
  ASSERT v_counter = 2,
    'FAIL 1f: counter should be 2 after two assignments + one re-call, got ' || v_counter::text;

  RAISE NOTICE 'Case 1 passed: PO-0001/PO-0002 sequence + idempotent re-call, counter correct.';
END
$$;

-- ─── case 2: second designer starts a fresh PO-0001 sequence ────────────────

DO $$
DECLARE
  v_po      purchase_orders;
  v_counter INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('66666666-6666-4666-8666-666666666602');

  v_po := assign_po_number('ee100000-0000-4000-8000-000000000005');
  ASSERT v_po.po_number = 'PO-0001',
    'FAIL 2a: designer B''s first assignment should start at PO-0001, got ' || COALESCE(v_po.po_number, 'NULL');

  SELECT next_number INTO v_counter
    FROM po_counters
   WHERE designer_id = '66666666-6666-4666-8666-666666666602';
  ASSERT FOUND AND v_counter = 1,
    'FAIL 2b: designer B should have an independent counter at 1, got ' || COALESCE(v_counter::text, 'no row');

  RAISE NOTICE 'Case 2 passed: per-designer sequences are independent (B starts at PO-0001).';
END
$$;

-- ─── case 3: non-owner rejected ──────────────────────────────────────────────

DO $$
DECLARE
  v_err      TEXT := NULL;
  v_counters RECORD;
BEGIN
  -- Rival (designer B) attempts to number designer A's unnumbered po_a3.
  PERFORM pg_temp.assume_user('66666666-6666-4666-8666-666666666602');
  BEGIN
    PERFORM assign_po_number('ee100000-0000-4000-8000-000000000003');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%not found or access denied%',
    'FAIL 3a: non-owner assignment should raise, got ' || COALESCE(v_err, 'no error');

  -- The target PO stays unnumbered and NEITHER counter moved.
  PERFORM 1 FROM purchase_orders
   WHERE id = 'ee100000-0000-4000-8000-000000000003' AND po_number IS NULL;
  ASSERT FOUND, 'FAIL 3b: failed non-owner call must leave the PO unnumbered';

  SELECT
    (SELECT next_number FROM po_counters WHERE designer_id = '66666666-6666-4666-8666-666666666601') AS a,
    (SELECT next_number FROM po_counters WHERE designer_id = '66666666-6666-4666-8666-666666666602') AS b
    INTO v_counters;
  ASSERT v_counters.a = 2 AND v_counters.b = 1,
    'FAIL 3c: failed call must not advance any counter, got A=' || v_counters.a::text || ' B=' || v_counters.b::text;

  RAISE NOTICE 'Case 3 passed: non-owner rejected; PO unnumbered, counters untouched.';
END
$$;

-- ─── case 4: partial UNIQUE — duplicate per designer, allowed cross-designer ─
--
-- Manual UPDATEs as superuser (RLS bypassed): the index must hold regardless
-- of how the number is written.

DO $$
DECLARE
  v_err TEXT := NULL;
BEGIN
  -- 4a: manual number on po_a3 succeeds (slot free).
  UPDATE purchase_orders SET po_number = 'PO-9999'
   WHERE id = 'ee100000-0000-4000-8000-000000000003';

  -- 4b: the SAME number for the SAME designer (po_a4) hits the index.
  BEGIN
    UPDATE purchase_orders SET po_number = 'PO-9999'
     WHERE id = 'ee100000-0000-4000-8000-000000000004';
  EXCEPTION WHEN unique_violation THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%uniq_purchase_orders_designer_po_number%',
    'FAIL 4b: duplicate po_number for the same designer should hit uniq_purchase_orders_designer_po_number, got '
    || COALESCE(v_err, 'no error');

  -- 4c: the SAME number for a DIFFERENT designer (po_b2) is allowed.
  UPDATE purchase_orders SET po_number = 'PO-9999'
   WHERE id = 'ee100000-0000-4000-8000-000000000006';
  PERFORM 1 FROM purchase_orders
   WHERE id = 'ee100000-0000-4000-8000-000000000006' AND po_number = 'PO-9999';
  ASSERT FOUND, 'FAIL 4c: the same po_number must be allowed for a different designer';

  RAISE NOTICE 'Case 4 passed: partial unique index — per-designer duplicate rejected, cross-designer allowed.';
END
$$;

-- ─── case 5: po_counters RLS lockout ─────────────────────────────────────────
--
-- 00178's invoice_counters posture, cloned here: RLS enabled with ZERO
-- policies. First assert the catalog shape as superuser, then drop to the
-- authenticated role (the postgres superuser bypasses RLS — same split as
-- ffe_coverage_test.sql case 5) and verify default-deny behavior directly.

DO $$
DECLARE
  v_rls      BOOLEAN;
  v_policies INTEGER;
  v_rows     INTEGER;
BEGIN
  -- 5a: rowsecurity is ON and zero policies exist.
  SELECT relrowsecurity INTO v_rls
    FROM pg_class WHERE oid = 'public.po_counters'::regclass;
  ASSERT v_rls,
    'FAIL 5a: po_counters must have row-level security enabled';

  SELECT COUNT(*) INTO v_policies
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'po_counters';
  ASSERT v_policies = 0,
    'FAIL 5b: po_counters must have ZERO policies (RPC/service-role only), got ' || v_policies::text;

  -- Positive control: counter rows DO exist (cases 1-2 created two), so the
  -- zero-rows assert in 5c below is RLS at work, not an empty table.
  SELECT COUNT(*) INTO v_rows FROM po_counters;
  ASSERT v_rows >= 2,
    'FAIL 5-pre: expected the fixture counters to exist as superuser, got ' || v_rows::text;
END
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_rows INTEGER;
  v_err  TEXT := NULL;
BEGIN
  PERFORM pg_temp.assume_user('66666666-6666-4666-8666-666666666601');

  -- 5c: default-deny SELECT — zero rows even for the designer whose counter
  -- exists (no policy grants any visibility). A permission error is an
  -- equally acceptable denial shape (no table grant at all).
  BEGIN
    SELECT COUNT(*) INTO v_rows FROM po_counters;
    ASSERT v_rows = 0,
      'FAIL 5c: authenticated SELECT must see zero counter rows (default-deny), got ' || v_rows::text;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- denied even harder: no SELECT grant
  END;

  -- 5d: direct INSERT is rejected (RLS violation or permission denied).
  BEGIN
    INSERT INTO po_counters (designer_id, next_number)
    VALUES ('66666666-6666-4666-8666-666666666602', 999);
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err IS NOT NULL
         AND (v_err LIKE '%row-level security%' OR v_err LIKE '%permission denied%'),
    'FAIL 5d: authenticated INSERT into po_counters must be denied, got ' || COALESCE(v_err, 'no error');

  RAISE NOTICE 'Case 5 passed: po_counters locked down — zero policies, default-deny SELECT, INSERT rejected.';
END
$$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'All po_send_columns assertions passed.'; END $$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
