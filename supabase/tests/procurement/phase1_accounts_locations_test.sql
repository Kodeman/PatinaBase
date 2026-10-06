-- ═══════════════════════════════════════════════════════════════════════════
-- Studio buying Phase 1 accounts + locations tests (migrations 00696, 00697;
-- US-16 C-12, C-13; SQ-402)
--
-- Studio A (owner O, member M, guest G) and studio B (owner X, outsider to A).
-- Cases:
--   A. studio_vendor_accounts: M creates an account (created_by/updated_by
--      stamped), O edits it (updated_by moves); R-PB9 claim-window defaults
--      with and without a row; guest and outsider refused; the table is
--      read-only to authenticated, and trade_discount_pct is not directly
--      selectable; RLS hides A's rows from X and from G; unknown keys and a
--      missing vendor refused.
--   B. resolve_or_create_vendor: dedupes by website host first (www. and
--      scheme ignored, name ignored), then by case-insensitive name, then
--      creates once and converges on the same website.
--   C. studio_locations: a second default receiver moves the default (one per
--      studio); the partial unique index refuses two defaults outright;
--      archive clears the default and freezes edits until restored; guest and
--      outsider refused; RLS hides A's locations from X and G.
--   D. set_purchase_order_ship_to_location: writes the FK and the printed
--      snapshot; refused after send when sent paper carries a ship-to; fills
--      a blank sent ship-to; refuses outsider, guest, another studio's
--      location, an archived location and a cancelled PO; NULL clears both.
--   E. Grants: anon cannot execute any new RPC or read either table.
--
-- How to run (after `supabase db reset`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase1_accounts_locations_test.sql
--
-- One transaction, rolled back at the end. RPC calls run under SET LOCAL ROLE
-- authenticated with request.jwt.claims, the real grant path.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('69200000-0000-4000-8000-0000000000a1', 'p1acct-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('69200000-0000-4000-8000-0000000000a2', 'p1acct-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- M
  ('69200000-0000-4000-8000-0000000000a3', 'p1acct-guest@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- G
  ('69200000-0000-4000-8000-0000000000a4', 'p1acct-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- X

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('69200000-0000-4000-8000-0000000000a1', 'p1acct-owner@test.invalid',    'P1 Owner',    NOW(), NOW()),
  ('69200000-0000-4000-8000-0000000000a2', 'p1acct-member@test.invalid',   'P1 Member',   NOW(), NOW()),
  ('69200000-0000-4000-8000-0000000000a3', 'p1acct-guest@test.invalid',    'P1 Guest',    NOW(), NOW()),
  ('69200000-0000-4000-8000-0000000000a4', 'p1acct-outsider@test.invalid', 'P1 Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES
  ('69200000-0000-4000-8000-0000000000f1', 'design_studio', 'P1 Acct Studio A', 'p1-acct-studio-a-test'),
  ('69200000-0000-4000-8000-0000000000f2', 'design_studio', 'P1 Acct Studio B', 'p1-acct-studio-b-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('69200000-0000-4000-8000-0000000000e1', '69200000-0000-4000-8000-0000000000a1', '69200000-0000-4000-8000-0000000000f1', 'owner',  'active', NOW()),
  ('69200000-0000-4000-8000-0000000000e2', '69200000-0000-4000-8000-0000000000a2', '69200000-0000-4000-8000-0000000000f1', 'member', 'active', NOW()),
  ('69200000-0000-4000-8000-0000000000e3', '69200000-0000-4000-8000-0000000000a3', '69200000-0000-4000-8000-0000000000f1', 'guest',  'active', NOW()),
  ('69200000-0000-4000-8000-0000000000e4', '69200000-0000-4000-8000-0000000000a4', '69200000-0000-4000-8000-0000000000f2', 'owner',  'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('69200000-0000-4000-8000-000000000001', 'P1 Acct Project A', '69200000-0000-4000-8000-0000000000a1', '69200000-0000-4000-8000-0000000000a1', '69200000-0000-4000-8000-0000000000f1'),
  ('69200000-0000-4000-8000-000000000002', 'P1 Acct Project B', '69200000-0000-4000-8000-0000000000a4', '69200000-0000-4000-8000-0000000000a4', '69200000-0000-4000-8000-0000000000f2');

INSERT INTO vendors (id, name, website)
VALUES
  ('69200000-0000-4000-8000-000000000011', 'P1 Acct Acme Fixture', 'https://www.p1acct-acme.test/shop'),
  ('69200000-0000-4000-8000-000000000012', 'P1 Acct Name Only',    NULL);

-- POs on project A unless noted:
--   po_draft   draft, never sent (D1, D4, D5, D7)
--   po_sent    sent, its paper carries a ship-to (D2)
--   po_blank   sent, its paper had no ship-to (D3)
--   po_cancel  cancelled (D8)
--   po_b       studio B's project (D5)
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, is_patina_catalog, sent_at, ship_to)
VALUES
  ('69200000-0000-4000-8000-000000000101', '69200000-0000-4000-8000-0000000000a1', '69200000-0000-4000-8000-000000000001', '69200000-0000-4000-8000-000000000011', 'net_30', 10000, 'draft',     false, NULL,  NULL),
  ('69200000-0000-4000-8000-000000000102', '69200000-0000-4000-8000-0000000000a1', '69200000-0000-4000-8000-000000000001', '69200000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed', false, NOW(), 'Old Dock, 1 Old St'),
  ('69200000-0000-4000-8000-000000000103', '69200000-0000-4000-8000-0000000000a1', '69200000-0000-4000-8000-000000000001', '69200000-0000-4000-8000-000000000011', 'net_30', 10000, 'confirmed', false, NOW(), NULL),
  ('69200000-0000-4000-8000-000000000104', '69200000-0000-4000-8000-0000000000a1', '69200000-0000-4000-8000-000000000001', '69200000-0000-4000-8000-000000000011', 'net_30', 10000, 'cancelled', false, NULL,  NULL),
  ('69200000-0000-4000-8000-000000000105', '69200000-0000-4000-8000-0000000000a4', '69200000-0000-4000-8000-000000000002', '69200000-0000-4000-8000-000000000011', 'net_30', 10000, 'draft',     false, NULL,  NULL);

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

-- ─── A. studio_vendor_accounts ──────────────────────────────────────────────

SET LOCAL "request.jwt.claims" TO '{"sub": "69200000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_acct public.studio_vendor_accounts; v_claims int; v_insp jsonb; v_n int;
BEGIN
  -- No row yet: R-PB9 defaults.
  SELECT claims_window_days, inspection_window_days INTO v_claims, v_insp
  FROM public.studio_vendor_claim_windows('69200000-0000-4000-8000-0000000000f1', '69200000-0000-4000-8000-000000000012');
  ASSERT v_claims = 3, 'FAIL A1: default claims window should be 3, got ' || COALESCE(v_claims::text, 'NULL');
  ASSERT v_insp = '{"concealed_carrier": 5}'::jsonb, 'FAIL A1: default inspection windows should be {"concealed_carrier":5}, got ' || COALESCE(v_insp::text, 'NULL');

  v_acct := public.upsert_studio_vendor_account(
    '69200000-0000-4000-8000-0000000000f1', '69200000-0000-4000-8000-000000000011',
    '{"paymentPattern": "net_30", "accountNumber": "  ACME-77  ", "inspectionWindowDays": {"parcel": 2}}'::jsonb);
  ASSERT v_acct.payment_pattern = 'net_30', 'FAIL A2: payment pattern should be net_30, got ' || COALESCE(v_acct.payment_pattern::text, 'NULL');
  ASSERT v_acct.created_by = '69200000-0000-4000-8000-0000000000a2' AND v_acct.updated_by = '69200000-0000-4000-8000-0000000000a2',
    'FAIL A2: created_by/updated_by should both be M';
  INSERT INTO p1_ids VALUES ('acct', v_acct.id);

  -- Row present but claims unset: claims default kept, inspection merged.
  SELECT claims_window_days, inspection_window_days INTO v_claims, v_insp
  FROM public.studio_vendor_claim_windows('69200000-0000-4000-8000-0000000000f1', '69200000-0000-4000-8000-000000000011');
  ASSERT v_claims = 3, 'FAIL A3: unset claims window should default to 3, got ' || COALESCE(v_claims::text, 'NULL');
  ASSERT v_insp = '{"concealed_carrier": 5, "parcel": 2}'::jsonb, 'FAIL A3: inspection windows should merge over the default, got ' || COALESCE(v_insp::text, 'NULL');

  v_err := pg_temp.raised($q$
    SELECT public.upsert_studio_vendor_account('69200000-0000-4000-8000-0000000000f1', '69200000-0000-4000-8000-000000000011', '{"bogusKey": 1}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %', 'FAIL A4: an unknown key should fail 23514, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    SELECT public.upsert_studio_vendor_account('69200000-0000-4000-8000-0000000000f1', '69200000-0000-4000-8000-0000000009ff', '{}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23503 %', 'FAIL A5: a missing vendor should fail 23503, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    INSERT INTO studio_vendor_accounts (organization_id, vendor_id)
    VALUES ('69200000-0000-4000-8000-0000000000f1', '69200000-0000-4000-8000-000000000012')
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A6: direct INSERT should fail 42501, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    UPDATE studio_vendor_accounts SET notes = 'x' WHERE organization_id = '69200000-0000-4000-8000-0000000000f1'
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A7: direct UPDATE should fail 42501, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$ SELECT trade_discount_pct FROM studio_vendor_accounts $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A8: direct SELECT of trade_discount_pct should fail 42501, got ' || COALESCE(v_err, 'no error');

  SELECT count(*) INTO v_n FROM studio_vendor_accounts WHERE organization_id = '69200000-0000-4000-8000-0000000000f1';
  ASSERT v_n = 1, 'FAIL A9: member should read the studio account through RLS, got ' || v_n;
  RAISE NOTICE 'Case A1–A9 (member upsert, defaults, refusals, read-only table): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69200000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_acct public.studio_vendor_accounts; v_claims int;
BEGIN
  v_acct := public.upsert_studio_vendor_account(
    '69200000-0000-4000-8000-0000000000f1', '69200000-0000-4000-8000-000000000011',
    '{"claimsWindowDays": 7}'::jsonb);
  ASSERT v_acct.id = (SELECT v FROM p1_ids WHERE k = 'acct'), 'FAIL A10: the second upsert should update the same row';
  ASSERT v_acct.updated_by = '69200000-0000-4000-8000-0000000000a1' AND v_acct.created_by = '69200000-0000-4000-8000-0000000000a2',
    'FAIL A10: updated_by should move to O, created_by stay M';
  ASSERT v_acct.payment_pattern = 'net_30' AND v_acct.account_number = 'ACME-77',
    'FAIL A10: absent keys should be kept (and account number trimmed), got ' || COALESCE(v_acct.account_number, 'NULL');
  SELECT claims_window_days INTO v_claims
  FROM public.studio_vendor_claim_windows('69200000-0000-4000-8000-0000000000f1', '69200000-0000-4000-8000-000000000011');
  ASSERT v_claims = 7, 'FAIL A11: a set claims window should win over the default, got ' || v_claims;
  RAISE NOTICE 'Case A10–A11 (owner edit stamps updated_by, keeps absent keys): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69200000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_n int;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT public.upsert_studio_vendor_account('69200000-0000-4000-8000-0000000000f1', '69200000-0000-4000-8000-000000000012', '{}'::jsonb)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A12: guest upsert should fail 42501, got ' || COALESCE(v_err, 'no error');
  SELECT count(*) INTO v_n FROM studio_vendor_accounts;
  ASSERT v_n = 0, 'FAIL A13: guest should read no accounts, got ' || v_n;
  SELECT count(*) INTO v_n FROM public.get_studio_vendor_accounts('69200000-0000-4000-8000-0000000000f1');
  ASSERT v_n = 0, 'FAIL A13: get_studio_vendor_accounts should return nothing to a guest, got ' || v_n;
  RAISE NOTICE 'Case A12–A13 (guest refused and blind): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69200000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_n int;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT public.upsert_studio_vendor_account('69200000-0000-4000-8000-0000000000f1', '69200000-0000-4000-8000-000000000012', '{}'::jsonb)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL A14: outsider upsert into studio A should fail 42501, got ' || COALESCE(v_err, 'no error');
  SELECT count(*) INTO v_n FROM studio_vendor_accounts WHERE organization_id = '69200000-0000-4000-8000-0000000000f1';
  ASSERT v_n = 0, 'FAIL A15: outsider should read none of studio A''s accounts, got ' || v_n;
  SELECT count(*) INTO v_n FROM public.get_studio_vendor_accounts('69200000-0000-4000-8000-0000000000f1');
  ASSERT v_n = 0, 'FAIL A15: get_studio_vendor_accounts should return nothing to an outsider, got ' || v_n;
  -- X's own studio works.
  PERFORM public.upsert_studio_vendor_account('69200000-0000-4000-8000-0000000000f2', '69200000-0000-4000-8000-000000000011', '{"notes": "B terms"}'::jsonb);
  SELECT count(*) INTO v_n FROM studio_vendor_accounts;
  ASSERT v_n = 1, 'FAIL A16: outsider should read only studio B''s account, got ' || v_n;
  RAISE NOTICE 'Case A14–A16 (RLS across studios): ok';
END $$;

-- ─── B. resolve_or_create_vendor ────────────────────────────────────────────

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69200000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_id uuid; v_again uuid; v_n int;
BEGIN
  v_id := public.resolve_or_create_vendor('A Different Name', 'http://P1ACCT-ACME.test/catalog?x=1');
  ASSERT v_id = '69200000-0000-4000-8000-000000000011', 'FAIL B1: a website host match should win over the name, got ' || COALESCE(v_id::text, 'NULL');

  v_id := public.resolve_or_create_vendor('  p1 acct name only ', NULL);
  ASSERT v_id = '69200000-0000-4000-8000-000000000012', 'FAIL B2: a case-insensitive name match should resolve, got ' || COALESCE(v_id::text, 'NULL');

  v_id := public.resolve_or_create_vendor('P1 Acct Name Only', 'https://p1acct-unseen.test');
  ASSERT v_id = '69200000-0000-4000-8000-000000000012', 'FAIL B3: no host match should fall back to the name, got ' || COALESCE(v_id::text, 'NULL');

  v_id := public.resolve_or_create_vendor('P1 Acct Fresh Vendor', 'p1acct-fresh.test');
  ASSERT v_id IS NOT NULL AND v_id NOT IN ('69200000-0000-4000-8000-000000000011', '69200000-0000-4000-8000-000000000012'),
    'FAIL B4: an unknown vendor should be created';
  v_again := public.resolve_or_create_vendor('Someone Else', 'https://www.p1acct-fresh.test/about');
  ASSERT v_again = v_id, 'FAIL B5: the created vendor should be found again by its website';
  SELECT count(*) INTO v_n FROM vendors WHERE lower(website) = 'https://p1acct-fresh.test';
  ASSERT v_n = 1, 'FAIL B5: exactly one vendor should carry the new website, got ' || v_n;

  v_err := pg_temp.raised($q$ SELECT public.resolve_or_create_vendor('  ', NULL) $q$);
  ASSERT v_err LIKE '23514 %', 'FAIL B6: no name and no website should fail 23514, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case B1–B6 (resolver dedupes by website, then name): ok';
END $$;

-- ─── C. studio_locations ────────────────────────────────────────────────────

DO $$
DECLARE v_err text; v_loc public.studio_locations; v_first uuid; v_n int;
BEGIN
  v_loc := public.upsert_studio_location('69200000-0000-4000-8000-0000000000f1',
    '{"kind": "receiver", "label": "Main Receiver", "isDefaultReceiver": true,
      "address": {"street": "10 Dock Rd", "city": "Austin", "state": "TX", "zip": "78701"}}'::jsonb);
  ASSERT v_loc.is_default_receiver AND v_loc.created_by = '69200000-0000-4000-8000-0000000000a2',
    'FAIL C1: the first location should be the default receiver, created by M';
  v_first := v_loc.id;
  INSERT INTO p1_ids VALUES ('loc_main', v_first);

  v_loc := public.upsert_studio_location('69200000-0000-4000-8000-0000000000f1',
    '{"kind": "storage", "label": "Overflow Warehouse", "isDefaultReceiver": true}'::jsonb);
  INSERT INTO p1_ids VALUES ('loc_overflow', v_loc.id);
  SELECT count(*) INTO v_n FROM studio_locations
  WHERE organization_id = '69200000-0000-4000-8000-0000000000f1' AND is_default_receiver;
  ASSERT v_n = 1, 'FAIL C2: a studio should keep exactly one default receiver, got ' || v_n;
  ASSERT (SELECT is_default_receiver FROM studio_locations WHERE id = v_loc.id), 'FAIL C2: the newest default should hold';
  ASSERT NOT (SELECT is_default_receiver FROM studio_locations WHERE id = v_first), 'FAIL C2: the old default should be cleared';

  -- Move it back by id.
  v_loc := public.upsert_studio_location('69200000-0000-4000-8000-0000000000f1',
    jsonb_build_object('id', v_first, 'isDefaultReceiver', true));
  ASSERT v_loc.is_default_receiver AND v_loc.label = 'Main Receiver', 'FAIL C3: an update by id should move the default and keep the label';

  v_err := pg_temp.raised($q$
    SELECT public.upsert_studio_location('69200000-0000-4000-8000-0000000000f1', '{"kind": "studio"}'::jsonb)
  $q$);
  ASSERT v_err LIKE '23514 %', 'FAIL C4: a location without a label should fail 23514, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    INSERT INTO studio_locations (organization_id, kind, label) VALUES ('69200000-0000-4000-8000-0000000000f1', 'site', 'Direct')
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL C5: direct INSERT should fail 42501, got ' || COALESCE(v_err, 'no error');

  -- Archive the default: it stops being the default, and edits wait for a restore.
  v_loc := public.archive_studio_location(v_first);
  ASSERT v_loc.archived_at IS NOT NULL AND NOT v_loc.is_default_receiver, 'FAIL C6: archiving should clear the default';
  v_err := pg_temp.raised(format(
    $q$ SELECT public.upsert_studio_location('69200000-0000-4000-8000-0000000000f1', '{"id": "%s", "label": "Renamed"}'::jsonb) $q$, v_first));
  ASSERT v_err LIKE '23514 %', 'FAIL C7: editing an archived location should fail 23514, got ' || COALESCE(v_err, 'no error');
  v_loc := public.archive_studio_location(v_first, false);
  ASSERT v_loc.archived_at IS NULL AND NOT v_loc.is_default_receiver, 'FAIL C8: a restore should un-archive without reclaiming the default';
  RAISE NOTICE 'Case C1–C8 (default receiver moves, archive and restore): ok';
END $$;

-- The partial unique index itself refuses a second default, even for postgres.
-- (After C8 studio A has no default, so the statement inserts two.)
RESET ROLE;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$
    INSERT INTO studio_locations (organization_id, kind, label, is_default_receiver)
    VALUES ('69200000-0000-4000-8000-0000000000f1', 'receiver', 'First Default', true),
           ('69200000-0000-4000-8000-0000000000f1', 'receiver', 'Second Default', true)
  $q$);
  ASSERT v_err LIKE '23505 %', 'FAIL C9: a second default receiver should fail 23505, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case C9 (one default receiver per studio, enforced by index): ok';
END $$;

SET LOCAL "request.jwt.claims" TO '{"sub": "69200000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_n int;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT public.upsert_studio_location('69200000-0000-4000-8000-0000000000f1', '{"kind": "site", "label": "Guest Site"}'::jsonb)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL C10: guest upsert should fail 42501, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format($q$ SELECT public.archive_studio_location('%s') $q$, (SELECT v FROM p1_ids WHERE k = 'loc_overflow')));
  ASSERT v_err LIKE '42501 %', 'FAIL C11: guest archive should fail 42501, got ' || COALESCE(v_err, 'no error');
  SELECT count(*) INTO v_n FROM studio_locations;
  ASSERT v_n = 0, 'FAIL C12: guest should read no locations, got ' || v_n;
  RAISE NOTICE 'Case C10–C12 (guest refused and blind): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69200000-0000-4000-8000-0000000000a4", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_n int; v_loc public.studio_locations;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT public.upsert_studio_location('69200000-0000-4000-8000-0000000000f1', '{"kind": "site", "label": "Outsider Site"}'::jsonb)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL C13: outsider upsert into studio A should fail 42501, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format($q$ SELECT public.archive_studio_location('%s') $q$, (SELECT v FROM p1_ids WHERE k = 'loc_overflow')));
  ASSERT v_err LIKE '42501 %', 'FAIL C14: outsider archive should fail 42501, got ' || COALESCE(v_err, 'no error');
  SELECT count(*) INTO v_n FROM studio_locations WHERE organization_id = '69200000-0000-4000-8000-0000000000f1';
  ASSERT v_n = 0, 'FAIL C15: outsider should read none of studio A''s locations, got ' || v_n;

  -- X's own studio location, used in D5.
  v_loc := public.upsert_studio_location('69200000-0000-4000-8000-0000000000f2', '{"kind": "receiver", "label": "B Receiver"}'::jsonb);
  INSERT INTO p1_ids VALUES ('loc_b', v_loc.id);

  -- D (outsider half): X cannot point A's PO anywhere, nor its own PO at A's location.
  v_err := pg_temp.raised($q$
    SELECT public.set_purchase_order_ship_to_location('69200000-0000-4000-8000-000000000101', NULL)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL D4: outsider on studio A''s PO should fail 42501, got ' || COALESCE(v_err, 'no error');
  v_err := pg_temp.raised(format($q$
    SELECT public.set_purchase_order_ship_to_location('69200000-0000-4000-8000-000000000105', '%s')
  $q$, (SELECT v FROM p1_ids WHERE k = 'loc_main')));
  ASSERT v_err LIKE '23514 %', 'FAIL D5: studio A''s location on studio B''s PO should fail 23514, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case C13–C15, D4–D5 (outsider refused across studios): ok';
END $$;

-- ─── D. set_purchase_order_ship_to_location ─────────────────────────────────

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69200000-0000-4000-8000-0000000000a2", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text; v_po public.purchase_orders; v_main uuid := (SELECT v FROM p1_ids WHERE k = 'loc_main');
BEGIN
  v_po := public.set_purchase_order_ship_to_location('69200000-0000-4000-8000-000000000101', v_main);
  ASSERT v_po.ship_to_location_id = v_main, 'FAIL D1: the FK should point at the location';
  ASSERT v_po.ship_to = E'Main Receiver\n10 Dock Rd\nAustin, TX 78701',
    'FAIL D1: the printed snapshot should be label, street, city/state/zip, got ' || COALESCE(v_po.ship_to, 'NULL');

  v_err := pg_temp.raised(format($q$
    SELECT public.set_purchase_order_ship_to_location('69200000-0000-4000-8000-000000000102', '%s')
  $q$, v_main));
  ASSERT v_err LIKE '23514 %', 'FAIL D2: a sent PO whose paper carries a ship-to should fail 23514, got ' || COALESCE(v_err, 'no error');
  ASSERT (SELECT ship_to FROM purchase_orders WHERE id = '69200000-0000-4000-8000-000000000102') = 'Old Dock, 1 Old St',
    'FAIL D2: the sent ship-to should be untouched';

  v_po := public.set_purchase_order_ship_to_location('69200000-0000-4000-8000-000000000103', v_main);
  ASSERT v_po.ship_to_location_id = v_main AND v_po.ship_to LIKE 'Main Receiver%', 'FAIL D3: a blank sent ship-to may be filled';

  v_err := pg_temp.raised(format($q$
    SELECT public.set_purchase_order_ship_to_location('69200000-0000-4000-8000-000000000101', '%s')
  $q$, (SELECT v FROM p1_ids WHERE k = 'loc_b')));
  ASSERT v_err LIKE '23514 %', 'FAIL D5: another studio''s location should fail 23514, got ' || COALESCE(v_err, 'no error');

  PERFORM public.archive_studio_location((SELECT v FROM p1_ids WHERE k = 'loc_overflow'));
  v_err := pg_temp.raised(format($q$
    SELECT public.set_purchase_order_ship_to_location('69200000-0000-4000-8000-000000000101', '%s')
  $q$, (SELECT v FROM p1_ids WHERE k = 'loc_overflow')));
  ASSERT v_err LIKE '23514 %', 'FAIL D6: an archived location should fail 23514, got ' || COALESCE(v_err, 'no error');

  v_po := public.set_purchase_order_ship_to_location('69200000-0000-4000-8000-000000000101', NULL);
  ASSERT v_po.ship_to_location_id IS NULL AND v_po.ship_to IS NULL, 'FAIL D7: NULL should clear both the FK and the snapshot';

  v_err := pg_temp.raised(format($q$
    SELECT public.set_purchase_order_ship_to_location('69200000-0000-4000-8000-000000000104', '%s')
  $q$, v_main));
  ASSERT v_err LIKE '23514 %', 'FAIL D8: a cancelled PO should fail 23514, got ' || COALESCE(v_err, 'no error');

  v_err := pg_temp.raised($q$
    UPDATE purchase_orders SET ship_to_location_id = NULL WHERE id = '69200000-0000-4000-8000-000000000103'
  $q$);
  ASSERT v_err IS NOT NULL, 'FAIL D9: a direct PO update should stay refused';
  RAISE NOTICE 'Case D1–D3, D5–D9 (ship-to location writes FK + snapshot, refused after send): ok';
END $$;

RESET ROLE;
SET LOCAL "request.jwt.claims" TO '{"sub": "69200000-0000-4000-8000-0000000000a3", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_err text;
BEGIN
  v_err := pg_temp.raised($q$
    SELECT public.set_purchase_order_ship_to_location('69200000-0000-4000-8000-000000000101', NULL)
  $q$);
  ASSERT v_err LIKE '42501 %', 'FAIL D10: guest should fail 42501, got ' || COALESCE(v_err, 'no error');
  RAISE NOTICE 'Case D10 (guest refused): ok';
END $$;

-- ─── E. grants ──────────────────────────────────────────────────────────────

RESET ROLE;

DO $$
DECLARE v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.studio_vendor_claim_windows(uuid, uuid)',
    'public.get_studio_vendor_accounts(uuid, uuid)',
    'public.upsert_studio_vendor_account(uuid, uuid, jsonb)',
    'public.resolve_or_create_vendor(text, text)',
    'public.upsert_studio_location(uuid, jsonb)',
    'public.archive_studio_location(uuid, boolean)',
    'public.set_purchase_order_ship_to_location(uuid, uuid)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'), 'FAIL E1: anon should not execute ' || v_fn;
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'), 'FAIL E2: authenticated should execute ' || v_fn;
  END LOOP;
  ASSERT NOT has_table_privilege('anon', 'public.studio_vendor_accounts', 'SELECT'), 'FAIL E3: anon should not read studio_vendor_accounts';
  ASSERT NOT has_table_privilege('anon', 'public.studio_locations', 'SELECT'), 'FAIL E3: anon should not read studio_locations';
  ASSERT NOT has_column_privilege('authenticated', 'public.studio_vendor_accounts', 'trade_discount_pct', 'SELECT'),
    'FAIL E4: authenticated should not select trade_discount_pct directly';
  ASSERT has_column_privilege('authenticated', 'public.studio_vendor_accounts', 'payment_pattern', 'SELECT'),
    'FAIL E4: authenticated should select payment_pattern';
  RAISE NOTICE 'Case E1–E4 (grants): ok';
END $$;

ROLLBACK;
