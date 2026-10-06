-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 1 — PO tracking, notice addressees, the claim clock and
-- procurement-clocks-daily (migrations 00698, 00699, 00700; SQ-403)
--
-- Cases:
--   1. set_purchase_order_tracking: a studio member sets carrier, tracking,
--      BOL path and ship date (trimmed); patch semantics clear one field and
--      keep the rest; unknown keys, non-string values, bad and future dates
--      and a cancelled PO are refused; an outsider is refused 42501.
--   2. set_purchase_order_eta appends {eta, note, at, by} to eta_history on
--      each change of date, and nothing when the date is unchanged.
--   3. advance_purchase_order_status → shipped stamps shipped_on when empty
--      and keeps an entered ship date.
--   4. Addressee: the 00151 trigger writers (deposit due, damage claim
--      drafted) address the PO creator and the project lead, deduped, and the
--      fill trigger stamps organization_id.
--   5. procurement_claim_deadline: studio vendor account windows (7 / 10)
--      versus the R-PB9 defaults (3 / 5); NULL deadlines before delivery;
--      no row for an outsider.
--   6. record_project_ffe_inspection: per-line condition and noted_on_bol
--      through the receipt batch (shipped → delivered_date stamped); invalid
--      lines refused; replay reuses; a replay with other conditions refused;
--      an outsider refused.
--   7. sweep_procurement_clocks run twice: one claim_window_closing notice per
--      recipient (creator + lead deduped), only the day before the vendor
--      deadline, only with a drafted claim; job_runs records both runs.
--   8. Read policy: a studio co-member reads a colleague's notice; an
--      outsider reads none; receiving_inspection_lines likewise, and is not
--      writable by authenticated.
--   9. Grants on the new functions.
--
-- How to run (local stack):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase1_tracking_clocks_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- O owns the studio, the project (lead) and every PO; M is a studio member and
-- creates POs 101, 103, 107; X belongs to no studio.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('70030000-0000-4000-8000-0000000000a1', 'p1t-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('70030000-0000-4000-8000-0000000000a2', 'p1t-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- M
  ('70030000-0000-4000-8000-0000000000a4', 'p1t-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- X

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('70030000-0000-4000-8000-0000000000a1', 'p1t-owner@test.invalid',    'P1T Owner',    NOW(), NOW()),
  ('70030000-0000-4000-8000-0000000000a2', 'p1t-member@test.invalid',   'P1T Member',   NOW(), NOW()),
  ('70030000-0000-4000-8000-0000000000a4', 'p1t-outsider@test.invalid', 'P1T Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('70030000-0000-4000-8000-0000000000f1', 'design_studio', 'P1T Studio', 'p1t-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('70030000-0000-4000-8000-0000000000e1', '70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-0000000000f1', 'owner',  'active', NOW()),
  ('70030000-0000-4000-8000-0000000000e2', '70030000-0000-4000-8000-0000000000a2', '70030000-0000-4000-8000-0000000000f1', 'member', 'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('70030000-0000-4000-8000-000000000001', 'P1T Project', '70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-0000000000f1');

-- V1 has a studio vendor account (claims 7 days, concealed carrier 10);
-- V2 has none (R-PB9 defaults: 3 and 5).
INSERT INTO vendors (id, name)
VALUES
  ('70030000-0000-4000-8000-000000000011', 'P1T Vendor One'),
  ('70030000-0000-4000-8000-000000000012', 'P1T Vendor Two');

INSERT INTO studio_vendor_accounts (organization_id, vendor_id, claims_window_days, inspection_window_days)
VALUES ('70030000-0000-4000-8000-0000000000f1', '70030000-0000-4000-8000-000000000011', 7, '{"concealed_carrier": 10}');

-- POs:
--   101 po_track       V1 confirmed, created by M          (cases 1, 2, 3)
--   102 po_cxl         V1 cancelled                        (case 1)
--   103 po_v1_dlv      V1 delivered today-6, created by M  (cases 4, 5, 7, 8)
--   104 po_v2_dlv      V2 delivered today-2, created by O  (cases 5, 7, 8)
--   105 po_v2_early    V2 delivered today                  (case 7: not yet)
--   106 po_v2_notified V2 delivered today-2, claim already notified (case 7)
--   107 po_recv        V2 shipped, created by M, two lines (case 6)
--   108 po_open        V2 confirmed, undelivered           (cases 3, 5)
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by, delivered_date)
VALUES
  ('70030000-0000-4000-8000-000000000101', '70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-000000000001', '70030000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed', '70030000-0000-4000-8000-0000000000a2', NULL),
  ('70030000-0000-4000-8000-000000000102', '70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-000000000001', '70030000-0000-4000-8000-000000000011', 'net_30', 10000, 'cancelled', '70030000-0000-4000-8000-0000000000a1', NULL),
  ('70030000-0000-4000-8000-000000000103', '70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-000000000001', '70030000-0000-4000-8000-000000000011', 'net_30', 10000, 'delivered', '70030000-0000-4000-8000-0000000000a2', CURRENT_DATE - 6),
  ('70030000-0000-4000-8000-000000000104', '70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-000000000001', '70030000-0000-4000-8000-000000000012', 'net_30', 10000, 'delivered', '70030000-0000-4000-8000-0000000000a1', CURRENT_DATE - 2),
  ('70030000-0000-4000-8000-000000000105', '70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-000000000001', '70030000-0000-4000-8000-000000000012', 'net_30', 10000, 'delivered', '70030000-0000-4000-8000-0000000000a1', CURRENT_DATE),
  ('70030000-0000-4000-8000-000000000106', '70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-000000000001', '70030000-0000-4000-8000-000000000012', 'net_30', 10000, 'delivered', '70030000-0000-4000-8000-0000000000a1', CURRENT_DATE - 2),
  ('70030000-0000-4000-8000-000000000107', '70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-000000000001', '70030000-0000-4000-8000-000000000012', 'net_30', 10000, 'shipped',   '70030000-0000-4000-8000-0000000000a2', NULL),
  ('70030000-0000-4000-8000-000000000108', '70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-000000000001', '70030000-0000-4000-8000-000000000012', 'net_30', 10000, 'confirmed', '70030000-0000-4000-8000-0000000000a1', NULL);

INSERT INTO project_ffe_items (id, project_id, name, status, quantity, unit_price_cents, trade_price_cents, line_total_cents, purchase_order_id, vendor_id, design_disposition)
VALUES
  ('70030000-0000-4000-8000-000000000201', '70030000-0000-4000-8000-000000000001', 'P1T chairs', 'ordered', 2, 20000, 15000, 40000, '70030000-0000-4000-8000-000000000107', '70030000-0000-4000-8000-000000000012', 'selected'),
  ('70030000-0000-4000-8000-000000000202', '70030000-0000-4000-8000-000000000001', 'P1T table',  'ordered', 1, 60000, 45000, 60000, '70030000-0000-4000-8000-000000000107', '70030000-0000-4000-8000-000000000012', 'selected');

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

-- ─── case 1: set_purchase_order_tracking ────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "70030000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_po  public.purchase_orders%ROWTYPE;
  v_day date := (now() AT TIME ZONE 'UTC')::date;
  v_err text;
BEGIN
  v_po := public.set_purchase_order_tracking('70030000-0000-4000-8000-000000000101', jsonb_build_object(
    'carrier', '  UPS Freight ', 'trackingNumber', '1Z999AA10123456784',
    'bolDocumentPath', 'po/101/bol.pdf', 'shippedOn', (v_day - 1)::text));
  ASSERT v_po.carrier = 'UPS Freight', 'FAIL 1a: carrier should be trimmed, got ' || COALESCE(v_po.carrier, 'NULL');
  ASSERT v_po.tracking_number = '1Z999AA10123456784', 'FAIL 1a: tracking number not set';
  ASSERT v_po.bol_document_path = 'po/101/bol.pdf', 'FAIL 1a: BOL path not set';
  ASSERT v_po.shipped_on = v_day - 1, 'FAIL 1a: shipped_on should be yesterday, got ' || COALESCE(v_po.shipped_on::text, 'NULL');
  ASSERT v_po.status = 'confirmed', 'FAIL 1a: tracking must not move status, got ' || v_po.status;

  -- Patch: null clears carrier; absent keys stay.
  v_po := public.set_purchase_order_tracking('70030000-0000-4000-8000-000000000101', '{"carrier": null}');
  ASSERT v_po.carrier IS NULL, 'FAIL 1b: null should clear carrier';
  ASSERT v_po.tracking_number = '1Z999AA10123456784' AND v_po.shipped_on = v_day - 1,
    'FAIL 1b: absent keys must stay unchanged';

  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_tracking('70030000-0000-4000-8000-000000000101', '{"eta": "2026-12-01"}')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL 1c: unknown key should raise 23514, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_tracking('70030000-0000-4000-8000-000000000101', '{"carrier": 5}')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL 1d: non-string value should raise 23514, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_tracking('70030000-0000-4000-8000-000000000101', '{"shippedOn": "not-a-date"}')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL 1e: bad date should raise 23514, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format(
    $q$SELECT public.set_purchase_order_tracking('70030000-0000-4000-8000-000000000101', '{"shippedOn": "%s"}')$q$, v_day + 5));
  ASSERT v_err LIKE '23514 %', 'FAIL 1f: future ship date should raise 23514, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_tracking('70030000-0000-4000-8000-000000000102', '{"carrier": "UPS"}')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL 1g: cancelled PO should raise 23514, got ' || COALESCE(v_err, 'no error');

  RAISE NOTICE 'Case 1a-1g passed: member sets tracking with patch semantics; bad requests refused.';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "70030000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$SELECT public.set_purchase_order_tracking('70030000-0000-4000-8000-000000000101', '{"carrier": "Hijack"}')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL 1h: outsider should be refused 42501, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case 1h passed: outsider refused (%).', v_err;
END $$;

RESET ROLE;

DO $$
DECLARE v_carrier text;
BEGIN
  SELECT carrier INTO v_carrier FROM public.purchase_orders WHERE id = '70030000-0000-4000-8000-000000000101';
  ASSERT v_carrier IS NULL, 'FAIL 1h: outsider write must not land, carrier = ' || COALESCE(v_carrier, 'NULL');
END $$;

-- ─── case 2: ETA history ────────────────────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "70030000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_po  public.purchase_orders%ROWTYPE;
  v_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  ASSERT (SELECT eta_history FROM public.purchase_orders WHERE id = '70030000-0000-4000-8000-000000000101') = '[]'::jsonb,
    'FAIL 2a: eta_history should default to []';

  v_po := public.set_purchase_order_eta('70030000-0000-4000-8000-000000000101', v_day + 20, 'vendor quoted six weeks');
  ASSERT jsonb_array_length(v_po.eta_history) = 1, 'FAIL 2b: first ETA should append one entry, got ' || v_po.eta_history::text;
  ASSERT v_po.eta_history->0->>'eta' = (v_day + 20)::text, 'FAIL 2b: entry eta wrong: ' || v_po.eta_history::text;
  ASSERT v_po.eta_history->0->>'note' = 'vendor quoted six weeks', 'FAIL 2b: entry note wrong';
  ASSERT v_po.eta_history->0->>'by' = '70030000-0000-4000-8000-0000000000a2', 'FAIL 2b: entry by should be the caller';
  ASSERT v_po.eta_history->0 ? 'at', 'FAIL 2b: entry should carry at';

  v_po := public.set_purchase_order_eta('70030000-0000-4000-8000-000000000101', v_day + 20, 'same date again');
  ASSERT jsonb_array_length(v_po.eta_history) = 1, 'FAIL 2c: unchanged date must not append, got ' || v_po.eta_history::text;

  v_po := public.set_purchase_order_eta('70030000-0000-4000-8000-000000000101', v_day + 30, NULL);
  ASSERT jsonb_array_length(v_po.eta_history) = 2, 'FAIL 2d: changed date should append, got ' || v_po.eta_history::text;
  ASSERT v_po.eta_history->1->>'eta' = (v_day + 30)::text AND v_po.eta_history->1->'note' = 'null'::jsonb,
    'FAIL 2d: second entry wrong: ' || v_po.eta_history::text;
  ASSERT v_po.confirmed_eta = v_day + 30, 'FAIL 2d: confirmed_eta should follow';

  RAISE NOTICE 'Case 2 passed: eta_history appends one entry per change of date.';
END $$;

-- ─── case 3: shipped_on on advance ──────────────────────────────────────────

DO $$
DECLARE
  v_po  public.purchase_orders%ROWTYPE;
  v_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  -- 101 carries an entered ship date (case 1): kept.
  v_po := public.advance_purchase_order_status('70030000-0000-4000-8000-000000000101', 'shipped');
  ASSERT v_po.status = 'shipped', 'FAIL 3a: 101 should be shipped';
  ASSERT v_po.shipped_on = v_day - 1, 'FAIL 3a: entered ship date must be kept, got ' || COALESCE(v_po.shipped_on::text, 'NULL');

  -- 108 has none: in_production leaves it empty, shipped stamps the day.
  v_po := public.advance_purchase_order_status('70030000-0000-4000-8000-000000000108', 'in_production');
  ASSERT v_po.shipped_on IS NULL, 'FAIL 3b: in_production must not stamp shipped_on';
  v_po := public.advance_purchase_order_status('70030000-0000-4000-8000-000000000108', 'shipped');
  ASSERT v_po.shipped_on = v_day, 'FAIL 3c: shipping should stamp today, got ' || COALESCE(v_po.shipped_on::text, 'NULL');

  RAISE NOTICE 'Case 3 passed: shipped stamps shipped_on only when empty.';
END $$;

RESET ROLE;

-- ─── case 4: addressee of the trigger writers ───────────────────────────────

INSERT INTO po_payments (id, purchase_order_id, kind, amount_cents, state)
VALUES ('70030000-0000-4000-8000-000000000301', '70030000-0000-4000-8000-000000000103', 'deposit', 5000, 'pending');
UPDATE po_payments SET state = 'due' WHERE id = '70030000-0000-4000-8000-000000000301';

INSERT INTO receiving_inspections (id, purchase_order_id, inspected_by, outcome)
VALUES
  ('70030000-0000-4000-8000-000000000401', '70030000-0000-4000-8000-000000000103', '70030000-0000-4000-8000-0000000000a1', 'damaged'),
  ('70030000-0000-4000-8000-000000000402', '70030000-0000-4000-8000-000000000104', '70030000-0000-4000-8000-0000000000a1', 'damaged'),
  ('70030000-0000-4000-8000-000000000403', '70030000-0000-4000-8000-000000000105', '70030000-0000-4000-8000-0000000000a1', 'damaged'),
  ('70030000-0000-4000-8000-000000000404', '70030000-0000-4000-8000-000000000106', '70030000-0000-4000-8000-0000000000a1', 'damaged');

INSERT INTO damage_claims (id, receiving_inspection_id, state, description)
VALUES
  ('70030000-0000-4000-8000-000000000501', '70030000-0000-4000-8000-000000000401', 'drafted',         'P1T crushed corner'),
  ('70030000-0000-4000-8000-000000000502', '70030000-0000-4000-8000-000000000402', 'drafted',         'P1T torn fabric'),
  ('70030000-0000-4000-8000-000000000503', '70030000-0000-4000-8000-000000000403', 'drafted',         'P1T scratched top'),
  ('70030000-0000-4000-8000-000000000504', '70030000-0000-4000-8000-000000000404', 'vendor_notified', 'P1T already sent');

DO $$
DECLARE v_users uuid[];
BEGIN
  SELECT array_agg(user_id ORDER BY user_id) INTO v_users FROM public.procurement_notifications
   WHERE subject_purchase_order_id = '70030000-0000-4000-8000-000000000103' AND kind = 'deposit_due';
  ASSERT v_users = ARRAY['70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-0000000000a2']::uuid[],
    'FAIL 4a: deposit_due should reach the lead (O) and the creator (M), got ' || COALESCE(v_users::text, 'none');

  SELECT array_agg(user_id ORDER BY user_id) INTO v_users FROM public.procurement_notifications
   WHERE subject_purchase_order_id = '70030000-0000-4000-8000-000000000103' AND kind = 'damage_claim_drafted';
  ASSERT v_users = ARRAY['70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-0000000000a2']::uuid[],
    'FAIL 4b: damage_claim_drafted should reach O and M, got ' || COALESCE(v_users::text, 'none');

  SELECT array_agg(user_id ORDER BY user_id) INTO v_users FROM public.procurement_notifications
   WHERE subject_purchase_order_id = '70030000-0000-4000-8000-000000000104' AND kind = 'damage_claim_drafted';
  ASSERT v_users = ARRAY['70030000-0000-4000-8000-0000000000a1']::uuid[],
    'FAIL 4c: creator = lead must be deduped to one notice, got ' || COALESCE(v_users::text, 'none');

  ASSERT NOT EXISTS (SELECT 1 FROM public.procurement_notifications
                      WHERE subject_purchase_order_id = '70030000-0000-4000-8000-000000000106'
                        AND kind = 'damage_claim_drafted'),
    'FAIL 4d: a claim inserted as vendor_notified must not notify';

  ASSERT NOT EXISTS (SELECT 1 FROM public.procurement_notifications
                      WHERE subject_purchase_order_id::text LIKE '70030000-%'
                        AND organization_id IS DISTINCT FROM '70030000-0000-4000-8000-0000000000f1'),
    'FAIL 4e: every notice should carry the PO studio as organization_id';

  RAISE NOTICE 'Case 4a-4e passed: trigger writers address creator + lead (deduped) and stamp organization_id.';
END $$;

-- 4f: stripe-webhook's insert (service_role, no organization_id) is filled too.
SET LOCAL ROLE service_role;
INSERT INTO public.procurement_notifications (id, user_id, kind, subject_purchase_order_id)
VALUES ('70030000-0000-4000-8000-000000000601', '70030000-0000-4000-8000-0000000000a1', 'payment_received', '70030000-0000-4000-8000-000000000104');
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT organization_id FROM public.procurement_notifications
           WHERE id = '70030000-0000-4000-8000-000000000601') = '70030000-0000-4000-8000-0000000000f1',
    'FAIL 4f: a service_role insert should get organization_id from the PO';
  DELETE FROM public.procurement_notifications WHERE id = '70030000-0000-4000-8000-000000000601';
  RAISE NOTICE 'Case 4f passed: service_role insert filled with the PO studio.';
END $$;

-- ─── case 5: procurement_claim_deadline ─────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "70030000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.procurement_claim_deadline('70030000-0000-4000-8000-000000000103');
  ASSERT r.delivered_on = CURRENT_DATE - 6
     AND r.claims_window_days = 7 AND r.vendor_deadline = CURRENT_DATE + 1
     AND r.concealed_carrier_days = 10 AND r.carrier_deadline = CURRENT_DATE + 4,
    'FAIL 5a: account windows 7/10 expected, got ' || row_to_json(r)::text;

  SELECT * INTO r FROM public.procurement_claim_deadline('70030000-0000-4000-8000-000000000104');
  ASSERT r.delivered_on = CURRENT_DATE - 2
     AND r.claims_window_days = 3 AND r.vendor_deadline = CURRENT_DATE + 1
     AND r.concealed_carrier_days = 5 AND r.carrier_deadline = CURRENT_DATE + 3,
    'FAIL 5b: R-PB9 defaults 3/5 expected, got ' || row_to_json(r)::text;

  SELECT * INTO r FROM public.procurement_claim_deadline('70030000-0000-4000-8000-000000000108');
  ASSERT r.delivered_on IS NULL AND r.vendor_deadline IS NULL AND r.carrier_deadline IS NULL
     AND r.claims_window_days = 3,
    'FAIL 5c: undelivered PO should have no deadlines, got ' || row_to_json(r)::text;

  RAISE NOTICE 'Case 5a-5c passed: claim deadlines from the account, the defaults, and none before delivery.';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "70030000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.procurement_claim_deadline('70030000-0000-4000-8000-000000000103')),
    'FAIL 5d: outsider should get no claim clock';
  RAISE NOTICE 'Case 5d passed: outsider sees no claim clock.';
END $$;

-- ─── case 6: record_project_ffe_inspection ──────────────────────────────────

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$SELECT public.record_project_ffe_inspection('70030000-0000-4000-8000-000000000107',
    '[{"selectionId": "70030000-0000-4000-8000-000000000201", "receivedQuantity": 2, "condition": "good"},
      {"selectionId": "70030000-0000-4000-8000-000000000202", "receivedQuantity": 1, "condition": "good"}]', 'clean')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL 6a: outsider check-in should raise 42501, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case 6a passed: outsider check-in refused (%).', v_err;
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "70030000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_err    text;
  v_result jsonb;
  v_replay jsonb;
BEGIN
  v_err := pg_temp.raised($q$SELECT public.record_project_ffe_inspection('70030000-0000-4000-8000-000000000107',
    '[{"selectionId": "70030000-0000-4000-8000-000000000201", "receivedQuantity": 2},
      {"selectionId": "70030000-0000-4000-8000-000000000202", "receivedQuantity": 1, "condition": "good"}]', 'damaged')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL 6b: missing condition should raise 23514, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$SELECT public.record_project_ffe_inspection('70030000-0000-4000-8000-000000000107',
    '[{"selectionId": "70030000-0000-4000-8000-000000000201", "receivedQuantity": 2, "condition": "broken"},
      {"selectionId": "70030000-0000-4000-8000-000000000202", "receivedQuantity": 1, "condition": "good"}]', 'damaged')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL 6c: unknown condition should raise 23514, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$SELECT public.record_project_ffe_inspection('70030000-0000-4000-8000-000000000107',
    '[{"selectionId": "70030000-0000-4000-8000-000000000201", "receivedQuantity": 2, "condition": "good", "notedOnBol": "yes"},
      {"selectionId": "70030000-0000-4000-8000-000000000202", "receivedQuantity": 1, "condition": "good"}]', 'damaged')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL 6d: non-boolean notedOnBol should raise 23514, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$SELECT public.record_project_ffe_inspection('70030000-0000-4000-8000-000000000107',
    '[{"selectionId": "70030000-0000-4000-8000-000000000201", "receivedQuantity": 2, "condition": "good", "note": "x"},
      {"selectionId": "70030000-0000-4000-8000-000000000202", "receivedQuantity": 1, "condition": "good"}]', 'damaged')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL 6e: unknown line key should raise 23514, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$SELECT public.record_project_ffe_inspection('70030000-0000-4000-8000-000000000107',
    '[{"selectionId": "70030000-0000-4000-8000-000000000201", "receivedQuantity": 2, "condition": "damaged"},
      {"selectionId": "70030000-0000-4000-8000-000000000202", "receivedQuantity": 1, "condition": "good"}]', 'clean')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL 6f: clean with a damaged line should raise 23514, got ' || COALESCE(v_err, 'no error');

  v_result := public.record_project_ffe_inspection('70030000-0000-4000-8000-000000000107',
    '[{"selectionId": "70030000-0000-4000-8000-000000000201", "receivedQuantity": 2, "condition": "damaged", "notedOnBol": true},
      {"selectionId": "70030000-0000-4000-8000-000000000202", "receivedQuantity": 1, "condition": "good"}]', 'damaged', 'leg split');
  ASSERT v_result->>'inspectionId' IS NOT NULL AND (v_result->>'reused')::boolean IS NOT TRUE,
    'FAIL 6g: first check-in should create an inspection, got ' || v_result::text;
  ASSERT jsonb_array_length(v_result->'lines') = 2
     AND v_result->'lines'->0->>'selectionId' = '70030000-0000-4000-8000-000000000201'
     AND v_result->'lines'->0->>'condition' = 'damaged'
     AND (v_result->'lines'->0->>'notedOnBol')::boolean
     AND v_result->'lines'->1->>'condition' = 'good'
     AND NOT (v_result->'lines'->1->>'notedOnBol')::boolean
     AND (v_result->'lines'->0->>'receivedQuantity')::int = 2,
    'FAIL 6g: result lines should carry condition and notedOnBol, got ' || (v_result->'lines')::text;

  v_replay := public.record_project_ffe_inspection('70030000-0000-4000-8000-000000000107',
    '[{"selectionId": "70030000-0000-4000-8000-000000000202", "receivedQuantity": 1, "condition": "good", "notedOnBol": false},
      {"selectionId": "70030000-0000-4000-8000-000000000201", "receivedQuantity": 2, "condition": "damaged", "notedOnBol": true}]', 'damaged', 'leg split');
  ASSERT (v_replay->>'reused')::boolean AND v_replay->>'inspectionId' = v_result->>'inspectionId',
    'FAIL 6h: identical replay should reuse the inspection, got ' || v_replay::text;

  v_err := pg_temp.raised($q$SELECT public.record_project_ffe_inspection('70030000-0000-4000-8000-000000000107',
    '[{"selectionId": "70030000-0000-4000-8000-000000000201", "receivedQuantity": 2, "condition": "damaged", "notedOnBol": true},
      {"selectionId": "70030000-0000-4000-8000-000000000202", "receivedQuantity": 1, "condition": "short"}]', 'damaged', 'leg split')$q$);
  ASSERT v_err LIKE '23514 %', 'FAIL 6i: replay with other conditions should raise 23514, got ' || COALESCE(v_err, 'no error');

  RAISE NOTICE 'Case 6b-6i passed: per-line condition / BOL recorded through the receipt batch.';
END $$;

RESET ROLE;

DO $$
DECLARE
  v_rows   int;
  v_bol    boolean;
  v_po     public.purchase_orders%ROWTYPE;
BEGIN
  SELECT count(*) INTO v_rows FROM public.receiving_inspection_lines l
    JOIN public.receiving_inspections ri ON ri.id = l.inspection_id
   WHERE ri.purchase_order_id = '70030000-0000-4000-8000-000000000107';
  ASSERT v_rows = 2, 'FAIL 6j: two inspection lines expected after replay, got ' || v_rows;
  SELECT noted_on_bol INTO v_bol FROM public.receiving_inspection_lines
   WHERE ffe_item_id = '70030000-0000-4000-8000-000000000201';
  ASSERT v_bol, 'FAIL 6j: chairs line should be noted on the BOL';
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = '70030000-0000-4000-8000-000000000107';
  ASSERT v_po.delivered_date IS NOT NULL AND v_po.status = 'shipped',
    'FAIL 6k: a damaged check-in stamps delivered_date and leaves the PO shipped, got '
    || v_po.status || ' / ' || COALESCE(v_po.delivered_date::text, 'NULL');
  RAISE NOTICE 'Case 6j-6k passed: lines stored once; shipped → delivered_date stamped.';
END $$;

-- ─── case 7: sweep_procurement_clocks, run twice ────────────────────────────

DO $$
DECLARE
  v_first  jsonb;
  v_second jsonb;
  v_users  uuid[];
  v_runs   int;
BEGIN
  v_first := public.sweep_procurement_clocks();
  v_second := public.sweep_procurement_clocks();

  ASSERT (v_first->>'claim_window_closing')::int >= 3,
    'FAIL 7a: first run should write at least the three fixture notices, got ' || v_first::text;
  ASSERT (v_second->>'claim_window_closing')::int = 0,
    'FAIL 7b: second run must write nothing (dedupe), got ' || v_second::text;

  SELECT array_agg(user_id ORDER BY user_id) INTO v_users FROM public.procurement_notifications
   WHERE subject_purchase_order_id = '70030000-0000-4000-8000-000000000103' AND kind = 'claim_window_closing';
  ASSERT v_users = ARRAY['70030000-0000-4000-8000-0000000000a1', '70030000-0000-4000-8000-0000000000a2']::uuid[],
    'FAIL 7c: account window (deadline tomorrow) should notify O and M once each, got ' || COALESCE(v_users::text, 'none');

  SELECT array_agg(user_id ORDER BY user_id) INTO v_users FROM public.procurement_notifications
   WHERE subject_purchase_order_id = '70030000-0000-4000-8000-000000000104' AND kind = 'claim_window_closing';
  ASSERT v_users = ARRAY['70030000-0000-4000-8000-0000000000a1']::uuid[],
    'FAIL 7d: default window (deadline tomorrow), creator = lead, should notify O once, got ' || COALESCE(v_users::text, 'none');

  ASSERT NOT EXISTS (SELECT 1 FROM public.procurement_notifications
                      WHERE subject_purchase_order_id IN ('70030000-0000-4000-8000-000000000105',
                                                          '70030000-0000-4000-8000-000000000106',
                                                          '70030000-0000-4000-8000-000000000107')
                        AND kind = 'claim_window_closing'),
    'FAIL 7e: deadline not yet near (105), claim already notified (106), no claim (107) → no notice';

  SELECT count(*) INTO v_runs FROM public.job_runs
   WHERE job_name = 'procurement-clocks-daily' AND status = 'succeeded'
     AND started_at >= now() AND detail ? 'claim_window_closing';
  ASSERT v_runs = 2, 'FAIL 7f: both runs should be recorded as succeeded in job_runs, got ' || v_runs;

  RAISE NOTICE 'Case 7 passed: procurement-clocks-daily is idempotent (% then %).', v_first, v_second;
END $$;

-- ─── case 8: read policy ────────────────────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "70030000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.procurement_notifications
   WHERE subject_purchase_order_id = '70030000-0000-4000-8000-000000000104'
     AND user_id = '70030000-0000-4000-8000-0000000000a1';
  ASSERT v_count = 2, 'FAIL 8a: co-member M should read O''s two notices on 104, got ' || v_count;

  SELECT count(*) INTO v_count FROM public.receiving_inspection_lines;
  ASSERT v_count >= 2, 'FAIL 8b: co-member should read the PO''s inspection lines, got ' || v_count;

  ASSERT pg_temp.raised($q$INSERT INTO public.receiving_inspection_lines (inspection_id, ffe_item_id, received_quantity, condition)
    SELECT inspection_id, ffe_item_id, 0, 'good' FROM public.receiving_inspection_lines LIMIT 1$q$) LIKE '42501 %',
    'FAIL 8c: authenticated must not write receiving_inspection_lines';

  RAISE NOTICE 'Case 8a-8c passed: co-member reads colleague notices and inspection lines; no direct writes.';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "70030000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.procurement_notifications
   WHERE subject_purchase_order_id::text LIKE '70030000-%';
  ASSERT v_count = 0, 'FAIL 8d: outsider must read no studio notices, got ' || v_count;

  SELECT count(*) INTO v_count FROM public.receiving_inspection_lines l
   WHERE l.ffe_item_id::text LIKE '70030000-%';
  ASSERT v_count = 0, 'FAIL 8e: outsider must read no inspection lines, got ' || v_count;

  RAISE NOTICE 'Case 8d-8e passed: outsider reads nothing.';
END $$;

RESET ROLE;

-- ─── case 9: grants ─────────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT has_function_privilege('authenticated', 'public.set_purchase_order_tracking(uuid, jsonb)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.set_purchase_order_tracking(uuid, jsonb)', 'EXECUTE'),
    'FAIL 9a: set_purchase_order_tracking grants';
  ASSERT has_function_privilege('authenticated', 'public.procurement_claim_deadline(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.procurement_claim_deadline(uuid)', 'EXECUTE'),
    'FAIL 9b: procurement_claim_deadline grants';
  ASSERT has_function_privilege('authenticated', 'public.record_project_ffe_inspection(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[])', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.record_project_ffe_inspection(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[])', 'EXECUTE'),
    'FAIL 9c: record_project_ffe_inspection grants';
  ASSERT has_function_privilege('service_role', 'public.sweep_procurement_clocks()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.sweep_procurement_clocks()', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.sweep_procurement_clocks()', 'EXECUTE'),
    'FAIL 9d: sweep_procurement_clocks must be service_role only';
  ASSERT has_function_privilege('service_role', 'public.procurement_notice_recipients(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.procurement_notice_recipients(uuid)', 'EXECUTE'),
    'FAIL 9e: procurement_notice_recipients must be service_role only';
  ASSERT has_function_privilege('service_role', 'public.purchase_order_studio_id(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.purchase_order_studio_id(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.purchase_order_studio_id(uuid)', 'EXECUTE'),
    'FAIL 9e: purchase_order_studio_id must be service_role only';
  ASSERT has_table_privilege('authenticated', 'public.receiving_inspection_lines', 'SELECT')
     AND NOT has_table_privilege('authenticated', 'public.receiving_inspection_lines', 'INSERT')
     AND NOT has_table_privilege('anon', 'public.receiving_inspection_lines', 'SELECT'),
    'FAIL 9f: receiving_inspection_lines grants';
  ASSERT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'procurement-clocks-daily'
                  AND command LIKE '%public.sweep_procurement_clocks()%'),
    'FAIL 9g: procurement-clocks-daily should be scheduled';
  RAISE NOTICE 'Case 9 passed: grants and schedule.';
END $$;

DO $$ BEGIN RAISE NOTICE 'All phase 1 tracking / clocks assertions passed.'; END $$;

ROLLBACK;
