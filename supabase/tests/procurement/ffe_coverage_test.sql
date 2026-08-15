-- ═══════════════════════════════════════════════════════════════════════════
-- FF&E invoice lines + coverage RPC tests (migration 00187)
--
-- Exercises the invoice ↔ procurement bridge:
--   1. kind CHECK admits 'ffe' (with ffe_item_id) and chk_line_items_ffe_kind
--      rejects kind='ffe' without ffe_item_id.
--   2. Unique live billing slot — a second line for the same item rejects
--      (uniq_invoice_line_items_ffe_item).
--   3. Coverage states walk: uninvoiced item; item on a draft invoice →
--      'invoiced'; issue_invoice → still 'invoiced'; record_invoice_payment
--      to full → 'paid'.
--   4. void_invoice releases the slot: line becomes kind 'adhoc' with
--      ffe_item_id NULL and metadata.released_ffe_item_id stamped, coverage
--      drops back to 'uninvoiced', AND the freed slot accepts a new line for
--      the same item.
--   5. SECURITY INVOKER scoping: as role `authenticated`, the owner sees one
--      row per item while a rival designer sees ZERO rows for the owner's
--      project (RLS does the scoping — the function has no ownership check).
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/procurement/ffe_coverage_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects. The transition RPCs
-- (issue_invoice / record_invoice_payment / void_invoice) are SECURITY
-- DEFINER and resolve the caller from auth.uid(), so cases set
-- request.jwt.claims (the auth-context idiom from create_po_rpc_test.sql).
-- Case 5 additionally needs SET LOCAL ROLE authenticated, because
-- get_ffe_invoice_coverage is SECURITY INVOKER and the postgres superuser
-- bypasses RLS — claims alone would not exercise the scoping.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

-- Owner designer + rival designer auth users and profiles (profiles may be
-- auto-created by an auth.users trigger; ON CONFLICT keeps this agnostic).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('99999999-9999-4999-8999-999999999901', 'ffe-coverage-owner@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- u_owner
  ('99999999-9999-4999-8999-999999999902', 'ffe-coverage-rival@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- u_rival

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('99999999-9999-4999-8999-999999999901', 'ffe-coverage-owner@test.invalid', 'FFE Coverage Owner', NOW(), NOW()),
  ('99999999-9999-4999-8999-999999999902', 'ffe-coverage-rival@test.invalid', 'FFE Coverage Rival', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('dd000000-0000-4000-8000-000000000001', 'FFE Coverage Test Project', '99999999-9999-4999-8999-999999999901', '99999999-9999-4999-8999-999999999901'); -- p1

-- FF&E items:
--   i_a 'dd200000-…01' — coverage walk (draft → issued → paid)     (case 2/3)
--   i_b 'dd200000-…02' — void/release walk                          (case 4)
--   i_c 'dd200000-…03' — stays uninvoiced (control)                 (case 3/5)
--   i_d 'dd200000-…04' — constraint scratch item                    (case 1)
INSERT INTO project_ffe_items (id, project_id, name, status, quantity, unit_price_cents, line_total_cents)
VALUES
  ('dd200000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 'Coverage sofa',     'specified', 1, 50000, 50000),
  ('dd200000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000001', 'Coverage credenza', 'specified', 1, 80000, 80000),
  ('dd200000-0000-4000-8000-000000000003', 'dd000000-0000-4000-8000-000000000001', 'Coverage lamp',     'specified', 1, 20000, 20000),
  ('dd200000-0000-4000-8000-000000000004', 'dd000000-0000-4000-8000-000000000001', 'Constraint stool',  'specified', 1, 10000, 10000);

-- Draft invoices, all owner-designed against p1:
--   inv0 'dd100000-…00' — constraint scratch (cases 1/2)
--   inv1 'dd100000-…01' — coverage walk for i_a (cases 2/3)
--   inv2 'dd100000-…02' — void walk for i_b (case 4)
--   inv3 'dd100000-…03' — re-bill of i_b after release (case 4)
INSERT INTO invoices (id, project_id, designer_id, status, tax_rate)
VALUES
  ('dd100000-0000-4000-8000-000000000000', 'dd000000-0000-4000-8000-000000000001', '99999999-9999-4999-8999-999999999901', 'draft', 0),
  ('dd100000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', '99999999-9999-4999-8999-999999999901', 'draft', 0),
  ('dd100000-0000-4000-8000-000000000002', 'dd000000-0000-4000-8000-000000000001', '99999999-9999-4999-8999-999999999901', 'draft', 0),
  ('dd100000-0000-4000-8000-000000000003', 'dd000000-0000-4000-8000-000000000001', '99999999-9999-4999-8999-999999999901', 'draft', 0);

-- ─── helpers ───────────────────────────────────────────────────────────────
--
-- The DEFINER RPCs resolve the caller via auth.uid() =
-- request.jwt.claims->>'sub'; the INVOKER coverage function relies on RLS,
-- which additionally needs a non-superuser role (case 5 pairs this with
-- SET LOCAL ROLE authenticated). Same claims idiom as create_po_rpc_test.sql.

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

GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO authenticated;

-- ─── case 1: kind CHECK admits 'ffe' / rejects 'ffe' without ffe_item_id ────

DO $$
DECLARE
  v_err TEXT := NULL;
BEGIN
  -- 1a: 'ffe' WITH ffe_item_id inserts cleanly.
  INSERT INTO invoice_line_items (invoice_id, kind, ffe_item_id, description, quantity, unit_amount_cents, amount_cents)
  VALUES ('dd100000-0000-4000-8000-000000000000', 'ffe', 'dd200000-0000-4000-8000-000000000004', 'Constraint stool', 1, 10000, 10000);

  PERFORM 1 FROM invoice_line_items
   WHERE invoice_id = 'dd100000-0000-4000-8000-000000000000'
     AND kind = 'ffe'
     AND ffe_item_id = 'dd200000-0000-4000-8000-000000000004';
  ASSERT FOUND, 'FAIL 1a: kind=ffe line with ffe_item_id should insert';

  -- 1b: 'ffe' WITHOUT ffe_item_id violates chk_line_items_ffe_kind (23514).
  BEGIN
    INSERT INTO invoice_line_items (invoice_id, kind, description, quantity, unit_amount_cents, amount_cents)
    VALUES ('dd100000-0000-4000-8000-000000000000', 'ffe', 'Dangling ffe line', 1, 5000, 5000);
  EXCEPTION WHEN check_violation THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%chk_line_items_ffe_kind%',
    'FAIL 1b: kind=ffe without ffe_item_id should violate chk_line_items_ffe_kind, got ' || COALESCE(v_err, 'no error');

  RAISE NOTICE 'Case 1 passed: kind CHECK admits ffe; ffe-kind requires ffe_item_id.';
END
$$;

-- ─── case 2: unique live billing slot per item ───────────────────────────────

DO $$
DECLARE
  v_err TEXT := NULL;
BEGIN
  -- Bill i_a on inv1 (its live slot).
  INSERT INTO invoice_line_items (invoice_id, kind, ffe_item_id, description, quantity, unit_amount_cents, amount_cents)
  VALUES ('dd100000-0000-4000-8000-000000000001', 'ffe', 'dd200000-0000-4000-8000-000000000001', 'Coverage sofa', 1, 50000, 50000);

  -- A second line for i_a — on ANY invoice — must reject (23505).
  BEGIN
    INSERT INTO invoice_line_items (invoice_id, kind, ffe_item_id, description, quantity, unit_amount_cents, amount_cents)
    VALUES ('dd100000-0000-4000-8000-000000000000', 'ffe', 'dd200000-0000-4000-8000-000000000001', 'Double-billed sofa', 1, 50000, 50000);
  EXCEPTION WHEN unique_violation THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%uniq_invoice_line_items_ffe_item%',
    'FAIL 2: second live line for the same item should hit uniq_invoice_line_items_ffe_item, got ' || COALESCE(v_err, 'no error');

  RAISE NOTICE 'Case 2 passed: one live billing slot per FF&E item.';
END
$$;

-- ─── case 3: coverage states — uninvoiced → invoiced (draft/sent) → paid ─────

DO $$
DECLARE
  r         RECORD;
  v_invoice invoices%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume_user('99999999-9999-4999-8999-999999999901');

  -- 3a: untouched item → 'uninvoiced', no invoice fields.
  SELECT * INTO r FROM get_ffe_invoice_coverage('dd000000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = 'dd200000-0000-4000-8000-000000000003';
  ASSERT FOUND AND r.coverage = 'uninvoiced' AND r.invoice_id IS NULL AND r.billed_cents IS NULL,
    'FAIL 3a: untouched item should be uninvoiced with NULL invoice fields';

  -- 3b: i_a sits on DRAFT inv1 → 'invoiced' with the line money.
  SELECT * INTO r FROM get_ffe_invoice_coverage('dd000000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = 'dd200000-0000-4000-8000-000000000001';
  ASSERT FOUND AND r.coverage = 'invoiced'
         AND r.invoice_id = 'dd100000-0000-4000-8000-000000000001'
         AND r.invoice_status = 'draft'
         AND r.billed_cents = 50000,
    'FAIL 3b: draft-billed item should be invoiced/draft/50000, got ' || COALESCE(r.coverage, 'NULL') || '/' || COALESCE(r.invoice_status, 'NULL');

  -- 3c: issue_invoice (draft → sent) → still 'invoiced', now numbered.
  PERFORM issue_invoice('dd100000-0000-4000-8000-000000000001');
  SELECT * INTO r FROM get_ffe_invoice_coverage('dd000000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = 'dd200000-0000-4000-8000-000000000001';
  ASSERT r.coverage = 'invoiced' AND r.invoice_status = 'sent' AND r.invoice_number IS NOT NULL,
    'FAIL 3c: issued invoice should keep the item at invoiced (sent, numbered)';

  -- 3d: record full payment → 'paid'.
  SELECT * INTO v_invoice FROM invoices WHERE id = 'dd100000-0000-4000-8000-000000000001';
  PERFORM record_invoice_payment('dd100000-0000-4000-8000-000000000001', v_invoice.total_cents, 'check');
  SELECT * INTO r FROM get_ffe_invoice_coverage('dd000000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = 'dd200000-0000-4000-8000-000000000001';
  ASSERT r.coverage = 'paid' AND r.invoice_status = 'paid',
    'FAIL 3d: fully paid invoice should flip the item to paid, got ' || COALESCE(r.coverage, 'NULL');

  -- One row per item, exactly (4 fixture items).
  SELECT COUNT(*) AS n INTO r FROM get_ffe_invoice_coverage('dd000000-0000-4000-8000-000000000001');
  ASSERT r.n = 4, 'FAIL 3e: coverage should return exactly one row per item (4), got ' || r.n::text;

  RAISE NOTICE 'Case 3 passed: uninvoiced → invoiced (draft, sent) → paid; one row per item.';
END
$$;

-- ─── case 4: void_invoice releases the slot ──────────────────────────────────

DO $$
DECLARE
  r       RECORD;
  v_line  invoice_line_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume_user('99999999-9999-4999-8999-999999999901');

  -- Bill i_b on inv2 and issue it (void from 'sent' exercises the full path).
  INSERT INTO invoice_line_items (invoice_id, kind, ffe_item_id, description, quantity, unit_amount_cents, amount_cents)
  VALUES ('dd100000-0000-4000-8000-000000000002', 'ffe', 'dd200000-0000-4000-8000-000000000002', 'Coverage credenza', 1, 80000, 80000);
  PERFORM issue_invoice('dd100000-0000-4000-8000-000000000002');

  PERFORM void_invoice('dd100000-0000-4000-8000-000000000002', 'client changed scope');

  -- 4a: the line was released — kind rewritten, pointer cleared, audit crumb.
  SELECT * INTO v_line FROM invoice_line_items
   WHERE invoice_id = 'dd100000-0000-4000-8000-000000000002';
  ASSERT v_line.kind = 'adhoc',
    'FAIL 4a: released line should be kind adhoc, got ' || v_line.kind;
  ASSERT v_line.ffe_item_id IS NULL,
    'FAIL 4b: released line should have ffe_item_id NULL';
  ASSERT v_line.metadata->>'released_ffe_item_id' = 'dd200000-0000-4000-8000-000000000002',
    'FAIL 4c: released line should carry metadata.released_ffe_item_id, got ' || COALESCE(v_line.metadata->>'released_ffe_item_id', 'NULL');

  -- 4d: coverage drops back to 'uninvoiced'.
  SELECT * INTO r FROM get_ffe_invoice_coverage('dd000000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = 'dd200000-0000-4000-8000-000000000002';
  ASSERT FOUND AND r.coverage = 'uninvoiced' AND r.invoice_id IS NULL,
    'FAIL 4d: voided billing should leave the item uninvoiced, got ' || COALESCE(r.coverage, 'NULL');

  -- 4e: the freed slot accepts a NEW line for the same item.
  INSERT INTO invoice_line_items (invoice_id, kind, ffe_item_id, description, quantity, unit_amount_cents, amount_cents)
  VALUES ('dd100000-0000-4000-8000-000000000003', 'ffe', 'dd200000-0000-4000-8000-000000000002', 'Coverage credenza (re-billed)', 1, 80000, 80000);

  SELECT * INTO r FROM get_ffe_invoice_coverage('dd000000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = 'dd200000-0000-4000-8000-000000000002';
  ASSERT r.coverage = 'invoiced' AND r.invoice_id = 'dd100000-0000-4000-8000-000000000003',
    'FAIL 4e: freed slot should accept a new line (coverage invoiced on inv3)';

  RAISE NOTICE 'Case 4 passed: void releases the slot (adhoc + NULL pointer + audit crumb) and the item is billable again.';
END
$$;

-- ─── case 4f: stuck-slot hazard (direct-SQL bypass, documentation only) ──────
--
-- This state is UNREACHABLE through the managed RPCs (void_invoice always
-- rewrites the line before setting status='void'). It exists solely to
-- document the hazard for direct-SQL writers: if a row is updated to
-- status='void' without first clearing the ffe_item_id on its lines, the
-- unique slot index is not released and the item cannot be re-billed.
--
-- 4f assertions:
--   (a) get_ffe_invoice_coverage still returns 'uninvoiced' for the item
--       (void invoice is filtered from the coverage view — billed_cents NULL).
--   (b) Attempting to INSERT a new kind='ffe' line for the same item raises
--       unique_violation on uniq_invoice_line_items_ffe_item (slot is stuck).

DO $$
DECLARE
  r        RECORD;
  v_err    TEXT := NULL;
  v_inv_id UUID := 'dd100000-0000-4000-8000-000000000003';
  v_item_id UUID := 'dd200000-0000-4000-8000-000000000002';
BEGIN
  -- Precondition: i_b (credenza) was re-billed on inv3 at end of case 4e.
  -- Directly void inv3 WITHOUT letting void_invoice run (bypasses the slot-
  -- release trigger). This simulates a direct UPDATE by a DBA or a future
  -- migration that forgets to call the managed RPC.
  UPDATE invoices SET status = 'void' WHERE id = v_inv_id;

  -- 4f-a: coverage sees the item as 'uninvoiced' (void is filtered).
  PERFORM pg_temp.assume_user('99999999-9999-4999-8999-999999999901');
  SELECT * INTO r FROM get_ffe_invoice_coverage('dd000000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = v_item_id;
  ASSERT FOUND AND r.coverage = 'uninvoiced' AND r.billed_cents IS NULL,
    'FAIL 4f-a: voided invoice should be filtered — item should appear uninvoiced with NULL billed_cents, got '
    || COALESCE(r.coverage, 'NULL') || '/' || COALESCE(r.billed_cents::text, 'NULL');

  -- 4f-b: the slot is stuck — a new line for the same item hits the unique index.
  BEGIN
    INSERT INTO invoice_line_items (invoice_id, kind, ffe_item_id, description, quantity, unit_amount_cents, amount_cents)
    VALUES ('dd100000-0000-4000-8000-000000000000', 'ffe', v_item_id, 'Stuck-slot re-bill attempt', 1, 80000, 80000);
  EXCEPTION WHEN unique_violation THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%uniq_invoice_line_items_ffe_item%',
    'FAIL 4f-b: stuck slot should block new ffe line (uniq_invoice_line_items_ffe_item), got '
    || COALESCE(v_err, 'no error');

  RAISE NOTICE 'Case 4f passed (stuck-slot hazard documented): void without RPC leaves slot stuck — coverage uninvoiced but re-bill blocked.';
END
$$;

-- ─── case 5: SECURITY INVOKER scoping ────────────────────────────────────────
--
-- The coverage function deliberately has no ownership check — RLS is the
-- gate. The postgres superuser bypasses RLS, so this case drops to the
-- `authenticated` role (which the function is granted to) and switches
-- request.jwt.claims between the owner and a rival designer.

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- 5a: owner (positive control) sees one row per item.
  PERFORM pg_temp.assume_user('99999999-9999-4999-8999-999999999901');
  SELECT COUNT(*) INTO v_count
    FROM get_ffe_invoice_coverage('dd000000-0000-4000-8000-000000000001');
  ASSERT v_count = 4,
    'FAIL 5a: owner (as authenticated) should see 4 coverage rows, got ' || v_count::text;

  -- 5b: rival designer sees ZERO rows for the owner's project.
  PERFORM pg_temp.assume_user('99999999-9999-4999-8999-999999999902');
  SELECT COUNT(*) INTO v_count
    FROM get_ffe_invoice_coverage('dd000000-0000-4000-8000-000000000001');
  ASSERT v_count = 0,
    'FAIL 5b: rival (as authenticated) should see 0 coverage rows, got ' || v_count::text;

  RAISE NOTICE 'Case 5 passed: INVOKER + RLS scoping — owner sees rows, rival sees none.';
END
$$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'All ffe_coverage assertions passed.'; END $$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
