-- ═══════════════════════════════════════════════════════════════════════════
-- 00555 — anon lockdown on profiles / notification_preferences / vendors /
--         four SECURITY DEFINER views
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Every file in that tree is a
-- plain psql script — BEGIN, fixtures, pg_temp role-assumption helpers, DO
-- blocks of ASSERTs, ROLLBACK — run under ON_ERROR_STOP=1. This file follows
-- supabase/tests/rls/products_three_layer_test.sql (identity switching) and
-- supabase/tests/rls/anon_table_grant_narrowing_test.sql (ACL assertions),
-- which are the two closest precedents. Adding pgTAP for one file would be a
-- new dependency for no gain.
--
-- Sibling: supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql
-- (that migration was minted as 00556 and renumbered — 00556 is taken by
--  00556_admin_studio_management.sql on admin-studios/build).
--
-- Run (single file, for iteration):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/00555_ios_round_one_security.test.sql
--
-- Run (the actual gate — whole suite against KNOWN_FAILURES.md):
--   scripts/run-sql-tests.sh
--
-- Covers:
--   1. ACL state — anon holds NOTHING (incl. PG 17 MAINTAIN) on profiles and
--      notification_preferences; anon reads only the public face of vendors;
--      the four definer views are closed to anon; authenticated keeps its reads
--      and loses DELETE on profiles; service_role is untouched.
--   2. profiles rows, BEHAVIOURALLY, one reader at a time — owner (2a),
--      counterparty via roster (2b-2e), org co-member incl. 'invited',
--      unrelated user (2f), anon (2g-2h), owner's own preferences (2i),
--      service_role (2j), an admin-domain role holder via
--      profiles_select_admin (2k), and the NOLOGIN agent_reader via
--      profiles_select_agent_reader (2l). 2k and 2l are what stop a policy
--      whose NAME still exists but whose predicate stopped matching — both
--      read through public.roles / public.user_roles, which carry their own
--      RLS and belong to other people's migrations.
--   3. The tightened legs actually bite: a 'new' lead and a revoked room-scan
--      share do NOT admit a reader.
--   4. anon WRITE attempts on notification_preferences all fail.
--   5. vendors as anon — the public columns read (5a-5b), the trade file does
--      not (5c-5d), and products JOIN vendors resolves (5e), which is the
--      column-grant design's whole reason for existing.
--   6. profiles INSERT — the anon leg is gone; a user may still insert own row;
--      and neither permissive INSERT policy will accept role='designer' or
--      is_designer=true (6e/6f), because profiles.role DEFAULTs to 'designer'
--      and an unpinned INSERT is a one-statement version of case 7.
--   7. self-elevation — the owner may edit their row but may change neither
--      their role (7c/7e) nor their is_designer (7f/7f2), on either of the
--      table's two permissive UPDATE policies; the roster row that used to
--      reach the sibling policy can no longer be minted at all (7e0); both
--      WITH CHECKs pin the is_designer COMPARISON, not merely name the column
--      (7f3/7f4), and the sibling's USING reads the OLD row (7f5). is_designer
--      is the one that carries AUTHORITY: 00286/00330/00285 and
--      search_shareable_designers all gate on it, not on role.
--      7h runs the CROSS-ACCOUNT direction — the attacker rosters somebody
--      ELSE and tries to demote and rename them. (profile_cards was CUT from
--      00555; 7a asserts it is absent.)
--   8. search_shareable_designers — finds by name, never returns email,
--      enforces the 2-char floor including against a WILDCARD query (8h),
--      and the LIMIT, closed to anon.
--   8b. list_vendor_profiles — returns vendor-role rows and only those, in
--      exactly the id/full_name/avatar_url shape L0.2b's hook destructures,
--      closed to anon.
--   9. No FOR ALL / TO PUBLIC / auth.uid() IS NULL policy survives in public.
--  10. Helper lockdown, and the policy set by NAME (which is a shape check, not
--      a behaviour check — sections 2 and 8 are the behaviour).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- Dana  = designer, Cleo's designer of record
-- Cleo  = Dana's rostered client
-- Mal   = unrelated authenticated user
-- Ora   = in the same organization as Dana, status 'invited' (the org leg)
-- Nyx   = a homeowner on a status='new' lead to Dana, and the consumer on a
--         REVOKED scan share with Dana — she must remain invisible to Dana
-- Adm   = holds a user_roles row against an admin-domain role (profiles_select_admin)
-- Ven   = role='vendor', the one row list_vendor_profiles must return

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('d0000000-0000-4000-8000-000000000001', 'p555-dana@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000002', 'p555-cleo@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000003', 'p555-mal@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e0000000-0000-4000-8000-000000000004', 'p555-ora@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f0000000-0000-4000-8000-000000000005', 'p555-nyx@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('ad000000-0000-4000-8000-000000000006', 'p555-adm@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('be000000-0000-4000-8000-000000000007', 'p555-ven@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, display_name, full_name, business_name, avatar_url, role, is_designer, phone, stripe_customer_id, created_at, updated_at)
VALUES
  ('d0000000-0000-4000-8000-000000000001', 'p555-dana@test.invalid', 'Dana', 'Dana Designer', 'Dana Studio Ltd', 'https://img.invalid/d.png', 'designer',  TRUE,  '555-0001', 'cus_test_dana', NOW(), NOW()),
  ('c0000000-0000-4000-8000-000000000002', 'p555-cleo@test.invalid', 'Cleo', 'Cleo Client',   NULL,              'https://img.invalid/c.png', 'client',    FALSE, '555-0002', 'cus_test_cleo', NOW(), NOW()),
  ('a0000000-0000-4000-8000-000000000003', 'p555-mal@test.invalid',  'Mal',  'Mal Unrelated', NULL,              NULL,                        'homeowner', FALSE, '555-0003', NULL,            NOW(), NOW()),
  ('e0000000-0000-4000-8000-000000000004', 'p555-ora@test.invalid',  'Ora',  'Ora Invited',   'Ora Works',       NULL,                        'designer',  TRUE,  '555-0004', NULL,            NOW(), NOW()),
  ('f0000000-0000-4000-8000-000000000005', 'p555-nyx@test.invalid',  'Nyx',  'Nyx Newlead',   NULL,              NULL,                        'homeowner', FALSE, '555-0005', NULL,            NOW(), NOW()),
  ('ad000000-0000-4000-8000-000000000006', 'p555-adm@test.invalid',  'Adm',  'Adm Admin',     NULL,              NULL,                        'admin',     FALSE, '555-0006', NULL,            NOW(), NOW()),
  ('be000000-0000-4000-8000-000000000007', 'p555-ven@test.invalid',  'Ven',  'Ven Vendor',    'Ven Supply Co',   'https://img.invalid/v.png', 'vendor',    FALSE, '555-0007', NULL,            NOW(), NOW())
ON CONFLICT (id) DO UPDATE
  SET display_name  = EXCLUDED.display_name,
      full_name     = EXCLUDED.full_name,
      business_name = EXCLUDED.business_name,
      is_designer   = EXCLUDED.is_designer,
      role          = EXCLUDED.role;

-- The roster relationship. `idx_designer_clients_unique_profile` is a UNIQUE
-- index on (designer_id, client_id) WHERE client_id IS NOT NULL AND
-- status <> 'lead', so an id-targeted ON CONFLICT would not catch a collision
-- with a pre-existing row for this pair. Use the untargeted form (which covers
-- every constraint) and then assert the row is actually present, so a silent
-- no-op fails loudly instead of being read as "no relationship".
INSERT INTO public.designer_clients (id, designer_id, client_id, status, created_at, updated_at)
VALUES ('dc555000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000002',
        'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM public.designer_clients
    WHERE designer_id = 'd0000000-0000-4000-8000-000000000001'
      AND client_id   = 'c0000000-0000-4000-8000-000000000002'
      AND status <> 'lead'
  ), 'FIXTURE: the Dana→Cleo roster row is missing; every counterparty case below would be meaningless';
END $$;

-- Org co-membership: Dana active, Ora invited. The org leg must admit Ora.
INSERT INTO public.organizations (id, type, name, slug, status, created_at, updated_at)
VALUES ('0f555000-0000-4000-8000-000000000001'::uuid, 'design_studio', 'Test Studio 555', 'p555-test-studio', 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES
  ('d0000000-0000-4000-8000-000000000001', '0f555000-0000-4000-8000-000000000001'::uuid, 'owner',  'active',  NOW(), NOW(), NOW()),
  ('e0000000-0000-4000-8000-000000000004', '0f555000-0000-4000-8000-000000000001'::uuid, 'member', 'invited', NULL,  NOW(), NOW())
ON CONFLICT DO NOTHING;

-- A status='new' lead — must NOT admit Dana to Nyx's profile.
INSERT INTO public.leads (id, homeowner_id, designer_id, project_type, status, created_at, updated_at)
VALUES ('1e555000-0000-4000-8000-000000000001'::uuid,
        'f0000000-0000-4000-8000-000000000005',
        'd0000000-0000-4000-8000-000000000001',
        'full_home', 'new', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- room_scan_associations.scan_id is NOT NULL and FK-bound, so the revoked-share
-- case in section 3 needs a real scan. room_scans requires only user_id + name.
INSERT INTO public.room_scans (id, user_id, name)
VALUES ('45555000-0000-4000-8000-000000000001'::uuid,
        'f0000000-0000-4000-8000-000000000005',
        'p555 test scan')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.notification_preferences (user_id)
VALUES ('d0000000-0000-4000-8000-000000000001')
ON CONFLICT DO NOTHING;

INSERT INTO public.vendors (id, name, made_in, brand_story, notes, trade_terms, website)
VALUES ('bd555000-0000-4000-8000-000000000001'::uuid, 'Test Maker Co', 'USA',
        '{"summary":"public"}'::jsonb,
        'internal: do not surface', 'net 30 trade only', 'https://maker.invalid')
ON CONFLICT (id) DO NOTHING;

-- A published catalogue product pointing at that vendor. Section 5e joins the
-- two AS ANON: the iOS product read is a PostgREST EMBED
-- (`*,vendors!products_vendor_id_fkey(name,made_in,brand_story)`,
-- ProductAPIClient.swift:122) which resolves through this FK on the BASE table,
-- and a broken embed reproduces A3-01 (withholdingUnresolvedMakers drops every
-- product). Asserting the columns one at a time cannot catch that; the join can.
INSERT INTO public.products (id, name, captured_at, status, layer, vendor_id)
VALUES ('9d555000-0000-4000-8000-000000000001'::uuid, 'p555 test piece', NOW(),
        'published', 'catalog', 'bd555000-0000-4000-8000-000000000001'::uuid)
ON CONFLICT (id) DO NOTHING;

-- The admin grant behind profiles_select_admin. Resolved by DOMAIN, never by a
-- seeded uuid — the seed's role ids are not a contract.
INSERT INTO public.user_roles (user_id, role_id)
SELECT 'ad000000-0000-4000-8000-000000000006'::uuid, r.id
  FROM public.roles r WHERE r.domain = 'admin' ORDER BY r.name LIMIT 1
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = 'ad000000-0000-4000-8000-000000000006' AND r.domain = 'admin'
  ), 'FIXTURE: no admin-domain role row for Adm — case 2k would be meaningless';
END $$;

-- ─── helpers (same shape as products_three_layer_test.sql) ─────────────────

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.assume_anon()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_anon() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.assume_service_role()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  EXECUTE 'SET LOCAL ROLE service_role';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_service_role() TO PUBLIC;

-- agent_reader is a NOLOGIN privilege role (docs/agent-os/agent-roles-runbook.md)
-- with no JWT of its own — Agent-OS reads assume it directly, so the helper does
-- not set request.jwt.claims.
CREATE OR REPLACE FUNCTION pg_temp.assume_agent_reader()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  EXECUTE 'SET LOCAL ROLE agent_reader';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_agent_reader() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── 1. ACL state ──────────────────────────────────────────────────────────

DO $$
DECLARE
  v_priv text;
  -- MAINTAIN is PG 17. An enumerated REVOKE that omits it silently leaves it
  -- behind, which is why the migration uses REVOKE ALL PRIVILEGES.
  v_all  text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','REFERENCES','TRIGGER','TRUNCATE','MAINTAIN'];
BEGIN
  FOREACH v_priv IN ARRAY v_all LOOP
    ASSERT NOT has_table_privilege('anon'::name, 'public.profiles'::regclass, v_priv),
      format('anon must hold no %s on profiles', v_priv);
    ASSERT NOT has_table_privilege('anon'::name, 'public.notification_preferences'::regclass, v_priv),
      format('anon must hold no %s on notification_preferences', v_priv);
  END LOOP;

  -- authenticated keeps its reads, loses the DELETE it never had a policy for
  ASSERT has_table_privilege('authenticated'::name, 'public.profiles'::regclass, 'SELECT'),
    'authenticated must keep SELECT on profiles';
  ASSERT NOT has_table_privilege('authenticated'::name, 'public.profiles'::regclass, 'DELETE'),
    'authenticated must not hold DELETE on profiles';
  ASSERT has_table_privilege('authenticated'::name, 'public.notification_preferences'::regclass, 'SELECT'),
    'authenticated must keep SELECT on notification_preferences';
  ASSERT has_table_privilege('service_role'::name, 'public.profiles'::regclass, 'SELECT'),
    'service_role must keep SELECT on profiles';

  -- vendors: table-level SELECT replaced by a column allowlist
  ASSERT NOT has_table_privilege('anon'::name, 'public.vendors'::regclass, 'INSERT'),
    'anon must not hold INSERT on vendors';
  ASSERT NOT has_table_privilege('anon'::name, 'public.vendors'::regclass, 'UPDATE'),
    'anon must not hold UPDATE on vendors';
  ASSERT NOT has_table_privilege('anon'::name, 'public.vendors'::regclass, 'DELETE'),
    'anon must not hold DELETE on vendors';
  ASSERT NOT has_table_privilege('anon'::name, 'public.vendors'::regclass, 'MAINTAIN'),
    'anon must not hold MAINTAIN on vendors';

  ASSERT has_column_privilege('anon'::name, 'public.vendors'::regclass, 'id',          'SELECT'),
    'anon must keep vendors.id (the products embed is a lateral join on it)';
  ASSERT has_column_privilege('anon'::name, 'public.vendors'::regclass, 'name',        'SELECT'),
    'anon must keep vendors.name';
  ASSERT has_column_privilege('anon'::name, 'public.vendors'::regclass, 'made_in',     'SELECT'),
    'anon must keep vendors.made_in (productSelect names it)';
  ASSERT has_column_privilege('anon'::name, 'public.vendors'::regclass, 'brand_story', 'SELECT'),
    'anon must keep vendors.brand_story (productSelect names it)';

  ASSERT NOT has_column_privilege('anon'::name, 'public.vendors'::regclass, 'notes',        'SELECT'),
    'anon must not read vendors.notes';
  ASSERT NOT has_column_privilege('anon'::name, 'public.vendors'::regclass, 'trade_terms',  'SELECT'),
    'anon must not read vendors.trade_terms';
  ASSERT NOT has_column_privilege('anon'::name, 'public.vendors'::regclass, 'contact_info', 'SELECT'),
    'anon must not read vendors.contact_info';
  ASSERT NOT has_column_privilege('anon'::name, 'public.vendors'::regclass, 'orders_email', 'SELECT'),
    'anon must not read vendors.orders_email';
  ASSERT has_column_privilege('authenticated'::name, 'public.vendors'::regclass, 'notes', 'SELECT'),
    'authenticated must keep the vendor trade file';

  -- the four SECURITY DEFINER views (they bypass profiles RLS by construction)
  ASSERT NOT has_table_privilege('anon'::name, 'public.user_engagement_scores'::regclass, 'SELECT'),
    'anon must not read user_engagement_scores (id, email, role)';
  ASSERT NOT has_table_privilege('anon'::name, 'public.consumer_funnel'::regclass,  'SELECT'),
    'anon must not read consumer_funnel';
  ASSERT NOT has_table_privilege('anon'::name, 'public.designer_funnel'::regclass,  'SELECT'),
    'anon must not read designer_funnel';
  ASSERT NOT has_table_privilege('anon'::name, 'public.conversion_funnel'::regclass,'SELECT'),
    'anon must not read conversion_funnel';
  ASSERT has_table_privilege('service_role'::name, 'public.user_engagement_scores'::regclass, 'SELECT'),
    'service_role must keep user_engagement_scores';

  -- anon must not out-rank authenticated anywhere here
  FOREACH v_priv IN ARRAY v_all LOOP
    ASSERT NOT (
      has_table_privilege('anon'::name, 'public.vendors'::regclass, v_priv)
      AND NOT has_table_privilege('authenticated'::name, 'public.vendors'::regclass, v_priv)
    ), format('anon holds %s on vendors while authenticated does not', v_priv);
  END LOOP;
END $$;

-- ─── 2. profiles row visibility ────────────────────────────────────────────

DO $$
DECLARE
  n INTEGER;
BEGIN
  -- 2a: Dana sees her own row.
  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  SELECT COUNT(*) INTO n FROM public.profiles WHERE id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT n = 1, 'FAIL 2a: Dana must see her own profile, got ' || n;

  -- 2b: Dana sees her rostered client.
  SELECT COUNT(*) INTO n FROM public.profiles WHERE id = 'c0000000-0000-4000-8000-000000000002';
  ASSERT n = 1, 'FAIL 2b: Dana must see her rostered client, got ' || n;

  -- 2c: Dana does NOT see an unrelated user.
  SELECT COUNT(*) INTO n FROM public.profiles WHERE id = 'a0000000-0000-4000-8000-000000000003';
  ASSERT n = 0, 'FAIL 2c: Dana must NOT see an unrelated profile, got ' || n;

  -- 2d: the org leg admits an INVITED co-member (is_studio_comember would not).
  SELECT COUNT(*) INTO n FROM public.profiles WHERE id = 'e0000000-0000-4000-8000-000000000004';
  ASSERT n = 1, 'FAIL 2d: an invited org co-member must be visible, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 2e: the roster is symmetric — Cleo sees Dana.
  PERFORM pg_temp.assume_user('c0000000-0000-4000-8000-000000000002');
  SELECT COUNT(*) INTO n FROM public.profiles WHERE id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT n = 1, 'FAIL 2e: a client must see their designer, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 2f: Mal, unrelated, sees only himself.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  SELECT COUNT(*) INTO n FROM public.profiles
   WHERE id IN ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002');
  ASSERT n = 0, 'FAIL 2f: an unrelated user must see neither party, got ' || n;
  SELECT COUNT(*) INTO n FROM public.profiles WHERE id = 'a0000000-0000-4000-8000-000000000003';
  ASSERT n = 1, 'FAIL 2f2: every user must see their own row, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 2g: the headline regression — anon sees nothing. anon holds no grant at
  --     all now, so the read raises 42501 rather than returning zero rows.
  PERFORM pg_temp.assume_anon();
  BEGIN
    SELECT COUNT(*) INTO n FROM public.profiles;
    ASSERT FALSE, 'FAIL 2g: anon read profiles and got ' || n || ' rows; expected insufficient_privilege';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- 2h: anon cannot read notification_preferences either.
  PERFORM pg_temp.assume_anon();
  BEGIN
    SELECT COUNT(*) INTO n FROM public.notification_preferences;
    ASSERT FALSE, 'FAIL 2h: anon read notification_preferences and got ' || n || ' rows';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- 2i: the owner still reaches their own preferences.
  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  SELECT COUNT(*) INTO n FROM public.notification_preferences
   WHERE user_id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT n = 1, 'FAIL 2i: owner must read own notification_preferences, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 2j: service_role is BYPASSRLS and still sees the whole table.
  PERFORM pg_temp.assume_service_role();
  SELECT COUNT(*) INTO n FROM public.profiles
   WHERE id IN ('d0000000-0000-4000-8000-000000000001',
                'c0000000-0000-4000-8000-000000000002',
                'a0000000-0000-4000-8000-000000000003');
  ASSERT n = 3, 'FAIL 2j: service_role must read every profile, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 2k: profiles_select_admin. Adm has no roster, project, thread or org tie to
  --     Mal, so the ONLY thing that can admit this read is the admin policy.
  --     The migration names this policy as what keeps use-audit-logs.ts:108,
  --     use-onboarding.ts:208/:242 and use-insights.ts:97 alive on the BROWSER
  --     client (anon key + user JWT), where service_role's bypass is not
  --     available. Asserting the policy's NAME cannot catch a policy whose
  --     predicate stops matching — public.roles and public.user_roles carry
  --     their own RLS, and either could change under someone else's migration
  --     and blank the admin portal with a green suite.
  PERFORM pg_temp.assume_user('ad000000-0000-4000-8000-000000000006');
  SELECT COUNT(*) INTO n FROM public.profiles
   WHERE id = 'a0000000-0000-4000-8000-000000000003';
  ASSERT n = 1, 'FAIL 2k: an admin-domain role holder must read an unrelated profile, got ' || n;
  SELECT COUNT(*) INTO n FROM public.profiles
   WHERE id IN ('d0000000-0000-4000-8000-000000000001',
                'c0000000-0000-4000-8000-000000000002',
                'f0000000-0000-4000-8000-000000000005');
  ASSERT n = 3, 'FAIL 2k2: the admin read must not be scoped to one row, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 2l: profiles_select_agent_reader. agent_reader read profiles ONLY through
  --     the dropped PUBLIC policy, so without this leg the whole Agent-OS read
  --     path loses profiles silently.
  PERFORM pg_temp.assume_agent_reader();
  SELECT COUNT(*) INTO n FROM public.profiles
   WHERE id = 'a0000000-0000-4000-8000-000000000003';
  ASSERT n = 1, 'FAIL 2l: agent_reader must read a profile, got ' || n;
  PERFORM pg_temp.reset_role();
END $$;

-- ─── 3. the tightened legs bite ────────────────────────────────────────────

DO $$
DECLARE
  n INTEGER;
BEGIN
  -- 3a: a status='new' lead must NOT admit the designer to the homeowner.
  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  SELECT COUNT(*) INTO n FROM public.profiles WHERE id = 'f0000000-0000-4000-8000-000000000005';
  ASSERT n = 0, 'FAIL 3a: a status=''new'' lead must not expose the homeowner, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 3b: accepting the lead admits her.
  UPDATE public.leads SET status = 'accepted'
   WHERE id = '1e555000-0000-4000-8000-000000000001'::uuid;
  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  SELECT COUNT(*) INTO n FROM public.profiles WHERE id = 'f0000000-0000-4000-8000-000000000005';
  ASSERT n = 1, 'FAIL 3b: an accepted lead must expose the homeowner, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 3c: put the lead back, then prove a REVOKED scan share does not admit her.
  UPDATE public.leads SET status = 'new'
   WHERE id = '1e555000-0000-4000-8000-000000000001'::uuid;

  INSERT INTO public.room_scan_associations
    (id, scan_id, consumer_id, designer_id, association_type, status, revoked_at, created_at, updated_at)
  VALUES ('a5555000-0000-4000-8000-000000000001'::uuid,
          '45555000-0000-4000-8000-000000000001'::uuid,
          'f0000000-0000-4000-8000-000000000005',
          'd0000000-0000-4000-8000-000000000001',
          'explicit', 'active', NOW(), NOW(), NOW())
  ON CONFLICT DO NOTHING;

  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  SELECT COUNT(*) INTO n FROM public.profiles WHERE id = 'f0000000-0000-4000-8000-000000000005';
  ASSERT n = 0, 'FAIL 3c: a REVOKED room-scan share must not expose the consumer, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 3d: un-revoke it and she becomes visible.
  UPDATE public.room_scan_associations SET revoked_at = NULL
   WHERE id = 'a5555000-0000-4000-8000-000000000001'::uuid;
  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  SELECT COUNT(*) INTO n FROM public.profiles WHERE id = 'f0000000-0000-4000-8000-000000000005';
  ASSERT n = 1, 'FAIL 3d: a live room-scan share must expose the consumer, got ' || n;
  PERFORM pg_temp.reset_role();
END $$;

-- ─── 4. anon WRITE attempts on notification_preferences ────────────────────
--
-- This is the half A3 could not exercise on prod (read-only lane). Here it is
-- exercised for real: every one of the three must fail on the grant, before
-- RLS is even consulted.

DO $$
DECLARE
  n INTEGER;
BEGIN
  PERFORM pg_temp.assume_anon();

  BEGIN
    INSERT INTO public.notification_preferences (user_id)
    VALUES ('a0000000-0000-4000-8000-000000000003');
    ASSERT FALSE, 'FAIL 4a: anon INSERTed a notification_preferences row';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.notification_preferences SET channels_email = FALSE;
    ASSERT FALSE, 'FAIL 4b: anon UPDATEd notification_preferences';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.notification_preferences;
    ASSERT FALSE, 'FAIL 4c: anon DELETEd from notification_preferences';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM pg_temp.reset_role();

  -- and the row is still there
  SELECT COUNT(*) INTO n FROM public.notification_preferences
   WHERE user_id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT n = 1, 'FAIL 4d: the preferences row did not survive the anon write attempts';
END $$;

-- ─── 5. vendors — anon reads the public face at ROW level ──────────────────
--
-- The ACL block above proves the column grants. This proves a real query
-- returns real rows: a column allowlist that forgot `id` would still pass the
-- ACL assertions while breaking every products embed.

DO $$
DECLARE
  n INTEGER;
  v_name text;
BEGIN
  PERFORM pg_temp.assume_anon();

  SELECT COUNT(*) INTO n FROM (
    SELECT id, name, made_in, brand_story FROM public.vendors
     WHERE id = 'bd555000-0000-4000-8000-000000000001'::uuid
  ) s;
  ASSERT n = 1, 'FAIL 5a: anon must read the public vendor columns, got ' || n;

  SELECT name INTO v_name FROM public.vendors
   WHERE id = 'bd555000-0000-4000-8000-000000000001'::uuid;
  ASSERT v_name = 'Test Maker Co', 'FAIL 5b: anon got the wrong vendor name: ' || COALESCE(v_name, '<null>');

  BEGIN
    PERFORM notes FROM public.vendors WHERE id = 'bd555000-0000-4000-8000-000000000001'::uuid;
    ASSERT FALSE, 'FAIL 5c: anon read vendors.notes';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM trade_terms FROM public.vendors WHERE id = 'bd555000-0000-4000-8000-000000000001'::uuid;
    ASSERT FALSE, 'FAIL 5d: anon read vendors.trade_terms';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- 5e: THE EMBED, as anon. This is the whole reason 00555 chose column grants
  --     over a vendor_cards view: ProductAPIClient's
  --     `*,vendors!products_vendor_id_fkey(name,made_in,brand_story)` resolves
  --     through the FK on the BASE table, and a view has no FK to resolve
  --     through. A broken embed reproduces A3-01 — withholdingUnresolvedMakers
  --     drops EVERY product and the marketplace renders empty for a guest.
  --     5a-5d assert the columns one at a time and cannot see that; only the
  --     join can, and until now it existed solely as prod probe 4, which runs
  --     AFTER the apply.
  SELECT COUNT(*) INTO n
    FROM public.products p
    JOIN public.vendors  v ON v.id = p.vendor_id
   WHERE p.id = '9d555000-0000-4000-8000-000000000001'::uuid;
  ASSERT n = 1, 'FAIL 5e: anon cannot join products to vendors — the iOS product embed is broken, got ' || n;

  SELECT v.name INTO v_name
    FROM public.products p
    JOIN public.vendors  v ON v.id = p.vendor_id
   WHERE p.id = '9d555000-0000-4000-8000-000000000001'::uuid;
  ASSERT v_name = 'Test Maker Co', 'FAIL 5e2: the embedded maker name did not resolve: ' || COALESCE(v_name, '<null>');

  PERFORM pg_temp.reset_role();
END $$;

-- ─── 6. profiles INSERT policy ─────────────────────────────────────────────

DO $$
DECLARE
  n          INTEGER;
  role_after TEXT;
BEGIN
  -- 6a: the anon leg is gone from the policy text.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
      AND polname  = 'Users can insert own profile'
      AND pg_get_expr(polwithcheck, polrelid) ILIKE '%auth.uid() IS NULL%'
  ), 'FAIL 6a: the anon leg of "Users can insert own profile" survived';

  -- 6b: anon cannot insert a profile at all (grant, then policy).
  PERFORM pg_temp.assume_anon();
  BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES ('99999999-9999-4999-8999-999999999999', 'p555-forged@test.invalid', 'designer');
    ASSERT FALSE, 'FAIL 6b: anon INSERTed a profiles row';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO n FROM public.profiles WHERE id = '99999999-9999-4999-8999-999999999999';
  ASSERT n = 0, 'FAIL 6c: a forged profile row exists';

  -- 6d: an authenticated user still cannot insert someone else's row.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  BEGIN
    INSERT INTO public.profiles (id, email, role)
    VALUES ('88888888-8888-4888-8888-888888888888', 'p555-other@test.invalid', 'client');
    ASSERT FALSE, 'FAIL 6d: an authenticated user inserted a profile for another id';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- 6e / 6f: the INSERT leg pins the same two columns the UPDATE leg does.
  --
  -- Case 7 closes self-elevation on UPDATE. The INSERT half is a separate door
  -- onto the same room: profiles.role's column DEFAULT is 'designer' and
  -- is_designer is nullable, so a row inserted with role omitted lands a
  -- designer, and a row inserted with is_designer = true lands designer
  -- AUTHORITY. The window is a live auth.users row with no profiles row —
  -- handle_new_user normally writes it, so this is narrow, but it is reachable
  -- through a partial delete-account or a backfill gap, and the section (a2)
  -- claim is about both columns, not only about UPDATE.
  --
  -- Both permissive INSERT policies matter: Postgres ORs the WITH CHECKs, so
  -- "Designers can create homeowner profiles" (00017) unpinned would OR around
  -- "Users can insert own profile" pinned. That second policy accepts ANY id,
  -- so the attempt below aims at a fresh one.
  --
  -- The two target ids get REAL auth.users rows whose trigger-made profiles row
  -- is then deleted, rather than being fabricated uuids. profiles_id_fkey would
  -- reject a fabricated uuid on its own and the case would pass without the
  -- policy doing any work — which is precisely the window this pair is about:
  -- a live auth.users row with no profiles row.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role)
  VALUES
    ('77777777-7777-4777-8777-777777777777', 'p555-mint@test.invalid',    '', NOW(), NOW(), NOW(),
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    ('76767676-7676-4676-8676-767676767676', 'p555-default@test.invalid', '', NOW(), NOW(), NOW(),
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  DELETE FROM public.profiles
   WHERE id IN ('77777777-7777-4777-8777-777777777777',
                '76767676-7676-4676-8676-767676767676');

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  BEGIN
    INSERT INTO public.profiles (id, email, role, is_designer)
    VALUES ('77777777-7777-4777-8777-777777777777', 'p555-mint@test.invalid',
            'homeowner', TRUE);
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO n FROM public.profiles
   WHERE id = '77777777-7777-4777-8777-777777777777';
  ASSERT n = 0,
    'FAIL 6e: an authenticated user inserted a profiles row carrying is_designer = true — '
    'designer authority is mintable through the INSERT leg';

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  BEGIN
    -- role omitted on purpose: the column DEFAULT is 'designer'.
    INSERT INTO public.profiles (id, email)
    VALUES ('76767676-7676-4676-8676-767676767676', 'p555-default@test.invalid');
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT role INTO role_after FROM public.profiles
   WHERE id = '76767676-7676-4676-8676-767676767676';
  ASSERT role_after IS NULL OR role_after = 'homeowner',
    'FAIL 6f: an authenticated user inserted a profiles row with role omitted and it '
    'landed as ' || COALESCE(role_after, '<null>') || ' — the column DEFAULT is ''designer''';
END $$;

-- ─── 7. self-elevation (was: profile_cards, cut from 00555) ────────────────
--
-- profile_cards was cut from the migration: no caller in the First Flight
-- program reads it, and a view with no reader is a future "why is this here".
-- Case 7 now covers the hole the migration closes instead — 00013 shipped
-- "Users can update own profile" as USING-only with no column restriction, so
-- an authenticated caller could raise their own profiles.role to 'designer'
-- AND their own profiles.is_designer to true. Both columns, both of the
-- table's permissive UPDATE policies, four routes in total: 7c (role, direct),
-- 7f (is_designer, direct), 7e (role, via a self-inserted designer_clients
-- row), 7f2 (is_designer, same row).

DO $$
DECLARE
  ok        BOOLEAN;
  name_now  TEXT;
  role_was  TEXT;
  role_now  TEXT;
  dsg_was   BOOLEAN;
  dsg_now   BOOLEAN;
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'profile_cards' AND relnamespace = 'public'::regnamespace
  ), 'FAIL 7a: profile_cards was cut from 00555 but exists — a stale apply?';

  -- 7b: the owner may still edit their own row.
  --
  -- This is not a formality. The first draft of the WITH CHECK pinned the role
  -- with an inline `SELECT role FROM public.profiles WHERE id = auth.uid()`,
  -- which is evaluated as the INVOKER and therefore re-enters profiles' own
  -- policies: every owner update died with `42P17 infinite recursion detected
  -- in policy for relation "profiles"`. The fix is the SECURITY DEFINER helper
  -- public.current_profile_role(). This case is that regression guard, so it
  -- asserts the row actually CHANGED rather than only that no error was raised.
  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  UPDATE public.profiles SET display_name = 'Dana H.'
   WHERE id = 'd0000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS ok = ROW_COUNT;
  ASSERT ok, 'FAIL 7b: the owner can no longer update their own profile';
  PERFORM pg_temp.reset_role();

  SELECT display_name INTO name_now FROM public.profiles
   WHERE id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT name_now = 'Dana H.',
    'FAIL 7b2: the owner''s own display_name write did not land, got ' || COALESCE(name_now, '<null>');

  -- 7c: but may NOT raise their own role.
  --
  -- Mal, not Dana: Dana is already 'designer' in the fixture, so asking her to
  -- set role='designer' is a no-op that any policy would allow and proves
  -- nothing. Mal is a 'homeowner', so this is a real elevation attempt — the
  -- exact vector A3-07's client-side remedy used to depend on.
  SELECT role INTO role_was FROM public.profiles
   WHERE id = 'a0000000-0000-4000-8000-000000000003';
  ASSERT role_was = 'homeowner',
    'FIXTURE 7c: Mal must start as a homeowner for the elevation to be real, got '
      || COALESCE(role_was, '<null>');

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  -- Either the WITH CHECK raises, or the update matches nothing; both are
  -- acceptable, a changed role is not.
  BEGIN
    UPDATE public.profiles SET role = 'designer'
     WHERE id = 'a0000000-0000-4000-8000-000000000003';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT role INTO role_now FROM public.profiles
   WHERE id = 'a0000000-0000-4000-8000-000000000003';
  ASSERT role_now IS NOT DISTINCT FROM role_was,
    'FAIL 7c: an authenticated user raised their own profiles.role from '
      || COALESCE(role_was, '<null>') || ' to ' || COALESCE(role_now, '<null>');

  -- 7f: and may not raise their own is_designer either — which is the half
  --     that actually matters.
  --
  -- profiles.role is a label; profiles.is_designer is AUTHORITY. It is the
  -- column claim_design_request and accept_design_request (00286, 00330) gate
  -- on, the column the open_design_requests view filters by in-body, the column
  -- design_request_submit (00285) validates a designer_id against, the column
  -- _can_manage_configurable_product reads, and the column this migration's own
  -- search_shareable_designers matches on (`p.is_designer IS TRUE`). A role pin
  -- with no is_designer pin closes the label and leaves the door: Mal PATCHes
  -- is_designer = true and walks into the design-request pool with role still
  -- reading 'homeowner'.
  SELECT is_designer INTO dsg_was FROM public.profiles
   WHERE id = 'a0000000-0000-4000-8000-000000000003';
  ASSERT dsg_was IS NOT TRUE,
    'FIXTURE 7f: Mal must start with is_designer not true for the elevation to be real, got '
      || COALESCE(dsg_was::text, '<null>');

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  BEGIN
    UPDATE public.profiles SET is_designer = TRUE
     WHERE id = 'a0000000-0000-4000-8000-000000000003';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT is_designer INTO dsg_now FROM public.profiles
   WHERE id = 'a0000000-0000-4000-8000-000000000003';
  ASSERT dsg_now IS NOT DISTINCT FROM dsg_was,
    'FAIL 7f: an authenticated user raised their own profiles.is_designer from '
      || COALESCE(dsg_was::text, '<null>') || ' to ' || COALESCE(dsg_now::text, '<null>')
      || ' — designer authority is self-servable';

  -- 7e: and may not reach the same elevation through the SIBLING policy.
  --
  -- profiles carries a SECOND permissive UPDATE policy, "Designers can update
  -- their client profiles" (00017:19). Postgres ORs the permissive WITH CHECKs
  -- for an UPDATE, and a policy with a NULL WITH CHECK reuses its own USING as
  -- the check — so as 00017 shipped it, a new row only had to satisfy ONE of
  -- the two policies and 7c's role pin was simply skipped.
  --
  -- The roster row that satisfies the sibling WAS self-servable:
  -- designer_clients' own policy is FOR ALL / TO PUBLIC / USING
  -- (auth.uid() = designer_id) with no WITH CHECK (00014:110), 00316's studio
  -- policy resolves is_studio_comember(designer_id) through a `p_owner =
  -- auth.uid()` self-branch, and authenticated holds INSERT. So the vector was
  -- two statements, not one, and 7c alone reported the hole closed while it was
  -- open.
  --
  -- 7e0: 00555 closes the mint itself, with a RESTRICTIVE policy on
  -- designer_clients. Mal is a homeowner; the INSERT must now be refused. This
  -- is asserted before the elevation attempts, because if the mint were still
  -- open the two cases below would be testing damage control rather than the
  -- fix.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  BEGIN
    INSERT INTO public.designer_clients (designer_id, client_id)
    VALUES ('a0000000-0000-4000-8000-000000000003',
            'a0000000-0000-4000-8000-000000000003');
    ASSERT FALSE,
      'FAIL 7e0: a homeowner minted a designer_clients row naming themselves as '
      'the designer — the primitive behind 7e/7f2/7h is still open';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- The roster row is now planted OUT of band (as the superuser running this
  -- script, which is RLS-exempt) so 7e and 7f2 still test what they were
  -- written to test: given a roster row by any means, the profiles UPDATE
  -- policies must still refuse the elevation. Belt and braces — 7e0 is the
  -- belt.
  INSERT INTO public.designer_clients (designer_id, client_id)
  VALUES ('a0000000-0000-4000-8000-000000000003',
          'a0000000-0000-4000-8000-000000000003')
  ON CONFLICT DO NOTHING;

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  BEGIN
    UPDATE public.profiles SET role = 'designer'
     WHERE id = 'a0000000-0000-4000-8000-000000000003';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT role INTO role_now FROM public.profiles
   WHERE id = 'a0000000-0000-4000-8000-000000000003';
  ASSERT role_now IS NOT DISTINCT FROM role_was,
    'FAIL 7e: a self-inserted designer_clients row let an authenticated user '
      || 'raise their own profiles.role from ' || COALESCE(role_was, '<null>')
      || ' to ' || COALESCE(role_now, '<null>')
      || ' — the sibling UPDATE policy has no WITH CHECK';

  -- 7f2: the same second statement, aimed at the column that carries authority.
  --
  -- The sibling's WITH CHECK pins role = 'homeowner', which is satisfied by an
  -- UPDATE that leaves role alone and raises is_designer instead — so 7f alone
  -- would have reported the door shut while this route was open. The roster row
  -- 7e inserted is still in the transaction; this is the second half of the
  -- same two-statement vector, with is_designer as the payload.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  BEGIN
    UPDATE public.profiles SET is_designer = TRUE
     WHERE id = 'a0000000-0000-4000-8000-000000000003';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT is_designer INTO dsg_now FROM public.profiles
   WHERE id = 'a0000000-0000-4000-8000-000000000003';
  ASSERT dsg_now IS NOT DISTINCT FROM dsg_was,
    'FAIL 7f2: a self-inserted designer_clients row let an authenticated user '
      || 'raise their own profiles.is_designer from ' || COALESCE(dsg_was::text, '<null>')
      || ' to ' || COALESCE(dsg_now::text, '<null>')
      || ' — the sibling UPDATE policy pins role but not designer authority';

  -- 7f3: the structural half of 7f/7f2 — BOTH permissive UPDATE policies must
  --      PIN is_designer in their WITH CHECK. A non-NULL polwithcheck (7e2)
  --      says nothing about which columns it pins, and — the trap these two
  --      cases fell into on their first pass — matching the column NAME says
  --      nothing about the comparison: `is_designer` is a substring of
  --      `current_profile_is_designer()`, so `AND
  --      public.current_profile_is_designer() IS NOT NULL`, which pins
  --      nothing at all, satisfied the earlier `ILIKE '%is_designer%'` form.
  --      Match the comparison instead. Postgres DEPARSES
  --      `a IS NOT DISTINCT FROM b` as `NOT (a IS DISTINCT FROM b)`, so both
  --      spellings are accepted — the source one is kept in the list so the
  --      line still reads as the pin it checks.
  ASSERT (
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%is_designer IS NOT DISTINCT FROM%'
        OR pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%NOT (is_designer IS DISTINCT FROM%'
    FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Users can update own profile'
  ), 'FAIL 7f3: "Users can update own profile" WITH CHECK does not pin is_designer to its current value';
  ASSERT (
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) ILIKE '%is_designer IS NOT TRUE%'
    FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Designers can update their client profiles'
  ), 'FAIL 7f4: "Designers can update their client profiles" WITH CHECK does not pin is_designer';

  -- 7f5: and the sibling's USING must read the OLD row's role/is_designer.
  --      A WITH CHECK pinned to the LITERALS role='homeowner' AND
  --      is_designer IS NOT TRUE is satisfied by construction when the caller
  --      is DEMOTING a designer — see 7h, which is the behaviour half.
  ASSERT (
    SELECT pg_get_expr(p.polqual, p.polrelid) ILIKE '%is_designer IS NOT TRUE%'
       AND pg_get_expr(p.polqual, p.polrelid) ILIKE '%role%homeowner%'
    FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Designers can update their client profiles'
  ), 'FAIL 7f5: "Designers can update their client profiles" USING does not read the OLD row''s role/is_designer — a rostered designer can be demoted';

  -- 7f6: the restrictive policies that close the mint (7e0's structural half).
  ASSERT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.designer_clients'::regclass
      AND p.polname  = 'designer_clients_writer_is_designer'
      AND NOT p.polpermissive AND p.polcmd = 'a'
  ), 'FAIL 7f6: designer_clients has no restrictive INSERT policy — any authenticated account can mint the roster row';
  ASSERT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.designer_clients'::regclass
      AND p.polname  = 'designer_clients_updater_is_designer'
      AND NOT p.polpermissive AND p.polcmd = 'w'
  ), 'FAIL 7f7: designer_clients has no restrictive UPDATE policy — a legacy roster row can be re-pointed by a non-designer';

  -- 7e2: the structural half. A future migration that re-creates the sibling
  -- without a WITH CHECK re-opens 7e, and 7e's own fixture (a self-roster row)
  -- is subtle enough to be lost in a rewrite. Assert the shape too.
  ASSERT (
    SELECT p.polwithcheck IS NOT NULL FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Designers can update their client profiles'
  ), 'FAIL 7e2: "Designers can update their client profiles" has no WITH CHECK, '
     'so it reuses its USING and bypasses the role pin on "Users can update own profile"';

  -- 7d: and the helper the policy leans on is closed to the anon key.
  ASSERT NOT has_function_privilege('anon'::name, 'public.current_profile_role()', 'EXECUTE'),
    'FAIL 7d: anon can execute current_profile_role';
  ASSERT has_function_privilege('authenticated'::name, 'public.current_profile_role()', 'EXECUTE'),
    'FAIL 7d2: authenticated cannot execute current_profile_role — the UPDATE policy denies every write';
  ASSERT (
    SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace nn ON nn.oid = p.pronamespace
    WHERE nn.nspname = 'public' AND p.proname = 'current_profile_role'
  ), 'FAIL 7d3: current_profile_role must be SECURITY DEFINER or the policy recurses again';

  -- 7g: and so is the is_designer helper, for the same three reasons.
  ASSERT NOT has_function_privilege('anon'::name, 'public.current_profile_is_designer()', 'EXECUTE'),
    'FAIL 7g: anon can execute current_profile_is_designer';
  ASSERT has_function_privilege('authenticated'::name, 'public.current_profile_is_designer()', 'EXECUTE'),
    'FAIL 7g2: authenticated cannot execute current_profile_is_designer — the UPDATE policy denies every write';
  ASSERT (
    SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace nn ON nn.oid = p.pronamespace
    WHERE nn.nspname = 'public' AND p.proname = 'current_profile_is_designer'
  ), 'FAIL 7g3: current_profile_is_designer must be SECURITY DEFINER or the policy recurses (42P17)';
END $$;

-- ─── 7h. the CROSS-ACCOUNT direction ───────────────────────────────────────
--
-- Every case above runs the attack at the attacker's OWN row: Mal tries to
-- promote Mal. The first fix round closed that and left the mirror image wide
-- open, because the sibling policy's WITH CHECK pinned the LITERALS
-- `role = 'homeowner' AND is_designer IS NOT TRUE` — which a DEMOTION satisfies
-- by construction. Reproduced over HTTP on a freshly-reset stack as the seeded
-- homeowner client@patina.dev:
--
--   POST  /rest/v1/designer_clients {designer_id: self, client_id: <Leah>} → 201
--   PATCH /rest/v1/profiles?id=eq.<Leah> {"role":"homeowner",
--                                        "is_designer":false}              → 204
--   PATCH /rest/v1/profiles?id=eq.<Leah> {"display_name":"PWNED",
--                                        "full_name":"PWNED"}              → 204
--   → designer|t|Leah Hartwell became homeowner|f|PWNED
--
-- That strips exactly the authority 00555 argues for — search_shareable_designers
-- (`p.is_designer IS TRUE`), open_design_requests, claim/accept_design_request —
-- and corrupts the name every surface renders. Mal is the attacker; Dana is the
-- victim and is a REAL designer (role='designer', is_designer=true), which is
-- the whole point: the literal pins can only be violated by a promotion, and
-- this is a demotion.
DO $$
DECLARE
  role_before  TEXT;
  role_after   TEXT;
  dsg_before   BOOLEAN;
  dsg_after    BOOLEAN;
  name_before  TEXT;
  name_after   TEXT;
BEGIN
  SELECT role, is_designer, display_name
    INTO role_before, dsg_before, name_before
    FROM public.profiles WHERE id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT role_before = 'designer' AND dsg_before IS TRUE,
    'FIXTURE 7h: Dana must be a real designer for the demotion to be real, got '
      || COALESCE(role_before, '<null>') || '/' || COALESCE(dsg_before::text, '<null>');

  -- 7h1: the mint, aimed at somebody else. Same refusal as 7e0 — this is the
  -- statement that made the whole chain reachable.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  BEGIN
    INSERT INTO public.designer_clients (designer_id, client_id)
    VALUES ('a0000000-0000-4000-8000-000000000003',
            'd0000000-0000-4000-8000-000000000001');
    ASSERT FALSE,
      'FAIL 7h1: a homeowner rostered a designer as their own client — one PATCH '
      'from demoting them';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Plant the row out of band, so 7h2/7h3 test the profiles policies rather
  -- than re-testing 7h1.
  INSERT INTO public.designer_clients (designer_id, client_id)
  VALUES ('a0000000-0000-4000-8000-000000000003',
          'd0000000-0000-4000-8000-000000000001')
  ON CONFLICT DO NOTHING;

  -- 7h2: the demotion.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  BEGIN
    UPDATE public.profiles
       SET role = 'homeowner', is_designer = FALSE
     WHERE id = 'd0000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT role, is_designer INTO role_after, dsg_after
    FROM public.profiles WHERE id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT role_after IS NOT DISTINCT FROM role_before
     AND dsg_after  IS NOT DISTINCT FROM dsg_before,
    'FAIL 7h2: a stranger demoted a designer through a roster row they wrote — '
      || COALESCE(role_before, '<null>') || '/' || COALESCE(dsg_before::text, '<null>')
      || ' became ' || COALESCE(role_after, '<null>') || '/'
      || COALESCE(dsg_after::text, '<null>');

  -- 7h3: and the rename, which is the half that shows on every surface.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  BEGIN
    UPDATE public.profiles
       SET display_name = 'PWNED', full_name = 'PWNED'
     WHERE id = 'd0000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT display_name INTO name_after
    FROM public.profiles WHERE id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT name_after IS NOT DISTINCT FROM name_before,
    'FAIL 7h3: a stranger rewrote a designer''s display_name through a roster row '
      || 'they wrote — ' || COALESCE(name_before, '<null>') || ' became '
      || COALESCE(name_after, '<null>');

  RAISE NOTICE '00555 cross-account profile-takeover assertions passed.';
END $$;

-- ─── 8. search_shareable_designers ─────────────────────────────────────────

DO $$
DECLARE
  n INTEGER;
BEGIN
  -- 8a: Mal, related to nobody, still finds Dana by name.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  SELECT COUNT(*) INTO n FROM public.search_shareable_designers('Dana')
   WHERE id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT n = 1, 'FAIL 8a: the RPC must find a designer the caller has no relationship with, got ' || n;

  -- 8b: it does not return non-designers.
  SELECT COUNT(*) INTO n FROM public.search_shareable_designers('Cleo');
  ASSERT n = 0, 'FAIL 8b: the RPC returned a non-designer, got ' || n;

  -- 8c: the two-character floor stops directory enumeration.
  SELECT COUNT(*) INTO n FROM public.search_shareable_designers('');
  ASSERT n = 0, 'FAIL 8c: an empty query enumerated the directory, got ' || n;
  SELECT COUNT(*) INTO n FROM public.search_shareable_designers('D');
  ASSERT n = 0, 'FAIL 8c2: a one-character query enumerated the directory, got ' || n;

  -- 8d: it never matches ON email, so it cannot confirm an address has an account.
  SELECT COUNT(*) INTO n FROM public.search_shareable_designers('p555-dana@test.invalid');
  ASSERT n = 0, 'FAIL 8d: the RPC matched on an email address, got ' || n;

  -- 8e: business_name is searchable (the picker's subtitle).
  SELECT COUNT(*) INTO n FROM public.search_shareable_designers('Ora Works')
   WHERE id = 'e0000000-0000-4000-8000-000000000004';
  ASSERT n = 1, 'FAIL 8e: the RPC must match on business_name, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 8f: closed to anon.
  PERFORM pg_temp.assume_anon();
  BEGIN
    SELECT COUNT(*) INTO n FROM public.search_shareable_designers('Dana');
    ASSERT FALSE, 'FAIL 8f: anon executed search_shareable_designers';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- 8g: the return shape carries no email column at all.
  ASSERT NOT EXISTS (
    SELECT 1
    FROM information_schema.parameters
    WHERE specific_schema = 'public'
      AND specific_name LIKE 'search_shareable_designers%'
      AND parameter_name = 'email'
  ), 'FAIL 8g: search_shareable_designers exposes an email column';

  -- 8h: a WILDCARD does not defeat the two-character floor. p_query is a
  --     parameter, so this was never injection — but '%' and '_' are wildcards
  --     INSIDE the pattern, and '%a' is two characters that match every name
  --     containing an 'a', which is exactly what the floor exists to prevent.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  SELECT COUNT(*) INTO n FROM public.search_shareable_designers('%a');
  ASSERT n = 0, 'FAIL 8h: a wildcard query enumerated the directory, got ' || n;
  SELECT COUNT(*) INTO n FROM public.search_shareable_designers('_a');
  ASSERT n = 0, 'FAIL 8h2: a single-char wildcard query enumerated the directory, got ' || n;

  -- 8i: and the escaping did not break ordinary matching.
  SELECT COUNT(*) INTO n FROM public.search_shareable_designers('Dana')
   WHERE id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT n = 1, 'FAIL 8i: escaping broke a plain name match, got ' || n;
  PERFORM pg_temp.reset_role();
END $$;

-- ─── 8b. list_vendor_profiles ──────────────────────────────────────────────
--
-- This is the RPC L0.2b's FF-01c swaps useVendorProfiles onto, and the reason
-- D8 orders the designer-portal deploy AHEAD of the apply. Unfixed, that hook
-- does not degrade to an empty list — it THROWS 42501 and every screen calling
-- it renders an error state. A cross-lane contract with no behavioural test is
-- the one that breaks quietly, so the shape is pinned here, not just the grant.

DO $$
DECLARE
  n    INTEGER;
  cols text;
BEGIN
  -- 8b-i: an authenticated caller gets the vendor-role rows.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  SELECT COUNT(*) INTO n FROM public.list_vendor_profiles()
   WHERE id = 'be000000-0000-4000-8000-000000000007';
  ASSERT n = 1, 'FAIL 8b-i: list_vendor_profiles did not return the vendor row, got ' || n;

  -- 8b-ii: and only vendor-role rows — not the designers or the client.
  SELECT COUNT(*) INTO n FROM public.list_vendor_profiles()
   WHERE id IN ('d0000000-0000-4000-8000-000000000001',
                'c0000000-0000-4000-8000-000000000002',
                'e0000000-0000-4000-8000-000000000004');
  ASSERT n = 0, 'FAIL 8b-ii: list_vendor_profiles returned a non-vendor, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 8b-iii: the return shape is exactly id / full_name / avatar_url. The hook
  --         destructures these three names; a fourth column would also be a new
  --         PII surface, since a profiles row carries email, phone and
  --         stripe_customer_id.
  --         Read off pg_proc, not information_schema.parameters: that view
  --         reports a TABLE function's output columns with parameter_mode 'OUT'
  --         (verified on this stack), and its specific_name carries the oid, so
  --         a LIKE match there is both wrong and brittle.
  SELECT string_agg(a.name, ',' ORDER BY a.ord) INTO cols
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace,
    LATERAL unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS a(name, mode, ord)
   WHERE n.nspname = 'public' AND p.proname = 'list_vendor_profiles'
     AND a.mode = 't';
  ASSERT cols = 'id,full_name,avatar_url',
    'FAIL 8b-iii: list_vendor_profiles return shape changed: ' || COALESCE(cols, '<null>');

  -- 8b-iv: closed to anon.
  PERFORM pg_temp.assume_anon();
  BEGIN
    SELECT COUNT(*) INTO n FROM public.list_vendor_profiles();
    ASSERT FALSE, 'FAIL 8b-iv: anon executed list_vendor_profiles';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();
END $$;

-- ─── 9. no FOR ALL / TO PUBLIC / auth.uid() IS NULL policy survives ────────

DO $$
DECLARE
  survivors text;
BEGIN
  SELECT string_agg(format('%s.%s: %s', n.nspname, c.relname, p.polname), '; ')
    INTO survivors
  FROM pg_policy p
  JOIN pg_class c     ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND p.polcmd = '*'
    AND p.polroles = '{0}'
    AND pg_get_expr(p.polqual, p.polrelid) = '(auth.uid() IS NULL)';

  ASSERT survivors IS NULL,
    'FAIL 9: FOR ALL / TO PUBLIC / auth.uid() IS NULL policies survived: ' || survivors;
END $$;

-- ─── 10. helper lockdown + the policy set ──────────────────────────────────

DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon'::name, 'public.can_view_profile(uuid)', 'EXECUTE'),
    'anon must not execute can_view_profile';
  ASSERT NOT has_function_privilege('public'::name, 'public.can_view_profile(uuid)', 'EXECUTE'),
    'PUBLIC must not execute can_view_profile';
  ASSERT has_function_privilege('authenticated'::name, 'public.can_view_profile(uuid)', 'EXECUTE'),
    'authenticated must execute can_view_profile (the policy calls it)';
  ASSERT NOT has_function_privilege('anon'::name, 'public.search_shareable_designers(text)', 'EXECUTE'),
    'anon must not execute search_shareable_designers';

  ASSERT (
    SELECT bool_and(p.prosecdef) FROM pg_proc p
    JOIN pg_namespace nn ON nn.oid = p.pronamespace
    WHERE nn.nspname = 'public'
      AND p.proname IN ('can_view_profile', 'search_shareable_designers',
                        'current_profile_role', 'current_profile_is_designer')
  ), 'every 00555 helper must be SECURITY DEFINER';

  ASSERT (
    SELECT bool_and('search_path=public' = ANY (COALESCE(p.proconfig, '{}')))
    FROM pg_proc p
    JOIN pg_namespace nn ON nn.oid = p.pronamespace
    WHERE nn.nspname = 'public'
      AND p.proname IN ('can_view_profile', 'search_shareable_designers',
                        'current_profile_role', 'current_profile_is_designer')
  ), 'every 00555 helper must pin search_path';

  -- all four SELECT policies present, none of them PUBLIC
  ASSERT (
    SELECT COUNT(*) FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass
      AND polname IN ('profiles_select_self', 'profiles_select_counterparty',
                      'profiles_select_admin', 'profiles_select_agent_reader')
  ) = 4, 'the four profiles SELECT policies are not all present';

  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.profiles'::regclass AND polcmd = 'r' AND polroles = '{0}'
  ), 'profiles still carries a PUBLIC SELECT policy';

  -- ── role self-elevation (added by the 2026-09-01 critique pass) ───────────
  -- 00013 shipped "Users can update own profile" as USING-only, with no column
  -- restriction, so any authenticated caller could set their own role to
  -- 'designer'. A3-07's client-side remedy depended on exactly that hole. 00555
  -- closes it; these two assertions are the regression guard.
  ASSERT (
    SELECT p.polwithcheck IS NOT NULL FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Users can update own profile'
  ), '"Users can update own profile" has no WITH CHECK — role self-elevation is open';

  ASSERT (
    SELECT pg_get_expr(p.polwithcheck, p.polrelid) LIKE '%role%' FROM pg_policy p
    WHERE p.polrelid = 'public.profiles'::regclass
      AND p.polname  = 'Users can update own profile'
  ), 'the WITH CHECK does not mention role — it does not pin it';

  -- Read the provider BRANCH and its DIRECTION, not the word. 00313's body
  -- already contains the literal 'homeowner' twice, so LIKE '%homeowner%'
  -- passes on the UNFIXED function; raw_app_meta_data appears nowhere in 00313,
  -- so it is the clean discriminator for the graft. `ELSE 'homeowner'` is the
  -- discriminator for the allowlist pointing the right way — the first cut of
  -- B2 shipped `ELSE 'designer'` and passed a graft-only guard while defaulting
  -- google, and every provider added later, to designer. Section 11 below is
  -- the behavioural half of this guard.
  ASSERT (
    SELECT pg_get_functiondef(p.oid) LIKE '%raw_app_meta_data%'
       AND pg_get_functiondef(p.oid) LIKE '%''email''%'
       AND pg_get_functiondef(p.oid) LIKE '%ELSE ''homeowner''%'
       AND pg_get_functiondef(p.oid) NOT LIKE '%ELSE ''designer''%'
    FROM pg_proc p JOIN pg_namespace nn ON nn.oid = p.pronamespace
    WHERE nn.nspname = 'public' AND p.proname = 'handle_new_user'
  ), 'handle_new_user() does not default an unknown identity provider to homeowner (ruling B2)';

  ASSERT NOT has_table_privilege('authenticated'::name, 'public.profiles'::regclass, 'DELETE'),
    'authenticated still holds DELETE on profiles';

  RAISE NOTICE '00555 security assertions passed.';
END $$;

-- ─── 11. handle_new_user's default role follows the identity provider ──────
--
-- 00555 §a2(ii), RULING B2 (Fable, 2026-09-02). 00313 shipped
-- COALESCE(v_role, 'designer'), so an Apple sign-up — which carries no creation
-- metadata at all, because supabase-swift's signInWithIdToken has no data:
-- parameter — landed as a DESIGNER. A3-07's client-side remedy (the app writing
-- its own role after sign-in) depended on the self-elevation hole case 7
-- closes, so the default has to move to the server or the app cannot stop
-- writing its own role.
--
-- B2's shape matters as much as its direction, and the DIRECTION is what the
-- first cut got wrong. Flipping the one constant to 'homeowner' would have
-- fixed the iOS path and broken the designer portal's own self-signup, which
-- also sends no role — so the default is read from raw_app_meta_data, which
-- GoTrue writes and a client cannot. But `WHEN provider='apple' … ELSE
-- 'designer'` is an allowlist pointed at the PRIVILEGED value: it left
-- AuthService.signInWithGoogle (:399-421, the second button on the same Welcome
-- screen, and equally metadata-less — signInWithOAuth takes no `data:`) landing
-- as a designer, which is A3-07 verbatim, and handed the same bug to every
-- provider added later. The allowlist now names the ONE surface that keeps the
-- privileged value:
--   email, and only email → designer   (the portal's own self-signup page)
--   anything else         → homeowner  (apple, google, any OAuth added later,
--                                       and a row with no raw_app_meta_data)
--   an explicit 'homeowner' hint still wins, on any provider.
--
-- These are BEHAVIOUR cases on purpose. The catalog assertion in section 10 is
-- a text match on the function definition; it can only prove the token is
-- there. Only an actual auth.users INSERT proves the trigger writes the role.
--
-- Both legs of the provider read are exercised: 11a carries the
-- {"provider": …, "providers": […]} pair GoTrue writes at signup, 11e carries
-- only the `providers` array (the non-deprecated half), and both land homeowner.
-- 11f and 11g are the two rows that passed silently as designer before the
-- direction was corrected.

DO $$
DECLARE
  v_role text;
BEGIN
  -- 11a: the Apple id-token path — the one that broke.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role, raw_app_meta_data)
  VALUES ('b0000000-0000-4000-8000-00000000f001', 'p555-apple@test.invalid', '', NOW(), NOW(), NOW(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '{"provider":"apple","providers":["apple"]}'::jsonb);
  SELECT role INTO v_role FROM public.profiles WHERE id = 'b0000000-0000-4000-8000-00000000f001';
  ASSERT v_role = 'homeowner',
    'FAIL 11a: an Apple signup must land as homeowner, got ' || COALESCE(v_role, '<null>');

  -- 11b: the designer portal's own self-signup — email provider, no role in
  --      raw_user_meta_data (auth/signup/page.tsx:147-157 sends name, company
  --      and phone only). It must STAY a designer, which is the whole reason
  --      B2 is provider-shaped rather than a flipped constant.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES ('b0000000-0000-4000-8000-00000000f002', 'p555-portal@test.invalid', '', NOW(), NOW(), NOW(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{"name":"Portal Designer","company":"Hart Studio"}'::jsonb);
  SELECT role INTO v_role FROM public.profiles WHERE id = 'b0000000-0000-4000-8000-00000000f002';
  ASSERT v_role = 'designer',
    'FAIL 11b: an email signup with no role hint must stay a designer, got '
      || COALESCE(v_role, '<null>');

  -- 11c: the explicit client hint the iOS app sends still wins, on any provider
  --      (AuthService.swift:437 and :563 both send role: "homeowner").
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES ('b0000000-0000-4000-8000-00000000f003', 'p555-hinted@test.invalid', '', NOW(), NOW(), NOW(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{"role":"homeowner"}'::jsonb);
  SELECT role INTO v_role FROM public.profiles WHERE id = 'b0000000-0000-4000-8000-00000000f003';
  ASSERT v_role = 'homeowner',
    'FAIL 11c: an explicit homeowner hint must be honored, got ' || COALESCE(v_role, '<null>');

  -- 11d: 00313's security rule survives the change — raw_user_meta_data is
  --      CLIENT-CONTROLLED, so a forged elevated hint must be ignored and fall
  --      through to the PROVIDER default, NOT be written as given.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES ('b0000000-0000-4000-8000-00000000f004', 'p555-forger@test.invalid', '', NOW(), NOW(), NOW(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '{"provider":"apple","providers":["apple"]}'::jsonb,
          '{"role":"super_admin"}'::jsonb);
  SELECT role INTO v_role FROM public.profiles WHERE id = 'b0000000-0000-4000-8000-00000000f004';
  ASSERT v_role = 'homeowner',
    'FAIL 11d: a forged role hint must be ignored, got ' || COALESCE(v_role, '<null>');

  -- 11e: the second leg of the provider read. GoTrue's own source marks the
  --      `provider` scalar deprecated, and an account that links a second
  --      identity accumulates names in `providers` while `provider` keeps the
  --      first. A row carrying only the array must still resolve homeowner.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role, raw_app_meta_data)
  VALUES ('b0000000-0000-4000-8000-00000000f005', 'p555-apple2@test.invalid', '', NOW(), NOW(), NOW(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '{"providers":["apple"]}'::jsonb);
  SELECT role INTO v_role FROM public.profiles WHERE id = 'b0000000-0000-4000-8000-00000000f005';
  ASSERT v_role = 'homeowner',
    'FAIL 11e: a providers-array-only Apple signup must land as homeowner, got '
      || COALESCE(v_role, '<null>');

  -- 11f: the Google button, which is the case the first cut of B2 missed.
  --      AuthService.signInWithGoogle ships beside the Apple button on the
  --      Patina Welcome screen (ContentView.swift:48, AuthSheet.swift:59) and
  --      signInWithOAuth carries no `data:` parameter, so a Google sign-up is
  --      exactly as metadata-less as an Apple one. Under `ELSE 'designer'` this
  --      row landed as a designer and no test in the file noticed.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role, raw_app_meta_data)
  VALUES ('b0000000-0000-4000-8000-00000000f006', 'p555-google@test.invalid', '', NOW(), NOW(), NOW(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '{"provider":"google","providers":["google"]}'::jsonb);
  SELECT role INTO v_role FROM public.profiles WHERE id = 'b0000000-0000-4000-8000-00000000f006';
  ASSERT v_role = 'homeowner',
    'FAIL 11f: a Google signup must land as homeowner — the allowlist names the '
      || 'provider that keeps ''designer'', not the ones that lose it. Got '
      || COALESCE(v_role, '<null>');

  -- 11g: no raw_app_meta_data at all. GoTrue always writes the pair, so this is
  --      a shape that should not occur — which is the reason to pin it: an
  --      unrecognised row must fall to the UNPRIVILEGED side, not inherit
  --      designer authority from a bare ELSE.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role)
  VALUES ('b0000000-0000-4000-8000-00000000f007', 'p555-nometa@test.invalid', '', NOW(), NOW(), NOW(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  SELECT role INTO v_role FROM public.profiles WHERE id = 'b0000000-0000-4000-8000-00000000f007';
  ASSERT v_role = 'homeowner',
    'FAIL 11g: a signup with no raw_app_meta_data must land as homeowner, got '
      || COALESCE(v_role, '<null>');

  -- 11h: an account that names email ALONGSIDE another provider is not the
  --      portal's self-signup and does not get the designer default.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role, raw_app_meta_data)
  VALUES ('b0000000-0000-4000-8000-00000000f008', 'p555-linked@test.invalid', '', NOW(), NOW(), NOW(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '{"provider":"email","providers":["email","google"]}'::jsonb);
  SELECT role INTO v_role FROM public.profiles WHERE id = 'b0000000-0000-4000-8000-00000000f008';
  ASSERT v_role = 'homeowner',
    'FAIL 11h: a linked-identity row naming a second provider must land as homeowner, got '
      || COALESCE(v_role, '<null>');

  RAISE NOTICE '00555 handle_new_user behaviour assertions passed.';
END $$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
