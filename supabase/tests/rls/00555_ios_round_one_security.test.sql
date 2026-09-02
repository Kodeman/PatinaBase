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
--      no permissive INSERT policy will accept is_designer=true (6e); and the
--      own-row leg no longer pins role at all (6f, ruling B2 v3(a)/RF2-07),
--      because role is a label and pinning it made the policy guess.
--   7. self-elevation — the owner may edit their row, may NOT raise their role
--      (7c/7e) or their is_designer (7f/7f2) on either permissive UPDATE
--      policy, and MAY perform the one-way self-DOWNGRADE ruling B2 v3(c)
--      grants (7i: role → 'homeowner' lands, is_designer → true still refused).
--      The roster row that used to reach the sibling policy can no longer be
--      minted at all (7e0), and after RF2-01 it cannot be minted by an
--      email/password self-signup carrying the label 'designer' either (7j).
--      Both WITH CHECKs pin the is_designer COMPARISON, not merely name the
--      column (7f3/7f4), and the sibling's USING reads the OLD row (7f5).
--      is_designer is the one that carries AUTHORITY: 00286/00330/00285 and
--      search_shareable_designers all gate on it, not on role.
--      7h runs the CROSS-ACCOUNT direction — the attacker rosters somebody
--      ELSE and tries to demote and rename them. 7k is the legitimate designer
--      path the whole section must not break: a real designer mints a roster
--      row and renames a rostered client, including one labelled 'client'
--      rather than 'homeowner' (ruling B2 v3(e)). (profile_cards was CUT from
--      00555; 7a asserts it is absent.)
--   8. search_shareable_designers — finds by name, never returns email,
--      enforces the 2-char floor including against a WILDCARD query (8h),
--      and the LIMIT, closed to anon.
--   8b. list_vendor_profiles — returns vendor-role rows and only those, in
--      exactly the id/full_name/avatar_url shape L0.2b's hook destructures,
--      closed to anon.
--   9. No FOR ALL / TO PUBLIC / auth.uid() IS NULL policy survives in public.
--  10. Helper lockdown, and the policy set by NAME (which is a shape check, not
--      a behaviour check — sections 2 and 8 are the behaviour). Also the ACL
--      changes fix round 3 added: anon holds nothing on designer_clients
--      (RF2-08), authenticated holds no TRUNCATE/REFERENCES on profiles
--      (RF2-09), handle_new_user is not EXECUTEable by PUBLIC or anon
--      (RF2-10), and all five helpers pin `search_path=public, pg_temp`
--      (RF2-11).
--  11. handle_new_user's default role — ruling B2 v3(a): UNCHANGED from 00313.
--      Every signup with no honored 'homeowner' hint lands 'designer',
--      whatever provider it came in on.
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
-- Sig   = the shape handle_new_user gives an email/password self-signup:
--         role = 'designer' (the label), is_designer FALSE, and NO user_roles
--         grant in the designer or admin domain. Ruling B2 v3(b) says this
--         account has no authority, and case 7j is what proves it — fix round
--         2's roster predicate admitted exactly this row.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('d0000000-0000-4000-8000-000000000001', 'p555-dana@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c0000000-0000-4000-8000-000000000002', 'p555-cleo@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000003', 'p555-mal@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e0000000-0000-4000-8000-000000000004', 'p555-ora@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f0000000-0000-4000-8000-000000000005', 'p555-nyx@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('ad000000-0000-4000-8000-000000000006', 'p555-adm@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('be000000-0000-4000-8000-000000000007', 'p555-ven@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('51000000-0000-4000-8000-000000000008', 'p555-sig@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, display_name, full_name, business_name, avatar_url, role, is_designer, phone, stripe_customer_id, created_at, updated_at)
VALUES
  ('d0000000-0000-4000-8000-000000000001', 'p555-dana@test.invalid', 'Dana', 'Dana Designer', 'Dana Studio Ltd', 'https://img.invalid/d.png', 'designer',  TRUE,  '555-0001', 'cus_test_dana', NOW(), NOW()),
  ('c0000000-0000-4000-8000-000000000002', 'p555-cleo@test.invalid', 'Cleo', 'Cleo Client',   NULL,              'https://img.invalid/c.png', 'client',    FALSE, '555-0002', 'cus_test_cleo', NOW(), NOW()),
  ('a0000000-0000-4000-8000-000000000003', 'p555-mal@test.invalid',  'Mal',  'Mal Unrelated', NULL,              NULL,                        'homeowner', FALSE, '555-0003', NULL,            NOW(), NOW()),
  ('e0000000-0000-4000-8000-000000000004', 'p555-ora@test.invalid',  'Ora',  'Ora Invited',   'Ora Works',       NULL,                        'designer',  TRUE,  '555-0004', NULL,            NOW(), NOW()),
  ('f0000000-0000-4000-8000-000000000005', 'p555-nyx@test.invalid',  'Nyx',  'Nyx Newlead',   NULL,              NULL,                        'homeowner', FALSE, '555-0005', NULL,            NOW(), NOW()),
  ('ad000000-0000-4000-8000-000000000006', 'p555-adm@test.invalid',  'Adm',  'Adm Admin',     NULL,              NULL,                        'admin',     FALSE, '555-0006', NULL,            NOW(), NOW()),
  ('be000000-0000-4000-8000-000000000007', 'p555-ven@test.invalid',  'Ven',  'Ven Vendor',    'Ven Supply Co',   'https://img.invalid/v.png', 'vendor',    FALSE, '555-0007', NULL,            NOW(), NOW()),
  ('51000000-0000-4000-8000-000000000008', 'p555-sig@test.invalid',  'Sig',  'Sig Selfsignup', 'Sig Interiors',  NULL,                        'designer',  FALSE, '555-0008', NULL,            NOW(), NOW())
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

  -- Sig must be the self-signup shape or 7j proves nothing. handle_new_user
  -- gives her the 'app_user' grant (consumer domain) on the auth.users insert
  -- above; what she must NOT have is a designer- or admin-domain one.
  ASSERT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = '51000000-0000-4000-8000-000000000008'
      AND role = 'designer' AND is_designer IS NOT TRUE
  ), 'FIXTURE: Sig must carry the label ''designer'' with is_designer false — case 7j would be meaningless';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = '51000000-0000-4000-8000-000000000008'
      AND r.domain IN ('designer', 'admin')
  ), 'FIXTURE: Sig must hold no designer/admin user_roles grant — case 7j would be meaningless';
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

  -- 6e / 6f: the INSERT leg pins the AUTHORITY column, and ONLY that one.
  --
  -- Case 7 closes self-elevation on UPDATE. The INSERT half is a separate door
  -- onto the same room: is_designer is nullable, so a row inserted with
  -- is_designer = true lands designer AUTHORITY. The window is a live
  -- auth.users row with no profiles row — handle_new_user normally writes it,
  -- so this is narrow, but it is reachable through a partial delete-account or
  -- a backfill gap.
  --
  -- 6f is the INVERSE of what it asserted in fix round 2. That round pinned
  -- role = 'homeowner' on this policy too; ruling B2 v3(a) took the pin out
  -- (RF2-07), because profiles.role is a label and pinning it forced the policy
  -- to guess which label a row was entitled to. 6f now asserts the own-row
  -- INSERT lands with the column DEFAULT intact and the write is NOT refused.
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

  -- 6f: the own-row INSERT leg does NOT pin role (ruling B2 v3(a), RF2-07).
  --     The caller inserts THEIR OWN row with role omitted; the column DEFAULT
  --     'designer' applies and the write must LAND. Fix round 2's pin would
  --     have refused this, which is the regression this case guards: a user
  --     whose profiles row was lost could not re-create it, and every honest
  --     label the product uses ('designer', 'vendor', 'client') was
  --     unreachable through a policy that only ever admitted 'homeowner'.
  PERFORM pg_temp.assume_user('76767676-7676-4676-8676-767676767676');
  INSERT INTO public.profiles (id, email)
  VALUES ('76767676-7676-4676-8676-767676767676', 'p555-default@test.invalid');
  PERFORM pg_temp.reset_role();

  SELECT role INTO role_after FROM public.profiles
   WHERE id = '76767676-7676-4676-8676-767676767676';
  ASSERT role_after = 'designer',
    'FAIL 6f: the own-row INSERT with role omitted did not land the column DEFAULT — got '
    || COALESCE(role_after, '<null>') || '. Ruling B2 v3(a) says this leg pins is_designer only';

  -- 6f2: and it still refuses the AUTHORITY column on the caller's own row.
  DELETE FROM public.profiles WHERE id = '76767676-7676-4676-8676-767676767676';
  PERFORM pg_temp.assume_user('76767676-7676-4676-8676-767676767676');
  BEGIN
    INSERT INTO public.profiles (id, email, is_designer)
    VALUES ('76767676-7676-4676-8676-767676767676', 'p555-default@test.invalid', TRUE);
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO n FROM public.profiles
   WHERE id = '76767676-7676-4676-8676-767676767676';
  ASSERT n = 0,
    'FAIL 6f2: a caller inserted their OWN profiles row carrying is_designer = true';
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

  -- 7i: the one write the ratchet ALLOWS — ruling B2 v3(c).
  --
  -- 7c/7f prove role and is_designer cannot go UP. This proves they can go
  -- DOWN, which is not a nicety: it is A3-07's fix. An Apple/Google sign-up
  -- lands profiles.role = 'designer' (handle_new_user, unchanged since 00013),
  -- and supabase-swift's signInWithIdToken / signInWithOAuth carry no `data:`
  -- parameter, so the app cannot send the 'homeowner' hint the email path
  -- sends. The app therefore corrects its own row after sign-in — W1 · L1-A,
  -- contract in build/waves/w1/l1-a-notes.md. Without this leg the app would
  -- need the wide-open USING-only policy 00013 shipped.
  --
  -- Dana is the subject: she is a real designer (role='designer',
  -- is_designer=t), so the downgrade is a real state change in the direction
  -- that would matter. It is also the reason the leg is safe — a designer who
  -- relabels themselves loses a word, not an authority: is_designer is pinned
  -- against rising, and 7i3 proves it.
  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  UPDATE public.profiles SET role = 'homeowner'
   WHERE id = 'd0000000-0000-4000-8000-000000000001';
  PERFORM pg_temp.reset_role();

  SELECT role INTO role_now FROM public.profiles
   WHERE id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT role_now = 'homeowner',
    'FAIL 7i: the owner''s self-DOWNGRADE to homeowner did not land, got '
      || COALESCE(role_now, '<null>') || ' — ruling B2 v3(c) is what A3-07''s fix stands on';

  -- 7i2: and it is idempotent, because the app runs it after every sign-in.
  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  UPDATE public.profiles SET role = 'homeowner'
   WHERE id = 'd0000000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS ok = ROW_COUNT;
  PERFORM pg_temp.reset_role();
  ASSERT ok, 'FAIL 7i2: the second self-downgrade was refused — the app''s write is not idempotent';

  -- 7i3: the ratchet only turns one way. Dana is now labelled 'homeowner';
  --      she may not put 'designer' back, and she may not raise is_designer.
  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.profiles SET role = 'designer'
     WHERE id = 'd0000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT role INTO role_now FROM public.profiles
   WHERE id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT role_now = 'homeowner',
    'FAIL 7i3: the owner climbed back up the ratchet — role is now '
      || COALESCE(role_now, '<null>');

  -- restore Dana for 7h and section 8, both of which need a real designer.
  UPDATE public.profiles SET role = 'designer'
   WHERE id = 'd0000000-0000-4000-8000-000000000001';

  -- 7i4: is_designer may fall too, and only fall. Ora is the subject — she is
  --      is_designer = t and is not used as a designer by any later case.
  PERFORM pg_temp.assume_user('e0000000-0000-4000-8000-000000000004');
  UPDATE public.profiles SET is_designer = FALSE
   WHERE id = 'e0000000-0000-4000-8000-000000000004';
  PERFORM pg_temp.reset_role();

  SELECT is_designer INTO dsg_now FROM public.profiles
   WHERE id = 'e0000000-0000-4000-8000-000000000004';
  ASSERT dsg_now IS FALSE,
    'FAIL 7i4: the owner''s self-downgrade of is_designer did not land, got '
      || COALESCE(dsg_now::text, '<null>');

  PERFORM pg_temp.assume_user('e0000000-0000-4000-8000-000000000004');
  BEGIN
    UPDATE public.profiles SET is_designer = TRUE
     WHERE id = 'e0000000-0000-4000-8000-000000000004';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT is_designer INTO dsg_now FROM public.profiles
   WHERE id = 'e0000000-0000-4000-8000-000000000004';
  ASSERT dsg_now IS FALSE,
    'FAIL 7i5: the owner raised is_designer back to true — the ratchet turns both ways';

  UPDATE public.profiles SET is_designer = TRUE
   WHERE id = 'e0000000-0000-4000-8000-000000000004';

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

-- ─── 7j. the roster mint, aimed at the account fix round 2 let through ─────
--
-- RF2-01, ruling B2 v3(b). Fix round 2's restrictive predicate was
--   current_profile_is_designer() IS TRUE
--   OR current_profile_role() IN ('designer','admin','super_admin')
-- and its stated reason was that a portal self-signup carries role = 'designer'
-- before any grant lands, so an is_designer-only test would lock a real
-- designer out of Add Client. The problem is that handle_new_user gives EVERY
-- email/password signup that label (00313, kept by ruling B2 v3(a)) — so the
-- role leg reads "anyone who completed a signup form may mint a roster row",
-- which is the primitive the restrictive policy exists to close.
--
-- Sig is that account exactly: role = 'designer', is_designer false, no
-- designer- or admin-domain grant. 7e0 could not catch this — Mal is a
-- 'homeowner', so he failed the role leg too and the case passed while the hole
-- was open.
DO $$
DECLARE
  n INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('51000000-0000-4000-8000-000000000008');
  BEGIN
    INSERT INTO public.designer_clients (designer_id, client_id)
    VALUES ('51000000-0000-4000-8000-000000000008',
            'd0000000-0000-4000-8000-000000000001');
    ASSERT FALSE,
      'FAIL 7j: an email/password self-signup carrying the LABEL ''designer'' minted a '
      'roster row naming a real designer as its client — ruling B2 v3(b) says authority '
      'is user_roles or is_designer, never profiles.role';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO n FROM public.designer_clients
   WHERE designer_id = '51000000-0000-4000-8000-000000000008';
  ASSERT n = 0, 'FAIL 7j2: a roster row exists for the self-signup account';

  -- 7j3: and the same account cannot re-point an existing row either. Plant one
  --      out of band (this script runs as the RLS-exempt superuser) and try.
  INSERT INTO public.designer_clients (id, designer_id, client_id, status)
  VALUES ('dc555000-0000-4000-8000-000000000099',
          '51000000-0000-4000-8000-000000000008',
          'a0000000-0000-4000-8000-000000000003', 'active')
  ON CONFLICT DO NOTHING;

  PERFORM pg_temp.assume_user('51000000-0000-4000-8000-000000000008');
  BEGIN
    UPDATE public.designer_clients
       SET client_id = 'd0000000-0000-4000-8000-000000000001'
     WHERE id = 'dc555000-0000-4000-8000-000000000099';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO n FROM public.designer_clients
   WHERE id = 'dc555000-0000-4000-8000-000000000099'
     AND client_id = 'd0000000-0000-4000-8000-000000000001';
  ASSERT n = 0,
    'FAIL 7j3: the self-signup account re-pointed a roster row at a real designer';

  DELETE FROM public.designer_clients WHERE id = 'dc555000-0000-4000-8000-000000000099';

  RAISE NOTICE '00555 self-signup roster-mint assertions passed.';
END $$;

-- ─── 7k. the LEGITIMATE designer path, which none of the above may break ───
--
-- Every case from 7e0 to 7j is a refusal, and a policy that refuses everything
-- passes all of them. This is the other half: a real designer mints a roster
-- row, and renames a rostered client whose role says 'client' rather than
-- 'homeowner' (ruling B2 v3(e), finding RF2-06 — with the single literal in the
-- USING clause this PATCH matched no row and the rename silently did nothing).
DO $$
DECLARE
  ok       BOOLEAN;
  name_now TEXT;
  dsg_now  BOOLEAN;
  role_now TEXT;
BEGIN
  -- 7k0: Cleo is the 'client'-labelled half of the vocabulary split. If a later
  --      edit relabels the fixture, this case stops testing (e).
  SELECT role INTO role_now FROM public.profiles
   WHERE id = 'c0000000-0000-4000-8000-000000000002';
  ASSERT role_now = 'client',
    'FIXTURE 7k: Cleo must be labelled ''client'' for the vocabulary case to be real, got '
      || COALESCE(role_now, '<null>');

  -- 7k1: the mint. Dana is is_designer = true, which is one of the two signals
  --      the restrictive policy accepts.
  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  INSERT INTO public.designer_clients (designer_id, client_id, status)
  VALUES ('d0000000-0000-4000-8000-000000000001',
          'a0000000-0000-4000-8000-000000000003', 'active');
  GET DIAGNOSTICS ok = ROW_COUNT;
  PERFORM pg_temp.reset_role();
  ASSERT ok, 'FAIL 7k1: a real designer could not mint a roster row — the restrictive policy is too tight';

  -- 7k2: the rename, through the sibling policy, on a 'client'-labelled row.
  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  UPDATE public.profiles SET display_name = 'Cleo R.'
   WHERE id = 'c0000000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS ok = ROW_COUNT;
  PERFORM pg_temp.reset_role();
  ASSERT ok,
    'FAIL 7k2: a designer could not rename their own rostered client because the client''s '
    'role says ''client'' and not ''homeowner'' — ruling B2 v3(e) is the fix';

  SELECT display_name INTO name_now FROM public.profiles
   WHERE id = 'c0000000-0000-4000-8000-000000000002';
  ASSERT name_now = 'Cleo R.',
    'FAIL 7k3: the designer''s rename did not land, got ' || COALESCE(name_now, '<null>');

  -- 7k4: and the same designer still may NOT promote that client.
  PERFORM pg_temp.assume_user('d0000000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.profiles SET is_designer = TRUE
     WHERE id = 'c0000000-0000-4000-8000-000000000002';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT is_designer INTO dsg_now FROM public.profiles
   WHERE id = 'c0000000-0000-4000-8000-000000000002';
  ASSERT dsg_now IS NOT TRUE,
    'FAIL 7k4: a designer promoted their own rostered client to designer authority';

  -- 7k5: an ADMIN-domain grant is the other accepted signal. Adm holds one and
  --      is_designer = false, so this row can only pass through the user_roles
  --      leg — which is the leg RF2-01 added.
  PERFORM pg_temp.assume_user('ad000000-0000-4000-8000-000000000006');
  INSERT INTO public.designer_clients (designer_id, client_id, status)
  VALUES ('ad000000-0000-4000-8000-000000000006',
          'a0000000-0000-4000-8000-000000000003', 'active');
  GET DIAGNOSTICS ok = ROW_COUNT;
  PERFORM pg_temp.reset_role();
  ASSERT ok,
    'FAIL 7k5: an admin-domain grant holder with is_designer false could not mint a roster '
    'row — the user_roles leg of the restrictive policy is not working';

  RAISE NOTICE '00555 legitimate-designer roster assertions passed.';
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

-- ─── 8c. designer_clients as ANON — the grant kept, the reads still empty ──
--
-- RF2-08. `anon` keeps SELECT on this table only so that the ACL check
-- Postgres runs over storage.objects' policy set (00224's
-- "Designers manage discovery folio objects" names designer_clients in its
-- USING) does not 42501 every anon read of storage. That is a permission check,
-- not a read path, and these cases are what keep the distinction honest: the
-- SELECT must return NOTHING, and every write verb must be gone.
DO $$
DECLARE
  n INTEGER;
BEGIN
  PERFORM pg_temp.assume_anon();
  SELECT COUNT(*) INTO n FROM public.designer_clients;
  PERFORM pg_temp.reset_role();
  ASSERT n = 0,
    'FAIL 8c1: anon read ' || n || ' designer_clients rows — the kept SELECT grant is supposed to '
    'satisfy a permission check, not open the roster. RLS (00014, auth.uid() = designer_id) is what '
    'makes it empty, and auth.uid() is NULL for anon';

  -- 8c2: and the write verbs are gone, which is the half that mattered. An anon
  -- INSERT here was the roster-mint primitive with the key in the iOS binary.
  PERFORM pg_temp.assume_anon();
  BEGIN
    INSERT INTO public.designer_clients (designer_id, client_id)
    VALUES ('d0000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000003');
    ASSERT FALSE, 'FAIL 8c2: anon INSERTed a designer_clients row';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_anon();
  BEGIN
    UPDATE public.designer_clients SET status = 'lead' WHERE TRUE;
    ASSERT FALSE, 'FAIL 8c3: anon holds UPDATE on designer_clients';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_anon();
  BEGIN
    DELETE FROM public.designer_clients WHERE TRUE;
    ASSERT FALSE, 'FAIL 8c4: anon holds DELETE on designer_clients';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- 8c5: and the reason the SELECT was kept — an anon read of storage.objects
  -- must not raise. This is the exact failure the first cut of RF2-08 caused,
  -- and it is asserted HERE so 00555's own suite catches it rather than two
  -- unrelated suites in other directories.
  PERFORM pg_temp.assume_anon();
  BEGIN
    PERFORM COUNT(*) FROM storage.objects WHERE bucket_id = 'project-documents';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.reset_role();
    ASSERT FALSE,
      'FAIL 8c5: an anon read of storage.objects raised 42501 — a table named in one of its '
      'policies lost the anon grant. Postgres checks those ACLs before filtering policies by role';
  END;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '00555 designer_clients anon-grant assertions passed.';
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

  -- RF2-11: pg_temp is named EXPLICITLY, not left implicitly at the front of
  -- the path where a caller-created temp object can shadow a schema one.
  ASSERT (
    SELECT bool_and('search_path=public, pg_temp' = ANY (COALESCE(p.proconfig, '{}')))
    FROM pg_proc p
    JOIN pg_namespace nn ON nn.oid = p.pronamespace
    WHERE nn.nspname = 'public'
      AND p.proname IN ('can_view_profile', 'search_shareable_designers',
                        'current_profile_role', 'current_profile_is_designer',
                        'list_vendor_profiles')
  ), 'every 00555 helper must pin search_path to "public, pg_temp"';

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

  -- ── ruling B2 v3(a): handle_new_user is 00313 VERBATIM ───────────────────
  -- The guard reads the COALESCE, which is the exact line the two reverted cuts
  -- replaced — v1 with COALESCE(v_role,'homeowner'), v2 with a CASE on
  -- raw_app_meta_data and no COALESCE at all — and rejects raw_app_meta_data
  -- outright, since that token appears nowhere in 00313. A LIKE '%homeowner%'
  -- guard proves nothing either way: 00313's body carries the literal twice.
  -- Section 11 below is the behavioural half.
  ASSERT (
    SELECT pg_get_functiondef(p.oid) LIKE '%COALESCE(v_role, ''designer'')%'
       AND pg_get_functiondef(p.oid) NOT LIKE '%raw_app_meta_data%'
    FROM pg_proc p JOIN pg_namespace nn ON nn.oid = p.pronamespace
    WHERE nn.nspname = 'public' AND p.proname = 'handle_new_user'
  ), 'handle_new_user() is not 00313''s body — ruling B2 v3(a) keeps COALESCE(v_role, ''designer'') and no provider branch';

  -- RF2-10: it is a trigger function; nothing may call it over PostgREST.
  ASSERT NOT has_function_privilege('anon'::name, 'public.handle_new_user()', 'EXECUTE'),
    'anon can execute handle_new_user';
  ASSERT NOT has_function_privilege('public'::name, 'public.handle_new_user()', 'EXECUTE'),
    'PUBLIC can execute handle_new_user';

  ASSERT NOT has_table_privilege('authenticated'::name, 'public.profiles'::regclass, 'DELETE'),
    'authenticated still holds DELETE on profiles';
  -- RF2-09: RLS does not constrain TRUNCATE, so the grant is a one-statement
  -- wipe of the table regardless of every policy above it.
  ASSERT NOT has_table_privilege('authenticated'::name, 'public.profiles'::regclass, 'TRUNCATE'),
    'authenticated still holds TRUNCATE on profiles';
  ASSERT NOT has_table_privilege('authenticated'::name, 'public.profiles'::regclass, 'REFERENCES'),
    'authenticated still holds REFERENCES on profiles';

  -- RF2-08: anon holds no WRITE on designer_clients. It held the full arwdDxtm
  -- set from the pre-flip creation default; the write half is the roster-mint
  -- primitive, reachable with the key that ships in the iOS binary.
  --
  -- SELECT is asserted PRESENT, not absent, and the reason is worth reading:
  -- storage.objects carries "Designers manage discovery folio objects"
  -- (00224:165), whose USING reads this table, and Postgres checks the ACL of
  -- every table named in a relation's policy set at executor init BEFORE
  -- filtering those policies by role. The policy is TO authenticated; the check
  -- is not. Revoking SELECT therefore 42501s every ANON read of storage.objects
  -- and takes project_documents_caller_binding_test.sql and
  -- mood_boards/share_security_test.sql red. RLS still returns anon zero rows
  -- from this table (00014's policy is `auth.uid() = designer_id`, and
  -- auth.uid() is NULL for anon), so the grant satisfies a permission check
  -- without opening a read. Case 8c below is the behavioural half.
  ASSERT has_table_privilege('anon'::name, 'public.designer_clients'::regclass, 'SELECT'),
    'anon lost SELECT on designer_clients — every anon read of storage.objects now 42501s';
  ASSERT NOT has_table_privilege('anon'::name, 'public.designer_clients'::regclass, 'INSERT'),
    'anon still holds INSERT on designer_clients';
  ASSERT NOT has_table_privilege('anon'::name, 'public.designer_clients'::regclass, 'UPDATE'),
    'anon still holds UPDATE on designer_clients';
  ASSERT NOT has_table_privilege('anon'::name, 'public.designer_clients'::regclass, 'DELETE'),
    'anon still holds DELETE on designer_clients';
  ASSERT NOT has_table_privilege('anon'::name, 'public.designer_clients'::regclass, 'TRUNCATE'),
    'anon still holds TRUNCATE on designer_clients';
  ASSERT NOT has_table_privilege('anon'::name, 'public.designer_clients'::regclass, 'MAINTAIN'),
    'anon still holds MAINTAIN on designer_clients';
  ASSERT has_table_privilege('authenticated'::name, 'public.designer_clients'::regclass, 'INSERT'),
    'authenticated lost INSERT on designer_clients — the Add Client flow is broken';

  -- RF2-01: neither restrictive policy reads profiles.role. The guard names the
  -- helper, not the word "role" — `role` is a substring of half this predicate.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.designer_clients'::regclass
      AND p.polname IN ('designer_clients_writer_is_designer',
                        'designer_clients_updater_is_designer')
      AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
             || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
          ILIKE '%current_profile_role%'
  ), 'a designer_clients restrictive policy still reads profiles.role (ruling B2 v3(b))';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy p
    WHERE p.polrelid = 'public.designer_clients'::regclass
      AND p.polname IN ('designer_clients_writer_is_designer',
                        'designer_clients_updater_is_designer')
      AND NOT ((COALESCE(pg_get_expr(p.polqual, p.polrelid), '')
                  || COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''))
               ILIKE '%user_roles%')
  ), 'a designer_clients restrictive policy does not read user_roles';

  RAISE NOTICE '00555 security assertions passed.';
END $$;

-- ─── 11. handle_new_user's default role — UNCHANGED (ruling B2 v3(a)) ──────
--
-- 00555 §a2(ii). This section has now been written three times, and the third
-- version deletes the behaviour the first two added.
--
--   v1  changed 00313's COALESCE(v_role,'designer') to 'homeowner'. Right for
--       the iOS app, wrong for the designer portal's own signup page, which
--       also sends no role hint (auth/signup/page.tsx:147-157) and would have
--       had every self-signup designer labelled `client` by
--       public.comms_resolve_role (00103:37-42).
--   v2  replaced the constant with a CASE on raw_app_meta_data->>'provider',
--       allowlisting 'email' to 'designer' and everything else to 'homeowner'.
--   v3  reverts to 00313 exactly. The provider CASE answered the wrong
--       question: which BUTTON someone tapped is not which KIND of account they
--       are. A designer can sign in with Apple; a client can sign up with an
--       email and a password — the client-portal invite-accept form does
--       exactly that (AcceptInviteForm.tsx:64) — so v2 wrote a wrong label for
--       both, silently, at the one moment nobody is watching.
--
-- And the label was never the security boundary. profiles.role grants nothing:
-- the design-request rail reads is_designer, profiles_select_admin reads
-- user_roles, and after RF2-01 so do the designer_clients restrictive policies.
-- A3-07 — an Apple sign-up landing as a designer — is fixed where the answer is
-- known: the iOS app self-downgrades its own row (case 7i above proves the
-- policy permits it) and client-invite's accept handler writes 'homeowner' as
-- service_role.
--
-- These are BEHAVIOUR cases on purpose. Section 10's guard is a text match on
-- the function definition; only an actual auth.users INSERT proves the trigger
-- writes the role. Every provider shape v2 branched on is exercised here, and
-- every one of them must now land 'designer' unless it carries the hint.

DO $$
DECLARE
  v_role text;
BEGIN
  -- 11a: the Apple id-token path. It lands 'designer', and that is CORRECT
  --      under v3 — the iOS app corrects its own row immediately afterwards
  --      (W1 · L1-A, build/waves/w1/l1-a-notes.md). Under v2 this case
  --      asserted 'homeowner'.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role, raw_app_meta_data)
  VALUES ('b0000000-0000-4000-8000-00000000f001', 'p555-apple@test.invalid', '', NOW(), NOW(), NOW(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '{"provider":"apple","providers":["apple"]}'::jsonb);
  SELECT role INTO v_role FROM public.profiles WHERE id = 'b0000000-0000-4000-8000-00000000f001';
  ASSERT v_role = 'designer',
    'FAIL 11a: an Apple signup must land on the pre-00555 default ''designer'' — ruling '
      'B2 v3(a) leaves this trigger alone and the APP does the relabel. Got '
      || COALESCE(v_role, '<null>');

  -- 11b: the designer portal's own self-signup — email provider, no role in
  --      raw_user_meta_data. Unchanged in every version of this ruling.
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

  -- 11c: the explicit client hint the iOS app sends on its email/OTP paths
  --      still wins, on any provider (AuthService.swift:437 and :563).
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

  -- 11d: 00313's security rule survives — raw_user_meta_data is
  --      CLIENT-CONTROLLED, so a forged elevated hint must be IGNORED and fall
  --      through to the default, never written as given. This is the case that
  --      matters most in this section: it is the only one where a client string
  --      could reach the column, and it must not.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role,
                          raw_app_meta_data, raw_user_meta_data)
  VALUES ('b0000000-0000-4000-8000-00000000f004', 'p555-forger@test.invalid', '', NOW(), NOW(), NOW(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          '{"provider":"apple","providers":["apple"]}'::jsonb,
          '{"role":"super_admin"}'::jsonb);
  SELECT role INTO v_role FROM public.profiles WHERE id = 'b0000000-0000-4000-8000-00000000f004';
  ASSERT v_role = 'designer',
    'FAIL 11d: a forged ''super_admin'' hint must be ignored and fall to the default, got '
      || COALESCE(v_role, '<null>');
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = 'b0000000-0000-4000-8000-00000000f004' AND r.domain = 'admin'
  ), 'FAIL 11d2: a forged role hint reached user_roles — the AUTHORITY table';

  -- 11e / 11f / 11g / 11h: the four provider shapes v2's CASE branched on. All
  -- four now take the same path as everything else, which is the point of
  -- reverting it — there is no provider logic left to get wrong.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role, raw_app_meta_data)
  VALUES
    ('b0000000-0000-4000-8000-00000000f005', 'p555-apple2@test.invalid', '', NOW(), NOW(), NOW(),
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     '{"providers":["apple"]}'::jsonb),
    ('b0000000-0000-4000-8000-00000000f006', 'p555-google@test.invalid', '', NOW(), NOW(), NOW(),
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     '{"provider":"google","providers":["google"]}'::jsonb),
    ('b0000000-0000-4000-8000-00000000f008', 'p555-linked@test.invalid', '', NOW(), NOW(), NOW(),
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     '{"provider":"email","providers":["email","google"]}'::jsonb);
  -- 11g: no raw_app_meta_data at all.
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, instance_id, aud, role)
  VALUES ('b0000000-0000-4000-8000-00000000f007', 'p555-nometa@test.invalid', '', NOW(), NOW(), NOW(),
          '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  ASSERT (
    SELECT bool_and(role = 'designer') FROM public.profiles
    WHERE id IN ('b0000000-0000-4000-8000-00000000f005',
                 'b0000000-0000-4000-8000-00000000f006',
                 'b0000000-0000-4000-8000-00000000f007',
                 'b0000000-0000-4000-8000-00000000f008')
  ), 'FAIL 11e-11h: a providers-array-only, Google, metadata-less or linked-identity signup '
     'did not land the pre-00555 default — some provider branch survives in handle_new_user';

  ASSERT (
    SELECT COUNT(*) FROM public.profiles
    WHERE id IN ('b0000000-0000-4000-8000-00000000f005',
                 'b0000000-0000-4000-8000-00000000f006',
                 'b0000000-0000-4000-8000-00000000f007',
                 'b0000000-0000-4000-8000-00000000f008')
  ) = 4, 'FAIL 11e-11h: handle_new_user did not create all four profiles rows';

  RAISE NOTICE '00555 handle_new_user behaviour assertions passed.';
END $$;

-- ─── 11i. the two callers that DO relabel, and the ratchet they use ────────
--
-- Ruling B2 v3(c)+(d). §11 above proves the trigger leaves every signup
-- 'designer'; the label is corrected afterwards by the iOS app on its own row,
-- and by client-invite's accept handler as service_role. The first is exactly
-- case 7i. This case is the second: a service_role write of the same column,
-- which must land regardless of the ratchet (service_role is BYPASSRLS) — and
-- must not be reachable by the client itself under someone else's id.
DO $$
DECLARE
  v_role text;
BEGIN
  -- the accepting client, as handle_new_user leaves them
  SELECT role INTO v_role FROM public.profiles
   WHERE id = 'b0000000-0000-4000-8000-00000000f002';
  ASSERT v_role = 'designer',
    'FIXTURE 11i: the invite-accept signup shape must start ''designer''';

  -- client-invite handleAccept's write, verbatim in shape:
  --   admin.from('profiles').update({role:'homeowner'}).eq('id', user.id)
  PERFORM pg_temp.assume_service_role();
  UPDATE public.profiles SET role = 'homeowner'
   WHERE id = 'b0000000-0000-4000-8000-00000000f002' AND role <> 'homeowner';
  PERFORM pg_temp.reset_role();

  SELECT role INTO v_role FROM public.profiles
   WHERE id = 'b0000000-0000-4000-8000-00000000f002';
  ASSERT v_role = 'homeowner',
    'FAIL 11i: client-invite''s service_role relabel did not land, got '
      || COALESCE(v_role, '<null>');

  -- and the same write, attempted by an ordinary caller against ANOTHER id, is
  -- refused — the accept path's authority is service_role, not the token.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  BEGIN
    UPDATE public.profiles SET role = 'homeowner'
     WHERE id = 'b0000000-0000-4000-8000-00000000f001';
  EXCEPTION WHEN check_violation OR insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();

  SELECT role INTO v_role FROM public.profiles
   WHERE id = 'b0000000-0000-4000-8000-00000000f001';
  ASSERT v_role = 'designer',
    'FAIL 11i2: an authenticated caller relabelled somebody else''s profile';

  RAISE NOTICE '00555 relabel-path assertions passed.';
END $$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
