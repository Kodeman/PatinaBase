-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1 review hardening tests (migration 00716; SQ-443)
--
-- Studio S (owner O, non-guest member M), studio T (owner U, who holds no
-- designer-domain role) and suspended-to-be studio V (member W). Cases:
--   A. F1: anon and authenticated cannot execute flip_pending_balance_to_due;
--      service_role can. A member's advance_purchase_order_status to shipped
--      (deposit paid) still flips the pending balance to due (Trigger B), and
--      a member's record_vendor_payment that pays the deposit of a shipped PO
--      still flips its balance (Trigger D).
--   B. F2: as the addressee, authenticated cannot UPDATE kind or
--      subject_purchase_order_id, cannot INSERT or DELETE, and can UPDATE
--      read_at on its own row.
--   C. F6: a seat UPDATE on an owner with no designer-domain role does not
--      grant studio_owner; the same move for a designer does.
--   D. record_vendor_payment refuses a refunded scheduled row.
--   E. A suspended studio's member reads no studio_locations or
--      studio_vendor_accounts rows (table or RPC) and cannot upsert either;
--      the same member reads both while the studio is active.
--
-- How to run (after `supabase db reset`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase1_review_hardening_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('69716000-0000-4000-8000-0000000000a1', 'p1rh-owner@test.invalid',      '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('69716000-0000-4000-8000-0000000000a2', 'p1rh-member@test.invalid',     '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- M
  ('69716000-0000-4000-8000-0000000000a3', 'p1rh-plain-owner@test.invalid','', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- U
  ('69716000-0000-4000-8000-0000000000a4', 'p1rh-designer@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- D
  ('69716000-0000-4000-8000-0000000000a5', 'p1rh-suspended@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- W

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('69716000-0000-4000-8000-0000000000a1', 'p1rh-owner@test.invalid',       'RH Owner',       NOW(), NOW()),
  ('69716000-0000-4000-8000-0000000000a2', 'p1rh-member@test.invalid',      'RH Member',      NOW(), NOW()),
  ('69716000-0000-4000-8000-0000000000a3', 'p1rh-plain-owner@test.invalid', 'RH Plain Owner', NOW(), NOW()),
  ('69716000-0000-4000-8000-0000000000a4', 'p1rh-designer@test.invalid',    'RH Designer',    NOW(), NOW()),
  ('69716000-0000-4000-8000-0000000000a5', 'p1rh-suspended@test.invalid',   'RH Suspended',   NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES
  ('69716000-0000-4000-8000-0000000000f1', 'design_studio', 'RH Studio S', 'p1-rh-studio-s-test'),
  ('69716000-0000-4000-8000-0000000000f2', 'design_studio', 'RH Studio T', 'p1-rh-studio-t-test'),
  ('69716000-0000-4000-8000-0000000000f3', 'design_studio', 'RH Studio V', 'p1-rh-studio-v-test');

-- U is seated as owner and D as a member: neither INSERT is a sync event.
-- C suspends and reactivates U's seat and promotes D.
INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('69716000-0000-4000-8000-0000000000e1', '69716000-0000-4000-8000-0000000000a1', '69716000-0000-4000-8000-0000000000f1', 'owner',  'active',    NOW()),
  ('69716000-0000-4000-8000-0000000000e2', '69716000-0000-4000-8000-0000000000a2', '69716000-0000-4000-8000-0000000000f1', 'member', 'active',    NOW()),
  ('69716000-0000-4000-8000-0000000000e3', '69716000-0000-4000-8000-0000000000a3', '69716000-0000-4000-8000-0000000000f2', 'owner',  'active',    NOW()),
  ('69716000-0000-4000-8000-0000000000e4', '69716000-0000-4000-8000-0000000000a4', '69716000-0000-4000-8000-0000000000f2', 'member', 'active',    NOW()),
  ('69716000-0000-4000-8000-0000000000e5', '69716000-0000-4000-8000-0000000000a5', '69716000-0000-4000-8000-0000000000f3', 'member', 'active',    NOW());

-- D is a designer; U holds no designer-domain role. Granted after the seats:
-- a designer role on a seatless user mints them a studio of their own.
INSERT INTO user_roles (user_id, role_id)
SELECT '69716000-0000-4000-8000-0000000000a4', id FROM roles WHERE name = 'studio_designer'
ON CONFLICT (user_id, role_id) DO NOTHING;
DELETE FROM user_roles ur USING roles r
WHERE r.id = ur.role_id AND ur.user_id = '69716000-0000-4000-8000-0000000000a3' AND r.domain = 'designer';

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('69716000-0000-4000-8000-000000000001', 'RH Project', '69716000-0000-4000-8000-0000000000a1', '69716000-0000-4000-8000-0000000000a1');

INSERT INTO vendors (id, name)
VALUES ('69716000-0000-4000-8000-000000000011', 'RH Vendor');

-- POs, all owned by O, studio lane:
--   po_b  in_production fifty_fifty, deposit paid, balance pending (A, Trigger B)
--   po_d  shipped fifty_fifty, deposit + balance pending       (A, Trigger D)
--   po_r  confirmed full_upfront, its row refunded              (D)
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, is_patina_catalog)
VALUES
  ('69716000-0000-4000-8000-000000000101', '69716000-0000-4000-8000-0000000000a1', '69716000-0000-4000-8000-000000000001', '69716000-0000-4000-8000-000000000011', 'fifty_fifty',  20000, 'in_production', false),
  ('69716000-0000-4000-8000-000000000102', '69716000-0000-4000-8000-0000000000a1', '69716000-0000-4000-8000-000000000001', '69716000-0000-4000-8000-000000000011', 'fifty_fifty',  20000, 'shipped',       false),
  ('69716000-0000-4000-8000-000000000103', '69716000-0000-4000-8000-0000000000a1', '69716000-0000-4000-8000-000000000001', '69716000-0000-4000-8000-000000000011', 'full_upfront',  5000, 'confirmed',     false);

INSERT INTO po_payments (id, purchase_order_id, kind, amount_cents, state, due_date, paid_date, sort_order)
VALUES
  ('69716000-0000-4000-8000-000000000301', '69716000-0000-4000-8000-000000000101', 'deposit', 10000, 'paid',     NULL, CURRENT_DATE, 0),
  ('69716000-0000-4000-8000-000000000302', '69716000-0000-4000-8000-000000000101', 'balance', 10000, 'pending',  NULL, NULL,         1),
  ('69716000-0000-4000-8000-000000000303', '69716000-0000-4000-8000-000000000102', 'deposit', 10000, 'pending',  NULL, NULL,         0),
  ('69716000-0000-4000-8000-000000000304', '69716000-0000-4000-8000-000000000102', 'balance', 10000, 'pending',  NULL, NULL,         1),
  ('69716000-0000-4000-8000-000000000305', '69716000-0000-4000-8000-000000000103', 'deposit',  5000, 'refunded', NULL, CURRENT_DATE, 0);

-- M's notice about po_b; po_r is the PO a repoint would aim at.
INSERT INTO procurement_notifications (id, user_id, kind, subject_purchase_order_id)
VALUES ('69716000-0000-4000-8000-000000000401', '69716000-0000-4000-8000-0000000000a2', 'delivery_this_week', '69716000-0000-4000-8000-000000000101');

-- Studio V's location and vendor account.
INSERT INTO studio_locations (id, organization_id, kind, label)
VALUES ('69716000-0000-4000-8000-000000000501', '69716000-0000-4000-8000-0000000000f3', 'receiver', 'RH Receiver');
INSERT INTO studio_vendor_accounts (id, organization_id, vendor_id)
VALUES ('69716000-0000-4000-8000-000000000601', '69716000-0000-4000-8000-0000000000f3', '69716000-0000-4000-8000-000000000011');

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

-- Whether p_user holds the named System A role.
CREATE OR REPLACE FUNCTION pg_temp.has_role(p_user uuid, p_role text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user AND r.name = p_role
  );
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.has_role(uuid, text) TO service_role;

-- ─── A. F1: flip is service_role only; the trigger paths still flip ─────────

DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.flip_pending_balance_to_due(uuid)', 'EXECUTE'),
    'FAIL A1: anon should not execute flip_pending_balance_to_due';
  ASSERT NOT has_function_privilege('authenticated', 'public.flip_pending_balance_to_due(uuid)', 'EXECUTE'),
    'FAIL A1: authenticated should not execute flip_pending_balance_to_due';
  ASSERT has_function_privilege('service_role', 'public.flip_pending_balance_to_due(uuid)', 'EXECUTE'),
    'FAIL A1: service_role should execute flip_pending_balance_to_due';
  RAISE NOTICE 'Case A1 (flip grants): ok';
END $$;

SET LOCAL "request.jwt.claims" TO '{"sub": "69716000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_state text; v_po purchase_orders;
BEGIN
  v_err := pg_temp.raised($q$SELECT public.flip_pending_balance_to_due('69716000-0000-4000-8000-000000000102')$q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A2: a member calling flip directly should fail 42501, got ' || COALESCE(v_err, 'no error');

  -- Trigger B: a member ships po_b with the deposit paid.
  v_po := public.advance_purchase_order_status('69716000-0000-4000-8000-000000000101', 'shipped', NULL);
  ASSERT v_po.status = 'shipped', 'FAIL A3: po_b should be shipped';
  SELECT state::text INTO v_state FROM po_payments WHERE id = '69716000-0000-4000-8000-000000000302';
  ASSERT v_state = 'due', 'FAIL A3: shipping with the deposit paid should flip the balance to due, got ' || v_state;

  -- Trigger D: a member pays po_d's deposit in full; the derive marks it paid
  -- and the shipped PO's balance goes due.
  PERFORM public.record_vendor_payment('69716000-0000-4000-8000-000000000102',
    '{"poPaymentId": "69716000-0000-4000-8000-000000000303", "method": "check"}'::jsonb);
  SELECT state::text INTO v_state FROM po_payments WHERE id = '69716000-0000-4000-8000-000000000303';
  ASSERT v_state = 'paid', 'FAIL A4: the deposit should be paid, got ' || v_state;
  SELECT state::text INTO v_state FROM po_payments WHERE id = '69716000-0000-4000-8000-000000000304';
  ASSERT v_state = 'due', 'FAIL A4: paying the deposit of a shipped PO should flip the balance to due, got ' || v_state;
  RAISE NOTICE 'Case A2–A4 (direct call refused; Trigger B and D paths flip as a member): ok';
END $$;

-- ─── B. F2: the addressee can only mark read ────────────────────────────────

DO $$
DECLARE v_err text; v_n int; v_read timestamptz;
BEGIN
  v_err := pg_temp.raised($q$
    UPDATE procurement_notifications SET subject_purchase_order_id = '69716000-0000-4000-8000-000000000103'
    WHERE id = '69716000-0000-4000-8000-000000000401'
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B1: repointing subject_purchase_order_id should fail 42501, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    UPDATE procurement_notifications SET kind = 'balance_due'
    WHERE id = '69716000-0000-4000-8000-000000000401'
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B2: changing kind should fail 42501, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    INSERT INTO procurement_notifications (user_id, kind, subject_purchase_order_id)
    VALUES ('69716000-0000-4000-8000-0000000000a2', 'balance_due', '69716000-0000-4000-8000-000000000103')
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B3: a direct INSERT should fail 42501, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    DELETE FROM procurement_notifications WHERE id = '69716000-0000-4000-8000-000000000401'
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL B4: a direct DELETE should fail 42501, got ' || COALESCE(v_err, 'no error');

  -- The useMarkProcurementNotificationRead write.
  UPDATE procurement_notifications SET read_at = now()
  WHERE id = '69716000-0000-4000-8000-000000000401'
    AND user_id = '69716000-0000-4000-8000-0000000000a2';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ASSERT v_n = 1, 'FAIL B5: the addressee should mark its own notice read, updated ' || v_n;
  SELECT read_at INTO v_read FROM procurement_notifications WHERE id = '69716000-0000-4000-8000-000000000401';
  ASSERT v_read IS NOT NULL, 'FAIL B5: read_at should be set';
  RAISE NOTICE 'Case B1–B5 (notices: read_at only): ok';
END $$;

-- ─── D. record_vendor_payment refuses a refunded row ────────────────────────

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT public.record_vendor_payment('69716000-0000-4000-8000-000000000103',
      '{"poPaymentId": "69716000-0000-4000-8000-000000000305", "amountCents": 5000}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %already refunded%', 'FAIL D1: a refunded row should be refused 23514, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case D1 (refunded row refused): ok';
END $$;

RESET ROLE;

-- ─── C. F6: studio_owner only alongside a designer-domain role ──────────────
-- The sync is a deferred constraint trigger; this transaction never commits,
-- so it asks for the queued events with SET CONSTRAINTS ... IMMEDIATE. The
-- seat moves run as service_role, the admin path (the owner guard's bypass).

SET CONSTRAINTS sync_studio_owner_role_from_seat IMMEDIATE;
SET LOCAL ROLE service_role;

DO $$
BEGIN
  ASSERT NOT public.has_designer_domain_role('69716000-0000-4000-8000-0000000000a3'),
    'FAIL C0: fixture expects U to hold no designer-domain role';
  ASSERT public.has_designer_domain_role('69716000-0000-4000-8000-0000000000a4'),
    'FAIL C0: fixture expects D to hold a designer-domain role';

  -- U's owner seat is suspended, then reactivated (status changes on an owner seat).
  UPDATE organization_members SET status = 'suspended' WHERE id = '69716000-0000-4000-8000-0000000000e3';
  UPDATE organization_members SET status = 'active' WHERE id = '69716000-0000-4000-8000-0000000000e3';
  ASSERT NOT pg_temp.has_role('69716000-0000-4000-8000-0000000000a3', 'studio_owner'),
    'FAIL C1: an owner seat update should not grant studio_owner to a user with no designer-domain role';
  ASSERT NOT public.has_designer_domain_role('69716000-0000-4000-8000-0000000000a3'),
    'FAIL C1: U should still hold no designer-domain role';

  -- D, a designer, is promoted to owner: the grant still happens.
  UPDATE organization_members SET role = 'owner' WHERE id = '69716000-0000-4000-8000-0000000000e4';
  ASSERT pg_temp.has_role('69716000-0000-4000-8000-0000000000a4', 'studio_owner'),
    'FAIL C2: promoting a designer to owner should grant studio_owner';
  RAISE NOTICE 'Case C1–C2 (sync narrowed to designer-domain holders): ok';
END $$;

RESET ROLE;

-- ─── E. a suspended studio's member reads and writes nothing ───────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "69716000-0000-4000-8000-0000000000a5", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM studio_locations WHERE organization_id = '69716000-0000-4000-8000-0000000000f3';
  ASSERT v_n = 1, 'FAIL E0: an active studio''s member should read its location, got ' || v_n;
  SELECT count(*) INTO v_n FROM studio_vendor_accounts WHERE organization_id = '69716000-0000-4000-8000-0000000000f3';
  ASSERT v_n = 1, 'FAIL E0: an active studio''s member should read its vendor account, got ' || v_n;
  RAISE NOTICE 'Case E0 (active studio reads): ok';
END $$;

-- The platform suspends V (the service_role admin path).
SET LOCAL ROLE service_role;
UPDATE organizations SET status = 'suspended' WHERE id = '69716000-0000-4000-8000-0000000000f3';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_n int; v_err text;
BEGIN
  SELECT count(*) INTO v_n FROM studio_locations WHERE organization_id = '69716000-0000-4000-8000-0000000000f3';
  ASSERT v_n = 0, 'FAIL E1: a suspended studio''s member should read no locations, got ' || v_n;
  SELECT count(*) INTO v_n FROM studio_vendor_accounts WHERE organization_id = '69716000-0000-4000-8000-0000000000f3';
  ASSERT v_n = 0, 'FAIL E2: a suspended studio''s member should read no vendor accounts, got ' || v_n;
  SELECT count(*) INTO v_n FROM public.get_studio_vendor_accounts('69716000-0000-4000-8000-0000000000f3');
  ASSERT v_n = 0, 'FAIL E3: get_studio_vendor_accounts should return nothing for a suspended studio, got ' || v_n;

  v_err := pg_temp.raised($q$
    SELECT public.upsert_studio_location('69716000-0000-4000-8000-0000000000f3', '{"kind": "storage", "label": "RH Storage"}'::jsonb)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL E4: upsert_studio_location should refuse a suspended studio, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised($q$
    SELECT public.upsert_studio_vendor_account('69716000-0000-4000-8000-0000000000f3', '69716000-0000-4000-8000-000000000011', '{"notes": "x"}'::jsonb)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL E5: upsert_studio_vendor_account should refuse a suspended studio, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case E1–E5 (suspended studio refused): ok';
END $$;

RESET ROLE;

ROLLBACK;
