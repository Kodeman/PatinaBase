-- ═══════════════════════════════════════════════════════════════════════════
-- 00539 §2 tests — when a homeowner was last here is hers, and her designer's
--
-- 00537 put `last_seen_at` on public.profiles, which is FOR SELECT USING (true)
-- (00013:57-58). W4's H2 lane is the first writer of it, so every authenticated
-- user could read when any homeowner last opened the app (integration.md §6.6).
-- 00539 §2 moves the fact onto public.profile_presence and drops the column.
--
-- Covers:
--   1. the owner reads her own row, inserts it, and updates it;
--   2. the designer of record reads it — through an ACCEPTED lead;
--   3. the designer of record reads it — through an ACTIVE project;
--   4. an unrelated authenticated designer reads ZERO, and a designer whose
--      lead is not accepted reads ZERO;
--   5. nobody but the owner may WRITE it — a designer's update touches no row
--      and her insert for somebody else is refused;
--   6. profiles.last_seen_at no longer exists.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rooms/profile_presence_test.sql
--
-- Single transaction; ROLLBACK at the end. Nothing survives the run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures (as superuser — bypasses RLS) ────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('da000000-0000-4000-8000-000000000001', 'pp-client@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('da000000-0000-4000-8000-000000000002', 'pp-lead-des@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('da000000-0000-4000-8000-000000000003', 'pp-proj-des@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('da000000-0000-4000-8000-000000000004', 'pp-other-des@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('da000000-0000-4000-8000-000000000005', 'pp-client-b@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('da000000-0000-4000-8000-000000000001', 'pp-client@test.invalid',    'PP Client',       false, NOW(), NOW()),
  ('da000000-0000-4000-8000-000000000002', 'pp-lead-des@test.invalid',  'PP Lead Des',     true,  NOW(), NOW()),
  ('da000000-0000-4000-8000-000000000003', 'pp-proj-des@test.invalid',  'PP Project Des',  true,  NOW(), NOW()),
  ('da000000-0000-4000-8000-000000000004', 'pp-other-des@test.invalid', 'PP Other Des',    true,  NOW(), NOW()),
  ('da000000-0000-4000-8000-000000000005', 'pp-client-b@test.invalid',  'PP Client B',     false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- An ACCEPTED lead: this designer is the client's designer of record.
INSERT INTO public.leads (id, homeowner_id, designer_id, project_type, status, created_at, updated_at)
VALUES ('da000000-0000-4000-8000-0000000000a1',
        'da000000-0000-4000-8000-000000000001',
        'da000000-0000-4000-8000-000000000002',
        'full_home', 'accepted', NOW(), NOW());

-- A lead that was never accepted: NOT a designer of record.
INSERT INTO public.leads (id, homeowner_id, designer_id, project_type, status, created_at, updated_at)
VALUES ('da000000-0000-4000-8000-0000000000a2',
        'da000000-0000-4000-8000-000000000001',
        'da000000-0000-4000-8000-000000000004',
        'full_home', 'contacted', NOW(), NOW());

-- An ACTIVE project: this designer is also a designer of record.
INSERT INTO public.projects (id, name, status, client_id, designer_id, created_by)
VALUES ('da000000-0000-4000-8000-0000000000b1', 'PP Residence', 'active',
        'da000000-0000-4000-8000-000000000001',
        'da000000-0000-4000-8000-000000000003',
        'da000000-0000-4000-8000-000000000003');

-- ─── helpers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid)
RETURNS void AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.assume_super()
RETURNS void AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_super() TO PUBLIC;

DO $$
DECLARE
  u_client    uuid := 'da000000-0000-4000-8000-000000000001';
  u_lead_des  uuid := 'da000000-0000-4000-8000-000000000002';
  u_proj_des  uuid := 'da000000-0000-4000-8000-000000000003';
  u_other_des uuid := 'da000000-0000-4000-8000-000000000004';
  u_client_b  uuid := 'da000000-0000-4000-8000-000000000005';
  v_count     integer;
  v_stamp     timestamptz;
  v_type      text;
BEGIN
  -- ── 6. the column is gone from the world-readable table ──
  SELECT data_type INTO v_type
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'last_seen_at';
  ASSERT v_type IS NULL,
    'profiles.last_seen_at must be dropped — profiles is FOR SELECT USING (true)';

  -- ── 1. the owner records and reads her own presence ──
  PERFORM pg_temp.assume_user(u_client);

  INSERT INTO public.profile_presence (user_id, last_seen_at)
  VALUES (u_client, TIMESTAMPTZ '2026-08-28 12:00:00+00');

  SELECT count(*)::int INTO v_count FROM public.profile_presence;
  ASSERT v_count = 1, 'the owner must read her own row, got ' || v_count;

  UPDATE public.profile_presence
     SET last_seen_at = TIMESTAMPTZ '2026-08-28 18:00:00+00'
   WHERE user_id = u_client;
  SELECT last_seen_at INTO v_stamp FROM public.profile_presence WHERE user_id = u_client;
  ASSERT v_stamp = TIMESTAMPTZ '2026-08-28 18:00:00+00',
    'the owner must be able to move her own stamp forward';

  -- A second client's row is not hers to see.
  PERFORM pg_temp.assume_super();
  INSERT INTO public.profile_presence (user_id, last_seen_at)
  VALUES (u_client_b, TIMESTAMPTZ '2026-08-28 09:00:00+00');

  PERFORM pg_temp.assume_user(u_client);
  SELECT count(*)::int INTO v_count FROM public.profile_presence;
  ASSERT v_count = 1,
    'a homeowner must see only her own presence row, got ' || v_count;

  -- ── 2. the designer of record, through an accepted lead ──
  PERFORM pg_temp.assume_user(u_lead_des);
  SELECT count(*)::int INTO v_count
    FROM public.profile_presence WHERE user_id = u_client;
  ASSERT v_count = 1,
    'the accepted lead''s designer must read her client''s presence, got ' || v_count;

  -- ── 5. …and may not write it ──
  UPDATE public.profile_presence
     SET last_seen_at = TIMESTAMPTZ '2020-01-01 00:00:00+00'
   WHERE user_id = u_client;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 0, 'a designer must not be able to write a client''s presence';

  -- …nor invent one. `WITH CHECK (user_id = auth.uid())` makes this true by
  -- construction; the assertion is here so a later policy edit cannot quietly
  -- take the WITH CHECK off.
  BEGIN
    INSERT INTO public.profile_presence (user_id, last_seen_at)
    VALUES (u_client_b, now());
    ASSERT false, 'a designer must not be able to insert a presence row for somebody else';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- ── 3. the designer of record, through an active project ──
  PERFORM pg_temp.assume_user(u_proj_des);
  SELECT count(*)::int INTO v_count
    FROM public.profile_presence WHERE user_id = u_client;
  ASSERT v_count = 1,
    'the active project''s designer must read her client''s presence, got ' || v_count;

  -- ── 4. everyone else reads nothing ──
  PERFORM pg_temp.assume_user(u_other_des);
  SELECT count(*)::int INTO v_count FROM public.profile_presence;
  ASSERT v_count = 0,
    'a designer with only an unaccepted lead must read nothing, got ' || v_count;

  PERFORM pg_temp.assume_user(u_client_b);
  SELECT count(*)::int INTO v_count
    FROM public.profile_presence WHERE user_id = u_client;
  ASSERT v_count = 0,
    'an unrelated homeowner must read nothing, got ' || v_count;

  PERFORM pg_temp.assume_super();
  RAISE NOTICE 'profile_presence: all assertions passed';
END $$;

ROLLBACK;
