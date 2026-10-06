-- ═══════════════════════════════════════════════════════════════════════════
-- Studio buying Phase 0 RPC tests (migrations 00690–00692; US-16 C-00…C-05,
-- C-07 SQL; SQ-391)
--
-- A two-member studio (owner O, non-guest member M, guest G) plus an outsider
-- X with no studio seat. Cases:
--   0. C-00 probe: a direct UPDATE of purchase_orders as the authenticated
--      role (member AND owner) fails with 42501 — the write the old
--      useUpdatePurchaseOrderETA hook made.
--   1. set_purchase_order_eta: member sets ETA + note via the authenticated
--      role; acknowledged_at stays NULL and status does not move (R16); owner
--      allowed on a draft (stays draft); outsider, guest and a cancelled PO
--      refused.
--   2. set_purchase_order_ship_to: member sets ship-to on an unsent PO; refused
--      once sent_at is set; outsider refused.
--   3. advance_purchase_order_status: outsider refused; confirmed →
--      in_production → shipped moves linked lines through the 00184 cascade
--      and flips the pending balance to due on ship; illegal transitions
--      (backwards, → delivered, → cancelled, from draft, from cancelled)
--      refused; re-recording the current status is a no-op.
--   4. record_project_ffe_installed: only delivered lines move (with
--      installed_on); ordered/specified lines refuse the whole call; an
--      already-installed line is left untouched; outsider refused.
--   5. set_project_ffe_line_commercials: vendor + trade on an un-PO'd line
--      (vendor_name copied, markup recomputed), client price unchanged;
--      refused on a PO'd line, for unknown keys, bad values, a missing vendor
--      and an outsider; trade above client price records markup 0.
--   6. assign_po_number: a co-member numbers a PO under the owner's counter;
--      outsider refused.
--   7. Grants: anon and PUBLIC cannot execute any new function; authenticated
--      can.
--
-- How to run (after `supabase db reset`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase0_rpcs_test.sql
--
-- One transaction, rolled back at the end. RPCs resolve the caller from
-- request.jwt.claims (the create_po_rpc_test idiom); cases 0 and 1a also
-- switch to the authenticated role to exercise the real grant path.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('69000000-0000-4000-8000-0000000000a1', 'p0-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('69000000-0000-4000-8000-0000000000a2', 'p0-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- M
  ('69000000-0000-4000-8000-0000000000a3', 'p0-guest@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- G
  ('69000000-0000-4000-8000-0000000000a4', 'p0-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- X

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('69000000-0000-4000-8000-0000000000a1', 'p0-owner@test.invalid',    'P0 Owner',    NOW(), NOW()),
  ('69000000-0000-4000-8000-0000000000a2', 'p0-member@test.invalid',   'P0 Member',   NOW(), NOW()),
  ('69000000-0000-4000-8000-0000000000a3', 'p0-guest@test.invalid',    'P0 Guest',    NOW(), NOW()),
  ('69000000-0000-4000-8000-0000000000a4', 'p0-outsider@test.invalid', 'P0 Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('69000000-0000-4000-8000-0000000000f1', 'design_studio', 'P0 Studio', 'p0-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('69000000-0000-4000-8000-0000000000e1', '69000000-0000-4000-8000-0000000000a1', '69000000-0000-4000-8000-0000000000f1', 'owner',  'active', NOW()),
  ('69000000-0000-4000-8000-0000000000e2', '69000000-0000-4000-8000-0000000000a2', '69000000-0000-4000-8000-0000000000f1', 'member', 'active', NOW()),
  ('69000000-0000-4000-8000-0000000000e3', '69000000-0000-4000-8000-0000000000a3', '69000000-0000-4000-8000-0000000000f1', 'guest',  'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('69000000-0000-4000-8000-000000000001', 'P0 Project', '69000000-0000-4000-8000-0000000000a1', '69000000-0000-4000-8000-0000000000a1');

INSERT INTO vendors (id, name)
VALUES
  ('69000000-0000-4000-8000-000000000011', 'P0 Vendor One'),
  ('69000000-0000-4000-8000-000000000012', 'P0 Vendor Two');

-- POs (all owned by O, as create_purchase_order stores them):
--   po_conf  confirmed fifty_fifty, deposit paid + balance pending (case 3)
--   po_draft draft, unsent, unnumbered (cases 1, 2, 3, 6)
--   po_sent  confirmed, sent (case 2)
--   po_cxl   cancelled (cases 1, 3)
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, sent_at)
VALUES
  ('69000000-0000-4000-8000-000000000101', '69000000-0000-4000-8000-0000000000a1', '69000000-0000-4000-8000-000000000001', '69000000-0000-4000-8000-000000000011', 'fifty_fifty', 100000, 'confirmed', NULL),  -- po_conf
  ('69000000-0000-4000-8000-000000000102', '69000000-0000-4000-8000-0000000000a1', '69000000-0000-4000-8000-000000000001', '69000000-0000-4000-8000-000000000011', 'net_30',       50000, 'draft',     NULL),  -- po_draft
  ('69000000-0000-4000-8000-000000000103', '69000000-0000-4000-8000-0000000000a1', '69000000-0000-4000-8000-000000000001', '69000000-0000-4000-8000-000000000011', 'net_30',       30000, 'confirmed', NOW()), -- po_sent
  ('69000000-0000-4000-8000-000000000104', '69000000-0000-4000-8000-0000000000a1', '69000000-0000-4000-8000-000000000001', '69000000-0000-4000-8000-000000000011', 'net_30',       20000, 'cancelled', NULL);  -- po_cxl

INSERT INTO po_payments (id, purchase_order_id, kind, amount_cents, state, paid_date)
VALUES
  ('69000000-0000-4000-8000-000000000301', '69000000-0000-4000-8000-000000000101', 'balance', 50000, 'pending', NULL),
  ('69000000-0000-4000-8000-000000000302', '69000000-0000-4000-8000-000000000101', 'deposit', 50000, 'paid',    CURRENT_DATE);

-- Lines:
--   i_c1, i_c2  ordered on po_conf (case 3 cascade)
--   i_d1, i_d2  delivered (case 4 happy path)
--   i_ord       ordered on po_draft (case 4 refusal; case 5 PO'd refusal)
--   i_free      specified, no PO, client 100000, no trade/vendor (cases 4, 5)
--   i_inst      already installed (case 4 idempotency)
INSERT INTO project_ffe_items (id, project_id, name, status, quantity, unit_price_cents, trade_price_cents, line_total_cents, purchase_order_id, vendor_id, design_disposition)
VALUES
  ('69000000-0000-4000-8000-000000000201', '69000000-0000-4000-8000-000000000001', 'P0 sofa',     'ordered',   1,  60000, 50000,  60000, '69000000-0000-4000-8000-000000000101', '69000000-0000-4000-8000-000000000011', 'selected'),
  ('69000000-0000-4000-8000-000000000202', '69000000-0000-4000-8000-000000000001', 'P0 chair',    'ordered',   1,  60000, 50000,  60000, '69000000-0000-4000-8000-000000000101', '69000000-0000-4000-8000-000000000011', 'selected'),
  ('69000000-0000-4000-8000-000000000203', '69000000-0000-4000-8000-000000000001', 'P0 lamp',     'delivered', 1,  20000, 15000,  20000, NULL,                                   '69000000-0000-4000-8000-000000000011', 'selected'),
  ('69000000-0000-4000-8000-000000000204', '69000000-0000-4000-8000-000000000001', 'P0 rug',      'delivered', 1,  40000, 30000,  40000, NULL,                                   '69000000-0000-4000-8000-000000000011', 'selected'),
  ('69000000-0000-4000-8000-000000000205', '69000000-0000-4000-8000-000000000001', 'P0 console',  'ordered',   1,  80000, 50000,  80000, '69000000-0000-4000-8000-000000000102', '69000000-0000-4000-8000-000000000011', 'selected'),
  ('69000000-0000-4000-8000-000000000206', '69000000-0000-4000-8000-000000000001', 'P0 find',     'specified', 2, 100000, NULL,  200000, NULL,                                   NULL,                                   'selected'),
  ('69000000-0000-4000-8000-000000000207', '69000000-0000-4000-8000-000000000001', 'P0 mirror',   'installed', 1,  10000,  8000,  10000, NULL,                                   '69000000-0000-4000-8000-000000000011', 'selected');

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

-- Runs p_sql and returns the SQLSTATE + message it raised, or NULL.
CREATE OR REPLACE FUNCTION pg_temp.raised(p_sql text)
RETURNS text AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION pg_temp.raised(text) TO authenticated;

-- ─── case 0: C-00 probe — the old direct ETA write fails ────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "69000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$
    UPDATE purchase_orders SET confirmed_eta = DATE '2026-11-01'
    WHERE id = '69000000-0000-4000-8000-000000000101'
  $q$);
  ASSERT v_err LIKE '42501 %',
    'FAIL 0a: member direct UPDATE of purchase_orders should fail 42501, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case 0a (member direct ETA UPDATE): %', v_err;
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69000000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$
    UPDATE purchase_orders SET confirmed_eta = DATE '2026-11-01'
    WHERE id = '69000000-0000-4000-8000-000000000101'
  $q$);
  ASSERT v_err LIKE '42501 %',
    'FAIL 0b: owner direct UPDATE of purchase_orders should fail 42501, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case 0b (owner direct ETA UPDATE): %', v_err;
END $$;

RESET ROLE;

-- ─── case 1: set_purchase_order_eta ─────────────────────────────────────────

-- 1a: the member, through the real authenticated grant path.
SET LOCAL "request.jwt.claims" TO '{"sub": "69000000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_po purchase_orders;
BEGIN
  v_po := set_purchase_order_eta('69000000-0000-4000-8000-000000000101', DATE '2026-11-14', '  Vendor says the 14th  ');
  ASSERT v_po.confirmed_eta = DATE '2026-11-14', 'FAIL 1a: ETA not stored';
  ASSERT v_po.acknowledged_at IS NULL, 'FAIL 1a: setting the ETA must not stamp acknowledged_at';
  ASSERT v_po.status = 'confirmed', 'FAIL 1a: setting the ETA must not move status, got ' || v_po.status;
  ASSERT v_po.notes = format('[%s ETA update]: Vendor says the 14th', CURRENT_DATE),
    'FAIL 1a: note audit line wrong, got ' || COALESCE(v_po.notes, 'NULL');

  v_po := set_purchase_order_eta('69000000-0000-4000-8000-000000000101', DATE '2026-11-21', 'Slipped a week');
  ASSERT v_po.notes LIKE '%Vendor says the 14th' || E'\n' || '[%ETA update]: Slipped a week',
    'FAIL 1a: second note must append, got ' || COALESCE(v_po.notes, 'NULL');
  RAISE NOTICE 'Case 1a passed: member sets ETA through the authenticated role; no ack, no status move.';
END $$;

RESET ROLE;

DO $$
DECLARE
  v_po purchase_orders;
  v_err text;
BEGIN
  -- 1b: owner on a draft PO — status stays draft, still no ack.
  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a1');
  v_po := set_purchase_order_eta('69000000-0000-4000-8000-000000000102', DATE '2026-12-01', NULL);
  ASSERT v_po.status = 'draft' AND v_po.acknowledged_at IS NULL AND v_po.notes IS NULL,
    'FAIL 1b: ETA on a draft must not ack, move status, or write a note';

  -- 1c: outsider refused.
  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT set_purchase_order_eta('69000000-0000-4000-8000-000000000101', DATE '2027-01-01', NULL)$q$);
  ASSERT v_err LIKE '%not found or access denied%', 'FAIL 1c: outsider should be refused, got ' || COALESCE(v_err, 'no error');

  -- 1d: guest refused (is_studio_comember excludes guests).
  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.raised($q$SELECT set_purchase_order_eta('69000000-0000-4000-8000-000000000101', DATE '2027-01-01', NULL)$q$);
  ASSERT v_err LIKE '%not found or access denied%', 'FAIL 1d: guest should be refused, got ' || COALESCE(v_err, 'no error');

  -- 1e: cancelled PO refused.
  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.raised($q$SELECT set_purchase_order_eta('69000000-0000-4000-8000-000000000104', DATE '2027-01-01', NULL)$q$);
  ASSERT v_err LIKE '%cancelled%', 'FAIL 1e: cancelled PO should be refused, got ' || COALESCE(v_err, 'no error');

  PERFORM 1 FROM purchase_orders
  WHERE id = '69000000-0000-4000-8000-000000000101' AND confirmed_eta = DATE '2026-11-21';
  ASSERT FOUND, 'FAIL 1f: refused calls must leave the ETA untouched';
  RAISE NOTICE 'Case 1 passed: owner allowed; outsider, guest, cancelled refused.';
END $$;

-- ─── case 2: set_purchase_order_ship_to ─────────────────────────────────────

DO $$
DECLARE
  v_po purchase_orders;
  v_err text;
BEGIN
  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a2');
  v_po := set_purchase_order_ship_to('69000000-0000-4000-8000-000000000102', '  Studio receiver, 12 Elm St  ');
  ASSERT v_po.ship_to = 'Studio receiver, 12 Elm St', 'FAIL 2a: ship-to not stored trimmed';

  v_err := pg_temp.raised($q$SELECT set_purchase_order_ship_to('69000000-0000-4000-8000-000000000103', 'Somewhere else')$q$);
  ASSERT v_err LIKE '%already sent%', 'FAIL 2b: ship-to after send should be refused, got ' || COALESCE(v_err, 'no error');
  PERFORM 1 FROM purchase_orders WHERE id = '69000000-0000-4000-8000-000000000103' AND ship_to IS NULL;
  ASSERT FOUND, 'FAIL 2b: refused ship-to must leave the sent PO untouched';

  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT set_purchase_order_ship_to('69000000-0000-4000-8000-000000000102', 'Hijack')$q$);
  ASSERT v_err LIKE '%not found or access denied%', 'FAIL 2c: outsider should be refused, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case 2 passed: ship-to set by member; refused after send and for outsider.';
END $$;

-- ─── case 3: advance_purchase_order_status ─────────────────────────────────

DO $$
DECLARE
  v_po purchase_orders;
  v_err text;
  v_n integer;
BEGIN
  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT advance_purchase_order_status('69000000-0000-4000-8000-000000000101', 'in_production', NULL)$q$);
  ASSERT v_err LIKE '%not found or access denied%', 'FAIL 3a: outsider should be refused, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a2');

  -- 3b: confirmed → in_production; the cascade moves both lines to production.
  v_po := advance_purchase_order_status('69000000-0000-4000-8000-000000000101', 'in_production', 'Vendor started');
  ASSERT v_po.status = 'in_production', 'FAIL 3b: status should be in_production';
  ASSERT v_po.notes LIKE '%in_production]: Vendor started', 'FAIL 3b: note audit line missing';
  SELECT count(*) INTO v_n FROM project_ffe_items
  WHERE purchase_order_id = '69000000-0000-4000-8000-000000000101' AND status = 'production';
  ASSERT v_n = 2, 'FAIL 3b: cascade should move 2 lines to production, moved ' || v_n;
  PERFORM 1 FROM po_payments WHERE id = '69000000-0000-4000-8000-000000000301' AND state = 'pending';
  ASSERT FOUND, 'FAIL 3b: balance must stay pending before ship';

  -- 3c: in_production → shipped; lines ship and the balance flips to due.
  v_po := advance_purchase_order_status('69000000-0000-4000-8000-000000000101', 'shipped', NULL);
  ASSERT v_po.status = 'shipped', 'FAIL 3c: status should be shipped';
  SELECT count(*) INTO v_n FROM project_ffe_items
  WHERE purchase_order_id = '69000000-0000-4000-8000-000000000101' AND status = 'shipped';
  ASSERT v_n = 2, 'FAIL 3c: cascade should move 2 lines to shipped, moved ' || v_n;
  PERFORM 1 FROM po_payments WHERE id = '69000000-0000-4000-8000-000000000301' AND state = 'due';
  ASSERT FOUND, 'FAIL 3c: shipping with the deposit paid must flip the balance to due';

  -- 3d: re-recording shipped is a no-op.
  v_po := advance_purchase_order_status('69000000-0000-4000-8000-000000000101', 'shipped', 'dup');
  ASSERT v_po.status = 'shipped' AND v_po.notes NOT LIKE '%dup%', 'FAIL 3d: same-status call must be a no-op';

  -- 3e: illegal transitions.
  v_err := pg_temp.raised($q$SELECT advance_purchase_order_status('69000000-0000-4000-8000-000000000101', 'in_production', NULL)$q$);
  ASSERT v_err LIKE '%not allowed%', 'FAIL 3e: shipped → in_production should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT advance_purchase_order_status('69000000-0000-4000-8000-000000000101', 'delivered', NULL)$q$);
  ASSERT v_err LIKE '%not allowed%', 'FAIL 3e: → delivered should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT advance_purchase_order_status('69000000-0000-4000-8000-000000000101', 'cancelled', NULL)$q$);
  ASSERT v_err LIKE '%not allowed%', 'FAIL 3e: → cancelled should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT advance_purchase_order_status('69000000-0000-4000-8000-000000000102', 'in_production', NULL)$q$);
  ASSERT v_err LIKE '%not allowed%', 'FAIL 3e: draft → in_production should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT advance_purchase_order_status('69000000-0000-4000-8000-000000000104', 'shipped', NULL)$q$);
  ASSERT v_err LIKE '%not allowed%', 'FAIL 3e: cancelled → shipped should be refused, got ' || COALESCE(v_err, 'no error');

  SELECT count(*) INTO v_n FROM purchase_orders
  WHERE (id = '69000000-0000-4000-8000-000000000101' AND status = 'shipped')
     OR (id = '69000000-0000-4000-8000-000000000102' AND status = 'draft')
     OR (id = '69000000-0000-4000-8000-000000000104' AND status = 'cancelled');
  ASSERT v_n = 3, 'FAIL 3f: refused transitions must leave statuses untouched';
  PERFORM 1 FROM project_ffe_items
  WHERE id = '69000000-0000-4000-8000-000000000205' AND status = 'ordered';
  ASSERT FOUND, 'FAIL 3f: refused draft advance must leave its line ordered';
  RAISE NOTICE 'Case 3 passed: forward chain cascades + flips balance; illegal transitions refused.';
END $$;

-- ─── case 4: record_project_ffe_installed ──────────────────────────────────

DO $$
DECLARE
  v_err text;
  v_n integer;
BEGIN
  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT * FROM record_project_ffe_installed(ARRAY['69000000-0000-4000-8000-000000000203']::uuid[], NULL)$q$);
  ASSERT v_err LIKE '%not found or access denied%', 'FAIL 4a: outsider should be refused, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a2');

  -- 4b: an ordered line in the batch refuses the whole call.
  v_err := pg_temp.raised($q$SELECT * FROM record_project_ffe_installed(
    ARRAY['69000000-0000-4000-8000-000000000203', '69000000-0000-4000-8000-000000000205']::uuid[], NULL)$q$);
  ASSERT v_err LIKE '%only delivered lines%P0 console (ordered)%',
    'FAIL 4b: ordered line should refuse the batch, got ' || COALESCE(v_err, 'no error');
  -- 4c: a specified line refuses too.
  v_err := pg_temp.raised($q$SELECT * FROM record_project_ffe_installed(
    ARRAY['69000000-0000-4000-8000-000000000206']::uuid[], NULL)$q$);
  ASSERT v_err LIKE '%only delivered lines%', 'FAIL 4c: specified line should be refused, got ' || COALESCE(v_err, 'no error');
  PERFORM 1 FROM project_ffe_items WHERE id = '69000000-0000-4000-8000-000000000203' AND status = 'delivered';
  ASSERT FOUND, 'FAIL 4c: refused batch must leave delivered lines delivered';

  -- 4d: delivered lines install; the already-installed line is untouched.
  SELECT count(*) INTO v_n FROM record_project_ffe_installed(ARRAY[
    '69000000-0000-4000-8000-000000000203', '69000000-0000-4000-8000-000000000204',
    '69000000-0000-4000-8000-000000000207']::uuid[], DATE '2026-10-01');
  ASSERT v_n = 3, 'FAIL 4d: should return the 3 requested rows, got ' || v_n;
  SELECT count(*) INTO v_n FROM project_ffe_items
  WHERE id IN ('69000000-0000-4000-8000-000000000203', '69000000-0000-4000-8000-000000000204')
    AND status = 'installed' AND installed_on = DATE '2026-10-01';
  ASSERT v_n = 2, 'FAIL 4d: both delivered lines should be installed on 2026-10-01, got ' || v_n;
  PERFORM 1 FROM project_ffe_items
  WHERE id = '69000000-0000-4000-8000-000000000207' AND status = 'installed' AND installed_on IS NULL;
  ASSERT FOUND, 'FAIL 4d: an already-installed line must be left untouched';
  RAISE NOTICE 'Case 4 passed: installed only from delivered; outsider refused.';
END $$;

-- ─── case 5: set_project_ffe_line_commercials ──────────────────────────────

DO $$
DECLARE
  v_item project_ffe_items;
  v_err text;
BEGIN
  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT set_project_ffe_line_commercials('69000000-0000-4000-8000-000000000206',
    '{"tradePriceCents": 1}'::jsonb)$q$);
  ASSERT v_err LIKE '%not found or access denied%', 'FAIL 5a: outsider should be refused, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a2');

  -- 5b: vendor + trade on an un-PO'd line.
  v_item := set_project_ffe_line_commercials('69000000-0000-4000-8000-000000000206',
    '{"vendorId": "69000000-0000-4000-8000-000000000012", "tradePriceCents": 60000}'::jsonb);
  ASSERT v_item.vendor_id = '69000000-0000-4000-8000-000000000012' AND v_item.vendor_name = 'P0 Vendor Two',
    'FAIL 5b: vendor id/name not set';
  ASSERT v_item.trade_price_cents = 60000, 'FAIL 5b: trade not set';
  ASSERT v_item.markup_percent = 66.67, 'FAIL 5b: markup should be 66.67, got ' || COALESCE(v_item.markup_percent::text, 'NULL');
  ASSERT v_item.unit_price_cents = 100000 AND v_item.line_total_cents = 200000,
    'FAIL 5b: client price must be unchanged';

  -- 5c: trade above the client price records markup 0, client price unchanged.
  v_item := set_project_ffe_line_commercials('69000000-0000-4000-8000-000000000206',
    '{"tradePriceCents": 120000}'::jsonb);
  ASSERT v_item.trade_price_cents = 120000 AND v_item.markup_percent = 0
     AND v_item.vendor_id = '69000000-0000-4000-8000-000000000012'
     AND v_item.unit_price_cents = 100000 AND v_item.line_total_cents = 200000,
    'FAIL 5c: trade-only update wrong';

  -- 5d: refused on a PO'd line; nothing changes.
  v_err := pg_temp.raised($q$SELECT set_project_ffe_line_commercials('69000000-0000-4000-8000-000000000205',
    '{"tradePriceCents": 1}'::jsonb)$q$);
  ASSERT v_err LIKE '%on a purchase order%', 'FAIL 5d: PO''d line should be refused, got ' || COALESCE(v_err, 'no error');
  PERFORM 1 FROM project_ffe_items
  WHERE id = '69000000-0000-4000-8000-000000000205' AND trade_price_cents = 50000 AND unit_price_cents = 80000;
  ASSERT FOUND, 'FAIL 5d: PO''d line must be untouched';

  -- 5e: client price keys, bad values and unknown vendors are refused.
  v_err := pg_temp.raised($q$SELECT set_project_ffe_line_commercials('69000000-0000-4000-8000-000000000206',
    '{"unitPriceCents": 1}'::jsonb)$q$);
  ASSERT v_err LIKE '%only vendorId and tradePriceCents%', 'FAIL 5e: unitPriceCents should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT set_project_ffe_line_commercials('69000000-0000-4000-8000-000000000206',
    '{"tradePriceCents": -1}'::jsonb)$q$);
  ASSERT v_err LIKE '%whole number of cents%', 'FAIL 5e: negative trade should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT set_project_ffe_line_commercials('69000000-0000-4000-8000-000000000206',
    '{"tradePriceCents": 10.5}'::jsonb)$q$);
  ASSERT v_err LIKE '%whole number of cents%', 'FAIL 5e: fractional trade should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT set_project_ffe_line_commercials('69000000-0000-4000-8000-000000000206',
    '{"vendorId": "69000000-0000-4000-8000-0000000009ff"}'::jsonb)$q$);
  ASSERT v_err LIKE '%does not exist%', 'FAIL 5e: unknown vendor should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT set_project_ffe_line_commercials('69000000-0000-4000-8000-000000000206', '{}'::jsonb)$q$);
  ASSERT v_err LIKE '%nothing to set%', 'FAIL 5e: empty request should be refused, got ' || COALESCE(v_err, 'no error');

  PERFORM 1 FROM project_ffe_items
  WHERE id = '69000000-0000-4000-8000-000000000206' AND trade_price_cents = 120000
    AND unit_price_cents = 100000 AND line_total_cents = 200000;
  ASSERT FOUND, 'FAIL 5f: refused calls must leave the line untouched';
  RAISE NOTICE 'Case 5 passed: vendor + trade set on un-PO''d line, client price unchanged; refusals hold.';
END $$;

-- ─── case 6: assign_po_number by a co-member ───────────────────────────────

DO $$
DECLARE
  v_po purchase_orders;
  v_err text;
  v_counter integer;
BEGIN
  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT assign_po_number('69000000-0000-4000-8000-000000000102')$q$);
  ASSERT v_err LIKE '%not found or access denied%', 'FAIL 6a: outsider should be refused, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a2');
  v_po := assign_po_number('69000000-0000-4000-8000-000000000102');
  ASSERT v_po.po_number = 'PO-0001', 'FAIL 6b: co-member should number PO-0001, got ' || COALESCE(v_po.po_number, 'NULL');
  SELECT next_number INTO v_counter FROM po_counters WHERE designer_id = '69000000-0000-4000-8000-0000000000a1';
  ASSERT v_counter = 1, 'FAIL 6b: the owner''s counter should hold 1';
  PERFORM 1 FROM po_counters WHERE designer_id = '69000000-0000-4000-8000-0000000000a2';
  ASSERT NOT FOUND, 'FAIL 6b: the member must not get a counter of their own';
  ASSERT can_send_purchase_order('69000000-0000-4000-8000-000000000102'), 'FAIL 6c: member can send';

  PERFORM pg_temp.assume_user('69000000-0000-4000-8000-0000000000a3');
  ASSERT NOT can_send_purchase_order('69000000-0000-4000-8000-000000000102'), 'FAIL 6c: guest cannot send';
  RAISE NOTICE 'Case 6 passed: co-member numbers under the owner''s counter; outsider refused.';
END $$;

-- ─── case 7: grants ────────────────────────────────────────────────────────

DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.can_send_purchase_order(uuid)',
    'public.set_purchase_order_eta(uuid, date, text)',
    'public.set_purchase_order_ship_to(uuid, text)',
    'public.advance_purchase_order_status(uuid, text, text)',
    'public.assign_po_number(uuid)',
    'public.record_project_ffe_installed(uuid[], date)',
    'public.set_project_ffe_line_commercials(uuid, jsonb)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'), 'FAIL 7: anon can execute ' || v_fn;
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'), 'FAIL 7: authenticated cannot execute ' || v_fn;
    ASSERT NOT EXISTS (
      SELECT 1 FROM pg_proc p, aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.oid = v_fn::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
    ), 'FAIL 7: PUBLIC can execute ' || v_fn;
    ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn::regprocedure), 'FAIL 7: not SECURITY DEFINER ' || v_fn;
  END LOOP;
  RAISE NOTICE 'Case 7 passed: anon/PUBLIC revoked, authenticated granted, all SECURITY DEFINER.';
END $$;

ROLLBACK;
