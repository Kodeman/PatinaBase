-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 2 — acknowledgments, procurement drafts, vendor quotes,
-- exceptions, substitution, refunds and the Phase 2 clocks
-- (migrations 00705–00708; SQ-419)
--
-- Studio A (owner O, member M, guest G), Studio B (owner B), an outsider X
-- and Project A's client C.
-- Cases:
--   A. v1 log_po_acknowledgment still stamps the PO (no ack row).
--   B. log_po_acknowledgment_v2, clean: ack_state clean, no exception, no draft.
--   C. log_po_acknowledgment_v2, mismatch: PO values and verdicts computed
--      server-side; ack_state discrepancy; one open ack_discrepancy exception
--      with a business-day clock; a reply draft awaiting review; bad input,
--      guest, outsider and Studio B refused.
--   D. resolve_ack_line: qty → change_order_required; unit_price accepted
--      writes trade and the PO total; disputed; a newer clean ack marks the
--      rest vendor_corrected and resolves the exception; the superseded ack
--      refuses resolution; R8: a line on an executed authorization and a PO
--      with a payment refuse a price change with change_order_required.
--   E. procurement_drafts: studio reads, guest / outsider / Studio B do not;
--      edit while awaiting review; chase draft; discard; no direct writes;
--      mark_procurement_draft_sent is service-side only.
--   F. vendor quotes: record (request moves to responded); apply writes trade
--      only; a line on a PO refused; a line on a sent authorization refused
--      change_order_required (R8); a superseded quote refused; the request
--      line guard; cross-studio refused.
--   G. exceptions: damage-claim clock from the vendor window, concealed damage
--      from the carrier window; one open exception per claim; subjects must
--      agree; ack_discrepancy refused; claim notice draft; resolve paths.
--   H. request_substitution_approval composes a client_decisions draft via the
--      rail, blocks the line, links the backorder exception.
--   I. vendor refunds and credits: negative rows, never more than net paid,
--      the kind/amount constraint.
--   J. sweep_procurement_clocks: ack_discrepancy, backorder_reported,
--      quote_expiring once per subject and recipient; a second run writes
--      nothing.
--   K. Grants: tables SELECT-only to authenticated; service-side functions
--      closed to authenticated; everything closed to anon.
--
-- How to run (local stack):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase2_ack_drafts_quotes_exceptions_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('70419000-0000-4000-8000-0000000000a1', 'sq419-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('70419000-0000-4000-8000-0000000000a2', 'sq419-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- M
  ('70419000-0000-4000-8000-0000000000a3', 'sq419-guest@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- G
  ('70419000-0000-4000-8000-0000000000a4', 'sq419-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- X
  ('70419000-0000-4000-8000-0000000000a5', 'sq419-owner-b@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- B
  ('70419000-0000-4000-8000-0000000000a6', 'sq419-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- C

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('70419000-0000-4000-8000-0000000000a1', 'sq419-owner@test.invalid',    'SQ419 Owner',    NOW(), NOW()),
  ('70419000-0000-4000-8000-0000000000a2', 'sq419-member@test.invalid',   'SQ419 Member',   NOW(), NOW()),
  ('70419000-0000-4000-8000-0000000000a3', 'sq419-guest@test.invalid',    'SQ419 Guest',    NOW(), NOW()),
  ('70419000-0000-4000-8000-0000000000a4', 'sq419-outsider@test.invalid', 'SQ419 Outsider', NOW(), NOW()),
  ('70419000-0000-4000-8000-0000000000a5', 'sq419-owner-b@test.invalid',  'SQ419 Owner B',  NOW(), NOW()),
  ('70419000-0000-4000-8000-0000000000a6', 'sq419-client@test.invalid',   'SQ419 Client',   NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES
  ('70419000-0000-4000-8000-0000000000f1', 'design_studio', 'SQ419 Studio A', 'sq419-studio-a-test'),
  ('70419000-0000-4000-8000-0000000000f2', 'design_studio', 'SQ419 Studio B', 'sq419-studio-b-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('70419000-0000-4000-8000-0000000000e1', '70419000-0000-4000-8000-0000000000a1', '70419000-0000-4000-8000-0000000000f1', 'owner',  'active', NOW()),
  ('70419000-0000-4000-8000-0000000000e2', '70419000-0000-4000-8000-0000000000a2', '70419000-0000-4000-8000-0000000000f1', 'member', 'active', NOW()),
  ('70419000-0000-4000-8000-0000000000e3', '70419000-0000-4000-8000-0000000000a3', '70419000-0000-4000-8000-0000000000f1', 'guest',  'active', NOW()),
  ('70419000-0000-4000-8000-0000000000e5', '70419000-0000-4000-8000-0000000000a5', '70419000-0000-4000-8000-0000000000f2', 'owner',  'active', NOW());

INSERT INTO projects (id, name, designer_id, client_id, created_by, studio_id)
VALUES
  ('70419000-0000-4000-8000-000000000001', 'SQ419 Project A', '70419000-0000-4000-8000-0000000000a1', '70419000-0000-4000-8000-0000000000a6', '70419000-0000-4000-8000-0000000000a1', '70419000-0000-4000-8000-0000000000f1'),
  ('70419000-0000-4000-8000-000000000002', 'SQ419 Project B', '70419000-0000-4000-8000-0000000000a5', NULL,                                   '70419000-0000-4000-8000-0000000000a5', '70419000-0000-4000-8000-0000000000f2');

INSERT INTO designer_clients (id, designer_id, client_id, status)
VALUES ('70419000-0000-4000-8000-0000000000d1', '70419000-0000-4000-8000-0000000000a1', '70419000-0000-4000-8000-0000000000a6', 'active');

INSERT INTO vendors (id, name, orders_email)
VALUES
  ('70419000-0000-4000-8000-000000000011', 'SQ419 Workroom', 'orders@sq419-workroom.test.invalid'),
  ('70419000-0000-4000-8000-000000000012', 'SQ419 Mill',     NULL);

INSERT INTO studio_vendor_accounts (organization_id, vendor_id, claims_window_days)
VALUES ('70419000-0000-4000-8000-0000000000f1', '70419000-0000-4000-8000-000000000011', 7);

INSERT INTO studio_payment_methods (id, organization_id, label, kind, last4)
VALUES ('70419000-0000-4000-8000-000000000301', '70419000-0000-4000-8000-0000000000f1', 'SQ419 Amex', 'card', '1007');

-- POs (Project A, the workroom, created by M):
--   101 confirmed, chairs + table, a requested ship date   (C, D mismatch)
--   102 draft, sent                                         (A v1)
--   103 confirmed, a desk on an executed authorization      (B clean, D R8)
--   104 confirmed, a bench, a payment is recorded in D      (D, I)
--   105 delivered yesterday, a console                      (G claims)
--   106 Studio B's project                                  (cross-studio)
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by, sent_at, confirmed_eta, requested_ship_on, delivered_date)
VALUES
  ('70419000-0000-4000-8000-000000000101', '70419000-0000-4000-8000-0000000000a1', '70419000-0000-4000-8000-000000000001', '70419000-0000-4000-8000-000000000011', 'net_30', 75000, 'confirmed', '70419000-0000-4000-8000-0000000000a2', NOW(), CURRENT_DATE + 40, DATE '2026-11-02', NULL),
  ('70419000-0000-4000-8000-000000000102', '70419000-0000-4000-8000-0000000000a1', '70419000-0000-4000-8000-000000000001', '70419000-0000-4000-8000-000000000011', 'net_30', 10000, 'draft',     '70419000-0000-4000-8000-0000000000a2', NOW(), NULL, NULL, NULL),
  ('70419000-0000-4000-8000-000000000103', '70419000-0000-4000-8000-0000000000a1', '70419000-0000-4000-8000-000000000001', '70419000-0000-4000-8000-000000000011', 'net_30', 40000, 'confirmed', '70419000-0000-4000-8000-0000000000a2', NOW(), NULL, NULL, NULL),
  ('70419000-0000-4000-8000-000000000104', '70419000-0000-4000-8000-0000000000a1', '70419000-0000-4000-8000-000000000001', '70419000-0000-4000-8000-000000000011', 'net_30', 30000, 'confirmed', '70419000-0000-4000-8000-0000000000a2', NOW(), NULL, NULL, NULL),
  ('70419000-0000-4000-8000-000000000105', '70419000-0000-4000-8000-0000000000a1', '70419000-0000-4000-8000-000000000001', '70419000-0000-4000-8000-000000000011', 'net_30', 35000, 'delivered', '70419000-0000-4000-8000-0000000000a2', NOW() - interval '30 days', NULL, NULL, CURRENT_DATE - 1),
  ('70419000-0000-4000-8000-000000000106', '70419000-0000-4000-8000-0000000000a5', '70419000-0000-4000-8000-000000000002', '70419000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed', '70419000-0000-4000-8000-0000000000a5', NOW(), NULL, NULL, NULL);

-- Lines on Project A:
--   201 chairs ×2, 202 table ×1 on PO 101; 203 desk on 103; 204 bench on 104;
--   211 console on 105.
--   205 sconces ×2 and 206 rug: no PO (F quotes; 206 sits on a sent
--   authorization). 207 sofa, selected; 208 / 209 its alternates (H).
INSERT INTO project_ffe_items (id, project_id, name, status, quantity, unit_price_cents, trade_price_cents, line_total_cents, purchase_order_id, vendor_id, design_disposition, blocked)
VALUES
  ('70419000-0000-4000-8000-000000000201', '70419000-0000-4000-8000-000000000001', 'SQ419 chairs',  'ordered',  2, 20000, 15000, 40000, '70419000-0000-4000-8000-000000000101', '70419000-0000-4000-8000-000000000011', 'selected', false),
  ('70419000-0000-4000-8000-000000000202', '70419000-0000-4000-8000-000000000001', 'SQ419 table',   'ordered',  1, 60000, 45000, 60000, '70419000-0000-4000-8000-000000000101', '70419000-0000-4000-8000-000000000011', 'selected', false),
  ('70419000-0000-4000-8000-000000000203', '70419000-0000-4000-8000-000000000001', 'SQ419 desk',    'ordered',  1, 50000, 40000, 50000, '70419000-0000-4000-8000-000000000103', '70419000-0000-4000-8000-000000000011', 'selected', false),
  ('70419000-0000-4000-8000-000000000204', '70419000-0000-4000-8000-000000000001', 'SQ419 bench',   'ordered',  1, 40000, 30000, 40000, '70419000-0000-4000-8000-000000000104', '70419000-0000-4000-8000-000000000011', 'selected', false),
  ('70419000-0000-4000-8000-000000000211', '70419000-0000-4000-8000-000000000001', 'SQ419 console', 'ordered',  1, 45000, 35000, 45000, '70419000-0000-4000-8000-000000000105', '70419000-0000-4000-8000-000000000011', 'selected', false),
  ('70419000-0000-4000-8000-000000000205', '70419000-0000-4000-8000-000000000001', 'SQ419 sconces', 'approved', 2, 30000, 20000, 60000, NULL, '70419000-0000-4000-8000-000000000011', 'selected', false),
  ('70419000-0000-4000-8000-000000000206', '70419000-0000-4000-8000-000000000001', 'SQ419 rug',     'approved', 1, 25000, 18000, 25000, NULL, '70419000-0000-4000-8000-000000000011', 'selected', false),
  ('70419000-0000-4000-8000-000000000207', '70419000-0000-4000-8000-000000000001', 'SQ419 sofa',    'approved', 1, 80000, 60000, 80000, NULL, '70419000-0000-4000-8000-000000000011', 'selected', false),
  ('70419000-0000-4000-8000-000000000208', '70419000-0000-4000-8000-000000000001', 'SQ419 sofa, linen',  'approved', 1, 82000, 61000, 82000, NULL, '70419000-0000-4000-8000-000000000011', 'alternate', false),
  ('70419000-0000-4000-8000-000000000209', '70419000-0000-4000-8000-000000000001', 'SQ419 sofa, velvet', 'approved', 1, 79000, 59000, 79000, NULL, '70419000-0000-4000-8000-000000000011', 'alternate', false);

INSERT INTO project_ffe_specs (ffe_item_id)
SELECT '70419000-0000-4000-8000-000000000201'
WHERE NOT EXISTS (SELECT 1 FROM project_ffe_specs WHERE ffe_item_id = '70419000-0000-4000-8000-000000000201');
UPDATE project_ffe_specs SET sku = 'CH-100', finish = 'Walnut'
WHERE ffe_item_id = '70419000-0000-4000-8000-000000000201';

-- Authorization No. 1 (executed) carries the desk; No. 2 (sent) the rug.
INSERT INTO proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES
  ('70419000-0000-4000-8000-000000000401', '70419000-0000-4000-8000-000000000001', '70419000-0000-4000-8000-0000000000a1',
   'SQ419 Authorization No. 1', 'accepted', 'furnishings_authorization', 'executed', 50000, 50000),
  ('70419000-0000-4000-8000-000000000411', '70419000-0000-4000-8000-000000000001', '70419000-0000-4000-8000-0000000000a1',
   'SQ419 Authorization No. 2', 'sent', 'furnishings_authorization', 'sent', 25000, 25000);
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES
  ('70419000-0000-4000-8000-000000000402', '70419000-0000-4000-8000-000000000001', '70419000-0000-4000-8000-000000000401',
   'furnishings_authorization', 'Authorization No. 1', false, now(), now(), '70419000-0000-4000-8000-0000000000a1'),
  ('70419000-0000-4000-8000-000000000412', '70419000-0000-4000-8000-000000000001', '70419000-0000-4000-8000-000000000411',
   'furnishings_authorization', 'Authorization No. 2', false, now(), NULL, '70419000-0000-4000-8000-0000000000a1');
INSERT INTO furnishing_authorization_items (id, commercial_document_id, source_ffe_item_id, name, quantity, client_unit_price_cents, client_line_total_cents)
VALUES
  ('70419000-0000-4000-8000-000000000403', '70419000-0000-4000-8000-000000000402', '70419000-0000-4000-8000-000000000203', 'SQ419 desk', 1, 50000, 50000),
  ('70419000-0000-4000-8000-000000000413', '70419000-0000-4000-8000-000000000412', '70419000-0000-4000-8000-000000000206', 'SQ419 rug',  1, 25000, 25000);

-- The console arrived damaged: an inspection and a drafted claim.
INSERT INTO receiving_inspections (id, purchase_order_id, inspected_by, outcome, notes)
VALUES ('70419000-0000-4000-8000-000000000501', '70419000-0000-4000-8000-000000000105', '70419000-0000-4000-8000-0000000000a2', 'damaged', 'Crate crushed at one corner');
INSERT INTO damage_claims (id, receiving_inspection_id, ffe_item_id, state, description)
VALUES ('70419000-0000-4000-8000-000000000502', '70419000-0000-4000-8000-000000000501', '70419000-0000-4000-8000-000000000211', 'drafted', 'Front left leg cracked');

-- A sent quote request for the sconces.
INSERT INTO vendor_quote_requests (id, vendor_id, designer_id, project_id, ffe_item_ids, status, sent_at)
VALUES ('70419000-0000-4000-8000-000000000601', '70419000-0000-4000-8000-000000000011', '70419000-0000-4000-8000-0000000000a2',
        '70419000-0000-4000-8000-000000000001', ARRAY['70419000-0000-4000-8000-000000000205']::uuid[], 'sent', NOW());

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

-- How many rows of p_table (a project-scoped new table) p_user sees.
CREATE OR REPLACE FUNCTION pg_temp.seen(p_user uuid, p_sql text)
RETURNS bigint AS $$
DECLARE
  v_count bigint;
BEGIN
  PERFORM pg_temp.act(p_user);
  EXECUTE p_sql INTO v_count;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION pg_temp.raised(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.act(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.seen(uuid, text) TO authenticated;

SET LOCAL ROLE authenticated;

-- ─── case A: v1 still works ─────────────────────────────────────────────────

DO $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
BEGIN
  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a2');
  v_po := public.log_po_acknowledgment('70419000-0000-4000-8000-000000000102', 'V-102', CURRENT_DATE + 21);
  ASSERT v_po.status = 'confirmed', 'FAIL A1: v1 should confirm the draft PO, got ' || v_po.status;
  ASSERT v_po.acknowledged_at IS NOT NULL AND v_po.vendor_po_number = 'V-102' AND v_po.confirmed_eta = CURRENT_DATE + 21,
    'FAIL A1: v1 should stamp acknowledged_at, the vendor PO number and the ETA';
  ASSERT v_po.ack_state = 'none', 'FAIL A1: v1 records no acknowledgment row, ack_state stays none';
  ASSERT NOT EXISTS (SELECT 1 FROM public.po_acknowledgments WHERE purchase_order_id = v_po.id),
    'FAIL A1: v1 must not write po_acknowledgments';
  RAISE NOTICE 'case A passed: v1 log_po_acknowledgment unchanged';
END;
$$;

-- ─── case B: a clean v2 acknowledgment ──────────────────────────────────────

DO $$
DECLARE
  v_ack public.po_acknowledgments%ROWTYPE;
BEGIN
  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a2');
  v_ack := public.log_po_acknowledgment_v2('70419000-0000-4000-8000-000000000103',
    jsonb_build_object('receivedOn', CURRENT_DATE::text, 'vendorOrderRef', 'V-103', 'receivedVia', 'pdf'),
    jsonb_build_array(jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000203', 'field', 'unit_price', 'ackValue', 40000)));
  ASSERT v_ack.received_via = 'pdf' AND v_ack.vendor_order_ref = 'V-103' AND v_ack.supersedes_ack_id IS NULL,
    'FAIL B1: ack header not recorded';
  ASSERT (SELECT verdict FROM public.po_ack_lines WHERE ack_id = v_ack.id) = 'match',
    'FAIL B1: a matching unit price should verdict match';
  ASSERT (SELECT ack_state FROM public.purchase_orders WHERE id = '70419000-0000-4000-8000-000000000103') = 'clean',
    'FAIL B1: ack_state should be clean';
  ASSERT (SELECT vendor_po_number FROM public.purchase_orders WHERE id = '70419000-0000-4000-8000-000000000103') = 'V-103',
    'FAIL B1: v1 stamps should carry over';
  ASSERT NOT EXISTS (SELECT 1 FROM public.procurement_exceptions WHERE purchase_order_id = '70419000-0000-4000-8000-000000000103')
     AND NOT EXISTS (SELECT 1 FROM public.procurement_drafts WHERE purchase_order_id = '70419000-0000-4000-8000-000000000103'),
    'FAIL B1: a clean ack opens nothing and drafts nothing';
  RAISE NOTICE 'case B passed: clean v2 acknowledgment';
END;
$$;

-- ─── case C: a v2 acknowledgment that differs ───────────────────────────────

DO $$
DECLARE
  v_ack   public.po_acknowledgments%ROWTYPE;
  v_exc   public.procurement_exceptions%ROWTYPE;
  v_draft public.procurement_drafts%ROWTYPE;
  v_err   text;
  v_user  uuid;
BEGIN
  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a2');
  -- 2026-10-01 is a Thursday: two business days later is Monday the 5th.
  v_ack := public.log_po_acknowledgment_v2('70419000-0000-4000-8000-000000000101',
    jsonb_build_object('receivedOn', '2026-10-01', 'vendorOrderRef', 'V-101', 'shipDate', '2026-11-09', 'freightCents', 9000),
    jsonb_build_array(
      jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000201', 'field', 'unit_price', 'ackValue', 16000),
      jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000201', 'field', 'sku', 'ackValue', ' ch-100 '),
      jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000201', 'field', 'finish', 'ackValue', 'Ebony'),
      jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000202', 'field', 'qty', 'ackValue', '2')));
  PERFORM set_config('sq419.ack1', v_ack.id::text, true);

  ASSERT (SELECT count(*) FROM public.po_ack_lines WHERE ack_id = v_ack.id) = 6,
    'FAIL C1: expected 6 lines (ship date, freight, 4 item lines)';
  ASSERT (SELECT verdict FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'unit_price') = 'mismatch'
     AND (SELECT po_value FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'unit_price') = '15000',
    'FAIL C1: unit price PO value is the trade price; 16000 vs 15000 mismatches';
  ASSERT (SELECT verdict FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'sku') = 'match',
    'FAIL C1: sku compares trimmed and case-folded';
  ASSERT (SELECT verdict FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'finish') = 'mismatch',
    'FAIL C1: finish Ebony vs Walnut mismatches';
  ASSERT (SELECT verdict FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'qty') = 'mismatch',
    'FAIL C1: qty 2 vs 1 mismatches';
  ASSERT (SELECT verdict || '/' || po_value FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'ship_date') = 'mismatch/2026-11-02',
    'FAIL C1: ship date mismatches the requested ship date';
  ASSERT (SELECT verdict FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'freight') = 'match',
    'FAIL C1: freight with no estimate on the PO has nothing to differ from';

  ASSERT (SELECT ack_state FROM public.purchase_orders WHERE id = '70419000-0000-4000-8000-000000000101') = 'discrepancy',
    'FAIL C2: ack_state should be discrepancy';
  SELECT * INTO v_exc FROM public.procurement_exceptions
  WHERE purchase_order_id = '70419000-0000-4000-8000-000000000101' AND type = 'ack_discrepancy';
  ASSERT v_exc.id IS NOT NULL AND v_exc.status = 'open' AND v_exc.acknowledgment_id = v_ack.id,
    'FAIL C2: one open ack_discrepancy exception on the ack';
  ASSERT v_exc.clock_due_on = DATE '2026-10-05' AND v_exc.clock_basis LIKE 'Answer the vendor within 2 business days%',
    'FAIL C2: clock should be two business days, got ' || COALESCE(v_exc.clock_due_on::text, 'NULL');
  ASSERT v_exc.project_id = '70419000-0000-4000-8000-000000000001' AND v_exc.organization_id = '70419000-0000-4000-8000-0000000000f1',
    'FAIL C2: exception project and studio';
  PERFORM set_config('sq419.exc_ack101', v_exc.id::text, true);

  SELECT * INTO v_draft FROM public.procurement_drafts WHERE ack_id = v_ack.id;
  ASSERT v_draft.kind = 'ack_discrepancy_reply' AND v_draft.status = 'awaiting_review' AND v_draft.composed_by = 'system',
    'FAIL C3: a reply draft awaiting review';
  ASSERT v_draft.exception_id = v_exc.id AND v_draft.purchase_order_id = '70419000-0000-4000-8000-000000000101',
    'FAIL C3: the draft links the exception and the PO';
  ASSERT v_draft.to_email = 'orders@sq419-workroom.test.invalid', 'FAIL C3: to the vendor orders address, got ' || COALESCE(v_draft.to_email, 'NULL');
  ASSERT v_draft.body LIKE '%SQ419 chairs: your acknowledgment lists a unit price of "$160.00"; our PO specifies "$150.00".%'
     AND v_draft.body LIKE '%your order V-101%' AND v_draft.body LIKE '%4 places%' AND v_draft.body LIKE '%SQ419 Studio A'
     AND v_draft.body NOT LIKE '%CH-100%',
    'FAIL C3: the body lists the four open differences and signs as the studio, got ' || v_draft.body;
  PERFORM set_config('sq419.draft1', v_draft.id::text, true);

  -- Bad input.
  v_err := pg_temp.raised($q$SELECT public.log_po_acknowledgment_v2('70419000-0000-4000-8000-000000000101', '{"shipVia": "x"}', '[]')$q$);
  ASSERT v_err LIKE '23514 %unknown keys%', 'FAIL C4: unknown key, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.log_po_acknowledgment_v2('70419000-0000-4000-8000-000000000101', '{}',
    '[{"ffeItemId": "70419000-0000-4000-8000-000000000201", "field": "ship_date", "ackValue": "2026-11-01"}]')$q$);
  ASSERT v_err LIKE '23514 %field must be%', 'FAIL C4: ship_date belongs on the header, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.log_po_acknowledgment_v2('70419000-0000-4000-8000-000000000101', '{}',
    '[{"ffeItemId": "70419000-0000-4000-8000-000000000201", "field": "unit_price", "ackValue": "160.00"}]')$q$);
  ASSERT v_err LIKE '23514 %whole number%', 'FAIL C4: a unit price is whole cents, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.log_po_acknowledgment_v2('70419000-0000-4000-8000-000000000101', '{}',
    '[{"ffeItemId": "70419000-0000-4000-8000-000000000205", "field": "qty", "ackValue": 2}]')$q$);
  ASSERT v_err LIKE '23514 %not on purchase order%', 'FAIL C4: a line off the PO, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.log_po_acknowledgment_v2('70419000-0000-4000-8000-000000000101', '{}',
    '[{"ffeItemId": "70419000-0000-4000-8000-000000000201", "field": "qty", "ackValue": 2},
      {"ffeItemId": "70419000-0000-4000-8000-000000000201", "field": "qty", "ackValue": 3}]')$q$);
  ASSERT v_err LIKE '23514 %listed twice%', 'FAIL C4: a duplicate field, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.log_po_acknowledgment_v2('70419000-0000-4000-8000-000000000101', '{"receivedOn": "2999-01-01"}', '[]')$q$);
  ASSERT v_err LIKE '23514 %future%', 'FAIL C4: a future receivedOn, got ' || COALESCE(v_err, 'no error');
  ASSERT (SELECT count(*) FROM public.po_acknowledgments WHERE purchase_order_id = '70419000-0000-4000-8000-000000000101') = 1,
    'FAIL C4: refused acks must leave nothing behind';

  -- Guest, outsider and Studio B.
  FOREACH v_user IN ARRAY ARRAY['70419000-0000-4000-8000-0000000000a3', '70419000-0000-4000-8000-0000000000a4',
                                '70419000-0000-4000-8000-0000000000a5']::uuid[] LOOP
    PERFORM pg_temp.act(v_user);
    v_err := pg_temp.raised($q$SELECT public.log_po_acknowledgment_v2('70419000-0000-4000-8000-000000000101', '{}', '[]')$q$);
    ASSERT v_err LIKE '42501 %', 'FAIL C5: ' || v_user || ' should be refused 42501, got ' || COALESCE(v_err, 'no error');
  END LOOP;
  RAISE NOTICE 'case C passed: mismatch → discrepancy + exception + draft';
END;
$$;

-- ─── case D: resolving acknowledgment lines ─────────────────────────────────

DO $$
DECLARE
  v_ack1  uuid := current_setting('sq419.ack1')::uuid;
  v_line  public.po_ack_lines%ROWTYPE;
  v_ack   public.po_acknowledgments%ROWTYPE;
  v_item  public.project_ffe_items%ROWTYPE;
  v_err   text;
  v_id    uuid;
BEGIN
  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a2');

  -- qty: a change order, never an edit.
  SELECT id INTO v_id FROM public.po_ack_lines WHERE ack_id = v_ack1 AND field = 'qty';
  v_err := pg_temp.raised(format('SELECT public.resolve_ack_line(%L, %L)', v_id, 'accepted'));
  ASSERT v_err LIKE '23514 change_order_required: a quantity change%', 'FAIL D1: qty accept, got ' || COALESCE(v_err, 'no error');

  -- unit_price accepted: trade and the PO total move, the client price stays.
  SELECT id INTO v_id FROM public.po_ack_lines WHERE ack_id = v_ack1 AND field = 'unit_price';
  v_line := public.resolve_ack_line(v_id, 'accepted', 'Vendor price increase, accepted');
  ASSERT v_line.verdict = 'accepted' AND v_line.resolved_by = '70419000-0000-4000-8000-0000000000a2' AND v_line.resolved_at IS NOT NULL,
    'FAIL D2: line resolved accepted';
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = '70419000-0000-4000-8000-000000000201';
  ASSERT v_item.trade_price_cents = 16000 AND v_item.unit_price_cents = 20000 AND v_item.markup_percent = 25.00,
    'FAIL D2: trade 16000, unit 20000, markup 25.00; got ' || v_item.trade_price_cents || '/' || v_item.unit_price_cents || '/' || COALESCE(v_item.markup_percent::text, 'NULL');
  ASSERT (SELECT total_cents FROM public.purchase_orders WHERE id = '70419000-0000-4000-8000-000000000101') = 16000 * 2 + 45000,
    'FAIL D2: the PO total follows the line trade total';
  v_err := pg_temp.raised(format('SELECT public.resolve_ack_line(%L, %L)', v_id, 'disputed'));
  ASSERT v_err LIKE '23514 %already%', 'FAIL D2: a resolved line is refused, got ' || COALESCE(v_err, 'no error');

  -- finish disputed; ship date accepted (recorded only).
  SELECT id INTO v_id FROM public.po_ack_lines WHERE ack_id = v_ack1 AND field = 'finish';
  v_line := public.resolve_ack_line(v_id, 'disputed', 'We ordered walnut');
  ASSERT v_line.verdict = 'disputed', 'FAIL D3: disputed';
  ASSERT (SELECT finish FROM public.project_ffe_specs WHERE ffe_item_id = '70419000-0000-4000-8000-000000000201') = 'Walnut',
    'FAIL D3: a dispute writes nothing to the spec';
  SELECT id INTO v_id FROM public.po_ack_lines WHERE ack_id = v_ack1 AND field = 'ship_date';
  PERFORM public.resolve_ack_line(v_id, 'accepted');
  ASSERT (SELECT requested_ship_on FROM public.purchase_orders WHERE id = '70419000-0000-4000-8000-000000000101') = DATE '2026-11-02',
    'FAIL D3: a ship date accept is recorded, not written to the sent paper';
  ASSERT (SELECT status FROM public.procurement_exceptions WHERE id = current_setting('sq419.exc_ack101')::uuid) = 'open',
    'FAIL D3: the qty mismatch keeps the exception open';
  ASSERT (SELECT ack_state FROM public.purchase_orders WHERE id = '70419000-0000-4000-8000-000000000101') = 'discrepancy',
    'FAIL D3: still a discrepancy';

  -- Guest refused.
  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.raised(format('SELECT public.resolve_ack_line(%L, %L)', v_id, 'disputed'));
  ASSERT v_err LIKE '42501 %', 'FAIL D4: guest resolve, got ' || COALESCE(v_err, 'no error');

  -- A newer, clean acknowledgment: the rest is vendor_corrected.
  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a2');
  v_ack := public.log_po_acknowledgment_v2('70419000-0000-4000-8000-000000000101',
    jsonb_build_object('receivedOn', '2026-10-02'),
    jsonb_build_array(
      jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000201', 'field', 'unit_price', 'ackValue', 16000),
      jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000201', 'field', 'finish', 'ackValue', 'walnut')));
  ASSERT v_ack.supersedes_ack_id = v_ack1, 'FAIL D5: the new ack supersedes the head';
  ASSERT (SELECT string_agg(field || '=' || verdict, ',' ORDER BY field) FROM public.po_ack_lines WHERE ack_id = v_ack1)
       = 'finish=vendor_corrected,freight=match,qty=vendor_corrected,ship_date=accepted,sku=match,unit_price=accepted',
    'FAIL D5: old open lines become vendor_corrected, got '
      || (SELECT string_agg(field || '=' || verdict, ',' ORDER BY field) FROM public.po_ack_lines WHERE ack_id = v_ack1);
  ASSERT (SELECT status || '/' || resolution_path FROM public.procurement_exceptions WHERE id = current_setting('sq419.exc_ack101')::uuid)
       = 'resolved/vendor_corrected', 'FAIL D5: the exception resolves vendor_corrected';
  ASSERT (SELECT ack_state FROM public.purchase_orders WHERE id = '70419000-0000-4000-8000-000000000101') = 'clean',
    'FAIL D5: the head ack is clean';
  ASSERT NOT EXISTS (SELECT 1 FROM public.procurement_drafts WHERE ack_id = v_ack.id), 'FAIL D5: a clean ack drafts nothing';
  SELECT id INTO v_id FROM public.po_ack_lines WHERE ack_id = v_ack1 AND field = 'sku';
  v_err := pg_temp.raised(format('SELECT public.resolve_ack_line(%L, %L)', v_id, 'disputed'));
  ASSERT v_err LIKE '23514 %supersedes%', 'FAIL D5: the superseded ack refuses, got ' || COALESCE(v_err, 'no error');

  -- R8: the desk sits on an executed authorization.
  v_ack := public.log_po_acknowledgment_v2('70419000-0000-4000-8000-000000000103', '{}',
    jsonb_build_array(jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000203', 'field', 'unit_price', 'ackValue', 42000)));
  ASSERT (SELECT ack_state FROM public.purchase_orders WHERE id = '70419000-0000-4000-8000-000000000103') = 'discrepancy',
    'FAIL D6: the 103 ack differs';
  SELECT id INTO v_id FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'unit_price';
  v_err := pg_temp.raised(format('SELECT public.resolve_ack_line(%L, %L)', v_id, 'accepted'));
  ASSERT v_err LIKE '23514 change_order_required: the line sits on a executed authorization%',
    'FAIL D6: R8 executed authorization, got ' || COALESCE(v_err, 'no error');
  ASSERT (SELECT trade_price_cents FROM public.project_ffe_items WHERE id = '70419000-0000-4000-8000-000000000203') = 40000,
    'FAIL D6: the refused accept writes nothing';

  -- A payment recorded on 104: a price change is a change order.
  PERFORM public.record_vendor_payment('70419000-0000-4000-8000-000000000104',
    jsonb_build_object('amountCents', 20000, 'method', 'check', 'reference', 'CHK-1'));
  v_ack := public.log_po_acknowledgment_v2('70419000-0000-4000-8000-000000000104', '{}',
    jsonb_build_array(jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000204', 'field', 'unit_price', 'ackValue', 31000)));
  SELECT id INTO v_id FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'unit_price';
  v_err := pg_temp.raised(format('SELECT public.resolve_ack_line(%L, %L)', v_id, 'accepted'));
  ASSERT v_err LIKE '23514 change_order_required: a payment is already recorded%',
    'FAIL D7: payment recorded, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'case D passed: resolve_ack_line, vendor_corrected, R8 refusals';
END;
$$;

-- ─── case E: procurement drafts ─────────────────────────────────────────────

DO $$
DECLARE
  v_draft_id uuid := current_setting('sq419.draft1')::uuid;
  v_draft    public.procurement_drafts%ROWTYPE;
  v_chase    public.procurement_drafts%ROWTYPE;
  v_err      text;
  v_user     uuid;
BEGIN
  ASSERT pg_temp.seen('70419000-0000-4000-8000-0000000000a1', format('SELECT count(*) FROM public.procurement_drafts WHERE id = %L', v_draft_id)) = 1
     AND pg_temp.seen('70419000-0000-4000-8000-0000000000a2', format('SELECT count(*) FROM public.procurement_drafts WHERE id = %L', v_draft_id)) = 1,
    'FAIL E1: owner and member read the draft';
  FOREACH v_user IN ARRAY ARRAY['70419000-0000-4000-8000-0000000000a3', '70419000-0000-4000-8000-0000000000a4',
                                '70419000-0000-4000-8000-0000000000a5']::uuid[] LOOP
    ASSERT pg_temp.seen(v_user, 'SELECT count(*) FROM public.procurement_drafts WHERE project_id = ''70419000-0000-4000-8000-000000000001''') = 0,
      'FAIL E1: ' || v_user || ' must not read the studio''s drafts';
    v_err := pg_temp.raised(format('SELECT public.update_procurement_draft(%L, %L)', v_draft_id, '{"subject": "x"}'));
    ASSERT v_err LIKE '42501 %', 'FAIL E1: ' || v_user || ' edit should be 42501, got ' || COALESCE(v_err, 'no error');
  END LOOP;

  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a2');
  v_draft := public.update_procurement_draft(v_draft_id, '{"subject": "PO 101: please confirm our order"}');
  ASSERT v_draft.subject = 'PO 101: please confirm our order' AND v_draft.edited_by = '70419000-0000-4000-8000-0000000000a2'
     AND v_draft.edited_at IS NOT NULL AND v_draft.body LIKE 'Hello SQ419 Workroom%',
    'FAIL E2: subject edited, body kept, edit stamped';
  v_err := pg_temp.raised(format('SELECT public.update_procurement_draft(%L, %L)', v_draft_id, '{"toEmail": "a@b.c"}'));
  ASSERT v_err LIKE '23514 %', 'FAIL E2: only subject and body are editable, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format('SELECT public.update_procurement_draft(%L, %L)', v_draft_id, '{"body": ""}'));
  ASSERT v_err LIKE '23514 %', 'FAIL E2: an empty body is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format('UPDATE public.procurement_drafts SET subject = %L WHERE id = %L', 'direct', v_draft_id));
  ASSERT v_err LIKE '42501 %', 'FAIL E2: no direct UPDATE, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format('UPDATE public.procurement_drafts SET status = %L WHERE id = %L', 'sent', v_draft_id));
  ASSERT v_err LIKE '42501 %', 'FAIL E2: no direct status move, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format('SELECT public.mark_procurement_draft_sent(%L, %L)', v_draft_id, '70419000-0000-4000-8000-0000000000a2'));
  ASSERT v_err LIKE '42501 %', 'FAIL E2: mark sent is service-side only, got ' || COALESCE(v_err, 'no error');

  -- The chase draft; discard once.
  v_chase := public.compose_ack_chase_draft('70419000-0000-4000-8000-000000000105');
  ASSERT v_chase.kind = 'ack_chase' AND v_chase.status = 'awaiting_review' AND v_chase.to_email = 'orders@sq419-workroom.test.invalid',
    'FAIL E3: chase draft awaiting review';
  v_err := pg_temp.raised($q$SELECT public.compose_ack_chase_draft('70419000-0000-4000-8000-000000000106')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL E3: Studio B''s PO, got ' || COALESCE(v_err, 'no error');
  v_chase := public.discard_procurement_draft(v_chase.id);
  ASSERT v_chase.status = 'discarded' AND v_chase.discarded_by = '70419000-0000-4000-8000-0000000000a2' AND v_chase.discarded_at IS NOT NULL,
    'FAIL E3: discarded and stamped';
  v_err := pg_temp.raised(format('SELECT public.discard_procurement_draft(%L)', v_chase.id));
  ASSERT v_err LIKE '23514 %already discarded%', 'FAIL E3: discard twice, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format('SELECT public.update_procurement_draft(%L, %L)', v_chase.id, '{"subject": "late"}'));
  ASSERT v_err LIKE '23514 %awaiting review%', 'FAIL E3: a discarded draft is not edited, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'case E passed (authenticated part): drafts read, edit, chase, discard';
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_draft public.procurement_drafts%ROWTYPE;
  v_err   text;
BEGIN
  v_err := pg_temp.raised(format('SELECT public.mark_procurement_draft_sent(%L, %L)',
    current_setting('sq419.draft1'), '70419000-0000-4000-8000-0000000000a4'));
  ASSERT v_err LIKE '42501 %cannot send%', 'FAIL E4: an outsider cannot be the sender, got ' || COALESCE(v_err, 'no error');
  v_draft := public.mark_procurement_draft_sent(current_setting('sq419.draft1')::uuid,
    '70419000-0000-4000-8000-0000000000a2', 'msg-sq419-1');
  ASSERT v_draft.status = 'sent' AND v_draft.sent_by = '70419000-0000-4000-8000-0000000000a2'
     AND v_draft.sent_at IS NOT NULL AND v_draft.message_id = 'msg-sq419-1',
    'FAIL E4: marked sent by the service path';
  v_err := pg_temp.raised(format('SELECT public.mark_procurement_draft_sent(%L, %L)',
    current_setting('sq419.draft1'), '70419000-0000-4000-8000-0000000000a2'));
  ASSERT v_err LIKE '23514 %already sent%', 'FAIL E4: sent once, got ' || COALESCE(v_err, 'no error');

  -- The quote request line guard: a caller must buy for the project; with or
  -- without a caller, lines are distinct live lines of the request's project.
  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.raised($q$INSERT INTO public.vendor_quote_requests (vendor_id, designer_id, project_id, ffe_item_ids)
    VALUES ('70419000-0000-4000-8000-000000000011', '70419000-0000-4000-8000-0000000000a2', '70419000-0000-4000-8000-000000000002',
            ARRAY['70419000-0000-4000-8000-000000000205']::uuid[])$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL F0: Studio B''s project for M, got ' || COALESCE(v_err, 'no error');
  PERFORM set_config('request.jwt.claims', '', true);
  v_err := pg_temp.raised($q$INSERT INTO public.vendor_quote_requests (vendor_id, designer_id, project_id, ffe_item_ids)
    VALUES ('70419000-0000-4000-8000-000000000011', '70419000-0000-4000-8000-0000000000a2', '70419000-0000-4000-8000-000000000002',
            ARRAY['70419000-0000-4000-8000-000000000205']::uuid[])$q$);
  ASSERT v_err LIKE '23514 %ffe_item_ids%', 'FAIL F0: a line of another project, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$INSERT INTO public.vendor_quote_requests (vendor_id, designer_id, project_id, ffe_item_ids)
    VALUES ('70419000-0000-4000-8000-000000000011', '70419000-0000-4000-8000-0000000000a2', '70419000-0000-4000-8000-000000000001',
            ARRAY['70419000-0000-4000-8000-000000000205', '70419000-0000-4000-8000-000000000205']::uuid[])$q$);
  ASSERT v_err LIKE '23514 %ffe_item_ids%', 'FAIL F0: duplicate lines, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$INSERT INTO public.vendor_quote_requests (vendor_id, designer_id, ffe_item_ids)
    VALUES ('70419000-0000-4000-8000-000000000011', '70419000-0000-4000-8000-0000000000a2',
            ARRAY['70419000-0000-4000-8000-000000000205']::uuid[])$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL F0: lines need a project, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'case E passed (service part): mark sent; quote request line guard';
END;
$$;

SET LOCAL ROLE authenticated;

-- ─── case F: vendor quotes ──────────────────────────────────────────────────

DO $$
DECLARE
  v_q1   public.vendor_quotes%ROWTYPE;
  v_q2   public.vendor_quotes%ROWTYPE;
  v_q3   public.vendor_quotes%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE;
  v_n    integer;
  v_err  text;
  v_user uuid;
BEGIN
  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a2');
  v_q1 := public.record_vendor_quote(jsonb_build_object(
    'requestId', '70419000-0000-4000-8000-000000000601',
    'receivedOn', CURRENT_DATE::text, 'validUntil', (CURRENT_DATE + 20)::text, 'quoteRef', 'Q-1',
    'freightEstimateCents', 12000, 'paymentPattern', 'fifty_fifty', 'depositPct', 50,
    'lines', jsonb_build_array(
      jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000205', 'unitTradeCents', 18000, 'qty', 2, 'leadTimeWeeks', 8),
      jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000206', 'unitTradeCents', 17000))));
  ASSERT v_q1.vendor_id = '70419000-0000-4000-8000-000000000011' AND v_q1.project_id = '70419000-0000-4000-8000-000000000001'
     AND v_q1.request_id = '70419000-0000-4000-8000-000000000601' AND v_q1.organization_id = '70419000-0000-4000-8000-0000000000f1',
    'FAIL F1: vendor and project come from the request';
  ASSERT (SELECT count(*) FROM public.vendor_quote_lines WHERE quote_id = v_q1.id) = 2, 'FAIL F1: two quote lines';
  ASSERT (SELECT status FROM public.vendor_quote_requests WHERE id = '70419000-0000-4000-8000-000000000601') = 'responded',
    'FAIL F1: the request moves to responded';

  -- Apply: trade only.
  SELECT count(*) INTO v_n FROM public.apply_vendor_quote_to_lines(v_q1.id, ARRAY['70419000-0000-4000-8000-000000000205']::uuid[]);
  ASSERT v_n = 1, 'FAIL F2: one line applied';
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = '70419000-0000-4000-8000-000000000205';
  ASSERT v_item.trade_price_cents = 18000 AND v_item.unit_price_cents = 30000 AND v_item.purchase_order_id IS NULL,
    'FAIL F2: the quote writes trade only, got trade ' || v_item.trade_price_cents || ' unit ' || v_item.unit_price_cents;
  ASSERT (SELECT applied_by FROM public.vendor_quote_lines WHERE quote_id = v_q1.id AND ffe_item_id = v_item.id) = '70419000-0000-4000-8000-0000000000a2',
    'FAIL F2: applied stamped';

  -- R8: the rug sits on a sent authorization.
  v_err := pg_temp.raised(format('SELECT public.apply_vendor_quote_to_lines(%L, %L)', v_q1.id, ARRAY['70419000-0000-4000-8000-000000000206']::uuid[]));
  ASSERT v_err LIKE '23514 change_order_required: line % sits on a sent authorization; void the authorization to edit it',
    'FAIL F3: R8 sent authorization, got ' || COALESCE(v_err, 'no error');
  ASSERT (SELECT trade_price_cents FROM public.project_ffe_items WHERE id = '70419000-0000-4000-8000-000000000206') = 18000,
    'FAIL F3: the refused apply writes nothing';

  -- A line on a PO.
  v_q3 := public.record_vendor_quote(jsonb_build_object(
    'vendorId', '70419000-0000-4000-8000-000000000011', 'projectId', '70419000-0000-4000-8000-000000000001',
    'validUntil', (CURRENT_DATE + 30)::text,
    'lines', jsonb_build_array(jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000201', 'unitTradeCents', 14000))));
  v_err := pg_temp.raised(format('SELECT public.apply_vendor_quote_to_lines(%L)', v_q3.id));
  ASSERT v_err LIKE '23514 %is on a purchase order%', 'FAIL F4: a PO line, got ' || COALESCE(v_err, 'no error');

  -- Superseded: Q2 replaces Q1 and expires today.
  v_q2 := public.record_vendor_quote(jsonb_build_object(
    'vendorId', '70419000-0000-4000-8000-000000000011', 'projectId', '70419000-0000-4000-8000-000000000001',
    'supersedesQuoteId', v_q1.id::text, 'validUntil', CURRENT_DATE::text, 'quoteRef', 'Q-1 rev',
    'lines', jsonb_build_array(jsonb_build_object('ffeItemId', '70419000-0000-4000-8000-000000000205', 'unitTradeCents', 17500, 'qty', 2))));
  ASSERT (SELECT superseded_by FROM public.vendor_quotes WHERE id = v_q1.id) = v_q2.id, 'FAIL F5: Q1 superseded by Q2';
  v_err := pg_temp.raised(format('SELECT public.apply_vendor_quote_to_lines(%L)', v_q1.id));
  ASSERT v_err LIKE '23514 %superseded%', 'FAIL F5: a superseded quote is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format('SELECT public.record_vendor_quote(%L)', jsonb_build_object(
    'vendorId', '70419000-0000-4000-8000-000000000011', 'projectId', '70419000-0000-4000-8000-000000000001',
    'supersedesQuoteId', v_q1.id::text)));
  ASSERT v_err LIKE '23514 %already superseded%', 'FAIL F5: superseding twice, got ' || COALESCE(v_err, 'no error');
  PERFORM set_config('sq419.q2', v_q2.id::text, true);

  -- Bad input.
  v_err := pg_temp.raised($q$SELECT public.record_vendor_quote('{"vendorId": "70419000-0000-4000-8000-000000000011", "projectId": "70419000-0000-4000-8000-000000000001", "lines": [{"ffeItemId": "70419000-0000-4000-8000-000000000205", "unitTradeCents": -1}]}')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL F6: negative trade, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_vendor_quote('{"vendorId": "70419000-0000-4000-8000-000000000012", "requestId": "70419000-0000-4000-8000-000000000601"}')$q$);
  ASSERT v_err LIKE '23514 %must match%', 'FAIL F6: a vendor other than the request''s, got ' || COALESCE(v_err, 'no error');

  -- Guest, outsider, Studio B.
  FOREACH v_user IN ARRAY ARRAY['70419000-0000-4000-8000-0000000000a3', '70419000-0000-4000-8000-0000000000a4',
                                '70419000-0000-4000-8000-0000000000a5']::uuid[] LOOP
    PERFORM pg_temp.act(v_user);
    v_err := pg_temp.raised($q$SELECT public.record_vendor_quote('{"vendorId": "70419000-0000-4000-8000-000000000011", "projectId": "70419000-0000-4000-8000-000000000001"}')$q$);
    ASSERT v_err LIKE '42501 %', 'FAIL F7: ' || v_user || ' record, got ' || COALESCE(v_err, 'no error');
    v_err := pg_temp.raised(format('SELECT public.apply_vendor_quote_to_lines(%L)', v_q2.id));
    ASSERT v_err LIKE '42501 %', 'FAIL F7: ' || v_user || ' apply, got ' || COALESCE(v_err, 'no error');
  END LOOP;
  RAISE NOTICE 'case F passed: quotes record, apply trade only, R8, superseded';
END;
$$;

-- ─── case G: exceptions ─────────────────────────────────────────────────────

DO $$
DECLARE
  v_exc   public.procurement_exceptions%ROWTYPE;
  v_conc  public.procurement_exceptions%ROWTYPE;
  v_back  public.procurement_exceptions%ROWTYPE;
  v_draft public.procurement_drafts%ROWTYPE;
  v_err   text;
  v_user  uuid;
BEGIN
  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a2');
  v_exc := public.open_procurement_exception(jsonb_build_object(
    'type', 'damage', 'damageClaimId', '70419000-0000-4000-8000-000000000502',
    'evidenceMediaIds', jsonb_build_array('70419000-0000-4000-8000-000000000901')));
  ASSERT v_exc.purchase_order_id = '70419000-0000-4000-8000-000000000105' AND v_exc.inspection_id = '70419000-0000-4000-8000-000000000501'
     AND v_exc.ffe_item_id = '70419000-0000-4000-8000-000000000211' AND v_exc.project_id = '70419000-0000-4000-8000-000000000001'
     AND v_exc.organization_id = '70419000-0000-4000-8000-0000000000f1' AND v_exc.opened_by = '70419000-0000-4000-8000-0000000000a2',
    'FAIL G1: subjects derived from the claim';
  ASSERT v_exc.clock_due_on = CURRENT_DATE - 1 + 7 AND v_exc.clock_basis = 'SQ419 Workroom wants written notice within 7 days of delivery.',
    'FAIL G1: the vendor claims window clock, got ' || COALESCE(v_exc.clock_due_on::text, 'NULL') || ' ' || COALESCE(v_exc.clock_basis, 'NULL');
  ASSERT cardinality(v_exc.evidence_media_ids) = 1, 'FAIL G1: evidence kept';
  ASSERT (SELECT exception_id FROM public.damage_claims WHERE id = '70419000-0000-4000-8000-000000000502') = v_exc.id,
    'FAIL G1: the claim points at its exception';
  v_err := pg_temp.raised($q$SELECT public.open_procurement_exception('{"type": "damage", "damageClaimId": "70419000-0000-4000-8000-000000000502"}')$q$);
  ASSERT v_err LIKE '23514 %already has an open exception%', 'FAIL G1: one open exception per claim, got ' || COALESCE(v_err, 'no error');

  v_conc := public.open_procurement_exception(jsonb_build_object(
    'type', 'concealed_damage', 'purchaseOrderId', '70419000-0000-4000-8000-000000000105', 'ffeItemId', '70419000-0000-4000-8000-000000000211',
    'clockDueOn', '2030-01-01', 'clockBasis', 'ignored'));
  ASSERT v_conc.clock_due_on = (CURRENT_DATE - 1) + (SELECT concealed_carrier_days FROM public.procurement_claim_deadline('70419000-0000-4000-8000-000000000105'))
     AND v_conc.clock_basis LIKE 'The carrier wants concealed damage reported within % days of delivery.',
    'FAIL G2: the carrier clock wins over a caller clock, got ' || COALESCE(v_conc.clock_due_on::text, 'NULL');

  v_err := pg_temp.raised($q$SELECT public.open_procurement_exception('{"type": "damage", "purchaseOrderId": "70419000-0000-4000-8000-000000000101", "inspectionId": "70419000-0000-4000-8000-000000000501"}')$q$);
  ASSERT v_err LIKE '23514 %do not belong together%', 'FAIL G3: mixed subjects, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.open_procurement_exception('{"type": "ack_discrepancy", "purchaseOrderId": "70419000-0000-4000-8000-000000000101"}')$q$);
  ASSERT v_err LIKE '23514 %log_po_acknowledgment_v2%', 'FAIL G3: ack_discrepancy opens from an ack, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.open_procurement_exception('{"type": "backorder"}')$q$);
  ASSERT v_err LIKE '23514 %name a subject%', 'FAIL G3: no subject, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.open_procurement_exception('{"type": "backorder", "ffeItemId": "70419000-0000-4000-8000-000000000207", "clockDueOn": "2026-12-01"}')$q$);
  ASSERT v_err LIKE '23514 %clockBasis%', 'FAIL G3: a clock needs its basis, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.open_procurement_exception('{"type": "backorder", "purchaseOrderId": "70419000-0000-4000-8000-000000000106"}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL G3: Studio B''s PO, got ' || COALESCE(v_err, 'no error');

  v_back := public.open_procurement_exception(jsonb_build_object(
    'type', 'backorder', 'ffeItemId', '70419000-0000-4000-8000-000000000207',
    'clockDueOn', (CURRENT_DATE + 10)::text, 'clockBasis', 'Choose a replacement by then to hold the install date.', 'note', 'Out until spring'));
  ASSERT v_back.purchase_order_id IS NULL AND v_back.clock_due_on = CURRENT_DATE + 10 AND v_back.status = 'open',
    'FAIL G4: a backorder on an unordered line with a caller clock';
  PERFORM set_config('sq419.backorder', v_back.id::text, true);

  -- The claim notice.
  v_draft := public.compose_vendor_claim_draft(v_exc.id);
  ASSERT v_draft.kind = 'vendor_claim_notice' AND v_draft.status = 'awaiting_review' AND v_draft.exception_id = v_exc.id
     AND v_draft.to_email = 'orders@sq419-workroom.test.invalid'
     AND v_draft.body LIKE '%Front left leg cracked%' AND v_draft.body LIKE '%SQ419 console%',
    'FAIL G5: the claim notice draft, got ' || COALESCE(v_draft.body, 'NULL');
  v_err := pg_temp.raised(format('SELECT public.compose_vendor_claim_draft(%L)', v_back.id));
  ASSERT v_err LIKE '23514 %', 'FAIL G5: a backorder makes no claim notice, got ' || COALESCE(v_err, 'no error');

  -- Resolve.
  v_exc := public.resolve_procurement_exception(v_exc.id, '{"status": "awaiting_vendor", "note": "Claim sent"}');
  ASSERT v_exc.status = 'awaiting_vendor' AND v_exc.resolved_at IS NULL AND v_exc.note = 'Claim sent', 'FAIL G6: awaiting vendor';
  v_err := pg_temp.raised(format('SELECT public.resolve_procurement_exception(%L, %L)', v_exc.id, '{}'));
  ASSERT v_err LIKE '23514 %resolutionPath%', 'FAIL G6: resolving needs a path, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format('SELECT public.resolve_procurement_exception(%L, %L)', v_exc.id,
    '{"resolutionPath": "replace", "replacementPurchaseOrderId": "70419000-0000-4000-8000-000000000106"}'));
  ASSERT v_err LIKE '23514 %same%' OR v_err LIKE '23514 %project%', 'FAIL G6: a replacement PO on another project, got ' || COALESCE(v_err, 'no error');
  v_exc := public.resolve_procurement_exception(v_exc.id, '{"resolutionPath": "replace", "replacementPurchaseOrderId": "70419000-0000-4000-8000-000000000104"}');
  ASSERT v_exc.status = 'resolved' AND v_exc.resolution_path = 'replace' AND v_exc.resolved_by = '70419000-0000-4000-8000-0000000000a2'
     AND v_exc.replacement_purchase_order_id = '70419000-0000-4000-8000-000000000104', 'FAIL G6: resolved replace';
  v_err := pg_temp.raised(format('SELECT public.resolve_procurement_exception(%L, %L)', v_exc.id, '{"resolutionPath": "credit"}'));
  ASSERT v_err LIKE '23514 %already resolved%', 'FAIL G6: resolved once, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format('SELECT public.resolve_procurement_exception(%L, %L)',
    (SELECT id FROM public.procurement_exceptions WHERE purchase_order_id = '70419000-0000-4000-8000-000000000103' AND type = 'ack_discrepancy'),
    '{"resolutionPath": "accept"}'));
  ASSERT v_err LIKE '23514 %resolve_ack_line%', 'FAIL G6: ack_discrepancy resolves through its lines, got ' || COALESCE(v_err, 'no error');

  FOREACH v_user IN ARRAY ARRAY['70419000-0000-4000-8000-0000000000a3', '70419000-0000-4000-8000-0000000000a4',
                                '70419000-0000-4000-8000-0000000000a5']::uuid[] LOOP
    PERFORM pg_temp.act(v_user);
    v_err := pg_temp.raised($q$SELECT public.open_procurement_exception('{"type": "delay", "purchaseOrderId": "70419000-0000-4000-8000-000000000101"}')$q$);
    ASSERT v_err LIKE '42501 %', 'FAIL G7: ' || v_user || ' open, got ' || COALESCE(v_err, 'no error');
    v_err := pg_temp.raised(format('SELECT public.resolve_procurement_exception(%L, %L)', v_conc.id, '{"resolutionPath": "credit"}'));
    ASSERT v_err LIKE '42501 %', 'FAIL G7: ' || v_user || ' resolve, got ' || COALESCE(v_err, 'no error');
  END LOOP;
  RAISE NOTICE 'case G passed: exceptions, clocks, claim notice, resolve';
END;
$$;

-- ─── case H: substitution through the decision rail ─────────────────────────

DO $$
DECLARE
  v_dec  public.client_decisions%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE;
  v_err  text;
BEGIN
  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.raised($q$SELECT public.request_substitution_approval('70419000-0000-4000-8000-000000000207', ARRAY['70419000-0000-4000-8000-000000000208']::uuid[])$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL H0: guest, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.raised($q$SELECT public.request_substitution_approval('70419000-0000-4000-8000-000000000207', ARRAY['70419000-0000-4000-8000-000000000201']::uuid[])$q$);
  ASSERT v_err LIKE '23514 %alternate lines%', 'FAIL H1: a selected line is not an alternate, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.request_substitution_approval('70419000-0000-4000-8000-000000000207', '{}'::uuid[])$q$);
  ASSERT v_err LIKE '23514 %alternate lines%', 'FAIL H1: no alternates, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.request_substitution_approval('70419000-0000-4000-8000-000000000208', ARRAY['70419000-0000-4000-8000-000000000209']::uuid[])$q$);
  ASSERT v_err LIKE '23514 %selected line%', 'FAIL H1: an alternate is not substituted, got ' || COALESCE(v_err, 'no error');

  v_dec := public.request_substitution_approval('70419000-0000-4000-8000-000000000207',
    ARRAY['70419000-0000-4000-8000-000000000208', '70419000-0000-4000-8000-000000000209']::uuid[]);
  ASSERT v_dec.status = 'draft' AND v_dec.sent_at IS NULL, 'FAIL H2: a draft the studio releases';
  ASSERT v_dec.project_id = '70419000-0000-4000-8000-000000000001' AND v_dec.designer_client_id = '70419000-0000-4000-8000-0000000000d1'
     AND v_dec.designer_id = '70419000-0000-4000-8000-0000000000a1', 'FAIL H2: on the project''s client relationship';
  ASSERT v_dec.blocking_status = 'blocks_procurement' AND v_dec.blocks_kind = 'ffe' AND v_dec.decision_kind = 'choice'
     AND v_dec.title = 'A replacement for SQ419 sofa' AND v_dec.context NOT SIMILAR TO '%[0-9]{4}-[0-9]{2}%',
    'FAIL H2: a blocking product choice, neutral wording, got ' || v_dec.title;
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = '70419000-0000-4000-8000-000000000207';
  ASSERT v_item.blocked AND v_item.blocked_by_decision_id = v_dec.id, 'FAIL H2: the line waits on the decision';
  ASSERT (SELECT status || '/' || client_decision_id FROM public.procurement_exceptions WHERE id = current_setting('sq419.backorder')::uuid)
       = 'awaiting_client/' || v_dec.id, 'FAIL H2: the backorder waits on the client';
  PERFORM set_config('sq419.decision', v_dec.id::text, true);

  v_err := pg_temp.raised($q$SELECT public.request_substitution_approval('70419000-0000-4000-8000-000000000207', ARRAY['70419000-0000-4000-8000-000000000208']::uuid[])$q$);
  ASSERT v_err LIKE '23514 %already waits%', 'FAIL H3: one decision at a time, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'case H passed: substitution composes a decision draft';
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_options text;
BEGIN
  SELECT string_agg(sort_order || ':' || name || ':' || COALESCE(price::text, '-') || ':' || COALESCE(designer_note, '-'), ' | ' ORDER BY sort_order)
    INTO v_options
  FROM public.client_decision_options WHERE decision_id = current_setting('sq419.decision')::uuid;
  ASSERT v_options = '0:SQ419 sofa:-:No longer available as specified | 1:SQ419 sofa, linen:82000:- | 2:SQ419 sofa, velvet:79000:-',
    'FAIL H4: the original then the alternates at their client price, got ' || COALESCE(v_options, 'NULL');
  RAISE NOTICE 'case H passed (options): original first, alternates at client price';
END;
$$;

SET LOCAL ROLE authenticated;

-- ─── case I: refunds and credits ────────────────────────────────────────────

DO $$
DECLARE
  v_row public.vendor_payments%ROWTYPE;
  v_err text;
BEGIN
  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a2');
  ASSERT (SELECT kind FROM public.vendor_payments WHERE purchase_order_id = '70419000-0000-4000-8000-000000000104' AND reference = 'CHK-1') = 'payment',
    'FAIL I1: record_vendor_payment writes kind payment';

  v_row := public.record_vendor_refund('70419000-0000-4000-8000-000000000104',
    jsonb_build_object('kind', 'refund', 'amountCents', 5000, 'method', 'check', 'reference', 'RF-1'));
  ASSERT v_row.kind = 'refund' AND v_row.amount_cents = -5000 AND v_row.po_payment_id IS NULL
     AND v_row.organization_id = '70419000-0000-4000-8000-0000000000f1' AND v_row.recorded_by = '70419000-0000-4000-8000-0000000000a2',
    'FAIL I2: a negative refund row';
  v_row := public.record_vendor_refund('70419000-0000-4000-8000-000000000104',
    jsonb_build_object('kind', 'credit', 'amountCents', 15000, 'paymentMethodId', '70419000-0000-4000-8000-000000000301'));
  ASSERT v_row.kind = 'credit' AND v_row.amount_cents = -15000 AND v_row.method = 'card', 'FAIL I2: a negative credit row';
  ASSERT (SELECT sum(amount_cents) FROM public.vendor_payments WHERE purchase_order_id = '70419000-0000-4000-8000-000000000104' AND voided_at IS NULL) = 0,
    'FAIL I2: net paid is zero';

  v_err := pg_temp.raised($q$SELECT public.record_vendor_refund('70419000-0000-4000-8000-000000000104', '{"kind": "refund", "amountCents": 1}')$q$);
  ASSERT v_err LIKE '23514 %more than the 0 cents net paid%', 'FAIL I3: never more back than went out, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_vendor_refund('70419000-0000-4000-8000-000000000104', '{"kind": "payment", "amountCents": 1}')$q$);
  ASSERT v_err LIKE '23514 %kind must be refund or credit%', 'FAIL I3: kind payment, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_vendor_refund('70419000-0000-4000-8000-000000000101', '{"kind": "refund", "amountCents": -5}')$q$);
  ASSERT v_err LIKE '23514 %positive whole number%', 'FAIL I3: a negative input, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_vendor_refund('70419000-0000-4000-8000-000000000101', '{"kind": "refund", "amountCents": 5, "poPaymentId": null}')$q$);
  ASSERT v_err LIKE '23514 %unknown keys%', 'FAIL I3: no schedule row on a refund, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$INSERT INTO public.vendor_payments (purchase_order_id, paid_on, amount_cents, method, kind) VALUES ('70419000-0000-4000-8000-000000000104', CURRENT_DATE, -1, 'check', 'refund')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL I3: no direct insert, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.raised($q$SELECT public.record_vendor_refund('70419000-0000-4000-8000-000000000104', '{"kind": "refund", "amountCents": 1}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL I4: guest, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70419000-0000-4000-8000-0000000000a5');
  v_err := pg_temp.raised($q$SELECT public.record_vendor_refund('70419000-0000-4000-8000-000000000104', '{"kind": "refund", "amountCents": 1}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL I4: Studio B, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'case I passed: refunds and credits';
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_err text;
BEGIN
  v_err := pg_temp.raised($q$INSERT INTO public.vendor_payments (purchase_order_id, paid_on, amount_cents, method) VALUES ('70419000-0000-4000-8000-000000000104', CURRENT_DATE, -1, 'check')$q$);
  ASSERT v_err LIKE '23514 %vendor_payments_kind_amount_ck%', 'FAIL I5: a negative payment, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$INSERT INTO public.vendor_payments (purchase_order_id, paid_on, amount_cents, method, kind) VALUES ('70419000-0000-4000-8000-000000000104', CURRENT_DATE, 1, 'check', 'refund')$q$);
  ASSERT v_err LIKE '23514 %vendor_payments_kind_amount_ck%', 'FAIL I5: a positive refund, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$INSERT INTO public.vendor_payments (purchase_order_id, paid_on, amount_cents, method, kind) VALUES ('70419000-0000-4000-8000-000000000104', CURRENT_DATE, -1, 'check', 'rebate')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL I5: an unknown kind, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'case I passed (constraint): kind and sign agree';
END;
$$;

-- ─── case J: the Phase 2 clocks ─────────────────────────────────────────────

DO $$
DECLARE
  v_first  jsonb;
  v_second jsonb;
  v_rows   text;
BEGIN
  v_first := public.sweep_procurement_clocks();
  ASSERT NOT (v_first ? 'error') AND NOT (v_first ? 'skipped'), 'FAIL J1: the sweep ran, got ' || v_first::text;

  -- ack_discrepancy: 103 and 104 are open (101 resolved); recipients M (creator) and O (lead).
  SELECT string_agg(po.id::text || ':' || n.user_id::text, ',' ORDER BY po.id, n.user_id) INTO v_rows
  FROM public.procurement_notifications AS n
  JOIN public.purchase_orders AS po ON po.id = n.subject_purchase_order_id
  WHERE n.kind = 'ack_discrepancy' AND po.project_id = '70419000-0000-4000-8000-000000000001';
  ASSERT v_rows = '70419000-0000-4000-8000-000000000103:70419000-0000-4000-8000-0000000000a1,'
               || '70419000-0000-4000-8000-000000000103:70419000-0000-4000-8000-0000000000a2,'
               || '70419000-0000-4000-8000-000000000104:70419000-0000-4000-8000-0000000000a1,'
               || '70419000-0000-4000-8000-000000000104:70419000-0000-4000-8000-0000000000a2',
    'FAIL J2: ack_discrepancy notices, got ' || COALESCE(v_rows, 'none');
  ASSERT NOT EXISTS (SELECT 1 FROM public.procurement_notifications
                     WHERE kind = 'ack_discrepancy' AND subject_purchase_order_id = '70419000-0000-4000-8000-000000000101'),
    'FAIL J2: a resolved discrepancy notifies nobody';
  ASSERT (SELECT bool_and(subject_exception_id IS NOT NULL AND organization_id = '70419000-0000-4000-8000-0000000000f1')
          FROM public.procurement_notifications AS n
          JOIN public.purchase_orders AS po ON po.id = n.subject_purchase_order_id
          WHERE n.kind = 'ack_discrepancy' AND po.project_id = '70419000-0000-4000-8000-000000000001'),
    'FAIL J2: notices carry the exception and the studio';

  -- backorder_reported: the sofa (no PO) → the lead and whoever opened it.
  SELECT string_agg(user_id::text, ',' ORDER BY user_id) INTO v_rows
  FROM public.procurement_notifications
  WHERE kind = 'backorder_reported' AND subject_exception_id = current_setting('sq419.backorder')::uuid;
  ASSERT v_rows = '70419000-0000-4000-8000-0000000000a1,70419000-0000-4000-8000-0000000000a2',
    'FAIL J3: backorder notices, got ' || COALESCE(v_rows, 'none');

  -- quote_expiring: Q2 expires today with an unordered line; Q1 is superseded; Q3 is far off.
  SELECT string_agg(n.subject_quote_id::text || ':' || n.user_id::text, ',' ORDER BY n.user_id) INTO v_rows
  FROM public.procurement_notifications AS n
  JOIN public.vendor_quotes AS q ON q.id = n.subject_quote_id
  WHERE n.kind = 'quote_expiring' AND q.project_id = '70419000-0000-4000-8000-000000000001';
  ASSERT v_rows = current_setting('sq419.q2') || ':70419000-0000-4000-8000-0000000000a1,'
               || current_setting('sq419.q2') || ':70419000-0000-4000-8000-0000000000a2',
    'FAIL J4: quote_expiring notices, got ' || COALESCE(v_rows, 'none');

  -- Idempotent: a second run writes nothing.
  v_second := public.sweep_procurement_clocks();
  -- 00712 added cfa_reserve_expiring and memo_return_due to the detail.
  ASSERT v_second = jsonb_build_object('claim_window_closing', 0, 'ack_discrepancy', 0, 'backorder_reported', 0, 'quote_expiring', 0,
                                       'cfa_reserve_expiring', 0, 'memo_return_due', 0),
    'FAIL J5: a second run should write nothing, got ' || v_second::text;
  ASSERT (SELECT status FROM public.job_runs WHERE job_name = 'procurement-clocks-daily' ORDER BY id DESC LIMIT 1) = 'succeeded',
    'FAIL J5: the run is recorded';
  RAISE NOTICE 'case J passed: Phase 2 clocks fire once per subject and recipient (first run %)', v_first;
END;
$$;

-- ─── case K: RLS across studios and grants ──────────────────────────────────

DO $$
DECLARE
  v_table text;
  v_fn    text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['po_acknowledgments', 'po_ack_lines', 'procurement_drafts', 'vendor_quotes',
                                 'vendor_quote_lines', 'procurement_exceptions'] LOOP
    ASSERT has_table_privilege('authenticated', 'public.' || v_table, 'SELECT'), 'FAIL K1: ' || v_table || ' readable';
    ASSERT NOT has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       AND NOT has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
       AND NOT has_table_privilege('authenticated', 'public.' || v_table, 'DELETE'),
      'FAIL K1: no direct writes on ' || v_table;
    ASSERT NOT has_table_privilege('anon', 'public.' || v_table, 'SELECT'), 'FAIL K1: anon must not read ' || v_table;
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_table)::regclass), 'FAIL K1: RLS on ' || v_table;
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY['log_po_acknowledgment_v2(uuid,jsonb,jsonb)', 'resolve_ack_line(uuid,text,text)',
      'update_procurement_draft(uuid,jsonb)', 'discard_procurement_draft(uuid)', 'compose_ack_discrepancy_draft(uuid)',
      'compose_ack_chase_draft(uuid)', 'compose_receiver_inbound_draft(uuid)', 'record_vendor_quote(jsonb)',
      'apply_vendor_quote_to_lines(uuid,uuid[])', 'open_procurement_exception(jsonb)',
      'resolve_procurement_exception(uuid,jsonb)', 'compose_vendor_claim_draft(uuid)',
      'request_substitution_approval(uuid,uuid[])', 'record_vendor_refund(uuid,jsonb)'] LOOP
    ASSERT has_function_privilege('authenticated', 'public.' || v_fn, 'EXECUTE'), 'FAIL K2: authenticated runs ' || v_fn;
    ASSERT NOT has_function_privilege('anon', 'public.' || v_fn, 'EXECUTE'), 'FAIL K2: anon must not run ' || v_fn;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY['mark_procurement_draft_sent(uuid,uuid,text)', 'ffe_line_authorization_state(uuid)',
      'sweep_procurement_clocks()', 'po_ack_state_sync()', '_procurement_vendor_email(uuid,uuid)'] LOOP
    ASSERT NOT has_function_privilege('authenticated', 'public.' || v_fn, 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.' || v_fn, 'EXECUTE'),
      'FAIL K2: ' || v_fn || ' is service-side only';
  END LOOP;
  ASSERT has_function_privilege('service_role', 'public.mark_procurement_draft_sent(uuid,uuid,text)', 'EXECUTE'),
    'FAIL K2: the send edge function runs as service_role';
  RAISE NOTICE 'case K passed (grants)';
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_user  uuid;
  v_table text;
  v_n     bigint;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['po_acknowledgments', 'po_ack_lines', 'procurement_drafts', 'vendor_quotes',
                                 'vendor_quote_lines', 'procurement_exceptions'] LOOP
    FOREACH v_user IN ARRAY ARRAY['70419000-0000-4000-8000-0000000000a1', '70419000-0000-4000-8000-0000000000a2']::uuid[] LOOP
      v_n := pg_temp.seen(v_user, format('SELECT count(*) FROM public.%I', v_table));
      ASSERT v_n > 0, 'FAIL K3: ' || v_user || ' should read ' || v_table;
    END LOOP;
    FOREACH v_user IN ARRAY ARRAY['70419000-0000-4000-8000-0000000000a3', '70419000-0000-4000-8000-0000000000a4',
                                  '70419000-0000-4000-8000-0000000000a5', '70419000-0000-4000-8000-0000000000a6']::uuid[] LOOP
      v_n := pg_temp.seen(v_user, format(
        'SELECT count(*) FROM public.%I AS t WHERE %s', v_table,
        CASE v_table
          WHEN 'po_ack_lines' THEN 't.ack_id IN (SELECT id FROM public.po_acknowledgments) OR t.ffe_item_id::text LIKE ''70419000%'''
          WHEN 'vendor_quote_lines' THEN 't.ffe_item_id::text LIKE ''70419000%'''
          WHEN 'po_acknowledgments' THEN 't.purchase_order_id::text LIKE ''70419000%'''
          ELSE 't.project_id::text LIKE ''70419000%''' END));
      ASSERT v_n = 0, 'FAIL K3: ' || v_user || ' must not read ' || v_table || ', saw ' || v_n;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'case K passed (RLS): the studio reads, guest / outsider / Studio B / client do not';
END;
$$;

ROLLBACK;
