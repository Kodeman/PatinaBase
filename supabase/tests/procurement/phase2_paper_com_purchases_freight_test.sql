-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 2 — the order paper, the COM pair and submittals, studio
-- purchases, PO cost lines and shipments (migrations 00701–00704; SQ-418)
--
-- Studio A (owner O, member M, guest G), Studio B (owner B) and an outsider X.
-- Cases:
--   A. set_purchase_order_header: a member writes sidemark, requested ship,
--      bill-to (blank parts dropped), freight terms and vendor note; patch
--      semantics; unknown keys and bad values refused; refused after send
--      (R8) and on a cancelled PO; guest, outsider and Studio B refused 42501.
--   B. link_ffe_pair / com_spec / set_purchase_order_supplies: one-level
--      pairing, self and inverted pairs refused; com_spec written under the
--      spec column grant, a non-object refused; the fabric PO points at the
--      PO it supplies, inverted and cross-project refused; outsiders 42501.
--   C. record_submittal / decide_submittal: create, patch while pending,
--      decide once; kind change, bad kind, cross-project PO refused;
--      ffe_line_submittals shows the row to the studio and not to the guest
--      or Studio B.
--   D. record_studio_purchase / void_studio_purchase: defaults
--      (billable_to_client true, billing_rule at_cost); the line advances to
--      ordered and takes the payee as vendor_name; no po_payments row; the
--      FF&E guard refuses a bought, blocked or PO line; studio overhead
--      resolves the caller's studio; void needs a reason, puts the line back
--      to approved, is refused twice and once billed; the line can be bought
--      again after a void; guest, outsider and Studio B refused.
--   E. RLS across studios on the new tables; no direct writes.
--   F. upsert_po_cost_line: defaults, patch keeps the estimate, an explicit
--      payee and rule, bad values refused, cancelled PO refused, guest and
--      Studio B refused.
--   G. record_po_shipment: a partial shipment advances the confirmed PO to
--      shipped (shipped_on stamped; linked lines cascade to shipped); the
--      piece count never exceeds the line; delivery sets
--      inspection_closes_at = delivered + the vendor account's claims window;
--      ETA history; the Week's delivery_events reads the next shipment ETA
--      before confirmed_eta; draft, cancelled, future and out-of-order dates
--      refused; guest, outsider and Studio B refused and see nothing.
--   H. Grants: functions closed to anon, delivery_events closed to anon and
--      security_invoker, tables SELECT-only to authenticated.
--
-- How to run (local stack):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase2_paper_com_purchases_freight_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('70418000-0000-4000-8000-0000000000a1', 'p2-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('70418000-0000-4000-8000-0000000000a2', 'p2-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- M
  ('70418000-0000-4000-8000-0000000000a3', 'p2-guest@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- G
  ('70418000-0000-4000-8000-0000000000a4', 'p2-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- X
  ('70418000-0000-4000-8000-0000000000a5', 'p2-owner-b@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- B

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('70418000-0000-4000-8000-0000000000a1', 'p2-owner@test.invalid',    'P2 Owner',    NOW(), NOW()),
  ('70418000-0000-4000-8000-0000000000a2', 'p2-member@test.invalid',   'P2 Member',   NOW(), NOW()),
  ('70418000-0000-4000-8000-0000000000a3', 'p2-guest@test.invalid',    'P2 Guest',    NOW(), NOW()),
  ('70418000-0000-4000-8000-0000000000a4', 'p2-outsider@test.invalid', 'P2 Outsider', NOW(), NOW()),
  ('70418000-0000-4000-8000-0000000000a5', 'p2-owner-b@test.invalid',  'P2 Owner B',  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES
  ('70418000-0000-4000-8000-0000000000f1', 'design_studio', 'P2 Studio A', 'p2-studio-a-test'),
  ('70418000-0000-4000-8000-0000000000f2', 'design_studio', 'P2 Studio B', 'p2-studio-b-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('70418000-0000-4000-8000-0000000000e1', '70418000-0000-4000-8000-0000000000a1', '70418000-0000-4000-8000-0000000000f1', 'owner',  'active', NOW()),
  ('70418000-0000-4000-8000-0000000000e2', '70418000-0000-4000-8000-0000000000a2', '70418000-0000-4000-8000-0000000000f1', 'member', 'active', NOW()),
  ('70418000-0000-4000-8000-0000000000e3', '70418000-0000-4000-8000-0000000000a3', '70418000-0000-4000-8000-0000000000f1', 'guest',  'active', NOW()),
  ('70418000-0000-4000-8000-0000000000e5', '70418000-0000-4000-8000-0000000000a5', '70418000-0000-4000-8000-0000000000f2', 'owner',  'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('70418000-0000-4000-8000-000000000001', 'P2 Project A', '70418000-0000-4000-8000-0000000000a1', '70418000-0000-4000-8000-0000000000a1', '70418000-0000-4000-8000-0000000000f1'),
  ('70418000-0000-4000-8000-000000000002', 'P2 Project B', '70418000-0000-4000-8000-0000000000a5', '70418000-0000-4000-8000-0000000000a5', '70418000-0000-4000-8000-0000000000f2');

-- V1 has a Studio A account with a 7-day claims window; V2 has none.
INSERT INTO vendors (id, name)
VALUES
  ('70418000-0000-4000-8000-000000000011', 'P2 Workroom'),
  ('70418000-0000-4000-8000-000000000012', 'P2 Mill');

INSERT INTO studio_vendor_accounts (organization_id, vendor_id, claims_window_days)
VALUES ('70418000-0000-4000-8000-0000000000f1', '70418000-0000-4000-8000-000000000011', 7);

INSERT INTO studio_payment_methods (id, organization_id, label, kind, last4)
VALUES ('70418000-0000-4000-8000-000000000301', '70418000-0000-4000-8000-0000000000f1', 'Studio Amex', 'card', '1007');

-- POs:
--   101 draft, unsent          (A header; G draft refused)
--   102 draft, sent            (A refused after send)
--   103 confirmed, two lines   (F cost lines; G shipments)
--   104 cancelled              (A, F, G refused)
--   107 confirmed, the mill    (B supplies 103; C submittal)
--   106 Studio B's project     (cross-studio)
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by, sent_at, confirmed_eta)
VALUES
  ('70418000-0000-4000-8000-000000000101', '70418000-0000-4000-8000-0000000000a1', '70418000-0000-4000-8000-000000000001', '70418000-0000-4000-8000-000000000011', 'net_30', 10000, 'draft',     '70418000-0000-4000-8000-0000000000a2', NULL,  NULL),
  ('70418000-0000-4000-8000-000000000102', '70418000-0000-4000-8000-0000000000a1', '70418000-0000-4000-8000-000000000001', '70418000-0000-4000-8000-000000000011', 'net_30', 10000, 'draft',     '70418000-0000-4000-8000-0000000000a2', NOW(), NULL),
  ('70418000-0000-4000-8000-000000000103', '70418000-0000-4000-8000-0000000000a1', '70418000-0000-4000-8000-000000000001', '70418000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed', '70418000-0000-4000-8000-0000000000a2', NOW(), CURRENT_DATE + 20),
  ('70418000-0000-4000-8000-000000000104', '70418000-0000-4000-8000-0000000000a1', '70418000-0000-4000-8000-000000000001', '70418000-0000-4000-8000-000000000011', 'net_30', 10000, 'cancelled', '70418000-0000-4000-8000-0000000000a2', NULL,  NULL),
  ('70418000-0000-4000-8000-000000000107', '70418000-0000-4000-8000-0000000000a1', '70418000-0000-4000-8000-000000000001', '70418000-0000-4000-8000-000000000012', 'net_30', 5000,  'confirmed', '70418000-0000-4000-8000-0000000000a2', NOW(), NULL),
  ('70418000-0000-4000-8000-000000000106', '70418000-0000-4000-8000-0000000000a5', '70418000-0000-4000-8000-000000000002', '70418000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed', '70418000-0000-4000-8000-0000000000a5', NOW(), NULL);

-- Lines on Project A:
--   201 chairs ×2 and 202 table ×1 on PO 103 (G)
--   203 lamp, approved, no PO (D buy / void / re-buy)
--   204 mirror, approved but blocked by a client decision (D refused)
--   205 sofa, the piece; 206 its COM fabric (B pair, C submittal)
INSERT INTO project_ffe_items (id, project_id, name, status, quantity, unit_price_cents, trade_price_cents, line_total_cents, purchase_order_id, vendor_id, design_disposition, blocked)
VALUES
  ('70418000-0000-4000-8000-000000000201', '70418000-0000-4000-8000-000000000001', 'P2 chairs', 'ordered',  2, 20000, 15000, 40000, '70418000-0000-4000-8000-000000000103', '70418000-0000-4000-8000-000000000011', 'selected', false),
  ('70418000-0000-4000-8000-000000000202', '70418000-0000-4000-8000-000000000001', 'P2 table',  'ordered',  1, 60000, 45000, 60000, '70418000-0000-4000-8000-000000000103', '70418000-0000-4000-8000-000000000011', 'selected', false),
  ('70418000-0000-4000-8000-000000000203', '70418000-0000-4000-8000-000000000001', 'P2 lamp',   'approved', 1,  9000,  9000,  9000, NULL, NULL, 'selected', false),
  ('70418000-0000-4000-8000-000000000204', '70418000-0000-4000-8000-000000000001', 'P2 mirror', 'approved', 1, 12000, 12000, 12000, NULL, NULL, 'selected', true),
  ('70418000-0000-4000-8000-000000000205', '70418000-0000-4000-8000-000000000001', 'P2 sofa',   'approved', 1, 80000, 60000, 80000, NULL, '70418000-0000-4000-8000-000000000011', 'selected', false),
  ('70418000-0000-4000-8000-000000000206', '70418000-0000-4000-8000-000000000001', 'P2 fabric', 'approved', 1, 14000, 11000, 14000, NULL, '70418000-0000-4000-8000-000000000012', 'selected', false);

INSERT INTO project_ffe_specs (ffe_item_id)
SELECT '70418000-0000-4000-8000-000000000206'
WHERE NOT EXISTS (
  SELECT 1 FROM project_ffe_specs WHERE ffe_item_id = '70418000-0000-4000-8000-000000000206'
);

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

-- Acts as p_user for the rest of the transaction (auth.uid()).
CREATE OR REPLACE FUNCTION pg_temp.act(p_user uuid)
RETURNS void AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$ LANGUAGE sql;

GRANT EXECUTE ON FUNCTION pg_temp.raised(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.act(uuid) TO authenticated;

SET LOCAL ROLE authenticated;

-- ─── case A: the order paper's header ───────────────────────────────────────

DO $$
DECLARE
  v_po  public.purchase_orders%ROWTYPE;
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_err text;
  v_user uuid;
BEGIN
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a2');
  v_po := public.set_purchase_order_header('70418000-0000-4000-8000-000000000101', jsonb_build_object(
    'sidemark', '  HALL / Ames ', 'requestedShipOn', (v_day + 14)::text,
    'billTo', jsonb_build_object('name', 'P2 Studio A', 'street', '1 Main St', 'city', 'Madison',
                                 'state', 'WI', 'zip', '53703', 'country', '  '),
    'freightTerms', 'prepaid_add', 'vendorNote', 'Call the receiver before delivery.'));
  ASSERT v_po.sidemark = 'HALL / Ames', 'FAIL A1: sidemark should be trimmed, got ' || COALESCE(v_po.sidemark, 'NULL');
  ASSERT v_po.requested_ship_on = v_day + 14, 'FAIL A1: requested_ship_on not set';
  ASSERT v_po.bill_to = '{"name": "P2 Studio A", "street": "1 Main St", "city": "Madison", "state": "WI", "zip": "53703"}'::jsonb,
    'FAIL A1: bill_to should drop the blank country, got ' || COALESCE(v_po.bill_to::text, 'NULL');
  ASSERT v_po.freight_terms = 'prepaid_add', 'FAIL A1: freight_terms not set';
  ASSERT v_po.vendor_note = 'Call the receiver before delivery.', 'FAIL A1: vendor_note not set';
  ASSERT v_po.status = 'draft', 'FAIL A1: the header must not move status';

  -- Patch: null clears the note; absent keys stay.
  v_po := public.set_purchase_order_header('70418000-0000-4000-8000-000000000101', '{"vendorNote": null}');
  ASSERT v_po.vendor_note IS NULL, 'FAIL A2: vendorNote null should clear';
  ASSERT v_po.freight_terms = 'prepaid_add' AND v_po.sidemark = 'HALL / Ames'
     AND v_po.requested_ship_on = v_day + 14 AND v_po.bill_to ? 'street',
    'FAIL A2: absent keys must stay';

  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_header('70418000-0000-4000-8000-000000000101', '{"shipTo": "x"}')$q$);
  ASSERT v_err LIKE '23514 %unknown keys%', 'FAIL A3: unknown key should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_header('70418000-0000-4000-8000-000000000101', '{"freightTerms": "ddp"}')$q$);
  ASSERT v_err LIKE '23514 %freightTerms%', 'FAIL A3: bad freight terms should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_header('70418000-0000-4000-8000-000000000101', '{"billTo": {"phone": "555"}}')$q$);
  ASSERT v_err LIKE '23514 %billTo%', 'FAIL A3: unknown bill-to part should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_header('70418000-0000-4000-8000-000000000101', '{"requestedShipOn": "soon"}')$q$);
  ASSERT v_err LIKE '23514 %requestedShipOn%', 'FAIL A3: a non-date should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_header('70418000-0000-4000-8000-000000000101', '{"sidemark": 7}')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL A3: a non-string should be refused, got ' || COALESCE(v_err, 'no error');

  -- R8: the sent paper is fixed.
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_header('70418000-0000-4000-8000-000000000102', '{"sidemark": "late"}')$q$);
  ASSERT v_err LIKE '23514 %already sent%', 'FAIL A4: the header must be refused after send, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_header('70418000-0000-4000-8000-000000000104', '{"sidemark": "x"}')$q$);
  ASSERT v_err LIKE '23514 %cancelled%', 'FAIL A4: a cancelled PO should be refused, got ' || COALESCE(v_err, 'no error');

  -- Guest, outsider, Studio B.
  FOREACH v_user IN ARRAY ARRAY['70418000-0000-4000-8000-0000000000a3', '70418000-0000-4000-8000-0000000000a4',
                                '70418000-0000-4000-8000-0000000000a5']::uuid[] LOOP
    PERFORM pg_temp.act(v_user);
    v_err := pg_temp.raised($q$SELECT public.set_purchase_order_header('70418000-0000-4000-8000-000000000101', '{"sidemark": "x"}')$q$);
    ASSERT v_err LIKE '42501 %', 'FAIL A5: ' || v_user || ' should be refused 42501, got ' || COALESCE(v_err, 'no error');
  END LOOP;

  RAISE NOTICE 'Case A (order paper header, R8, access): ok';
END $$;

-- ─── case B: the COM pair, com_spec, the supplying PO ───────────────────────

DO $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
  v_po   public.purchase_orders%ROWTYPE;
  v_err  text;
  v_n    integer;
BEGIN
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a2');
  v_item := public.link_ffe_pair('70418000-0000-4000-8000-000000000206', '70418000-0000-4000-8000-000000000205');
  ASSERT v_item.parent_ffe_item_id = '70418000-0000-4000-8000-000000000205', 'FAIL B1: the fabric should point at the sofa';

  v_err := pg_temp.raised($q$SELECT public.link_ffe_pair('70418000-0000-4000-8000-000000000205', '70418000-0000-4000-8000-000000000206')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL B2: an inverted pair should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.link_ffe_pair('70418000-0000-4000-8000-000000000203', '70418000-0000-4000-8000-000000000203')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL B2: a self pair should be refused, got ' || COALESCE(v_err, 'no error');

  -- Unlink and relink.
  v_item := public.link_ffe_pair('70418000-0000-4000-8000-000000000206', NULL);
  ASSERT v_item.parent_ffe_item_id IS NULL, 'FAIL B3: NULL parent should unlink';
  v_item := public.link_ffe_pair('70418000-0000-4000-8000-000000000206', '70418000-0000-4000-8000-000000000205');

  -- com_spec through the spec column grant and the studio policy.
  UPDATE public.project_ffe_specs
     SET com_spec = '{"fabricName": "Belgian linen", "mill": "P2 Mill", "yardage": "14", "railroaded": true}'
   WHERE ffe_item_id = '70418000-0000-4000-8000-000000000206';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 1, 'FAIL B4: a member should write com_spec, rows ' || v_n;
  v_err := pg_temp.raised($q$UPDATE public.project_ffe_specs SET com_spec = '"linen"' WHERE ffe_item_id = '70418000-0000-4000-8000-000000000206'$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL B4: a non-object com_spec should be refused, got ' || COALESCE(v_err, 'no error');

  -- The mill's PO supplies the workroom's.
  v_po := public.set_purchase_order_supplies('70418000-0000-4000-8000-000000000107', '70418000-0000-4000-8000-000000000103');
  ASSERT v_po.supplies_purchase_order_id = '70418000-0000-4000-8000-000000000103', 'FAIL B5: supplies not set';
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_supplies('70418000-0000-4000-8000-000000000103', '70418000-0000-4000-8000-000000000107')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL B5: an inverted supply should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_supplies('70418000-0000-4000-8000-000000000101', '70418000-0000-4000-8000-000000000106')$q$);
  ASSERT v_err LIKE '23514 %same project%', 'FAIL B5: a cross-project supply should be refused, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.raised($q$SELECT public.link_ffe_pair('70418000-0000-4000-8000-000000000206', NULL)$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B6: a guest should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_supplies('70418000-0000-4000-8000-000000000107', NULL)$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B6: a guest should be refused, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a5');
  v_err := pg_temp.raised($q$SELECT public.link_ffe_pair('70418000-0000-4000-8000-000000000206', NULL)$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B6: Studio B should be refused, got ' || COALESCE(v_err, 'no error');

  RAISE NOTICE 'Case B (COM pair, com_spec, supplying PO): ok';
END $$;

-- ─── case C: submittals ─────────────────────────────────────────────────────

DO $$
DECLARE
  v_sub public.po_submittals%ROWTYPE;
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_err text;
  v_n   integer;
BEGIN
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a2');
  v_sub := public.record_submittal(jsonb_build_object(
    'ffeItemId', '70418000-0000-4000-8000-000000000206', 'kind', 'strike_off',
    'purchaseOrderId', '70418000-0000-4000-8000-000000000107', 'requestedOn', v_day::text));
  ASSERT v_sub.decision = 'pending' AND v_sub.decided_at IS NULL, 'FAIL C1: a new submittal is pending';
  ASSERT v_sub.organization_id = '70418000-0000-4000-8000-0000000000f1', 'FAIL C1: organization from the project studio';
  ASSERT v_sub.project_id = '70418000-0000-4000-8000-000000000001', 'FAIL C1: project from the line';

  v_sub := public.record_submittal(jsonb_build_object('id', v_sub.id, 'dyeLot', ' LOT 44 ', 'receivedOn', v_day::text));
  ASSERT v_sub.dye_lot = 'LOT 44' AND v_sub.received_on = v_day AND v_sub.requested_on = v_day,
    'FAIL C2: a pending patch keeps absent keys';

  v_err := pg_temp.raised(format($q$SELECT public.record_submittal('{"id": "%s", "kind": "cfa"}')$q$, v_sub.id));
  ASSERT v_err LIKE '23514 %cannot change%', 'FAIL C3: kind is fixed, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_submittal('{"ffeItemId": "70418000-0000-4000-8000-000000000206", "kind": "mockup"}')$q$);
  ASSERT v_err LIKE '23514 %kind%', 'FAIL C3: a bad kind is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_submittal('{"ffeItemId": "70418000-0000-4000-8000-000000000206", "kind": "cfa", "purchaseOrderId": "70418000-0000-4000-8000-000000000106"}')$q$);
  ASSERT v_err LIKE '23514 %same project%', 'FAIL C3: another project''s PO is refused, got ' || COALESCE(v_err, 'no error');

  v_sub := public.decide_submittal(v_sub.id, 'approved', 'Matches the memo.');
  ASSERT v_sub.decision = 'approved' AND v_sub.decided_by = '70418000-0000-4000-8000-0000000000a2'
     AND v_sub.decided_at IS NOT NULL AND v_sub.note = 'Matches the memo.',
    'FAIL C4: decision not stamped';
  v_err := pg_temp.raised(format($q$SELECT public.decide_submittal('%s', 'rejected')$q$, v_sub.id));
  ASSERT v_err LIKE '23514 %already decided%', 'FAIL C4: a second decision is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format($q$SELECT public.record_submittal('{"id": "%s", "note": "late"}')$q$, v_sub.id));
  ASSERT v_err LIKE '23514 %already decided%', 'FAIL C4: a decided submittal is fixed, got ' || COALESCE(v_err, 'no error');

  SELECT count(*) INTO v_n FROM public.ffe_line_submittals
   WHERE ffe_item_id = '70418000-0000-4000-8000-000000000206' AND source = 'submittal';
  ASSERT v_n = 1, 'FAIL C5: the studio reads the line''s submittal through the view, got ' || v_n;

  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a3');
  SELECT count(*) INTO v_n FROM public.ffe_line_submittals WHERE ffe_item_id = '70418000-0000-4000-8000-000000000206';
  ASSERT v_n = 0, 'FAIL C6: a guest reads no submittals, got ' || v_n;
  v_err := pg_temp.raised($q$SELECT public.record_submittal('{"ffeItemId": "70418000-0000-4000-8000-000000000206", "kind": "cfa"}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL C6: a guest records nothing, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a5');
  SELECT count(*) INTO v_n FROM public.po_submittals;
  ASSERT v_n = 0, 'FAIL C7: Studio B reads none of Studio A''s submittals, got ' || v_n;
  v_err := pg_temp.raised(format($q$SELECT public.decide_submittal('%s', 'rejected')$q$, v_sub.id));
  ASSERT v_err LIKE '42501 %', 'FAIL C7: Studio B decides nothing, got ' || COALESCE(v_err, 'no error');

  RAISE NOTICE 'Case C (submittals and the line view): ok';
END $$;

-- ─── case D: studio purchases ───────────────────────────────────────────────

DO $$
DECLARE
  v_buy  public.studio_purchases%ROWTYPE;
  v_over public.studio_purchases%ROWTYPE;
  v_line public.project_ffe_items%ROWTYPE;
  v_day  date := (now() AT TIME ZONE 'UTC')::date;
  v_payments_before integer;
  v_payments_after integer;
  v_err  text;
BEGIN
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a2');
  SELECT count(*) INTO v_payments_before FROM public.po_payments;

  v_buy := public.record_studio_purchase(jsonb_build_object(
    'ffeItemId', '70418000-0000-4000-8000-000000000203', 'kind', 'antique_auction',
    'payeeName', '  Round Barn Antiques ', 'amountCents', 8600, 'buyerPremiumCents', 1290, 'taxCents', 473,
    'paymentMethodId', '70418000-0000-4000-8000-000000000301',
    'paidByMemberId', '70418000-0000-4000-8000-0000000000e2',
    'returnable', true, 'returnBy', (v_day + 30)::text));
  ASSERT v_buy.billable_to_client IS TRUE, 'FAIL D1: billable_to_client defaults to true';
  ASSERT v_buy.billing_rule = 'at_cost', 'FAIL D1: billing_rule defaults to at_cost, got ' || v_buy.billing_rule;
  ASSERT v_buy.status = 'recorded' AND v_buy.recorded_by = '70418000-0000-4000-8000-0000000000a2', 'FAIL D1: recorded by M';
  ASSERT v_buy.project_id = '70418000-0000-4000-8000-000000000001'
     AND v_buy.organization_id = '70418000-0000-4000-8000-0000000000f1', 'FAIL D1: project and studio from the line';
  ASSERT v_buy.payee_name = 'Round Barn Antiques' AND v_buy.purchased_on = v_day AND v_buy.currency_code = 'USD',
    'FAIL D1: payee trimmed, purchased today, USD';

  SELECT * INTO v_line FROM public.project_ffe_items WHERE id = '70418000-0000-4000-8000-000000000203';
  ASSERT v_line.status = 'ordered', 'FAIL D2: the line advances to ordered, got ' || v_line.status;
  ASSERT v_line.vendor_name = 'Round Barn Antiques', 'FAIL D2: vendor_name from the payee, got ' || COALESCE(v_line.vendor_name, 'NULL');
  ASSERT v_line.purchase_order_id IS NULL, 'FAIL D2: a purchase is not a PO';
  SELECT count(*) INTO v_payments_after FROM public.po_payments;
  ASSERT v_payments_after = v_payments_before, 'FAIL D2: a purchase never creates po_payments';

  -- The FF&E guard.
  v_err := pg_temp.raised($q$SELECT public.record_studio_purchase('{"ffeItemId": "70418000-0000-4000-8000-000000000203", "kind": "card_retail", "payeeName": "Again", "amountCents": 100}')$q$);
  ASSERT v_err LIKE '23514 %already%', 'FAIL D3: a bought line is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_studio_purchase('{"ffeItemId": "70418000-0000-4000-8000-000000000204", "kind": "card_retail", "payeeName": "Shop", "amountCents": 100}')$q$);
  ASSERT v_err LIKE '23514 %blocked%', 'FAIL D3: a blocked line is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_studio_purchase('{"ffeItemId": "70418000-0000-4000-8000-000000000201", "kind": "card_retail", "payeeName": "Shop", "amountCents": 100}')$q$);
  ASSERT v_err LIKE '23514 %purchase order%', 'FAIL D3: a PO line is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_studio_purchase('{"kind": "card_retail", "payeeName": "Shop", "amountCents": 100, "returnBy": "2030-01-01"}')$q$);
  ASSERT v_err LIKE '23514 %returnable%', 'FAIL D3: returnBy needs returnable, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_studio_purchase('{"kind": "card_retail", "payeeName": "Shop", "amountCents": 0}')$q$);
  ASSERT v_err LIKE '23514 %amountCents%', 'FAIL D3: a zero amount is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_studio_purchase('{"kind": "card_retail", "payeeName": "Shop", "amountCents": 100, "reimburseMember": true}')$q$);
  ASSERT v_err LIKE '23514 %paidByMemberId%', 'FAIL D3: reimburse needs a member, got ' || COALESCE(v_err, 'no error');

  -- Studio overhead resolves M's only studio.
  v_over := public.record_studio_purchase('{"kind": "expense", "payeeName": "Courier Co", "amountCents": 4500, "description": "Sample courier"}');
  ASSERT v_over.project_id IS NULL AND v_over.organization_id = '70418000-0000-4000-8000-0000000000f1',
    'FAIL D4: overhead belongs to the caller''s studio';
  ASSERT v_over.billable_to_client IS TRUE AND v_over.billing_rule = 'at_cost', 'FAIL D4: defaults on overhead too';

  -- Void.
  v_err := pg_temp.raised(format($q$SELECT public.void_studio_purchase('%s', '  ')$q$, v_buy.id));
  ASSERT v_err LIKE '23514 %reason%', 'FAIL D5: void needs a reason, got ' || COALESCE(v_err, 'no error');
  v_buy := public.void_studio_purchase(v_buy.id, 'Lost the auction reconciliation; re-entering.');
  ASSERT v_buy.status = 'void' AND v_buy.voided_at IS NOT NULL
     AND v_buy.voided_by = '70418000-0000-4000-8000-0000000000a2', 'FAIL D5: void not stamped';
  SELECT * INTO v_line FROM public.project_ffe_items WHERE id = '70418000-0000-4000-8000-000000000203';
  ASSERT v_line.status = 'approved', 'FAIL D5: the line goes back to approved, got ' || v_line.status;
  v_err := pg_temp.raised(format($q$SELECT public.void_studio_purchase('%s', 'again')$q$, v_buy.id));
  ASSERT v_err LIKE '23514 %already void%', 'FAIL D5: a second void is refused, got ' || COALESCE(v_err, 'no error');

  -- Bought again after the void.
  v_buy := public.record_studio_purchase(jsonb_build_object(
    'ffeItemId', '70418000-0000-4000-8000-000000000203', 'kind', 'card_retail',
    'payeeName', 'Lamp Shop', 'amountCents', 9000, 'billableToClient', false));
  ASSERT v_buy.billable_to_client IS FALSE, 'FAIL D6: an explicit billableToClient false is kept';
  SELECT * INTO v_line FROM public.project_ffe_items WHERE id = '70418000-0000-4000-8000-000000000203';
  ASSERT v_line.status = 'ordered' AND v_line.vendor_name = 'Lamp Shop', 'FAIL D6: re-bought line is ordered from the new payee';

  -- Guest, outsider, Studio B.
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.raised($q$SELECT public.record_studio_purchase('{"organizationId": "70418000-0000-4000-8000-0000000000f1", "kind": "expense", "payeeName": "x", "amountCents": 100}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL D7: a guest records no overhead, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_studio_purchase('{"ffeItemId": "70418000-0000-4000-8000-000000000205", "kind": "card_retail", "payeeName": "x", "amountCents": 100}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL D7: a guest buys no line, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT public.record_studio_purchase('{"projectId": "70418000-0000-4000-8000-000000000001", "kind": "expense", "payeeName": "x", "amountCents": 100}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL D7: an outsider is refused, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a5');
  v_err := pg_temp.raised(format($q$SELECT public.void_studio_purchase('%s', 'not mine')$q$, v_over.id));
  ASSERT v_err LIKE '42501 %', 'FAIL D7: Studio B voids nothing of Studio A''s, got ' || COALESCE(v_err, 'no error');

  RAISE NOTICE 'Case D (purchases: defaults, line advance, guard, void): ok';
END $$;

-- A billed purchase cannot be voided (the billing writer is outside this
-- ticket; stamp it as the owner would).
RESET ROLE;
UPDATE public.studio_purchases SET status = 'billed'
 WHERE payee_name = 'Courier Co' AND organization_id = '70418000-0000-4000-8000-0000000000f1';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_id  uuid;
  v_err text;
BEGIN
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a2');
  SELECT id INTO v_id FROM public.studio_purchases WHERE payee_name = 'Courier Co';
  v_err := pg_temp.raised(format($q$SELECT public.void_studio_purchase('%s', 'billed already')$q$, v_id));
  ASSERT v_err LIKE '23514 %billed%', 'FAIL D8: a billed purchase is not voided, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case D8 (billed purchase refuses void): ok';
END $$;

-- ─── case E: RLS across studios; no direct writes ───────────────────────────

DO $$
DECLARE
  v_n   integer;
  v_err text;
BEGIN
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a1');
  SELECT count(*) INTO v_n FROM public.studio_purchases;
  ASSERT v_n = 3, 'FAIL E1: the owner reads the studio''s 3 purchases, got ' || v_n;
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a2');
  SELECT count(*) INTO v_n FROM public.studio_purchases;
  ASSERT v_n = 3, 'FAIL E1: a member reads the studio''s 3 purchases, got ' || v_n;

  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a3');
  SELECT count(*) INTO v_n FROM public.studio_purchases;
  ASSERT v_n = 0, 'FAIL E2: a guest reads no purchases, got ' || v_n;
  SELECT count(*) INTO v_n FROM public.po_submittals;
  ASSERT v_n = 0, 'FAIL E2: a guest reads no submittals, got ' || v_n;
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a5');
  SELECT count(*) INTO v_n FROM public.studio_purchases;
  ASSERT v_n = 0, 'FAIL E2: Studio B reads none of Studio A''s purchases, got ' || v_n;
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a4');
  SELECT count(*) INTO v_n FROM public.studio_purchases;
  ASSERT v_n = 0, 'FAIL E2: an outsider reads no purchases, got ' || v_n;

  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.raised($q$INSERT INTO public.studio_purchases (organization_id, kind, payee_name, purchased_on, amount_cents) VALUES ('70418000-0000-4000-8000-0000000000f1', 'expense', 'x', CURRENT_DATE, 1)$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL E3: purchases are not directly writable, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$UPDATE public.po_submittals SET decision = 'rejected'$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL E3: submittals are not directly writable, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$INSERT INTO public.po_cost_lines (purchase_order_id, kind) VALUES ('70418000-0000-4000-8000-000000000103', 'freight')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL E3: cost lines are not directly writable, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$INSERT INTO public.po_shipments (purchase_order_id, shipped_on) VALUES ('70418000-0000-4000-8000-000000000103', CURRENT_DATE)$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL E3: shipments are not directly writable, got ' || COALESCE(v_err, 'no error');

  RAISE NOTICE 'Case E (RLS across studios, guest, no direct writes): ok';
END $$;

-- ─── case F: PO cost lines ──────────────────────────────────────────────────

DO $$
DECLARE
  v_cost public.po_cost_lines%ROWTYPE;
  v_err  text;
  v_n    integer;
BEGIN
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a2');
  v_cost := public.upsert_po_cost_line('70418000-0000-4000-8000-000000000103', '{"kind": "freight", "estimateCents": 25000}');
  ASSERT v_cost.billable_to_client IS TRUE, 'FAIL F1: billable_to_client defaults to true';
  ASSERT v_cost.billing_rule = 'at_cost', 'FAIL F1: billing_rule defaults to at_cost, got ' || v_cost.billing_rule;
  ASSERT v_cost.estimate_cents = 25000 AND v_cost.actual_cents IS NULL
     AND v_cost.payee_vendor_id IS NULL AND v_cost.payee_contact_id IS NULL, 'FAIL F1: estimate only';
  ASSERT v_cost.organization_id = '70418000-0000-4000-8000-0000000000f1', 'FAIL F1: the PO''s studio';

  v_cost := public.upsert_po_cost_line('70418000-0000-4000-8000-000000000103',
    jsonb_build_object('id', v_cost.id, 'actualCents', 23000));
  ASSERT v_cost.estimate_cents = 25000 AND v_cost.actual_cents = 23000 AND v_cost.kind = 'freight',
    'FAIL F2: a patch keeps the estimate and kind';

  v_cost := public.upsert_po_cost_line('70418000-0000-4000-8000-000000000103', jsonb_build_object(
    'kind', 'receiving', 'payeeVendorId', '70418000-0000-4000-8000-000000000012',
    'billableToClient', false, 'billingRule', 'cost_plus', 'estimateCents', 7500));
  ASSERT v_cost.billable_to_client IS FALSE AND v_cost.billing_rule = 'cost_plus'
     AND v_cost.payee_vendor_id = '70418000-0000-4000-8000-000000000012', 'FAIL F3: explicit payee, flag and rule kept';

  v_err := pg_temp.raised($q$SELECT public.upsert_po_cost_line('70418000-0000-4000-8000-000000000103', '{"kind": "tip"}')$q$);
  ASSERT v_err LIKE '23514 %kind%', 'FAIL F4: a bad kind is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.upsert_po_cost_line('70418000-0000-4000-8000-000000000103', '{"kind": "freight", "estimateCents": -1}')$q$);
  ASSERT v_err LIKE '23514 %cents%', 'FAIL F4: negative cents are refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.upsert_po_cost_line('70418000-0000-4000-8000-000000000103', '{"kind": "freight", "estimateCents": "100"}')$q$);
  ASSERT v_err LIKE '23514 %wrong type%', 'FAIL F4: string cents are refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.upsert_po_cost_line('70418000-0000-4000-8000-000000000104', '{"kind": "freight"}')$q$);
  ASSERT v_err LIKE '23514 %cancelled%', 'FAIL F4: a cancelled PO is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.upsert_po_cost_line('70418000-0000-4000-8000-000000000107', '{"id": "70418000-0000-4000-8000-000000000999"}')$q$);
  ASSERT v_err LIKE '23514 %not on purchase order%', 'FAIL F4: a foreign cost line id is refused, got ' || COALESCE(v_err, 'no error');

  SELECT count(*) INTO v_n FROM public.po_cost_lines WHERE purchase_order_id = '70418000-0000-4000-8000-000000000103';
  ASSERT v_n = 2, 'FAIL F5: the studio reads 2 cost lines, got ' || v_n;

  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.raised($q$SELECT public.upsert_po_cost_line('70418000-0000-4000-8000-000000000103', '{"kind": "freight"}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL F6: a guest is refused, got ' || COALESCE(v_err, 'no error');
  SELECT count(*) INTO v_n FROM public.po_cost_lines;
  ASSERT v_n = 0, 'FAIL F6: a guest reads no cost lines, got ' || v_n;
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a5');
  v_err := pg_temp.raised($q$SELECT public.upsert_po_cost_line('70418000-0000-4000-8000-000000000103', '{"kind": "freight"}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL F6: Studio B is refused, got ' || COALESCE(v_err, 'no error');
  SELECT count(*) INTO v_n FROM public.po_cost_lines;
  ASSERT v_n = 0, 'FAIL F6: Studio B reads no cost lines, got ' || v_n;

  RAISE NOTICE 'Case F (cost lines: defaults, patch, refusals, access): ok';
END $$;

-- ─── case G: shipments, partial shipments, the inspection clock, the Week ───

DO $$
DECLARE
  v_ship  public.po_shipments%ROWTYPE;
  v_ship2 public.po_shipments%ROWTYPE;
  v_po    public.purchase_orders%ROWTYPE;
  v_event record;
  v_day   date := (now() AT TIME ZONE 'UTC')::date;
  v_err   text;
  v_n     integer;
  v_user  uuid;
BEGIN
  PERFORM pg_temp.act('70418000-0000-4000-8000-0000000000a2');

  -- Before any shipment the Week dates the PO by confirmed_eta.
  SELECT * INTO v_event FROM public.delivery_events WHERE purchase_order_id = '70418000-0000-4000-8000-000000000103';
  ASSERT v_event.event_date = v_day + 20 AND v_event.current_eta IS NULL AND v_event.confirmed_eta = v_day + 20,
    'FAIL G0: without a shipment the Week reads confirmed_eta';

  -- First shipment: one of the two chairs.
  v_ship := public.record_po_shipment('70418000-0000-4000-8000-000000000103', jsonb_build_object(
    'mode', 'ltl', 'carrier', ' Estes ', 'tracking', 'PRO 4471', 'currentEta', (v_day + 5)::text,
    'lines', jsonb_build_array(jsonb_build_object('ffeItemId', '70418000-0000-4000-8000-000000000201', 'qty', 1))));
  ASSERT v_ship.shipped_on = v_day, 'FAIL G1: a shipment without a date ships today';
  ASSERT v_ship.carrier = 'Estes' AND v_ship.mode = 'ltl' AND v_ship.current_eta = v_day + 5, 'FAIL G1: shipment facts';
  ASSERT jsonb_array_length(v_ship.eta_history) = 1, 'FAIL G1: the first ETA is in the history';
  ASSERT v_ship.inspection_closes_at IS NULL AND v_ship.delivered_on IS NULL, 'FAIL G1: not delivered yet';
  ASSERT v_ship.organization_id = '70418000-0000-4000-8000-0000000000f1', 'FAIL G1: the PO''s studio';
  SELECT count(*) INTO v_n FROM public.po_shipment_lines WHERE shipment_id = v_ship.id AND qty = 1;
  ASSERT v_n = 1, 'FAIL G1: one chair on the first shipment';

  -- The shipment advanced the PO; the 00184 cascade moved the linked lines.
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = '70418000-0000-4000-8000-000000000103';
  ASSERT v_po.status = 'shipped', 'FAIL G2: the PO advances to shipped, got ' || v_po.status;
  ASSERT v_po.shipped_on = v_day, 'FAIL G2: the PO takes the shipment''s date';
  SELECT count(*) INTO v_n FROM public.project_ffe_items
   WHERE purchase_order_id = '70418000-0000-4000-8000-000000000103' AND status = 'shipped';
  ASSERT v_n = 2, 'FAIL G2: the linked lines cascade to shipped, got ' || v_n;

  -- Partial shipments never exceed the line.
  v_err := pg_temp.raised($q$SELECT public.record_po_shipment('70418000-0000-4000-8000-000000000103', '{"lines": [{"ffeItemId": "70418000-0000-4000-8000-000000000201", "qty": 2}]}')$q$);
  ASSERT v_err LIKE '23514 %more pieces than ordered%', 'FAIL G3: 3 of 2 chairs is refused, got ' || COALESCE(v_err, 'no error');
  v_ship2 := public.record_po_shipment('70418000-0000-4000-8000-000000000103', jsonb_build_object(
    'carrier', 'Estes', 'currentEta', (v_day + 9)::text,
    'lines', jsonb_build_array(
      jsonb_build_object('ffeItemId', '70418000-0000-4000-8000-000000000201', 'qty', 1),
      jsonb_build_object('ffeItemId', '70418000-0000-4000-8000-000000000202', 'qty', 1))));
  SELECT count(*) INTO v_n FROM public.po_shipments WHERE purchase_order_id = '70418000-0000-4000-8000-000000000103';
  ASSERT v_n = 2, 'FAIL G3: the rest ships second, got ' || v_n || ' shipments';
  v_err := pg_temp.raised($q$SELECT public.record_po_shipment('70418000-0000-4000-8000-000000000103', '{"lines": [{"ffeItemId": "70418000-0000-4000-8000-000000000202", "qty": 1}]}')$q$);
  ASSERT v_err LIKE '23514 %more pieces than ordered%', 'FAIL G3: a fully shipped table is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_po_shipment('70418000-0000-4000-8000-000000000103', '{"lines": [{"ffeItemId": "70418000-0000-4000-8000-000000000203", "qty": 1}]}')$q$);
  ASSERT v_err LIKE '23514 %piece on purchase order%', 'FAIL G3: a line off the PO is refused, got ' || COALESCE(v_err, 'no error');

  -- The Week: the next undelivered shipment's ETA, before confirmed_eta.
  SELECT * INTO v_event FROM public.delivery_events WHERE purchase_order_id = '70418000-0000-4000-8000-000000000103';
  ASSERT v_event.event_date = v_day + 5 AND v_event.current_eta = v_day + 5 AND v_event.confirmed_eta = v_day + 20,
    'FAIL G4: the Week reads current_eta first, got ' || COALESCE(v_event.event_date::text, 'NULL');

  -- Delivery sets the inspection clock from the vendor account (7 days).
  v_ship := public.record_po_shipment('70418000-0000-4000-8000-000000000103',
    jsonb_build_object('id', v_ship.id, 'deliveredOn', v_day::text));
  ASSERT v_ship.delivered_on = v_day, 'FAIL G5: delivered_on set';
  ASSERT v_ship.inspection_closes_at = v_day + 7,
    'FAIL G5: inspection closes delivered + 7, got ' || COALESCE(v_ship.inspection_closes_at::text, 'NULL');
  ASSERT v_ship.carrier = 'Estes' AND v_ship.current_eta = v_day + 5, 'FAIL G5: a patch keeps absent keys';
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = '70418000-0000-4000-8000-000000000103';
  ASSERT v_po.status = 'shipped' AND v_po.delivered_date IS NULL, 'FAIL G5: receiving, not the shipment, records PO delivery';
  SELECT * INTO v_event FROM public.delivery_events WHERE purchase_order_id = '70418000-0000-4000-8000-000000000103';
  ASSERT v_event.event_date = v_day + 9, 'FAIL G5: the Week moves to the next open shipment, got ' || COALESCE(v_event.event_date::text, 'NULL');

  -- ETA history appends on change only.
  v_ship2 := public.record_po_shipment('70418000-0000-4000-8000-000000000103',
    jsonb_build_object('id', v_ship2.id, 'currentEta', (v_day + 11)::text, 'etaNote', 'Carrier rolled it'));
  ASSERT jsonb_array_length(v_ship2.eta_history) = 2
     AND v_ship2.eta_history->1->>'note' = 'Carrier rolled it'
     AND v_ship2.eta_history->1->>'by' = '70418000-0000-4000-8000-0000000000a2', 'FAIL G6: the ETA change is in the history';
  v_ship2 := public.record_po_shipment('70418000-0000-4000-8000-000000000103',
    jsonb_build_object('id', v_ship2.id, 'currentEta', (v_day + 11)::text));
  ASSERT jsonb_array_length(v_ship2.eta_history) = 2, 'FAIL G6: the same ETA appends nothing';

  -- Refusals.
  v_err := pg_temp.raised(format($q$SELECT public.record_po_shipment('70418000-0000-4000-8000-000000000103', '{"id": "%s", "deliveredOn": "%s"}')$q$, v_ship2.id, v_day + 5));
  ASSERT v_err LIKE '23514 %future%', 'FAIL G7: a future delivery is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format($q$SELECT public.record_po_shipment('70418000-0000-4000-8000-000000000103', '{"shippedOn": "%s", "deliveredOn": "%s"}')$q$, v_day, v_day - 1));
  ASSERT v_err LIKE '23514 %before shippedOn%', 'FAIL G7: delivery before shipping is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_po_shipment('70418000-0000-4000-8000-000000000101', '{}')$q$);
  ASSERT v_err LIKE '23514 %draft%', 'FAIL G7: a draft PO is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_po_shipment('70418000-0000-4000-8000-000000000104', '{}')$q$);
  ASSERT v_err LIKE '23514 %cancelled%', 'FAIL G7: a cancelled PO is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_po_shipment('70418000-0000-4000-8000-000000000103', '{"mode": "drone"}')$q$);
  ASSERT v_err LIKE '23514 %mode%', 'FAIL G7: a bad mode is refused, got ' || COALESCE(v_err, 'no error');

  -- Guest, outsider, Studio B: refused, and they read nothing.
  FOREACH v_user IN ARRAY ARRAY['70418000-0000-4000-8000-0000000000a3', '70418000-0000-4000-8000-0000000000a4',
                                '70418000-0000-4000-8000-0000000000a5']::uuid[] LOOP
    PERFORM pg_temp.act(v_user);
    v_err := pg_temp.raised($q$SELECT public.record_po_shipment('70418000-0000-4000-8000-000000000103', '{}')$q$);
    ASSERT v_err LIKE '42501 %', 'FAIL G8: ' || v_user || ' should be refused 42501, got ' || COALESCE(v_err, 'no error');
    SELECT count(*) INTO v_n FROM public.po_shipments WHERE purchase_order_id = '70418000-0000-4000-8000-000000000103';
    ASSERT v_n = 0, 'FAIL G8: ' || v_user || ' reads no shipments, got ' || v_n;
    SELECT count(*) INTO v_n FROM public.po_shipment_lines;
    ASSERT v_n = 0, 'FAIL G8: ' || v_user || ' reads no shipment lines, got ' || v_n;
    SELECT count(*) INTO v_n FROM public.delivery_events WHERE purchase_order_id = '70418000-0000-4000-8000-000000000103';
    ASSERT v_n = 0, 'FAIL G8: ' || v_user || ' reads no Week event for Studio A''s PO, got ' || v_n;
  END LOOP;

  RAISE NOTICE 'Case G (shipments: partial, advance, inspection clock, Week, access): ok';
END $$;

-- ─── case H: grants ─────────────────────────────────────────────────────────

RESET ROLE;

DO $$
DECLARE
  v_fn text;
  v_tbl text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.set_purchase_order_header(uuid, jsonb)',
    'public.can_buy_for_project(uuid)',
    'public.link_ffe_pair(uuid, uuid, text)', -- 00732: gained p_kind
    'public.set_purchase_order_supplies(uuid, uuid)',
    'public.record_submittal(jsonb)',
    'public.decide_submittal(uuid, text, text)',
    'public.record_studio_purchase(jsonb)',
    'public.void_studio_purchase(uuid, text)',
    'public.upsert_po_cost_line(uuid, jsonb)',
    'public.record_po_shipment(uuid, jsonb, date)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'), 'FAIL H1: anon can execute ' || v_fn;
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'), 'FAIL H1: authenticated cannot execute ' || v_fn;
    ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn::regprocedure), 'FAIL H1: not SECURITY DEFINER: ' || v_fn;
  END LOOP;

  FOREACH v_tbl IN ARRAY ARRAY['public.po_submittals', 'public.studio_purchases', 'public.po_cost_lines',
                               'public.po_shipments', 'public.po_shipment_lines'] LOOP
    ASSERT has_table_privilege('authenticated', v_tbl, 'SELECT'), 'FAIL H2: authenticated cannot read ' || v_tbl;
    ASSERT NOT has_table_privilege('authenticated', v_tbl, 'INSERT')
       AND NOT has_table_privilege('authenticated', v_tbl, 'UPDATE')
       AND NOT has_table_privilege('authenticated', v_tbl, 'DELETE'), 'FAIL H2: authenticated can write ' || v_tbl;
    ASSERT NOT has_table_privilege('anon', v_tbl, 'SELECT'), 'FAIL H2: anon can read ' || v_tbl;
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = v_tbl::regclass), 'FAIL H2: RLS off on ' || v_tbl;
  END LOOP;

  ASSERT NOT has_table_privilege('anon', 'public.delivery_events', 'SELECT'), 'FAIL H3: anon can read delivery_events';
  ASSERT NOT has_table_privilege('anon', 'public.ffe_line_submittals', 'SELECT'), 'FAIL H3: anon can read ffe_line_submittals';
  ASSERT (SELECT 'security_invoker=true' = ANY (reloptions) FROM pg_class WHERE oid = 'public.delivery_events'::regclass),
    'FAIL H3: delivery_events is not security_invoker';
  ASSERT (SELECT 'security_invoker=true' = ANY (reloptions) FROM pg_class WHERE oid = 'public.ffe_line_submittals'::regclass),
    'FAIL H3: ffe_line_submittals is not security_invoker';
  ASSERT has_column_privilege('authenticated', 'public.project_ffe_specs', 'com_spec', 'UPDATE'),
    'FAIL H4: com_spec lacks the spec column grant';
  ASSERT NOT has_column_privilege('authenticated', 'public.purchase_orders', 'freight_terms', 'UPDATE'),
    'FAIL H4: purchase_orders header columns must stay RPC-only';

  RAISE NOTICE 'Case H (grants): ok';
END $$;

ROLLBACK;
