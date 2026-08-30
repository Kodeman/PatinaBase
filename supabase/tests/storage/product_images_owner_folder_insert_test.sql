-- ═══════════════════════════════════════════════════════════════════════════
-- product-images bucket INSERT policy — owner-folder scoping (00057 → 00542)
--
-- The regression this pins: 00057's INSERT policy checked only bucket_id —
-- no owner-folder predicate — even though the sibling UPDATE/DELETE policies
-- on the SAME bucket already required
-- (storage.foldername(name))[1] = auth.uid()::text. Any authenticated caller
-- could write an object under ANY OTHER user's `${uid}/…` prefix. 00542
-- brings INSERT in line with its siblings.
--
-- The DENY case is the discriminator: user A attempting to INSERT under user
-- B's folder must fail at the RLS layer (42501). The pre-00542 policy passes
-- the ALLOW case in this file too — a suite that only proved the allow path
-- would be green against the vulnerable policy.
--
-- Every insert probe runs under SET LOCAL ROLE with real JWT claims. As
-- postgres (BYPASSRLS) the whole file would pass while proving nothing.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/storage/product_images_owner_folder_insert_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors ────────────────────────────────────────────────────────────────
-- User A uploads under their own folder. User B's folder is the target of
-- the cross-user probe.
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('48800000-0000-4000-8000-000000000001', 'pi-user-a@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48800000-0000-4000-8000-000000000002', 'pi-user-b@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('48800000-0000-4000-8000-000000000001', 'pi-user-a@test.invalid', 'PI User A', true, now(), now()),
  ('48800000-0000-4000-8000-000000000002', 'pi-user-b@test.invalid', 'PI User B', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

-- ── Role + probe helpers ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume(p_actor uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    CASE WHEN p_actor IS NULL
      THEN json_build_object('role', p_role)::text
      ELSE json_build_object('sub', p_actor::text, 'role', p_role)::text
    END,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;

-- SECURITY INVOKER on purpose: the INSERT must run — and be evaluated by
-- storage RLS — as whatever role SET LOCAL ROLE has put the session into.
-- Returns a tagged string rather than raising, so an RLS-layer error and a
-- successful insert are distinguishable without aborting the caller's block.
CREATE OR REPLACE FUNCTION pg_temp.probe_insert(p_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('product-images', p_name, auth.uid());
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  RETURN 'err:' || SQLSTATE;
END;
$$;

-- 00483 strips PUBLIC EXECUTE from routines created after it, pg_temp included.
GRANT EXECUTE ON FUNCTION pg_temp.assume(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.probe_insert(text) TO authenticated;

-- ── (1) Catalog: the policy names the owner-folder predicate ──────────────
DO $$
DECLARE
  v_check text;
BEGIN
  SELECT COALESCE(policy.with_check, '') INTO v_check
  FROM pg_policies AS policy
  WHERE policy.schemaname = 'storage' AND policy.tablename = 'objects'
    AND policy.policyname = 'Authenticated users can upload product images';

  ASSERT v_check LIKE '%product-images%',
    'the product-images INSERT policy must still gate on bucket_id';
  ASSERT v_check LIKE '%foldername%' AND v_check LIKE '%auth.uid()%',
    'the product-images INSERT policy must gate on the owner-folder prefix';
END $$;

-- ── (2) ALLOW: user A writes under their own folder ────────────────────────
-- ── (3) DENY: user A writes under user B's folder ──────────────────────────
DO $$
DECLARE
  v_a  uuid := '48800000-0000-4000-8000-000000000001';
  v_own_path   text := '48800000-0000-4000-8000-000000000001/probe.jpg';
  v_other_path text := '48800000-0000-4000-8000-000000000002/probe.jpg';
  v_no_folder_path text := 'probe-no-folder.jpg';
  v_probe text;
BEGIN
  PERFORM pg_temp.assume(v_a, 'authenticated');
  SET LOCAL ROLE authenticated;
  v_probe := pg_temp.probe_insert(v_own_path);
  RESET ROLE;
  ASSERT v_probe = 'ok',
    format('user A must be able to upload under their own folder; got %L', v_probe);

  PERFORM pg_temp.assume(v_a, 'authenticated');
  SET LOCAL ROLE authenticated;
  v_probe := pg_temp.probe_insert(v_other_path);
  RESET ROLE;
  ASSERT v_probe = 'err:42501',
    format('user A must be denied (42501) writing under another user''s folder; got %L', v_probe);

  -- A key with no folder segment: storage.foldername() splits on '/' and
  -- drops the last segment, so a value with no slash yields '{}'; '{}'[1] is
  -- NULL, and NULL = auth.uid()::text is NULL — not true, so WITH CHECK
  -- rejects it just like any other mismatched prefix.
  PERFORM pg_temp.assume(v_a, 'authenticated');
  SET LOCAL ROLE authenticated;
  v_probe := pg_temp.probe_insert(v_no_folder_path);
  RESET ROLE;
  ASSERT v_probe = 'err:42501',
    format('user A must be denied (42501) writing a key with no folder segment; got %L', v_probe);

  RAISE NOTICE 'product-images owner-folder INSERT assertions passed';
END $$;

-- ── (4) ANTI-VACUITY: the pre-00542 shape allows the cross-user write ──────
-- Put the policy back to its 00057 shape (bucket_id only, no owner-folder
-- check) and prove user A CAN then write under user B's folder. If this
-- passed with 'err:42501' the DENY assertion above would be proving nothing.
SAVEPOINT pre_00542_shape;

DO $$
DECLARE
  v_a uuid := '48800000-0000-4000-8000-000000000001';
  v_other_path text := '48800000-0000-4000-8000-000000000002/probe-vacuity.jpg';
  v_probe text;
BEGIN
  EXECUTE 'DROP POLICY "Authenticated users can upload product images" ON storage.objects';
  EXECUTE 'CREATE POLICY "Authenticated users can upload product images" '
    'ON storage.objects FOR INSERT TO authenticated '
    'WITH CHECK (bucket_id = ''product-images'')';

  PERFORM pg_temp.assume(v_a, 'authenticated');
  SET LOCAL ROLE authenticated;
  v_probe := pg_temp.probe_insert(v_other_path);
  RESET ROLE;

  ASSERT v_probe = 'ok',
    format('the pre-00542 bucket-only shape must allow the cross-user write — '
           'if this is err:42501 the DENY assertion above cannot be trusted; got %L', v_probe);
END $$;

ROLLBACK TO SAVEPOINT pre_00542_shape;

-- The savepoint rollback must have restored the fixed policy.
DO $$
DECLARE
  v_check text;
BEGIN
  SELECT COALESCE(policy.with_check, '') INTO v_check
  FROM pg_policies AS policy
  WHERE policy.schemaname = 'storage' AND policy.tablename = 'objects'
    AND policy.policyname = 'Authenticated users can upload product images';
  ASSERT v_check LIKE '%foldername%' AND v_check LIKE '%auth.uid()%',
    'the savepoint rollback must have restored the owner-folder-scoped policy';
END $$;

-- ── (5) Clean up ────────────────────────────────────────────────────────
-- Direct DELETE on storage.objects is blocked by Supabase (42501 — "Use the
-- Storage API instead"), so cleanup can't be a DELETE statement here; the
-- final ROLLBACK undoes the whole fixture, the allow-case row from (2)
-- included.
ROLLBACK;
