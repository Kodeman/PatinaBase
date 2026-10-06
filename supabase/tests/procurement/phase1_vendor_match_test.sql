-- ═══════════════════════════════════════════════════════════════════════════
-- Studio buying Phase 1: find_vendor_match (migration 00715; US-16 R-PB4;
-- SQ-406)
--
-- Cases:
--   A. A website host match wins over the name (www., scheme and path
--      ignored).
--   B. With no host match, a trimmed case-insensitive name match resolves.
--   C. No match returns NULL, and so does input with no usable name or host.
--   D. Nothing is inserted: the vendors row count is unchanged after every
--      call, and the answers agree with resolve_or_create_vendor for the
--      matching cases.
--   E. Grants: anon cannot execute it; an unauthenticated caller is refused.
--
-- How to run (after `supabase db reset`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/phase1_vendor_match_test.sql
--
-- One transaction, rolled back at the end. Calls run under SET LOCAL ROLE
-- authenticated with request.jwt.claims, the real grant path.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('69300000-0000-4000-8000-0000000000a1', 'p1match-member@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('69300000-0000-4000-8000-0000000000a1', 'p1match-member@test.invalid', 'P1 Match Member', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO vendors (id, name, website)
VALUES
  ('69300000-0000-4000-8000-000000000011', 'P1 Match Hewn Woodworks', 'https://www.p1match-hewn.test/shop'),
  ('69300000-0000-4000-8000-000000000012', 'P1 Match Name Only',      NULL);

SET LOCAL "request.jwt.claims" TO '{"sub": "69300000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_id uuid; v_before int; v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM vendors;

  -- A. website first, name ignored
  v_id := public.find_vendor_match('A Different Name', 'http://P1MATCH-HEWN.test/catalog?x=1');
  ASSERT v_id = '69300000-0000-4000-8000-000000000011',
    'FAIL A1: a website host match should win over the name, got ' || COALESCE(v_id::text, 'NULL');
  v_id := public.find_vendor_match(NULL, 'p1match-hewn.test');
  ASSERT v_id = '69300000-0000-4000-8000-000000000011',
    'FAIL A2: a bare host should match, got ' || COALESCE(v_id::text, 'NULL');
  RAISE NOTICE 'Case A1–A2 (website match): ok';

  -- B. then name
  v_id := public.find_vendor_match('  p1 match name only ', NULL);
  ASSERT v_id = '69300000-0000-4000-8000-000000000012',
    'FAIL B1: a case-insensitive name match should resolve, got ' || COALESCE(v_id::text, 'NULL');
  v_id := public.find_vendor_match('P1 Match Name Only', 'https://p1match-unseen.test');
  ASSERT v_id = '69300000-0000-4000-8000-000000000012',
    'FAIL B2: no host match should fall back to the name, got ' || COALESCE(v_id::text, 'NULL');
  v_id := public.find_vendor_match('P1 Match Hewn Woodworks', 'call Joe');
  ASSERT v_id = '69300000-0000-4000-8000-000000000011',
    'FAIL B3: text that is not a host should be ignored and the name matched, got ' || COALESCE(v_id::text, 'NULL');
  RAISE NOTICE 'Case B1–B3 (name match): ok';

  -- C. no match
  v_id := public.find_vendor_match('P1 Match Nobody Makes This', 'https://p1match-nobody.test');
  ASSERT v_id IS NULL, 'FAIL C1: no match should return NULL, got ' || COALESCE(v_id::text, 'NULL');
  v_id := public.find_vendor_match('  ', NULL);
  ASSERT v_id IS NULL, 'FAIL C2: blank input should return NULL, got ' || COALESCE(v_id::text, 'NULL');
  v_id := public.find_vendor_match(NULL, NULL);
  ASSERT v_id IS NULL, 'FAIL C3: no input should return NULL, got ' || COALESCE(v_id::text, 'NULL');
  RAISE NOTICE 'Case C1–C3 (no match is NULL): ok';

  -- D. lookup only
  SELECT count(*) INTO v_after FROM vendors;
  ASSERT v_after = v_before, 'FAIL D1: find_vendor_match inserted ' || (v_after - v_before) || ' vendor rows';
  ASSERT NOT EXISTS (SELECT 1 FROM vendors WHERE website ILIKE '%p1match-nobody.test%' OR name = 'P1 Match Nobody Makes This'),
    'FAIL D1: the unmatched vendor should not exist';
  ASSERT public.find_vendor_match('A Different Name', 'p1match-hewn.test')
         = public.resolve_or_create_vendor('A Different Name', 'p1match-hewn.test'),
    'FAIL D2: find_vendor_match and resolve_or_create_vendor should agree on a website match';
  ASSERT public.find_vendor_match('P1 MATCH NAME ONLY', NULL)
         = public.resolve_or_create_vendor('P1 MATCH NAME ONLY', NULL),
    'FAIL D2: find_vendor_match and resolve_or_create_vendor should agree on a name match';
  SELECT count(*) INTO v_after FROM vendors;
  ASSERT v_after = v_before, 'FAIL D2: a matching resolve should not insert';
  RAISE NOTICE 'Case D1–D2 (nothing inserted; agrees with the resolver): ok';
END $$;

RESET ROLE;

DO $$
DECLARE v_failed boolean := false;
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.find_vendor_match(text, text)', 'EXECUTE'),
    'FAIL E1: anon should not execute find_vendor_match';
  ASSERT has_function_privilege('authenticated', 'public.find_vendor_match(text, text)', 'EXECUTE'),
    'FAIL E1: authenticated should execute find_vendor_match';

  PERFORM set_config('request.jwt.claims', '{}', true);
  BEGIN
    PERFORM public.find_vendor_match('P1 Match Name Only', NULL);
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'FAIL E2: an unauthenticated caller should be refused 42501';
  RAISE NOTICE 'Case E1–E2 (grants): ok';
END $$;

ROLLBACK;
