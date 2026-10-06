-- ═══════════════════════════════════════════════════════════════════════════
-- Studio buying Phase 1 payments tests (migration 00695; US-16 C-11; SQ-401)
--
-- A studio (owner O, non-guest member M, guest G) plus an outsider X. Cases:
--   A. The back door is closed: a direct INSERT/UPDATE/DELETE of po_payments
--      as authenticated (member AND owner) fails 42501; a direct INSERT into
--      vendor_payments fails 42501; the member still READS po_payments, the
--      outsider reads none.
--   B. service_role (the stripe-webhook client) still updates po_payments:
--      the webhook's paid patch lands on a Stripe-rail row.
--   C. upsert_studio_payment_method: member creates a card (studio inferred),
--      updates and archives it; a full card number in last4 or the label is
--      refused; guest and outsider refused.
--   D. record_vendor_payment: outsider and guest refused; catalog PO and a
--      Stripe-rail row refused; a partial deposit leaves the row unpaid; the
--      remainder (amount omitted) flips the deposit to paid and the 00184
--      trigger turns the shipped PO's balance due; an unscheduled payment is
--      allowed; missing amount / future date refused.
--   E. void_vendor_payment: outsider and a blank reason refused; a void
--      reverses the derived state; a second void refused; the ledger refuses
--      DELETE and any other UPDATE even from postgres.
--   F. update_po_payment_schedule: member edits an unpaid schedule; outsider
--      and catalog refused; refused once a payment is recorded.
--   G. Grants: anon cannot execute any new RPC; authenticated can.
--
-- How to run (after `supabase db reset`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase1_payments_test.sql
--
-- One transaction, rolled back at the end. Money calls run under SET LOCAL
-- ROLE authenticated with request.jwt.claims, the real grant path.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('69100000-0000-4000-8000-0000000000a1', 'p1pay-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('69100000-0000-4000-8000-0000000000a2', 'p1pay-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- M
  ('69100000-0000-4000-8000-0000000000a3', 'p1pay-guest@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- G
  ('69100000-0000-4000-8000-0000000000a4', 'p1pay-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- X

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('69100000-0000-4000-8000-0000000000a1', 'p1pay-owner@test.invalid',    'P1 Owner',    NOW(), NOW()),
  ('69100000-0000-4000-8000-0000000000a2', 'p1pay-member@test.invalid',   'P1 Member',   NOW(), NOW()),
  ('69100000-0000-4000-8000-0000000000a3', 'p1pay-guest@test.invalid',    'P1 Guest',    NOW(), NOW()),
  ('69100000-0000-4000-8000-0000000000a4', 'p1pay-outsider@test.invalid', 'P1 Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('69100000-0000-4000-8000-0000000000f1', 'design_studio', 'P1 Pay Studio', 'p1-pay-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('69100000-0000-4000-8000-0000000000e1', '69100000-0000-4000-8000-0000000000a1', '69100000-0000-4000-8000-0000000000f1', 'owner',  'active', NOW()),
  ('69100000-0000-4000-8000-0000000000e2', '69100000-0000-4000-8000-0000000000a2', '69100000-0000-4000-8000-0000000000f1', 'member', 'active', NOW()),
  ('69100000-0000-4000-8000-0000000000e3', '69100000-0000-4000-8000-0000000000a3', '69100000-0000-4000-8000-0000000000f1', 'guest',  'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('69100000-0000-4000-8000-000000000001', 'P1 Pay Project', '69100000-0000-4000-8000-0000000000a1', '69100000-0000-4000-8000-0000000000a1');

INSERT INTO vendors (id, name)
VALUES ('69100000-0000-4000-8000-000000000011', 'P1 Pay Vendor');

-- POs, all owned by O:
--   po_split  shipped fifty_fifty: deposit + balance pending (D, E)
--   po_cat    Patina catalog, full upfront (D3, F)
--   po_stripe studio lane, but its row carries a Stripe session (B, D4)
--   po_net    confirmed net_30, one balance row (D7, F3)
--   po_sched  draft thirty_seventy, nothing paid (F)
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, is_patina_catalog)
VALUES
  ('69100000-0000-4000-8000-000000000101', '69100000-0000-4000-8000-0000000000a1', '69100000-0000-4000-8000-000000000001', '69100000-0000-4000-8000-000000000011', 'fifty_fifty',     100000, 'shipped',   false),
  ('69100000-0000-4000-8000-000000000102', '69100000-0000-4000-8000-0000000000a1', '69100000-0000-4000-8000-000000000001', '69100000-0000-4000-8000-000000000011', 'full_upfront',     40000, 'confirmed', true),
  ('69100000-0000-4000-8000-000000000103', '69100000-0000-4000-8000-0000000000a1', '69100000-0000-4000-8000-000000000001', '69100000-0000-4000-8000-000000000011', 'full_upfront',     25000, 'confirmed', false),
  ('69100000-0000-4000-8000-000000000104', '69100000-0000-4000-8000-0000000000a1', '69100000-0000-4000-8000-000000000001', '69100000-0000-4000-8000-000000000011', 'net_30',           30000, 'confirmed', false),
  ('69100000-0000-4000-8000-000000000105', '69100000-0000-4000-8000-0000000000a1', '69100000-0000-4000-8000-000000000001', '69100000-0000-4000-8000-000000000011', 'thirty_seventy',   10000, 'draft',     false);

INSERT INTO po_payments (id, purchase_order_id, kind, amount_cents, state, due_date, sort_order, stripe_checkout_session_id)
VALUES
  ('69100000-0000-4000-8000-000000000301', '69100000-0000-4000-8000-000000000101', 'deposit', 50000, 'pending', NULL, 0, NULL),
  ('69100000-0000-4000-8000-000000000302', '69100000-0000-4000-8000-000000000101', 'balance', 50000, 'pending', NULL, 1, NULL),
  ('69100000-0000-4000-8000-000000000303', '69100000-0000-4000-8000-000000000102', 'deposit', 40000, 'due',     NULL, 0, NULL),
  ('69100000-0000-4000-8000-000000000304', '69100000-0000-4000-8000-000000000103', 'deposit', 25000, 'due',     NULL, 0, 'cs_test_p1pay'),
  ('69100000-0000-4000-8000-000000000305', '69100000-0000-4000-8000-000000000104', 'balance', 30000, 'pending', CURRENT_DATE + 30, 0, NULL),
  ('69100000-0000-4000-8000-000000000306', '69100000-0000-4000-8000-000000000105', 'deposit',  3000, 'pending', NULL, 0, NULL),
  ('69100000-0000-4000-8000-000000000307', '69100000-0000-4000-8000-000000000105', 'balance',  7000, 'pending', NULL, 1, NULL);

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

-- Shared scratch: ids minted during the run.
CREATE TEMP TABLE p1_ids (k text PRIMARY KEY, v uuid);
GRANT ALL ON p1_ids TO authenticated;

-- ─── A. the back door is closed ─────────────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "69100000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_n int;
BEGIN
  v_err := pg_temp.raised($q$
    UPDATE po_payments SET state = 'paid', paid_date = CURRENT_DATE
    WHERE id = '69100000-0000-4000-8000-000000000301'
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A1: member direct UPDATE of po_payments should fail 42501, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    INSERT INTO po_payments (purchase_order_id, kind, amount_cents)
    VALUES ('69100000-0000-4000-8000-000000000101', 'milestone', 100)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A2: member direct INSERT into po_payments should fail 42501, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    DELETE FROM po_payments WHERE id = '69100000-0000-4000-8000-000000000302'
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A3: member direct DELETE of po_payments should fail 42501, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    INSERT INTO vendor_payments (purchase_order_id, paid_on, amount_cents, method)
    VALUES ('69100000-0000-4000-8000-000000000101', CURRENT_DATE, 100, 'check')
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A4: member direct INSERT into vendor_payments should fail 42501, got ' || COALESCE(v_err, 'no error');

  SELECT count(*) INTO v_n FROM po_payments WHERE purchase_order_id = '69100000-0000-4000-8000-000000000101';
  ASSERT v_n = 2, 'FAIL A5: member should still read both po_split payment rows, got ' || v_n;
  RAISE NOTICE 'Case A1–A5 (member direct writes refused, read kept): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69100000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$
    UPDATE po_payments SET state = 'paid', paid_date = CURRENT_DATE
    WHERE id = '69100000-0000-4000-8000-000000000301'
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A6: owner direct UPDATE of po_payments should fail 42501, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case A6 (owner direct UPDATE refused): %', v_err;
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69100000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM po_payments WHERE purchase_order_id = '69100000-0000-4000-8000-000000000101';
  ASSERT v_n = 0, 'FAIL A7: outsider should read no po_payments rows, got ' || v_n;
  RAISE NOTICE 'Case A7 (outsider reads nothing): ok';
END $$;

RESET ROLE;

-- ─── B. service_role (the webhook client) still writes po_payments ──────────

SET LOCAL ROLE service_role;
DO $$
DECLARE v_n int;
BEGIN
  -- The stripe-webhook paid patch (index.ts markPoPaymentPaid shape).
  UPDATE po_payments
     SET state = 'paid', paid_date = CURRENT_DATE, stripe_payment_intent_id = 'pi_test_p1pay'
   WHERE id = '69100000-0000-4000-8000-000000000304';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 1, 'FAIL B1: service_role UPDATE of a Stripe po_payments row should land, rows=' || v_n;
  RAISE NOTICE 'Case B1 (service_role webhook patch): ok';
END $$;
RESET ROLE;

-- ─── C. upsert_studio_payment_method ────────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "69100000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_pm studio_payment_methods%ROWTYPE; v_err text;
BEGIN
  v_pm := upsert_studio_payment_method(jsonb_build_object(
    'label', 'Amex · Studio', 'kind', 'card', 'last4', '1234',
    'holderMemberId', '69100000-0000-4000-8000-0000000000e2'));
  ASSERT v_pm.organization_id = '69100000-0000-4000-8000-0000000000f1', 'FAIL C1: studio should be inferred';
  ASSERT v_pm.last4 = '1234' AND v_pm.archived_at IS NULL, 'FAIL C1: last4 / archived';
  INSERT INTO p1_ids VALUES ('pm', v_pm.id);

  v_pm := upsert_studio_payment_method(jsonb_build_object('id', v_pm.id, 'label', 'Amex · Leah'));
  ASSERT v_pm.label = 'Amex · Leah' AND v_pm.kind = 'card' AND v_pm.last4 = '1234', 'FAIL C2: partial update kept other fields';

  v_err := pg_temp.raised($q$
    SELECT upsert_studio_payment_method('{"label":"Visa","kind":"card","last4":"4242424242424242"}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %last4%', 'FAIL C3: a full number in last4 should be refused, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    SELECT upsert_studio_payment_method('{"label":"Visa 4242 4242 4242 4242","kind":"card"}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %', 'FAIL C4: a full number in the label should be refused, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    SELECT upsert_studio_payment_method('{"label":"Cash box","kind":"barter"}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %kind%', 'FAIL C5: unknown kind should be refused, got ' || COALESCE(v_err, 'no error');

  -- A second method, archived, for D's archived-method refusal.
  v_pm := upsert_studio_payment_method('{"label":"Old Chase","kind":"ach","archived":true}'::jsonb);
  ASSERT v_pm.archived_at IS NOT NULL, 'FAIL C6: archived:true should archive';
  INSERT INTO p1_ids VALUES ('pm_archived', v_pm.id);
  RAISE NOTICE 'Case C1–C6 (member upserts methods; full numbers refused): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69100000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_n int;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT upsert_studio_payment_method('{"organizationId":"69100000-0000-4000-8000-0000000000f1","label":"Guest card","kind":"card"}'::jsonb)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL C7: guest create should be refused 42501, got ' || COALESCE(v_err, 'no error');
  SELECT count(*) INTO v_n FROM studio_payment_methods WHERE organization_id = '69100000-0000-4000-8000-0000000000f1';
  ASSERT v_n = 0, 'FAIL C8: guest should read no payment methods, got ' || v_n;
  RAISE NOTICE 'Case C7–C8 (guest refused): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69100000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised(format(
    $q$SELECT upsert_studio_payment_method('{"id":"%s","label":"Mine now"}'::jsonb)$q$,
    (SELECT v FROM p1_ids WHERE k = 'pm')));
  ASSERT v_err LIKE '42501 %', 'FAIL C9: outsider update should be refused 42501, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case C9 (outsider refused): ok';
END $$;

-- ─── D. record_vendor_payment ───────────────────────────────────────────────

DO $$
DECLARE v_err text;
BEGIN
  -- Still the outsider.
  v_err := pg_temp.raised($q$
    SELECT record_vendor_payment('69100000-0000-4000-8000-000000000101',
      '{"poPaymentId":"69100000-0000-4000-8000-000000000301","amountCents":1000}'::jsonb)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL D1: outsider should be refused 42501, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case D1 (outsider refused): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69100000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT record_vendor_payment('69100000-0000-4000-8000-000000000101',
      '{"poPaymentId":"69100000-0000-4000-8000-000000000301","amountCents":1000}'::jsonb)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL D2: guest should be refused 42501, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case D2 (guest refused): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69100000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_err text;
  v_vp vendor_payments%ROWTYPE;
  v_dep po_payments%ROWTYPE;
  v_bal po_payments%ROWTYPE;
BEGIN
  -- D3: catalog PO.
  v_err := pg_temp.raised($q$
    SELECT record_vendor_payment('69100000-0000-4000-8000-000000000102',
      '{"poPaymentId":"69100000-0000-4000-8000-000000000303","amountCents":40000}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %Stripe%', 'FAIL D3: catalog PO should be refused (Stripe lane), got ' || COALESCE(v_err, 'no error');

  -- D4: a row carrying a Stripe session on a studio-lane PO.
  v_err := pg_temp.raised($q$
    SELECT record_vendor_payment('69100000-0000-4000-8000-000000000103',
      '{"poPaymentId":"69100000-0000-4000-8000-000000000304","amountCents":25000}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %Stripe%', 'FAIL D4: Stripe-rail row should be refused, got ' || COALESCE(v_err, 'no error');

  -- D5: a partial deposit leaves both rows unpaid.
  v_vp := record_vendor_payment('69100000-0000-4000-8000-000000000101', jsonb_build_object(
    'poPaymentId', '69100000-0000-4000-8000-000000000301', 'amountCents', 20000,
    'paidOn', (CURRENT_DATE - 2)::text, 'method', 'check', 'reference', 'Check 1041'));
  ASSERT v_vp.recorded_by = '69100000-0000-4000-8000-0000000000a2' AND v_vp.amount_cents = 20000
     AND v_vp.method = 'check' AND v_vp.currency_code = 'USD', 'FAIL D5: ledger row shape';
  SELECT * INTO v_dep FROM po_payments WHERE id = '69100000-0000-4000-8000-000000000301';
  SELECT * INTO v_bal FROM po_payments WHERE id = '69100000-0000-4000-8000-000000000302';
  ASSERT v_dep.state = 'pending' AND v_dep.paid_date IS NULL, 'FAIL D5: partial deposit should stay pending, got ' || v_dep.state;
  ASSERT v_bal.state = 'pending', 'FAIL D5: balance should stay pending, got ' || v_bal.state;

  -- D6: the remainder (amount omitted, card method) pays the deposit in full;
  -- the 00184 trigger turns the shipped PO's balance due.
  v_vp := record_vendor_payment('69100000-0000-4000-8000-000000000101', jsonb_build_object(
    'poPaymentId', '69100000-0000-4000-8000-000000000301',
    'paymentMethodId', (SELECT v FROM p1_ids WHERE k = 'pm'),
    'paidOn', CURRENT_DATE::text));
  ASSERT v_vp.amount_cents = 30000, 'FAIL D6: omitted amount should be the 30000 remainder, got ' || v_vp.amount_cents;
  ASSERT v_vp.method = 'card', 'FAIL D6: method should default to the card kind, got ' || v_vp.method;
  ASSERT v_vp.organization_id = '69100000-0000-4000-8000-0000000000f1', 'FAIL D6: organization from the payment method';
  INSERT INTO p1_ids VALUES ('vp_remainder', v_vp.id);
  SELECT * INTO v_dep FROM po_payments WHERE id = '69100000-0000-4000-8000-000000000301';
  SELECT * INTO v_bal FROM po_payments WHERE id = '69100000-0000-4000-8000-000000000302';
  ASSERT v_dep.state = 'paid' AND v_dep.paid_date = CURRENT_DATE,
    'FAIL D6: deposit should be paid on the latest paid_on, got ' || v_dep.state || ' ' || COALESCE(v_dep.paid_date::text, 'null');
  ASSERT v_bal.state = 'due', 'FAIL D6: balance should go due after the deposit is paid (00184), got ' || v_bal.state;

  -- D6b: paying a row already paid in full needs an explicit amount.
  v_err := pg_temp.raised($q$
    SELECT record_vendor_payment('69100000-0000-4000-8000-000000000101',
      '{"poPaymentId":"69100000-0000-4000-8000-000000000301"}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %paid in full%', 'FAIL D6b: no remainder should be refused, got ' || COALESCE(v_err, 'no error');

  -- D7: an unscheduled payment (a restocking fee) is allowed; it needs an amount.
  v_vp := record_vendor_payment('69100000-0000-4000-8000-000000000104',
    '{"amountCents":1500,"method":"wire","reference":"Restocking fee"}'::jsonb);
  ASSERT v_vp.po_payment_id IS NULL AND v_vp.amount_cents = 1500, 'FAIL D7: unscheduled payment';
  ASSERT (SELECT state FROM po_payments WHERE id = '69100000-0000-4000-8000-000000000305') = 'pending',
    'FAIL D7: an unscheduled payment must not move the schedule';
  v_err := pg_temp.raised($q$
    SELECT record_vendor_payment('69100000-0000-4000-8000-000000000104', '{"method":"wire"}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %amountCents is required%', 'FAIL D7b: missing amount should be refused, got ' || COALESCE(v_err, 'no error');

  -- D8: bad inputs.
  v_err := pg_temp.raised(format($q$
    SELECT record_vendor_payment('69100000-0000-4000-8000-000000000104',
      '{"amountCents":100,"paidOn":"%s"}'::jsonb)$q$, (CURRENT_DATE + 5)::text));
  ASSERT v_err LIKE '23514 %future%', 'FAIL D8a: a future paidOn should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$
    SELECT record_vendor_payment('69100000-0000-4000-8000-000000000104', '{"amountCents":12.5}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %whole%', 'FAIL D8b: fractional cents should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$
    SELECT record_vendor_payment('69100000-0000-4000-8000-000000000104', '{"amountCents":100,"memo":"x"}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %unknown keys%', 'FAIL D8c: unknown keys should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format($q$
    SELECT record_vendor_payment('69100000-0000-4000-8000-000000000104',
      '{"amountCents":100,"paymentMethodId":"%s"}'::jsonb)$q$, (SELECT v FROM p1_ids WHERE k = 'pm_archived')));
  ASSERT v_err LIKE '23514 %archived%', 'FAIL D8d: an archived method should be refused, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case D3–D8 (lane guard, partial, full + balance due, unscheduled, bad input): ok';
END $$;

-- ─── E. void_vendor_payment ─────────────────────────────────────────────────

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69100000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised(format($q$SELECT void_vendor_payment('%s', 'mine')$q$,
    (SELECT v FROM p1_ids WHERE k = 'vp_remainder')));
  ASSERT v_err LIKE '42501 %', 'FAIL E1: outsider void should be refused 42501, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case E1 (outsider void refused): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69100000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_vp vendor_payments%ROWTYPE; v_dep po_payments%ROWTYPE;
BEGIN
  v_err := pg_temp.raised(format($q$SELECT void_vendor_payment('%s', '   ')$q$,
    (SELECT v FROM p1_ids WHERE k = 'vp_remainder')));
  ASSERT v_err LIKE '23514 %reason%', 'FAIL E2: a blank reason should be refused, got ' || COALESCE(v_err, 'no error');

  -- E3: the owner voids the remainder; the deposit is no longer paid.
  v_vp := void_vendor_payment((SELECT v FROM p1_ids WHERE k = 'vp_remainder'), 'Card charge reversed');
  ASSERT v_vp.voided_at IS NOT NULL AND v_vp.void_reason = 'Card charge reversed'
     AND v_vp.voided_by = '69100000-0000-4000-8000-0000000000a1', 'FAIL E3: void stamp';
  SELECT * INTO v_dep FROM po_payments WHERE id = '69100000-0000-4000-8000-000000000301';
  ASSERT v_dep.state = 'due' AND v_dep.paid_date IS NULL,
    'FAIL E3: a void should reverse the deposit to due, got ' || v_dep.state;

  v_err := pg_temp.raised(format($q$SELECT void_vendor_payment('%s', 'again')$q$,
    (SELECT v FROM p1_ids WHERE k = 'vp_remainder')));
  ASSERT v_err LIKE '23514 %already void%', 'FAIL E4: a second void should be refused, got ' || COALESCE(v_err, 'no error');

  -- E5: recording again re-pays it (the ledger, not the void, is the truth).
  PERFORM record_vendor_payment('69100000-0000-4000-8000-000000000101',
    '{"poPaymentId":"69100000-0000-4000-8000-000000000301","method":"ach"}'::jsonb);
  ASSERT (SELECT state FROM po_payments WHERE id = '69100000-0000-4000-8000-000000000301') = 'paid',
    'FAIL E5: re-recording the remainder should pay the deposit again';
  RAISE NOTICE 'Case E2–E5 (void reverses, double void refused, re-record pays): ok';
END $$;

RESET ROLE;

-- E6: append-only, even for the table owner.
DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised(format($q$DELETE FROM vendor_payments WHERE id = '%s'$q$,
    (SELECT v FROM p1_ids WHERE k = 'vp_remainder')));
  ASSERT v_err LIKE '55000 %append-only%', 'FAIL E6a: DELETE should be refused, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$
    UPDATE vendor_payments SET amount_cents = amount_cents + 1
    WHERE purchase_order_id = '69100000-0000-4000-8000-000000000104'
  $q$);
  ASSERT v_err LIKE '55000 %append-only%', 'FAIL E6b: editing an amount should be refused, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case E6 (ledger is append-only): ok';
END $$;

-- ─── F. update_po_payment_schedule ──────────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "69100000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM update_po_payment_schedule('69100000-0000-4000-8000-000000000105', jsonb_build_object(
    'payments', jsonb_build_array(
      jsonb_build_object('id', '69100000-0000-4000-8000-000000000306', 'amountCents', 4000,
                         'dueDate', (CURRENT_DATE + 7)::text, 'label', 'Deposit (revised)'),
      jsonb_build_object('id', '69100000-0000-4000-8000-000000000307', 'amountCents', 6000))));
  ASSERT v_n = 2, 'FAIL F1: should return the two schedule rows, got ' || v_n;
  ASSERT (SELECT amount_cents FROM po_payments WHERE id = '69100000-0000-4000-8000-000000000306') = 4000
     AND (SELECT due_date FROM po_payments WHERE id = '69100000-0000-4000-8000-000000000306') = CURRENT_DATE + 7
     AND (SELECT label FROM po_payments WHERE id = '69100000-0000-4000-8000-000000000306') = 'Deposit (revised)'
     AND (SELECT amount_cents FROM po_payments WHERE id = '69100000-0000-4000-8000-000000000307') = 6000,
    'FAIL F1: schedule edit did not land';

  v_err := pg_temp.raised($q$
    SELECT update_po_payment_schedule('69100000-0000-4000-8000-000000000102',
      '{"payments":[{"id":"69100000-0000-4000-8000-000000000303","amountCents":1}]}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %catalog%', 'FAIL F2: catalog schedule should be refused, got ' || COALESCE(v_err, 'no error');

  -- F3: po_net carries a recorded (unscheduled) payment from D7.
  v_err := pg_temp.raised($q$
    SELECT update_po_payment_schedule('69100000-0000-4000-8000-000000000104',
      '{"payments":[{"id":"69100000-0000-4000-8000-000000000305","amountCents":1}]}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %already recorded%', 'FAIL F3: schedule should lock after a payment, got ' || COALESCE(v_err, 'no error');

  -- F4: the first payment on po_sched locks its schedule too.
  PERFORM record_vendor_payment('69100000-0000-4000-8000-000000000105',
    '{"poPaymentId":"69100000-0000-4000-8000-000000000306","amountCents":1000}'::jsonb);
  v_err := pg_temp.raised($q$
    SELECT update_po_payment_schedule('69100000-0000-4000-8000-000000000105',
      '{"payments":[{"id":"69100000-0000-4000-8000-000000000307","amountCents":1}]}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %already recorded%', 'FAIL F4: schedule should lock after the first payment, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case F1–F4 (schedule editable until the first payment): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69100000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT update_po_payment_schedule('69100000-0000-4000-8000-000000000105',
      '{"payments":[{"id":"69100000-0000-4000-8000-000000000307","amountCents":1}]}'::jsonb)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL F5: outsider schedule edit should be refused 42501, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case F5 (outsider refused): ok';
END $$;

RESET ROLE;

-- ─── G. grants ──────────────────────────────────────────────────────────────

DO $$
DECLARE v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.record_vendor_payment(uuid, jsonb)',
    'public.void_vendor_payment(uuid, text)',
    'public.update_po_payment_schedule(uuid, jsonb)',
    'public.upsert_studio_payment_method(jsonb)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'), 'FAIL G: anon can execute ' || v_fn;
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'), 'FAIL G: authenticated cannot execute ' || v_fn;
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.vendor_payments_derive_po_payment_state()',
    'public.vendor_payments_guard_append_only()'
  ] LOOP
    ASSERT NOT has_function_privilege('authenticated', v_fn, 'EXECUTE'), 'FAIL G: authenticated can execute ' || v_fn;
  END LOOP;
  ASSERT NOT has_table_privilege('authenticated', 'public.po_payments', 'UPDATE'), 'FAIL G: authenticated keeps UPDATE on po_payments';
  ASSERT has_table_privilege('service_role', 'public.po_payments', 'UPDATE'), 'FAIL G: service_role lost UPDATE on po_payments';
  ASSERT NOT has_table_privilege('anon', 'public.vendor_payments', 'SELECT'), 'FAIL G: anon can read vendor_payments';
  RAISE NOTICE 'Case G (grants): ok';
END $$;

ROLLBACK;
