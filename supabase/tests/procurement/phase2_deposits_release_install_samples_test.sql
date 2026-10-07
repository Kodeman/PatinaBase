-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 2 — client deposit/balance slots and the billing writer, the
-- release gate, the install manifest and spec snapshots, sample requests
-- (migrations 00709–00712; SQ-420)
--
-- Studio A (owner O, admin D, member M, guest G), Studio B (owner B) and an
-- outsider X.
-- Cases:
--   A. Release gate: off by default (nothing required, a draft is sendable);
--      only an owner/admin sets it; a hold below the threshold is refused; at
--      the threshold a member holds, po_is_sendable is false and the sent_at
--      stamp is refused at the DB even for the service path; a member, guest,
--      outsider and Studio B cannot release; an admin releases at the total;
--      a higher total needs a new release; send back needs an owner/admin and
--      a note; an owner releases a draft directly; every-order mode.
--      00719 (SQ-449): the release covers the paper — each edit path after a
--      release (header, ship-to location, supplies, payment schedule, rider,
--      spec column, an accepted lower unit price) re-holds it and the stamp is
--      refused until a new release; a sidemark filled into a blank one does
--      not; a NULL (pre-00719) fingerprint stays total-only; ack v1 and v2 are
--      refused on an edited PO and pass after a re-release. The threshold
--      reads the job's open and recently sent orders to the same maker;
--      po_release_state reasons; assign_po_number refuses a held PO.
--   B. Billing: a deposit, then the balance, on separate slots; a full bill
--      and a deposit never share a line (23505 naming the index); coverage
--      stays one row per line, a deposit alone reads invoiced, both paid reads
--      paid; stage coverage per slot. Purchases and riders bill at cost once:
--      a second stamp, a voided, non-billable or cross-studio purchase and a
--      rider without an amount are refused; deleting the line or voiding the
--      invoice releases the stamp.
--   C. Install manifest and punch items: upsert with patch semantics, one row
--      per line; punch create/patch/resolve; refusals.
--   D. Spec snapshots: revision 1, unchanged resend keeps it, a changed value
--      writes revision 2, a touched-but-unchanged line does not; 0 for no
--      lines.
--   E. Sample requests and the last two clocks: memo_return_due and
--      cfa_reserve_expiring fire once per subject and recipient; returning the
--      sample clears the need; FKs wired.
--   F. RLS across studios and grants.
--
-- How to run (local stack):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase2_deposits_release_install_samples_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('70420000-0000-4000-8000-0000000000a1', 'sq420-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('70420000-0000-4000-8000-0000000000a2', 'sq420-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- M
  ('70420000-0000-4000-8000-0000000000a3', 'sq420-guest@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- G
  ('70420000-0000-4000-8000-0000000000a4', 'sq420-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- X
  ('70420000-0000-4000-8000-0000000000a5', 'sq420-owner-b@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- B
  ('70420000-0000-4000-8000-0000000000a6', 'sq420-admin@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- D

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('70420000-0000-4000-8000-0000000000a1', 'sq420-owner@test.invalid',    'SQ420 Owner',    NOW(), NOW()),
  ('70420000-0000-4000-8000-0000000000a2', 'sq420-member@test.invalid',   'SQ420 Member',   NOW(), NOW()),
  ('70420000-0000-4000-8000-0000000000a3', 'sq420-guest@test.invalid',    'SQ420 Guest',    NOW(), NOW()),
  ('70420000-0000-4000-8000-0000000000a4', 'sq420-outsider@test.invalid', 'SQ420 Outsider', NOW(), NOW()),
  ('70420000-0000-4000-8000-0000000000a5', 'sq420-owner-b@test.invalid',  'SQ420 Owner B',  NOW(), NOW()),
  ('70420000-0000-4000-8000-0000000000a6', 'sq420-admin@test.invalid',    'SQ420 Admin',    NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES
  ('70420000-0000-4000-8000-0000000000f1', 'design_studio', 'SQ420 Studio A', 'sq420-studio-a-test'),
  ('70420000-0000-4000-8000-0000000000f2', 'design_studio', 'SQ420 Studio B', 'sq420-studio-b-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('70420000-0000-4000-8000-0000000000e1', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-0000000000f1', 'owner',  'active', NOW()),
  ('70420000-0000-4000-8000-0000000000e2', '70420000-0000-4000-8000-0000000000a2', '70420000-0000-4000-8000-0000000000f1', 'member', 'active', NOW()),
  ('70420000-0000-4000-8000-0000000000e3', '70420000-0000-4000-8000-0000000000a3', '70420000-0000-4000-8000-0000000000f1', 'guest',  'active', NOW()),
  ('70420000-0000-4000-8000-0000000000e5', '70420000-0000-4000-8000-0000000000a5', '70420000-0000-4000-8000-0000000000f2', 'owner',  'active', NOW()),
  ('70420000-0000-4000-8000-0000000000e6', '70420000-0000-4000-8000-0000000000a6', '70420000-0000-4000-8000-0000000000f1', 'admin',  'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('70420000-0000-4000-8000-000000000001', 'SQ420 Project A', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-0000000000f1'),
  ('70420000-0000-4000-8000-000000000002', 'SQ420 Project B', '70420000-0000-4000-8000-0000000000a5', '70420000-0000-4000-8000-0000000000a5', '70420000-0000-4000-8000-0000000000f2'),
  ('70420000-0000-4000-8000-000000000003', 'SQ420 Project C', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-0000000000f1');

-- 012–015 keep the 00719 release groups (project × maker) apart.
INSERT INTO vendors (id, name, orders_email)
VALUES
  ('70420000-0000-4000-8000-000000000011', 'SQ420 Workroom',   NULL),
  ('70420000-0000-4000-8000-000000000012', 'SQ420 Joinery',    NULL),
  ('70420000-0000-4000-8000-000000000013', 'SQ420 Upholstery', 'orders@sq420-upholstery.test.invalid'),
  ('70420000-0000-4000-8000-000000000014', 'SQ420 Lighting',   NULL),
  ('70420000-0000-4000-8000-000000000015', 'SQ420 Rugs',       NULL);

INSERT INTO studio_locations (id, organization_id, kind, label)
VALUES ('70420000-0000-4000-8000-000000000701', '70420000-0000-4000-8000-0000000000f1', 'studio', 'SQ420 Studio');

-- POs:
--   101 draft, unsent, $3,000   (A hold → release → stamp)
--   102 draft, unsent, $1,000   (A below the threshold; its own maker)
--   103 draft, unsent, $3,000   (A send back; owner releases a draft)
--   104 confirmed, sent, two lines (B riders; D snapshots)
--   105 cancelled               (A never sendable)
--   106 Studio B's project      (cross-studio)
--   107 draft, $3,000, one line and a deposit row (A11–A15 edit paths, ack v2)
--   108 draft, $3,000           (A14 legacy release, ack v1)
--   111–116 $600 each, $1,000 line (A16 groups): 111, 112 drafts to 014;
--       113 to 014 sent 8 days ago; 114 draft and 116 sent 2 days ago to 015;
--       115 draft to 014 on project C.
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by, sent_at)
VALUES
  ('70420000-0000-4000-8000-000000000101', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000011', 'net_30', 300000, 'draft',     '70420000-0000-4000-8000-0000000000a2', NULL),
  ('70420000-0000-4000-8000-000000000102', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000012', 'net_30', 100000, 'draft',     '70420000-0000-4000-8000-0000000000a2', NULL),
  ('70420000-0000-4000-8000-000000000107', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000013', 'net_30', 300000, 'draft',     '70420000-0000-4000-8000-0000000000a2', NULL),
  ('70420000-0000-4000-8000-000000000108', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000013', 'net_30', 300000, 'draft',     '70420000-0000-4000-8000-0000000000a2', NULL),
  ('70420000-0000-4000-8000-000000000111', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000014', 'net_30', 60000,  'draft',     '70420000-0000-4000-8000-0000000000a2', NULL),
  ('70420000-0000-4000-8000-000000000112', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000014', 'net_30', 60000,  'draft',     '70420000-0000-4000-8000-0000000000a2', NULL),
  ('70420000-0000-4000-8000-000000000113', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000014', 'net_30', 60000,  'confirmed', '70420000-0000-4000-8000-0000000000a2', NOW() - interval '8 days'),
  ('70420000-0000-4000-8000-000000000114', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000015', 'net_30', 60000,  'draft',     '70420000-0000-4000-8000-0000000000a2', NULL),
  ('70420000-0000-4000-8000-000000000115', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000003', '70420000-0000-4000-8000-000000000014', 'net_30', 60000,  'draft',     '70420000-0000-4000-8000-0000000000a2', NULL),
  ('70420000-0000-4000-8000-000000000116', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000015', 'net_30', 60000,  'confirmed', '70420000-0000-4000-8000-0000000000a2', NOW() - interval '2 days'),
  ('70420000-0000-4000-8000-000000000103', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000011', 'net_30', 300000, 'draft',     '70420000-0000-4000-8000-0000000000a2', NULL),
  ('70420000-0000-4000-8000-000000000104', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000011', 'net_30', 100000, 'confirmed', '70420000-0000-4000-8000-0000000000a2', NOW()),
  ('70420000-0000-4000-8000-000000000105', '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000011', 'net_30', 1000,   'cancelled', '70420000-0000-4000-8000-0000000000a2', NULL),
  ('70420000-0000-4000-8000-000000000106', '70420000-0000-4000-8000-0000000000a5', '70420000-0000-4000-8000-000000000002', '70420000-0000-4000-8000-000000000011', 'net_30', 100000, 'confirmed', '70420000-0000-4000-8000-0000000000a5', NOW());

-- Lines: 201 chairs ×2 and 202 table on PO 104; 203 sofa (deposit/balance);
-- 204 lamp (no deposit); 211 Studio B's line.
INSERT INTO project_ffe_items (id, project_id, name, status, quantity, unit_price_cents, trade_price_cents, line_total_cents, purchase_order_id, vendor_id, design_disposition, blocked)
VALUES
  ('70420000-0000-4000-8000-000000000201', '70420000-0000-4000-8000-000000000001', 'SQ420 chairs', 'ordered',  2,  20000, 15000,  40000, '70420000-0000-4000-8000-000000000104', '70420000-0000-4000-8000-000000000011', 'selected', false),
  ('70420000-0000-4000-8000-000000000202', '70420000-0000-4000-8000-000000000001', 'SQ420 table',  'ordered',  1,  60000, 45000,  60000, '70420000-0000-4000-8000-000000000104', '70420000-0000-4000-8000-000000000011', 'selected', false),
  ('70420000-0000-4000-8000-000000000203', '70420000-0000-4000-8000-000000000001', 'SQ420 sofa',   'approved', 1, 100000, 70000, 100000, NULL, NULL, 'selected', false),
  ('70420000-0000-4000-8000-000000000204', '70420000-0000-4000-8000-000000000001', 'SQ420 lamp',   'approved', 1,   9000,  9000,   9000, NULL, NULL, 'selected', false),
  ('70420000-0000-4000-8000-000000000211', '70420000-0000-4000-8000-000000000002', 'SQ420 B line', 'approved', 1,  10000, 10000,  10000, NULL, NULL, 'selected', false);

-- The item insert seeds an empty spec row; set the finish on it.
INSERT INTO project_ffe_specs (ffe_item_id)
SELECT '70420000-0000-4000-8000-000000000201'
WHERE NOT EXISTS (SELECT 1 FROM project_ffe_specs WHERE ffe_item_id = '70420000-0000-4000-8000-000000000201');
UPDATE project_ffe_specs SET finish = 'Walnut' WHERE ffe_item_id = '70420000-0000-4000-8000-000000000201';

-- 00719: 207 is PO 107's armchair ($3,000 trade); 801 its deposit row.
INSERT INTO project_ffe_items (id, project_id, name, status, quantity, unit_price_cents, trade_price_cents, line_total_cents, purchase_order_id, vendor_id, design_disposition, blocked)
VALUES ('70420000-0000-4000-8000-000000000207', '70420000-0000-4000-8000-000000000001', 'SQ420 armchair', 'ordered', 1, 400000, 300000, 400000, '70420000-0000-4000-8000-000000000107', '70420000-0000-4000-8000-000000000013', 'selected', false);
INSERT INTO project_ffe_specs (ffe_item_id)
SELECT '70420000-0000-4000-8000-000000000207'
WHERE NOT EXISTS (SELECT 1 FROM project_ffe_specs WHERE ffe_item_id = '70420000-0000-4000-8000-000000000207');
INSERT INTO po_payments (id, purchase_order_id, kind, amount_cents, state)
VALUES ('70420000-0000-4000-8000-000000000801', '70420000-0000-4000-8000-000000000107', 'deposit', 150000, 'pending');

-- Invoices: 301 deposit, 302 balance, 303 purchases and riders, 304 re-bill
-- then void, 306 Studio B.
INSERT INTO invoices (id, project_id, designer_id, status, tax_rate)
VALUES
  ('70420000-0000-4000-8000-000000000301', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-0000000000a1', 'draft', 0.1),
  ('70420000-0000-4000-8000-000000000302', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-0000000000a1', 'draft', 0),
  ('70420000-0000-4000-8000-000000000303', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-0000000000a1', 'draft', 0),
  ('70420000-0000-4000-8000-000000000304', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-0000000000a1', 'draft', 0),
  ('70420000-0000-4000-8000-000000000306', '70420000-0000-4000-8000-000000000002', '70420000-0000-4000-8000-0000000000a5', 'draft', 0);

-- Purchases: 401 billable ($300 + $24 tax + $15 shipping); 402 voided;
-- 403 not billable; 404 Studio B; 405 billable (released by an invoice void).
INSERT INTO studio_purchases (id, organization_id, project_id, kind, payee_name, purchased_on, amount_cents, tax_cents, shipping_cents, billable_to_client, status, voided_at, void_reason, recorded_by)
VALUES
  ('70420000-0000-4000-8000-000000000401', '70420000-0000-4000-8000-0000000000f1', '70420000-0000-4000-8000-000000000001', 'card_retail', 'CB2',        CURRENT_DATE, 30000, 2400, 1500, true,  'recorded', NULL,  NULL,        '70420000-0000-4000-8000-0000000000a2'),
  ('70420000-0000-4000-8000-000000000402', '70420000-0000-4000-8000-0000000000f1', '70420000-0000-4000-8000-000000000001', 'card_retail', 'West Elm',   CURRENT_DATE, 10000, 0,    0,    true,  'void',     NOW(), 'returned', '70420000-0000-4000-8000-0000000000a2'),
  ('70420000-0000-4000-8000-000000000403', '70420000-0000-4000-8000-0000000000f1', '70420000-0000-4000-8000-000000000001', 'expense',     'Parking',    CURRENT_DATE, 2000,  0,    0,    false, 'recorded', NULL,  NULL,        '70420000-0000-4000-8000-0000000000a2'),
  ('70420000-0000-4000-8000-000000000404', '70420000-0000-4000-8000-0000000000f2', '70420000-0000-4000-8000-000000000002', 'card_retail', 'B store',    CURRENT_DATE, 5000,  0,    0,    true,  'recorded', NULL,  NULL,        '70420000-0000-4000-8000-0000000000a5'),
  ('70420000-0000-4000-8000-000000000405', '70420000-0000-4000-8000-0000000000f1', '70420000-0000-4000-8000-000000000001', 'one_off',     'Brimfield',  CURRENT_DATE, 45000, 0,    0,    true,  'recorded', NULL,  NULL,        '70420000-0000-4000-8000-0000000000a2');

-- Riders: 501 freight (actual over estimate); 502 storage, not billable;
-- 503 Studio B; 504 crating with no amount; 505 liftgate (released by void).
INSERT INTO po_cost_lines (id, organization_id, purchase_order_id, kind, estimate_cents, actual_cents, billable_to_client)
VALUES
  ('70420000-0000-4000-8000-000000000501', '70420000-0000-4000-8000-0000000000f1', '70420000-0000-4000-8000-000000000104', 'freight',  12000, 12500, true),
  ('70420000-0000-4000-8000-000000000502', '70420000-0000-4000-8000-0000000000f1', '70420000-0000-4000-8000-000000000104', 'storage',  3000,  NULL,  false),
  ('70420000-0000-4000-8000-000000000503', '70420000-0000-4000-8000-0000000000f2', '70420000-0000-4000-8000-000000000106', 'freight',  4000,  NULL,  true),
  ('70420000-0000-4000-8000-000000000504', '70420000-0000-4000-8000-0000000000f1', '70420000-0000-4000-8000-000000000104', 'crating',  NULL,  NULL,  true),
  ('70420000-0000-4000-8000-000000000505', '70420000-0000-4000-8000-0000000000f1', '70420000-0000-4000-8000-000000000104', 'liftgate', 7500,  NULL,  true);

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

-- 00719: probes the sent_at stamp as the table owner (po-send stamps as
-- service_role) and undoes it; returns the refusal, or NULL when allowed.
CREATE OR REPLACE FUNCTION pg_temp.stamp_refusal(p_po_id uuid)
RETURNS text SECURITY DEFINER AS $$
BEGIN
  UPDATE public.purchase_orders SET sent_at = now() WHERE id = p_po_id;
  RAISE EXCEPTION 'stamp_probe_allowed';
EXCEPTION WHEN OTHERS THEN
  RETURN CASE WHEN SQLERRM = 'stamp_probe_allowed' THEN NULL ELSE SQLSTATE || ' ' || SQLERRM END;
END;
$$ LANGUAGE plpgsql;

-- 00719: a write as the table owner mid-case (po-send's own writes; a
-- release recorded before 00719).
CREATE OR REPLACE FUNCTION pg_temp.as_owner(p_sql text)
RETURNS void SECURITY DEFINER AS $$
BEGIN
  EXECUTE p_sql;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION pg_temp.raised(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.act(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.stamp_refusal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.as_owner(text) TO authenticated;

SET LOCAL ROLE authenticated;

-- ─── case A: the release gate ───────────────────────────────────────────────

DO $$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_po  public.purchase_orders%ROWTYPE;
  v_err text;
BEGIN
  -- A1: off by default.
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  SELECT * INTO v_org FROM public.organizations WHERE id = '70420000-0000-4000-8000-0000000000f1';
  ASSERT v_org.release_threshold_cents IS NULL AND v_org.require_release_per_order = false,
    'FAIL A1: the release gate should be off by default';
  ASSERT NOT public.purchase_order_release_required('70420000-0000-4000-8000-000000000101'),
    'FAIL A1: nothing waits for release while the gate is off';
  ASSERT public.po_is_sendable('70420000-0000-4000-8000-000000000101'),
    'FAIL A1: an unsent draft is sendable while the gate is off';
  ASSERT public.po_is_sendable('70420000-0000-4000-8000-000000000104'),
    'FAIL A1: a sent PO stays sendable (resend)';
  ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000105'),
    'FAIL A1: a cancelled PO is never sendable';
  v_err := pg_temp.raised($q$SELECT public.hold_purchase_order_for_release('70420000-0000-4000-8000-000000000101')$q$);
  ASSERT v_err LIKE '23514 %does not apply%', 'FAIL A1: nothing to hold while the gate is off, got ' || COALESCE(v_err, 'no error');

  -- A2: only an owner/admin sets the gate.
  v_err := pg_temp.raised($q$SELECT public.set_studio_release_gate('70420000-0000-4000-8000-0000000000f1', 250000)$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A2: a member cannot set the gate, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a5');
  v_err := pg_temp.raised($q$SELECT public.set_studio_release_gate('70420000-0000-4000-8000-0000000000f1', 250000)$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A2: another studio''s owner cannot set the gate, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a6');
  v_err := pg_temp.raised($q$SELECT public.set_studio_release_gate('70420000-0000-4000-8000-0000000000f1', 0)$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL A2: a zero threshold is refused, got ' || COALESCE(v_err, 'no error');
  v_org := public.set_studio_release_gate('70420000-0000-4000-8000-0000000000f1', 250000);
  ASSERT v_org.release_threshold_cents = 250000 AND NOT v_org.require_release_per_order,
    'FAIL A2: the admin sets a $2,500 threshold';

  -- A3: below the threshold nothing waits.
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  ASSERT NOT public.purchase_order_release_required('70420000-0000-4000-8000-000000000102'),
    'FAIL A3: a $1,000 order is under the threshold';
  ASSERT public.po_is_sendable('70420000-0000-4000-8000-000000000102'), 'FAIL A3: under the threshold is sendable';
  v_err := pg_temp.raised($q$SELECT public.hold_purchase_order_for_release('70420000-0000-4000-8000-000000000102')$q$);
  ASSERT v_err LIKE '23514 %does not apply%', 'FAIL A3: a hold under the threshold is refused, got ' || COALESCE(v_err, 'no error');

  -- A4: at the threshold the member holds, and the PO cannot go out.
  ASSERT public.purchase_order_release_required('70420000-0000-4000-8000-000000000101'),
    'FAIL A4: a $3,000 order is over the threshold';
  ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000101'),
    'FAIL A4: over the threshold and unreleased is not sendable';
  v_po := public.hold_purchase_order_for_release('70420000-0000-4000-8000-000000000101', ' Check the leg finish ');
  ASSERT v_po.status = 'held_for_release' AND v_po.held_by = '70420000-0000-4000-8000-0000000000a2'
     AND v_po.held_at IS NOT NULL AND v_po.hold_note = 'Check the leg finish',
    'FAIL A4: the hold is recorded, got ' || v_po.status;
  ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000101'), 'FAIL A4: a held PO is not sendable';
  v_po := public.hold_purchase_order_for_release('70420000-0000-4000-8000-000000000101');
  ASSERT v_po.status = 'held_for_release' AND v_po.hold_note = 'Check the leg finish', 'FAIL A4: a second hold is a no-op';

  -- A6: a member, guest, outsider and Studio B cannot release.
  v_err := pg_temp.raised($q$SELECT public.release_purchase_order('70420000-0000-4000-8000-000000000101')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A6: a member cannot release, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.raised($q$SELECT public.release_purchase_order('70420000-0000-4000-8000-000000000101')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A6: a guest cannot release, got ' || COALESCE(v_err, 'no error');
  ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000102'), 'FAIL A6: a guest learns nothing from po_is_sendable';
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT public.release_purchase_order('70420000-0000-4000-8000-000000000101')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A6: an outsider cannot release, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a5');
  v_err := pg_temp.raised($q$SELECT public.release_purchase_order('70420000-0000-4000-8000-000000000101')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A6: Studio B cannot release, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.hold_purchase_order_for_release('70420000-0000-4000-8000-000000000103')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A6: Studio B cannot hold, got ' || COALESCE(v_err, 'no error');

  RAISE NOTICE 'case A1-A4, A6 passed: off by default; the hold applies at the threshold; only owner/admin seats release';
END;
$$;

-- A5: the DB stops the sent_at stamp on a held PO, whatever the path
-- (po-send stamps as service_role).
RESET ROLE;
DO $$
DECLARE
  v_err text;
BEGIN
  v_err := pg_temp.raised($q$UPDATE public.purchase_orders SET sent_at = now() WHERE id = '70420000-0000-4000-8000-000000000101'$q$);
  ASSERT v_err LIKE '23514 held_for_release:%', 'FAIL A5: the stamp on a held PO is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$UPDATE public.purchase_orders SET status = 'confirmed' WHERE id = '70420000-0000-4000-8000-000000000101'$q$);
  ASSERT v_err LIKE '23514 held_for_release:%', 'FAIL A5: a held PO cannot jump to confirmed, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$UPDATE public.purchase_orders SET sent_at = now() WHERE id = '70420000-0000-4000-8000-000000000103'$q$);
  ASSERT v_err LIKE '23514 held_for_release:%', 'FAIL A5: an unreleased draft over the threshold cannot be stamped, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'case A5 passed: the sent_at stamp is refused at the DB while a release is owed';
END;
$$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_po  public.purchase_orders%ROWTYPE;
  v_err text;
BEGIN
  -- A7: the admin releases at the current total.
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a6');
  v_po := public.release_purchase_order('70420000-0000-4000-8000-000000000101');
  ASSERT v_po.status = 'draft' AND v_po.released_by = '70420000-0000-4000-8000-0000000000a6'
     AND v_po.released_total_cents = 300000 AND v_po.released_at IS NOT NULL,
    'FAIL A7: the release is recorded against the total';
  ASSERT public.po_is_sendable('70420000-0000-4000-8000-000000000101'), 'FAIL A7: a released PO is sendable';
  v_err := pg_temp.raised($q$SELECT public.release_purchase_order('70420000-0000-4000-8000-000000000102')$q$);
  ASSERT v_err LIKE '23514 %not waiting%', 'FAIL A7: nothing to release under the threshold, got ' || COALESCE(v_err, 'no error');

  -- A8: send back needs an owner/admin and a note.
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  v_po := public.hold_purchase_order_for_release('70420000-0000-4000-8000-000000000103');
  v_err := pg_temp.raised($q$SELECT public.send_back_purchase_order('70420000-0000-4000-8000-000000000103', 'nope')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A8: a member cannot send back, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a1');
  v_err := pg_temp.raised($q$SELECT public.send_back_purchase_order('70420000-0000-4000-8000-000000000103', '  ')$q$);
  ASSERT v_err LIKE '23514 %note%', 'FAIL A8: send back needs a note, got ' || COALESCE(v_err, 'no error');
  v_po := public.send_back_purchase_order('70420000-0000-4000-8000-000000000103', 'Check the leg finish first.');
  ASSERT v_po.status = 'draft' AND v_po.send_back_note = 'Check the leg finish first.'
     AND v_po.sent_back_by = '70420000-0000-4000-8000-0000000000a1' AND v_po.released_at IS NULL,
    'FAIL A8: sent back to draft with the note';
  ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000103'), 'FAIL A8: a sent-back PO still owes a release';
  v_err := pg_temp.raised($q$SELECT public.send_back_purchase_order('70420000-0000-4000-8000-000000000103', 'again')$q$);
  ASSERT v_err LIKE '23514 %not held%', 'FAIL A8: only a held PO goes back, got ' || COALESCE(v_err, 'no error');

  -- A9: an owner releases her own draft directly.
  v_po := public.release_purchase_order('70420000-0000-4000-8000-000000000103');
  ASSERT v_po.status = 'draft' AND v_po.released_total_cents = 300000, 'FAIL A9: an owner releases a draft directly';
  ASSERT public.po_is_sendable('70420000-0000-4000-8000-000000000103'), 'FAIL A9: released draft is sendable';

  -- A10: every-order mode.
  PERFORM public.set_studio_release_gate('70420000-0000-4000-8000-0000000000f1', NULL, true);
  ASSERT public.purchase_order_release_required('70420000-0000-4000-8000-000000000102'),
    'FAIL A10: every order waits when require_release_per_order is on';
  ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000102'), 'FAIL A10: a $1,000 order now waits';
  PERFORM public.set_studio_release_gate('70420000-0000-4000-8000-0000000000f1', 250000, false);
  RAISE NOTICE 'case A7-A10 passed: release at the total; send back with a note; owner releases a draft; every-order mode';
END;
$$;

-- A7b: a higher total needs a new release; the released total lets the stamp through.
RESET ROLE;
DO $$
DECLARE
  v_err text;
BEGIN
  UPDATE public.purchase_orders SET total_cents = 300001 WHERE id = '70420000-0000-4000-8000-000000000101';
  ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000101'), 'FAIL A7b: a raised total needs a new release';
  v_err := pg_temp.raised($q$UPDATE public.purchase_orders SET sent_at = now() WHERE id = '70420000-0000-4000-8000-000000000101'$q$);
  ASSERT v_err LIKE '23514 held_for_release:%', 'FAIL A7b: the stamp is refused above the released total, got ' || COALESCE(v_err, 'no error');
  UPDATE public.purchase_orders SET total_cents = 300000 WHERE id = '70420000-0000-4000-8000-000000000101';
  UPDATE public.purchase_orders SET sent_at = now() WHERE id = '70420000-0000-4000-8000-000000000101';
  ASSERT public.po_is_sendable('70420000-0000-4000-8000-000000000101'), 'FAIL A7b: a sent PO stays sendable';
  RAISE NOTICE 'case A7b passed: the release covers its total only; the released PO is stamped';
END;
$$;
SET LOCAL ROLE authenticated;

-- A11–A15 (00719, R3): the release covers the paper, not just the total.
DO $$
DECLARE
  v_po    public.purchase_orders%ROWTYPE;
  v_ack   public.po_acknowledgments%ROWTYPE;
  v_state jsonb;
  v_err   text;
  v_path  text;
  v_sql   text;
  v_line  uuid;
BEGIN
  -- A11: each edit path after a release needs a new release; the stamp is
  -- refused until then.
  FOR v_path, v_sql IN
    SELECT * FROM (VALUES
      ('header', $q$SELECT public.set_purchase_order_header('70420000-0000-4000-8000-000000000107', '{"vendorNote": "Call before delivery"}')$q$),
      ('ship-to location', $q$SELECT public.set_purchase_order_ship_to_location('70420000-0000-4000-8000-000000000107', '70420000-0000-4000-8000-000000000701')$q$),
      ('supplies', $q$SELECT public.set_purchase_order_supplies('70420000-0000-4000-8000-000000000107', '70420000-0000-4000-8000-000000000104')$q$),
      ('payment schedule', $q$SELECT public.update_po_payment_schedule('70420000-0000-4000-8000-000000000107', '{"payments": [{"id": "70420000-0000-4000-8000-000000000801", "label": "Deposit on order"}]}')$q$),
      ('rider', $q$SELECT public.upsert_po_cost_line('70420000-0000-4000-8000-000000000107', '{"kind": "freight", "estimateCents": 12000}')$q$),
      ('spec column', $q$UPDATE public.project_ffe_specs SET com_spec = '{"yardage": 14}' WHERE ffe_item_id = '70420000-0000-4000-8000-000000000207'$q$)
    ) AS edit_path(path, sql)
  LOOP
    PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a6');
    v_po := public.release_purchase_order('70420000-0000-4000-8000-000000000107');
    ASSERT v_po.released_fingerprint IS NOT NULL, 'FAIL A11: the release records the paper before the ' || v_path || ' edit';
    PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
    ASSERT public.po_is_sendable('70420000-0000-4000-8000-000000000107'),
      'FAIL A11: released and unedited is sendable before the ' || v_path || ' edit';
    v_state := public.po_release_state('70420000-0000-4000-8000-000000000107');
    ASSERT (v_state->>'cleared')::boolean AND v_state->'reason' = 'null'::jsonb,
      'FAIL A11: a cleared paper has no reason, got ' || v_state::text;
    EXECUTE v_sql;
    ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000107'),
      'FAIL A11: a ' || v_path || ' edit after release needs a new release';
    v_err := pg_temp.stamp_refusal('70420000-0000-4000-8000-000000000107');
    ASSERT v_err LIKE '23514 held_for_release:%',
      'FAIL A11: the stamp is refused after a ' || v_path || ' edit, got ' || COALESCE(v_err, 'no error');
    v_state := public.po_release_state('70420000-0000-4000-8000-000000000107');
    ASSERT v_state->>'reason' = 'changed' AND (v_state->>'released')::boolean AND NOT (v_state->>'cleared')::boolean,
      'FAIL A11: po_release_state says changed after the ' || v_path || ' edit, got ' || v_state::text;
  END LOOP;

  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a6');
  PERFORM public.release_purchase_order('70420000-0000-4000-8000-000000000107');
  ASSERT public.po_is_sendable('70420000-0000-4000-8000-000000000107')
     AND pg_temp.stamp_refusal('70420000-0000-4000-8000-000000000107') IS NULL,
    'FAIL A11: a new release covers the edited paper';

  -- A12: po-send fills a blank sidemark before the stamp; that keeps the
  -- release. Changing a sidemark the release saw does not.
  PERFORM pg_temp.as_owner($q$UPDATE public.purchase_orders SET sidemark = 'SQ420-A-ARM' WHERE id = '70420000-0000-4000-8000-000000000107'$q$);
  ASSERT public.po_is_sendable('70420000-0000-4000-8000-000000000107')
     AND pg_temp.stamp_refusal('70420000-0000-4000-8000-000000000107') IS NULL,
    'FAIL A12: a sidemark filled into a blank one keeps the release';
  PERFORM public.release_purchase_order('70420000-0000-4000-8000-000000000107');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  PERFORM public.set_purchase_order_header('70420000-0000-4000-8000-000000000107', '{"sidemark": "SQ420-OTHER"}');
  ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000107'),
    'FAIL A12: changing a released sidemark needs a new release';

  -- A13 (option T): ack v2 confirms a draft, so an edited one waits too; a
  -- new release lets it through.
  v_err := pg_temp.raised($q$SELECT public.log_po_acknowledgment_v2('70420000-0000-4000-8000-000000000107', '{}', '[]')$q$);
  ASSERT v_err LIKE '23514 held_for_release:%',
    'FAIL A13: ack v2 on a PO edited after release is refused, got ' || COALESCE(v_err, 'no error');
  ASSERT NOT EXISTS (SELECT 1 FROM public.po_acknowledgments WHERE purchase_order_id = '70420000-0000-4000-8000-000000000107'),
    'FAIL A13: the refused ack v2 left no acknowledgment';
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a6');
  PERFORM public.release_purchase_order('70420000-0000-4000-8000-000000000107');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  v_ack := public.log_po_acknowledgment_v2('70420000-0000-4000-8000-000000000107', '{}',
    jsonb_build_array(jsonb_build_object('ffeItemId', '70420000-0000-4000-8000-000000000207',
                                         'field', 'unit_price', 'ackValue', 290000)));
  ASSERT (SELECT status FROM public.purchase_orders WHERE id = '70420000-0000-4000-8000-000000000107') = 'confirmed',
    'FAIL A13: after a new release ack v2 confirms the PO';
  ASSERT public.po_is_sendable('70420000-0000-4000-8000-000000000107'),
    'FAIL A13: the acknowledgment itself does not change the released paper';

  -- A15: resolve_ack_line accepting a lower unit price changes the paper.
  SELECT id INTO v_line FROM public.po_ack_lines WHERE ack_id = v_ack.id AND field = 'unit_price';
  PERFORM public.resolve_ack_line(v_line, 'accepted', 'Vendor price, accepted');
  ASSERT (SELECT total_cents FROM public.purchase_orders WHERE id = '70420000-0000-4000-8000-000000000107') = 290000,
    'FAIL A15: the accepted price lowers the total';
  ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000107'),
    'FAIL A15: a lower unit price accepted after release needs a new release';
  v_err := pg_temp.stamp_refusal('70420000-0000-4000-8000-000000000107');
  ASSERT v_err LIKE '23514 held_for_release:%',
    'FAIL A15: the stamp is refused after the accepted price, got ' || COALESCE(v_err, 'no error');
  ASSERT public.po_release_state('70420000-0000-4000-8000-000000000107')->>'reason' = 'changed',
    'FAIL A15: po_release_state says changed';

  -- A14: a release from before 00719 (NULL fingerprint) covers its total only.
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a6');
  PERFORM public.release_purchase_order('70420000-0000-4000-8000-000000000108');
  PERFORM pg_temp.as_owner($q$UPDATE public.purchase_orders SET released_fingerprint = NULL WHERE id = '70420000-0000-4000-8000-000000000108'$q$);
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  PERFORM public.set_purchase_order_header('70420000-0000-4000-8000-000000000108', '{"vendorNote": "Legacy release"}');
  ASSERT public.po_is_sendable('70420000-0000-4000-8000-000000000108')
     AND pg_temp.stamp_refusal('70420000-0000-4000-8000-000000000108') IS NULL,
    'FAIL A14: a NULL fingerprint ignores the paper edit';
  PERFORM pg_temp.as_owner($q$UPDATE public.purchase_orders SET total_cents = 300001 WHERE id = '70420000-0000-4000-8000-000000000108'$q$);
  v_state := public.po_release_state('70420000-0000-4000-8000-000000000108');
  ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000108') AND v_state->>'reason' = 'total_rose',
    'FAIL A14: a NULL fingerprint still guards its total (total_rose), got ' || v_state::text;
  PERFORM pg_temp.as_owner($q$UPDATE public.purchase_orders SET total_cents = 300000 WHERE id = '70420000-0000-4000-8000-000000000108'$q$);

  -- A13 (option T): ack v1 likewise.
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a6');
  PERFORM public.release_purchase_order('70420000-0000-4000-8000-000000000108');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  PERFORM public.set_purchase_order_header('70420000-0000-4000-8000-000000000108', '{"freightTerms": "collect"}');
  v_err := pg_temp.raised($q$SELECT public.log_po_acknowledgment('70420000-0000-4000-8000-000000000108', 'V-108')$q$);
  ASSERT v_err LIKE '23514 held_for_release:%',
    'FAIL A13: ack v1 on a PO edited after release is refused, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a6');
  PERFORM public.release_purchase_order('70420000-0000-4000-8000-000000000108');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  v_po := public.log_po_acknowledgment('70420000-0000-4000-8000-000000000108', 'V-108');
  ASSERT v_po.status = 'confirmed', 'FAIL A13: after a new release ack v1 confirms the PO, got ' || v_po.status;

  -- The fingerprint and its parts stay internal.
  v_err := pg_temp.raised($q$SELECT public._po_release_fingerprint('70420000-0000-4000-8000-000000000108')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A11: authenticated cannot call _po_release_fingerprint, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public._release_gate_total('70420000-0000-4000-8000-000000000108')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A11: authenticated cannot call _release_gate_total, got ' || COALESCE(v_err, 'no error');

  RAISE NOTICE 'case A11-A15 passed: every edit path re-holds a released PO; blank sidemark fill keeps it; legacy release is total-only; ack v1/v2 wait for a new release';
END;
$$;

-- A16–A17 (00719, R4): the threshold reads the job's open and recently sent
-- orders to the same maker; a held PO takes no number.
DO $$
DECLARE
  v_po    public.purchase_orders%ROWTYPE;
  v_state jsonb;
  v_err   text;
BEGIN
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a6');
  PERFORM public.set_studio_release_gate('70420000-0000-4000-8000-0000000000f1', 100000);
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');

  -- A16: two $600 drafts to one maker on one job are $1,200 together.
  ASSERT public.purchase_order_release_required('70420000-0000-4000-8000-000000000111')
     AND public.purchase_order_release_required('70420000-0000-4000-8000-000000000112'),
    'FAIL A16: both $600 drafts wait under a $1,000 line';
  ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000111')
     AND NOT public.po_is_sendable('70420000-0000-4000-8000-000000000112'),
    'FAIL A16: neither split draft is sendable';
  v_state := public.po_release_state('70420000-0000-4000-8000-000000000111');
  ASSERT (v_state->>'group_total_cents')::bigint = 120000,
    'FAIL A16: the order sent 8 days ago, another maker''s and another job''s do not count, got ' || v_state::text;
  ASSERT (v_state->>'applies')::boolean AND NOT (v_state->>'released')::boolean
     AND v_state->>'reason' = 'group_over' AND (v_state->>'threshold_cents')::bigint = 100000,
    'FAIL A16: po_release_state says group_over, got ' || v_state::text;
  ASSERT (public.po_release_state('70420000-0000-4000-8000-000000000114')->>'group_total_cents')::bigint = 120000
     AND public.purchase_order_release_required('70420000-0000-4000-8000-000000000114'),
    'FAIL A16: the order sent 2 days ago counts';
  ASSERT NOT public.purchase_order_release_required('70420000-0000-4000-8000-000000000115')
     AND public.po_is_sendable('70420000-0000-4000-8000-000000000115')
     AND (public.po_release_state('70420000-0000-4000-8000-000000000115')->>'group_total_cents')::bigint = 60000,
    'FAIL A16: the same maker on another job does not count';
  ASSERT public.po_release_state('70420000-0000-4000-8000-000000000115')->'reason' = 'null'::jsonb,
    'FAIL A16: no reason under the line';
  v_err := pg_temp.stamp_refusal('70420000-0000-4000-8000-000000000112');
  ASSERT v_err LIKE '23514 held_for_release:%', 'FAIL A16: the split draft''s stamp is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.log_po_acknowledgment_v2('70420000-0000-4000-8000-000000000112', '{}', '[]')$q$);
  ASSERT v_err LIKE '23514 held_for_release:%', 'FAIL A16: an ack cannot confirm a split draft, got ' || COALESCE(v_err, 'no error');

  -- A member holds one; it still counts toward its sibling. Releasing it
  -- does not release the sibling.
  v_po := public.hold_purchase_order_for_release('70420000-0000-4000-8000-000000000111');
  ASSERT v_po.status = 'held_for_release', 'FAIL A16: a split draft can be held';
  ASSERT (public.po_release_state('70420000-0000-4000-8000-000000000112')->>'group_total_cents')::bigint = 120000,
    'FAIL A16: a held sibling counts';

  -- A17: a held PO takes its number when it is released.
  v_err := pg_temp.raised($q$SELECT public.assign_po_number('70420000-0000-4000-8000-000000000111')$q$);
  ASSERT v_err = '23514 held_for_release: a held order takes its number when it is released',
    'FAIL A17: assign_po_number refuses a held PO, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a6');
  v_po := public.release_purchase_order('70420000-0000-4000-8000-000000000111');
  ASSERT public.po_is_sendable('70420000-0000-4000-8000-000000000111')
     AND pg_temp.stamp_refusal('70420000-0000-4000-8000-000000000111') IS NULL,
    'FAIL A16: the released split draft can go';
  ASSERT NOT public.po_is_sendable('70420000-0000-4000-8000-000000000112'),
    'FAIL A16: releasing one split draft does not release its sibling';
  v_po := public.assign_po_number('70420000-0000-4000-8000-000000000111');
  ASSERT v_po.po_number IS NOT NULL, 'FAIL A17: a released PO takes its number';

  PERFORM public.set_studio_release_gate('70420000-0000-4000-8000-0000000000f1', 250000, false);
  RAISE NOTICE 'case A16-A17 passed: the line reads the job''s open and 7-day orders to the maker; a held PO takes no number';
END;
$$;

-- ─── case B: deposit/balance slots and the billing writer ───────────────────

DO $$
DECLARE
  v_line public.invoice_line_items%ROWTYPE;
  v_inv  public.invoices%ROWTYPE;
  r      record;
  v_err  text;
  v_n    int;
BEGIN
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');

  -- B1: a 50 % deposit on the sofa.
  SELECT * INTO v_line FROM public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000301',
    '[{"ffeItemId": "70420000-0000-4000-8000-000000000203", "stage": "deposit", "depositPct": 50}]');
  ASSERT v_line.kind = 'ffe' AND v_line.billing_stage = 'deposit' AND v_line.billing_stage_pct = 50
     AND v_line.amount_cents = 50000 AND v_line.description = 'Deposit (50%) · SQ420 sofa',
    'FAIL B1: deposit line, got ' || v_line.billing_stage || '/' || v_line.amount_cents || '/' || v_line.description;
  SELECT * INTO v_inv FROM public.invoices WHERE id = '70420000-0000-4000-8000-000000000301';
  ASSERT v_inv.subtotal_cents = 50000 AND v_inv.tax_cents = 5000 AND v_inv.total_cents = 55000,
    'FAIL B1: totals recomputed at the entered tax rate, got ' || v_inv.total_cents;

  -- B2: a full bill and a deposit never share a line; one deposit per line.
  v_err := pg_temp.raised($q$INSERT INTO public.invoice_line_items (invoice_id, kind, ffe_item_id, description, quantity, unit_amount_cents, amount_cents)
    VALUES ('70420000-0000-4000-8000-000000000302', 'ffe', '70420000-0000-4000-8000-000000000203', 'full', 1, 100000, 100000)$q$);
  ASSERT v_err LIKE '23505 %uniq_invoice_line_items_ffe_item%', 'FAIL B2: a full bill beside a deposit is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000302',
    '[{"ffeItemId": "70420000-0000-4000-8000-000000000203", "stage": "deposit", "depositPct": 25}]')$q$);
  ASSERT v_err LIKE '23505 %uniq_invoice_line_items_ffe_item%', 'FAIL B2: a second deposit is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000302',
    '[{"ffeItemId": "70420000-0000-4000-8000-000000000204", "stage": "balance"}]')$q$);
  ASSERT v_err LIKE '23514 %no deposit%', 'FAIL B2: a balance before a deposit is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000302',
    '[{"ffeItemId": "70420000-0000-4000-8000-000000000204", "stage": "deposit"}]')$q$);
  ASSERT v_err LIKE '23514 %depositPct%', 'FAIL B2: a deposit needs a percent, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000302',
    '[{"ffeItemId": "70420000-0000-4000-8000-000000000211", "stage": "deposit", "depositPct": 50}]')$q$);
  ASSERT v_err LIKE '23514 %project%', 'FAIL B2: another project''s line is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000302',
    '[{"ffeItemId": "70420000-0000-4000-8000-000000000204", "stage": "deposit", "depositPct": 50, "bogus": 1}]')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL B2: unknown keys are refused, got ' || COALESCE(v_err, 'no error');

  -- B3: the balance is the price less the live deposit.
  SELECT * INTO v_line FROM public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000302',
    '[{"ffeItemId": "70420000-0000-4000-8000-000000000203", "stage": "balance"}]');
  ASSERT v_line.billing_stage = 'balance' AND v_line.amount_cents = 50000 AND v_line.billing_stage_pct IS NULL,
    'FAIL B3: balance of 50000, got ' || v_line.amount_cents;

  -- B4: coverage stays one row per line; stage coverage per slot.
  SELECT count(*) INTO v_n FROM public.get_ffe_invoice_coverage('70420000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = '70420000-0000-4000-8000-000000000203';
  ASSERT v_n = 1, 'FAIL B4: one coverage row per line, got ' || v_n;
  SELECT * INTO r FROM public.get_ffe_invoice_coverage('70420000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = '70420000-0000-4000-8000-000000000203';
  ASSERT r.billed_cents = 100000 AND r.coverage = 'invoiced'
     AND r.invoice_id = '70420000-0000-4000-8000-000000000302',
    'FAIL B4: both slots sum, latest invoice shown, got ' || r.billed_cents || '/' || r.coverage;
  SELECT string_agg(billing_stage || ':' || billed_cents || ':' || coverage, ',') INTO v_err
    FROM public.get_ffe_invoice_stage_coverage('70420000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = '70420000-0000-4000-8000-000000000203';
  ASSERT v_err = 'deposit:50000:invoiced,balance:50000:invoiced', 'FAIL B4: stage coverage, got ' || COALESCE(v_err, 'none');
  RAISE NOTICE 'case B1-B4 (drafts) passed: deposit then balance on separate slots; full and deposit never mix';
END;
$$;

-- B4b: paid roll-up. A paid deposit alone reads invoiced; both paid read paid.
RESET ROLE;
UPDATE public.invoices SET status = 'paid', invoice_number = 'SQ420-301', sent_at = now(), paid_at = now(),
       amount_paid_cents = total_cents
 WHERE id = '70420000-0000-4000-8000-000000000301';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  r record;
BEGIN
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  SELECT * INTO r FROM public.get_ffe_invoice_coverage('70420000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = '70420000-0000-4000-8000-000000000203';
  ASSERT r.coverage = 'invoiced', 'FAIL B4b: a paid deposit with the balance still draft reads invoiced, got ' || r.coverage;
END;
$$;

RESET ROLE;
UPDATE public.invoices SET status = 'paid', invoice_number = 'SQ420-302', sent_at = now(), paid_at = now(),
       amount_paid_cents = total_cents
 WHERE id = '70420000-0000-4000-8000-000000000302';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  r     record;
  v_err text;
BEGIN
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  SELECT * INTO r FROM public.get_ffe_invoice_coverage('70420000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = '70420000-0000-4000-8000-000000000203';
  ASSERT r.coverage = 'paid' AND r.billed_cents = 100000, 'FAIL B4b: deposit and balance both paid read paid, got ' || r.coverage;
  SELECT * INTO r FROM public.get_ffe_invoice_coverage('70420000-0000-4000-8000-000000000001')
   WHERE ffe_item_id = '70420000-0000-4000-8000-000000000204';
  ASSERT r.coverage = 'uninvoiced' AND r.billed_cents IS NULL AND r.invoice_id IS NULL,
    'FAIL B4b: an unbilled line reads uninvoiced';
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000301',
    '[{"purchaseId": "70420000-0000-4000-8000-000000000401"}]')$q$);
  ASSERT v_err LIKE '23514 %not a draft%', 'FAIL B4b: a paid invoice takes no lines, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'case B4b passed: coverage rolls up the slots (deposit alone invoiced; both paid paid)';
END;
$$;

DO $$
DECLARE
  v_line public.invoice_line_items%ROWTYPE;
  v_pur  public.studio_purchases%ROWTYPE;
  v_rid  public.po_cost_lines%ROWTYPE;
  v_inv  public.invoices%ROWTYPE;
  v_err  text;
  v_n    int;
BEGIN
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');

  -- B5: a purchase bills at cost on its own line, once.
  SELECT * INTO v_line FROM public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000303',
    '[{"purchaseId": "70420000-0000-4000-8000-000000000401"}]');
  ASSERT v_line.kind = 'adhoc' AND v_line.amount_cents = 33900 AND v_line.ffe_item_id IS NULL
     AND v_line.metadata->>'studioPurchaseId' = '70420000-0000-4000-8000-000000000401'
     AND (v_line.metadata->>'costCents')::int = 33900 AND v_line.description = 'CB2',
    'FAIL B5: the purchase bills at cost (amount + tax + shipping), got ' || v_line.amount_cents;
  SELECT * INTO v_pur FROM public.studio_purchases WHERE id = '70420000-0000-4000-8000-000000000401';
  ASSERT v_pur.status = 'billed' AND v_pur.invoice_line_id = v_line.id, 'FAIL B5: the purchase is stamped billed';
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000304',
    '[{"purchaseId": "70420000-0000-4000-8000-000000000401"}]')$q$);
  ASSERT v_err LIKE '23514 %already billed%', 'FAIL B5: a second stamp is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000304',
    '[{"purchaseId": "70420000-0000-4000-8000-000000000402"}]')$q$);
  ASSERT v_err LIKE '23514 %voided%', 'FAIL B5: a voided purchase is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000304',
    '[{"purchaseId": "70420000-0000-4000-8000-000000000403"}]')$q$);
  ASSERT v_err LIKE '23514 %not billable%', 'FAIL B5: a non-billable purchase is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000304',
    '[{"purchaseId": "70420000-0000-4000-8000-000000000404"}]')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B5: another studio''s purchase is refused, got ' || COALESCE(v_err, 'no error');
  -- The same purchase twice in one call never bills twice.
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000304',
    '[{"purchaseId": "70420000-0000-4000-8000-000000000405"}, {"purchaseId": "70420000-0000-4000-8000-000000000405"}]')$q$);
  ASSERT v_err LIKE '23514 %already billed%', 'FAIL B5: a duplicate in one call is refused, got ' || COALESCE(v_err, 'no error');
  ASSERT (SELECT status FROM public.studio_purchases WHERE id = '70420000-0000-4000-8000-000000000405') = 'recorded',
    'FAIL B5: the refused call left nothing behind';

  -- B6: riders bill at cost (actual, else estimate), once; an override wins.
  SELECT * INTO v_line FROM public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000303',
    '[{"costLineId": "70420000-0000-4000-8000-000000000501"}]');
  ASSERT v_line.amount_cents = 12500 AND v_line.metadata->>'poCostLineId' = '70420000-0000-4000-8000-000000000501'
     AND v_line.description = 'Freight', 'FAIL B6: the rider bills at its actual, got ' || v_line.amount_cents;
  SELECT * INTO v_rid FROM public.po_cost_lines WHERE id = '70420000-0000-4000-8000-000000000501';
  ASSERT v_rid.invoice_line_id = v_line.id, 'FAIL B6: the rider is stamped';
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000304',
    '[{"costLineId": "70420000-0000-4000-8000-000000000501"}]')$q$);
  ASSERT v_err LIKE '23514 %already billed%', 'FAIL B6: a second rider stamp is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000304',
    '[{"costLineId": "70420000-0000-4000-8000-000000000502"}]')$q$);
  ASSERT v_err LIKE '23514 %not billable%', 'FAIL B6: a non-billable rider is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000304',
    '[{"costLineId": "70420000-0000-4000-8000-000000000503"}]')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B6: another studio''s rider is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000304',
    '[{"costLineId": "70420000-0000-4000-8000-000000000504"}]')$q$);
  ASSERT v_err LIKE '23514 %no estimate or actual%', 'FAIL B6: a rider with no amount needs one, got ' || COALESCE(v_err, 'no error');
  SELECT * INTO v_line FROM public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000303',
    '[{"costLineId": "70420000-0000-4000-8000-000000000504", "amountCents": 800, "description": "Crating, two pieces"}]');
  ASSERT v_line.amount_cents = 800 AND v_line.description = 'Crating, two pieces', 'FAIL B6: an override wins';
  SELECT * INTO v_inv FROM public.invoices WHERE id = '70420000-0000-4000-8000-000000000303';
  ASSERT v_inv.subtotal_cents = 33900 + 12500 + 800 AND v_inv.total_cents = v_inv.subtotal_cents,
    'FAIL B6: the draft''s totals follow its lines, got ' || v_inv.subtotal_cents;

  -- B7: the invoice must be one the caller manages.
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000304',
    '[{"purchaseId": "70420000-0000-4000-8000-000000000405"}]')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B7: a guest is refused, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a5');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000304',
    '[{"purchaseId": "70420000-0000-4000-8000-000000000405"}]')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B7: Studio B is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000306',
    '[{"purchaseId": "70420000-0000-4000-8000-000000000405"}]')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B7: Studio B cannot bill Studio A''s purchase on its invoice, got ' || COALESCE(v_err, 'no error');

  -- B8: deleting the line releases the purchase; it can be billed again.
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  DELETE FROM public.invoice_line_items
   WHERE id = (SELECT invoice_line_id FROM public.studio_purchases WHERE id = '70420000-0000-4000-8000-000000000401');
  SELECT * INTO v_pur FROM public.studio_purchases WHERE id = '70420000-0000-4000-8000-000000000401';
  ASSERT v_pur.status = 'recorded' AND v_pur.invoice_line_id IS NULL, 'FAIL B8: deleting the line returns the purchase to recorded';
  SELECT count(*) INTO v_n FROM public.add_invoice_billing_lines('70420000-0000-4000-8000-000000000304',
    '[{"purchaseId": "70420000-0000-4000-8000-000000000401", "amountCents": 30000},
      {"purchaseId": "70420000-0000-4000-8000-000000000405"},
      {"costLineId": "70420000-0000-4000-8000-000000000505"}]');
  ASSERT v_n = 3, 'FAIL B8: three lines added, got ' || v_n;
  RAISE NOTICE 'case B5-B8 passed: purchases and riders bill at cost once; overrides; deleting the line releases';
END;
$$;

-- B9: voiding the invoice releases its stamps.
RESET ROLE;
UPDATE public.invoices SET status = 'void', voided_at = now(), void_reason = 'SQ420 test'
 WHERE id = '70420000-0000-4000-8000-000000000304';
DO $$
BEGIN
  ASSERT (SELECT status = 'recorded' AND invoice_line_id IS NULL FROM public.studio_purchases
           WHERE id = '70420000-0000-4000-8000-000000000401')
     AND (SELECT status = 'recorded' AND invoice_line_id IS NULL FROM public.studio_purchases
           WHERE id = '70420000-0000-4000-8000-000000000405'),
    'FAIL B9: a void returns its purchases to recorded';
  ASSERT (SELECT invoice_line_id IS NULL FROM public.po_cost_lines WHERE id = '70420000-0000-4000-8000-000000000505'),
    'FAIL B9: a void frees its riders';
  ASSERT (SELECT invoice_line_id IS NOT NULL FROM public.po_cost_lines WHERE id = '70420000-0000-4000-8000-000000000501'),
    'FAIL B9: a rider on another invoice stays stamped';
  RAISE NOTICE 'case B9 passed: voiding the invoice releases its stamps';
END;
$$;
SET LOCAL ROLE authenticated;

-- ─── case C: install manifest and punch items ───────────────────────────────

DO $$
DECLARE
  v_m     public.install_manifest_items%ROWTYPE;
  v_id    uuid;
  v_p     public.install_punch_items%ROWTYPE;
  v_err   text;
BEGIN
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  v_m := public.upsert_install_manifest_item('70420000-0000-4000-8000-000000000201',
    jsonb_build_object('roomLocation', ' Living room, north wall ', 'installOn', (CURRENT_DATE + 30)::text,
                       'installerName', 'Badger Install', 'state', 'at_receiver'));
  ASSERT v_m.room_location = 'Living room, north wall' AND v_m.install_on = CURRENT_DATE + 30
     AND v_m.state = 'at_receiver' AND v_m.organization_id = '70420000-0000-4000-8000-0000000000f1'
     AND v_m.project_id = '70420000-0000-4000-8000-000000000001',
    'FAIL C1: the manifest row is written';
  v_id := v_m.id;
  v_m := public.upsert_install_manifest_item('70420000-0000-4000-8000-000000000201', '{"note": "Two-person carry", "installOn": null}');
  ASSERT v_m.id = v_id AND v_m.note = 'Two-person carry' AND v_m.install_on IS NULL
     AND v_m.room_location = 'Living room, north wall' AND v_m.state = 'at_receiver',
    'FAIL C1: one row per line; patch keeps absent keys, null clears';
  v_err := pg_temp.raised($q$SELECT public.upsert_install_manifest_item('70420000-0000-4000-8000-000000000201', '{"state": "installed"}')$q$);
  ASSERT v_err LIKE '23514 %state%', 'FAIL C1: a bad state is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.upsert_install_manifest_item('70420000-0000-4000-8000-000000000201', '{"bogus": "x"}')$q$);
  ASSERT v_err LIKE '23514 %unknown keys%', 'FAIL C1: unknown keys are refused, got ' || COALESCE(v_err, 'no error');

  -- C2: punch items.
  v_p := public.upsert_install_punch_item(jsonb_build_object(
    'ffeItemId', '70420000-0000-4000-8000-000000000201', 'note', 'Touch-up on left arm',
    'mediaIds', jsonb_build_array('70420000-0000-4000-8000-000000000901')));
  ASSERT v_p.note = 'Touch-up on left arm' AND cardinality(v_p.media_ids) = 1 AND v_p.resolved_at IS NULL,
    'FAIL C2: the punch item is recorded';
  v_p := public.upsert_install_punch_item(jsonb_build_object('id', v_p.id, 'dueOn', (CURRENT_DATE + 7)::text));
  ASSERT v_p.due_on = CURRENT_DATE + 7 AND v_p.note = 'Touch-up on left arm', 'FAIL C2: patch sets the due date';
  v_err := pg_temp.raised($q$SELECT public.upsert_install_punch_item('{"ffeItemId": "70420000-0000-4000-8000-000000000201"}')$q$);
  ASSERT v_err LIKE '23514 %required%', 'FAIL C2: a punch item needs a note, got ' || COALESCE(v_err, 'no error');
  v_p := public.resolve_install_punch_item(v_p.id, 'Touched up on site');
  ASSERT v_p.resolved_at IS NOT NULL AND v_p.resolved_by = '70420000-0000-4000-8000-0000000000a2'
     AND v_p.resolution_note = 'Touched up on site', 'FAIL C2: resolved';
  v_p := public.resolve_install_punch_item(v_p.id);
  ASSERT v_p.resolution_note = 'Touched up on site', 'FAIL C2: resolve is idempotent';
  v_err := pg_temp.raised(format($q$SELECT public.upsert_install_punch_item('{"id": "%s", "note": "x"}')$q$, v_p.id));
  ASSERT v_err LIKE '23514 %resolved%', 'FAIL C2: a resolved item takes no patch, got ' || COALESCE(v_err, 'no error');
  PERFORM set_config('sq420.punch', v_p.id::text, true);

  -- C3: refusals.
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.raised($q$SELECT public.upsert_install_manifest_item('70420000-0000-4000-8000-000000000201', '{"note": "x"}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL C3: a guest is refused, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a5');
  v_err := pg_temp.raised($q$SELECT public.upsert_install_punch_item('{"ffeItemId": "70420000-0000-4000-8000-000000000201", "note": "x"}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL C3: Studio B is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format($q$SELECT public.resolve_install_punch_item('%s')$q$, v_p.id));
  ASSERT v_err LIKE '42501 %', 'FAIL C3: Studio B cannot resolve, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'case C passed: manifest upsert with patch semantics; punch create/patch/resolve; refusals';
END;
$$;

-- ─── case D: spec snapshots ─────────────────────────────────────────────────

DO $$
DECLARE
  v_rev int;
  v_err text;
BEGIN
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  v_rev := public.snapshot_purchase_order_spec('70420000-0000-4000-8000-000000000104');
  ASSERT v_rev = 1, 'FAIL D1: the first snapshot is revision 1, got ' || v_rev;
  ASSERT (SELECT count(*) FROM public.po_spec_snapshots WHERE purchase_order_id = '70420000-0000-4000-8000-000000000104') = 2,
    'FAIL D1: one row per line';
  ASSERT (SELECT spec->>'finish' FROM public.po_spec_snapshots
           WHERE purchase_order_id = '70420000-0000-4000-8000-000000000104'
             AND ffe_item_id = '70420000-0000-4000-8000-000000000201') = 'Walnut',
    'FAIL D1: the resolved finish is captured';
  ASSERT (SELECT (spec->>'unitTradeCents')::int FROM public.po_spec_snapshots
           WHERE purchase_order_id = '70420000-0000-4000-8000-000000000104'
             AND ffe_item_id = '70420000-0000-4000-8000-000000000201') = 15000,
    'FAIL D1: the trade price is captured';
  v_rev := public.snapshot_purchase_order_spec('70420000-0000-4000-8000-000000000104');
  ASSERT v_rev = 1, 'FAIL D2: an unchanged resend keeps revision 1, got ' || v_rev;
  ASSERT public.snapshot_purchase_order_spec('70420000-0000-4000-8000-000000000102') = 0,
    'FAIL D4: a PO with no lines snapshots nothing';

  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.raised($q$SELECT public.snapshot_purchase_order_spec('70420000-0000-4000-8000-000000000104')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL D5: a guest is refused, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a5');
  v_err := pg_temp.raised($q$SELECT public.snapshot_purchase_order_spec('70420000-0000-4000-8000-000000000104')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL D5: Studio B is refused, got ' || COALESCE(v_err, 'no error');
END;
$$;

RESET ROLE;
UPDATE public.project_ffe_items SET updated_at = now() + interval '1 minute'
 WHERE id = '70420000-0000-4000-8000-000000000202';
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  ASSERT public.snapshot_purchase_order_spec('70420000-0000-4000-8000-000000000104') = 1,
    'FAIL D3: a touched-but-unchanged line keeps the revision';
END;
$$;

RESET ROLE;
UPDATE public.project_ffe_specs SET finish = 'Ebony' WHERE ffe_item_id = '70420000-0000-4000-8000-000000000201';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_rev int;
BEGIN
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  v_rev := public.snapshot_purchase_order_spec('70420000-0000-4000-8000-000000000104');
  ASSERT v_rev = 2, 'FAIL D3: a changed finish writes revision 2, got ' || v_rev;
  ASSERT (SELECT count(*) FROM public.po_spec_snapshots WHERE purchase_order_id = '70420000-0000-4000-8000-000000000104') = 4,
    'FAIL D3: revision 2 holds every line';
  ASSERT (SELECT spec->>'finish' FROM public.po_spec_snapshots
           WHERE purchase_order_id = '70420000-0000-4000-8000-000000000104' AND revision = 2
             AND ffe_item_id = '70420000-0000-4000-8000-000000000201') = 'Ebony'
     AND (SELECT spec->>'finish' FROM public.po_spec_snapshots
           WHERE purchase_order_id = '70420000-0000-4000-8000-000000000104' AND revision = 1
             AND ffe_item_id = '70420000-0000-4000-8000-000000000201') = 'Walnut',
    'FAIL D3: each revision keeps what went out';
  RAISE NOTICE 'case D passed: snapshot revisions move only when the spec does';
END;
$$;

-- ─── case E: sample requests and the last two clocks ────────────────────────

DO $$
DECLARE
  v_s   public.sample_requests%ROWTYPE;
  v_err text;
BEGIN
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  -- E1: a memo on the sofa, due back in two days.
  v_s := public.record_sample_request(jsonb_build_object(
    'ffeItemId', '70420000-0000-4000-8000-000000000203', 'vendorId', '70420000-0000-4000-8000-000000000011',
    'kind', 'memo', 'description', 'Mohair, three colourways', 'returnBy', (CURRENT_DATE + 2)::text,
    'feeCents', 2500));
  ASSERT v_s.project_id = '70420000-0000-4000-8000-000000000001' AND v_s.organization_id = '70420000-0000-4000-8000-0000000000f1'
     AND v_s.status = 'requested' AND v_s.requested_on = CURRENT_DATE AND v_s.fee_cents = 2500
     AND NOT v_s.billable_to_client,
    'FAIL E1: the memo request is recorded against the line''s project';
  PERFORM set_config('sq420.memo', v_s.id::text, true);
  v_s := public.record_sample_request(jsonb_build_object('id', v_s.id, 'receivedOn', CURRENT_DATE::text));
  ASSERT v_s.status = 'received' AND v_s.received_on = CURRENT_DATE, 'FAIL E1: receivedOn moves it to received';

  -- E2: a studio-level loaner with no project, due back tomorrow.
  v_s := public.record_sample_request(jsonb_build_object('kind', 'loaner', 'description', 'Rug loaner',
    'returnBy', (CURRENT_DATE + 1)::text));
  ASSERT v_s.project_id IS NULL AND v_s.organization_id = '70420000-0000-4000-8000-0000000000f1',
    'FAIL E2: a studio sample resolves the caller''s studio';
  PERFORM set_config('sq420.loaner', v_s.id::text, true);
  -- A chip far from due.
  v_s := public.record_sample_request(jsonb_build_object('kind', 'finish_chip', 'projectId', '70420000-0000-4000-8000-000000000001',
    'returnBy', (CURRENT_DATE + 20)::text));
  PERFORM set_config('sq420.chip', v_s.id::text, true);

  v_err := pg_temp.raised($q$SELECT public.record_sample_request('{"kind": "swatch"}')$q$);
  ASSERT v_err LIKE '23514 %kind%', 'FAIL E1: a bad kind is refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_sample_request('{"kind": "memo", "bogus": "x"}')$q$);
  ASSERT v_err LIKE '23514 %unknown keys%', 'FAIL E1: unknown keys are refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.record_sample_request('{"kind": "memo", "status": "returned"}')$q$);
  ASSERT v_err LIKE '23514 %mark_sample_returned%', 'FAIL E1: a return goes through mark_sample_returned, got ' || COALESCE(v_err, 'no error');

  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a5');
  v_err := pg_temp.raised($q$SELECT public.record_sample_request('{"kind": "memo", "projectId": "70420000-0000-4000-8000-000000000001"}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL E5: Studio B cannot record on Studio A''s project, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format($q$SELECT public.mark_sample_returned('%s')$q$, current_setting('sq420.memo')));
  ASSERT v_err LIKE '42501 %', 'FAIL E5: Studio B cannot mark a return, got ' || COALESCE(v_err, 'no error');
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a3');
  v_err := pg_temp.raised(format($q$SELECT public.mark_sample_returned('%s')$q$, current_setting('sq420.loaner')));
  ASSERT v_err LIKE '42501 %', 'FAIL E5: a guest cannot mark a studio sample returned, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'case E1-E2 passed: sample requests recorded against a line or the studio';
END;
$$;

-- E3: the sweep (service role) — memo_return_due and cfa_reserve_expiring.
RESET ROLE;
INSERT INTO po_submittals (id, organization_id, project_id, ffe_item_id, purchase_order_id, kind, reserve_expires_on, decision, created_by)
VALUES
  ('70420000-0000-4000-8000-000000000601', '70420000-0000-4000-8000-0000000000f1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000201', '70420000-0000-4000-8000-000000000104', 'cfa', CURRENT_DATE + 1, 'pending', '70420000-0000-4000-8000-0000000000a2'),
  ('70420000-0000-4000-8000-000000000602', '70420000-0000-4000-8000-0000000000f1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000202', NULL, 'cfa', CURRENT_DATE + 5, 'pending', '70420000-0000-4000-8000-0000000000a2');
INSERT INTO po_submittals (id, organization_id, project_id, ffe_item_id, kind, reserve_expires_on, decision, decided_at, decided_by, created_by)
VALUES
  ('70420000-0000-4000-8000-000000000603', '70420000-0000-4000-8000-0000000000f1', '70420000-0000-4000-8000-000000000001', '70420000-0000-4000-8000-000000000203', 'cfa', CURRENT_DATE, 'approved', now(), '70420000-0000-4000-8000-0000000000a1', '70420000-0000-4000-8000-0000000000a2');

DO $$
DECLARE
  v_first  jsonb;
  v_second jsonb;
  v_rows   text;
BEGIN
  v_first := public.sweep_procurement_clocks();
  ASSERT NOT (v_first ? 'error') AND NOT (v_first ? 'skipped') AND v_first ? 'cfa_reserve_expiring'
     AND v_first ? 'memo_return_due', 'FAIL E3: the sweep ran with the new scans, got ' || v_first::text;

  -- memo_return_due: the memo (creator M + lead O) and the loaner (creator M only); not the chip.
  SELECT string_agg(n.subject_sample_id::text || ':' || n.user_id::text, ',' ORDER BY n.subject_sample_id::text, n.user_id::text)
    INTO v_rows
    FROM public.procurement_notifications AS n
   WHERE n.kind = 'memo_return_due'
     AND n.subject_sample_id IN (current_setting('sq420.memo')::uuid, current_setting('sq420.loaner')::uuid,
                                 current_setting('sq420.chip')::uuid);
  ASSERT v_rows = (
    SELECT string_agg(s || ':' || u, ',' ORDER BY s, u) FROM (VALUES
      (current_setting('sq420.memo'), '70420000-0000-4000-8000-0000000000a1'),
      (current_setting('sq420.memo'), '70420000-0000-4000-8000-0000000000a2'),
      (current_setting('sq420.loaner'), '70420000-0000-4000-8000-0000000000a2')) AS t(s, u)),
    'FAIL E3: memo_return_due notices, got ' || COALESCE(v_rows, 'none');
  ASSERT (SELECT bool_and(organization_id = '70420000-0000-4000-8000-0000000000f1') FROM public.procurement_notifications
           WHERE kind = 'memo_return_due' AND subject_sample_id = current_setting('sq420.memo')::uuid),
    'FAIL E3: notices carry the studio';

  -- cfa_reserve_expiring: 601 (tomorrow, pending) only; 602 is far off, 603 decided.
  SELECT string_agg(n.subject_submittal_id::text || ':' || n.user_id::text || ':' || COALESCE(n.subject_purchase_order_id::text, '-'),
                    ',' ORDER BY n.subject_submittal_id::text, n.user_id::text)
    INTO v_rows
    FROM public.procurement_notifications AS n
   WHERE n.kind = 'cfa_reserve_expiring'
     AND n.subject_submittal_id IN ('70420000-0000-4000-8000-000000000601', '70420000-0000-4000-8000-000000000602',
                                    '70420000-0000-4000-8000-000000000603');
  ASSERT v_rows = '70420000-0000-4000-8000-000000000601:70420000-0000-4000-8000-0000000000a1:70420000-0000-4000-8000-000000000104,'
               || '70420000-0000-4000-8000-000000000601:70420000-0000-4000-8000-0000000000a2:70420000-0000-4000-8000-000000000104',
    'FAIL E3: cfa_reserve_expiring notices, got ' || COALESCE(v_rows, 'none');

  -- E4: idempotent.
  v_second := public.sweep_procurement_clocks();
  ASSERT v_second = jsonb_build_object('claim_window_closing', 0, 'ack_discrepancy', 0, 'backorder_reported', 0,
                                       'quote_expiring', 0, 'cfa_reserve_expiring', 0, 'memo_return_due', 0),
    'FAIL E4: a second run writes nothing, got ' || v_second::text;
  RAISE NOTICE 'case E3-E4 passed: memo_return_due and cfa_reserve_expiring fire once per subject and recipient';
END;
$$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_s   public.sample_requests%ROWTYPE;
  v_err text;
BEGIN
  -- E5: returning the memo clears the need, for both recipients.
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  v_s := public.mark_sample_returned(current_setting('sq420.memo')::uuid, NULL, 'UPS 1Z999');
  ASSERT v_s.status = 'returned' AND v_s.returned_on = CURRENT_DATE AND v_s.return_tracking = 'UPS 1Z999',
    'FAIL E5: the memo is returned';
  v_s := public.mark_sample_returned(current_setting('sq420.memo')::uuid, CURRENT_DATE - 3);
  ASSERT v_s.returned_on = CURRENT_DATE AND v_s.return_tracking = 'UPS 1Z999', 'FAIL E5: a second return is a no-op';
  v_err := pg_temp.raised(format($q$SELECT public.record_sample_request('{"id": "%s", "description": "x"}')$q$, v_s.id));
  ASSERT v_err LIKE '23514 %returned%', 'FAIL E5: a returned sample takes no patch, got ' || COALESCE(v_err, 'no error');
END;
$$;

RESET ROLE;
DO $$
DECLARE
  v_third jsonb;
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.procurement_notifications
                      WHERE kind = 'memo_return_due' AND subject_sample_id = current_setting('sq420.memo')::uuid
                        AND read_at IS NULL),
    'FAIL E5: the return clears the memo''s need for every recipient';
  ASSERT EXISTS (SELECT 1 FROM public.procurement_notifications
                  WHERE kind = 'memo_return_due' AND subject_sample_id = current_setting('sq420.loaner')::uuid
                    AND read_at IS NULL),
    'FAIL E5: another sample''s need stays';
  v_third := public.sweep_procurement_clocks();
  ASSERT (v_third->>'memo_return_due')::int = 0, 'FAIL E5: a returned sample raises no new need';

  -- E6: the FKs are wired.
  ASSERT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procurement_notifications_subject_sample_id_fkey'
                   AND confrelid = 'public.sample_requests'::regclass)
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procurement_notifications_subject_submittal_id_fkey'
                   AND confrelid = 'public.po_submittals'::regclass)
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'procurement_drafts_sample_id_fkey'
                   AND confrelid = 'public.sample_requests'::regclass),
    'FAIL E6: subject_sample_id, subject_submittal_id and procurement_drafts.sample_id are FKs';
  RAISE NOTICE 'case E5-E6 passed: the return clears the need; FKs wired';
END;
$$;
SET LOCAL ROLE authenticated;

-- ─── case F: RLS across studios, and grants ─────────────────────────────────

DO $$
DECLARE
  v_n int;
BEGIN
  PERFORM pg_temp.act('70420000-0000-4000-8000-0000000000a2');
  ASSERT (SELECT count(*) FROM public.install_manifest_items WHERE project_id = '70420000-0000-4000-8000-000000000001') = 1
     AND (SELECT count(*) FROM public.install_punch_items WHERE project_id = '70420000-0000-4000-8000-000000000001') = 1
     AND (SELECT count(*) FROM public.po_spec_snapshots WHERE purchase_order_id = '70420000-0000-4000-8000-000000000104') = 4
     AND (SELECT count(*) FROM public.sample_requests WHERE organization_id = '70420000-0000-4000-8000-0000000000f1') = 3,
    'FAIL F1: the member sees the studio''s rows';

  FOREACH v_n IN ARRAY ARRAY[3, 5, 4] LOOP
    PERFORM pg_temp.act(('70420000-0000-4000-8000-0000000000a' || v_n)::uuid);
    ASSERT (SELECT count(*) FROM public.install_manifest_items WHERE project_id = '70420000-0000-4000-8000-000000000001') = 0
       AND (SELECT count(*) FROM public.install_punch_items WHERE project_id = '70420000-0000-4000-8000-000000000001') = 0
       AND (SELECT count(*) FROM public.po_spec_snapshots WHERE purchase_order_id = '70420000-0000-4000-8000-000000000104') = 0
       AND (SELECT count(*) FROM public.sample_requests WHERE organization_id = '70420000-0000-4000-8000-0000000000f1') = 0,
      'FAIL F1: user a' || v_n || ' sees none of Studio A''s rows';
  END LOOP;
  RAISE NOTICE 'case F1 passed: RLS across studios';
END;
$$;

RESET ROLE;
DO $$
DECLARE
  v_fn  text;
  v_tbl text;
BEGIN
  FOREACH v_tbl IN ARRAY ARRAY['install_manifest_items', 'install_punch_items', 'po_spec_snapshots', 'sample_requests'] LOOP
    ASSERT has_table_privilege('authenticated', 'public.' || v_tbl, 'SELECT')
       AND NOT has_table_privilege('authenticated', 'public.' || v_tbl, 'INSERT')
       AND NOT has_table_privilege('authenticated', 'public.' || v_tbl, 'UPDATE')
       AND NOT has_table_privilege('authenticated', 'public.' || v_tbl, 'DELETE')
       AND NOT has_table_privilege('anon', 'public.' || v_tbl, 'SELECT'),
      'FAIL F2: ' || v_tbl || ' is SELECT-only to authenticated and closed to anon';
    ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || v_tbl)::regclass),
      'FAIL F2: ' || v_tbl || ' has RLS on';
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
      'add_invoice_billing_lines(uuid,jsonb)', 'get_ffe_invoice_stage_coverage(uuid)',
      'set_studio_release_gate(uuid,integer,boolean)', 'purchase_order_release_required(uuid)',
      'po_is_sendable(uuid)', 'hold_purchase_order_for_release(uuid,text)', 'release_purchase_order(uuid)',
      'send_back_purchase_order(uuid,text)', 'upsert_install_manifest_item(uuid,jsonb)',
      'upsert_install_punch_item(jsonb)', 'resolve_install_punch_item(uuid,text)',
      'snapshot_purchase_order_spec(uuid)', 'record_sample_request(jsonb)',
      'mark_sample_returned(uuid,date,text)'] LOOP
    ASSERT has_function_privilege('authenticated', 'public.' || v_fn, 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.' || v_fn, 'EXECUTE'),
      'FAIL F3: ' || v_fn || ' is open to authenticated and closed to anon';
  END LOOP;

  FOREACH v_fn IN ARRAY ARRAY[
      '_release_gate_applies(uuid,integer)',
      '_po_release_cleared(text,timestamp with time zone,uuid,integer,timestamp with time zone,integer)',
      'guard_purchase_order_release()', 'guard_invoice_line_ffe_stage()',
      'release_billing_stamps_on_invoice_void()', 'sweep_procurement_clocks()'] LOOP
    ASSERT NOT has_function_privilege('authenticated', 'public.' || v_fn, 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.' || v_fn, 'EXECUTE'),
      'FAIL F3: ' || v_fn || ' is closed to clients';
  END LOOP;
  ASSERT has_function_privilege('service_role', 'public.po_is_sendable(uuid)', 'EXECUTE')
     AND has_function_privilege('service_role', 'public.snapshot_purchase_order_spec(uuid)', 'EXECUTE'),
    'FAIL F3: po-send (service_role) can call po_is_sendable and snapshot_purchase_order_spec';
  RAISE NOTICE 'case F2-F3 passed: tables SELECT-only, RLS on; functions closed to anon';
END;
$$;

ROLLBACK;
