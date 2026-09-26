-- 00672 — teaching_note_state: own-row table and the teaching_note_state_patch writer.
--
-- Covers: (1) anon cannot execute the writer; (2) a first patch creates the row and
-- returns the state; (3) missing parents are created (seen.<key>.n on an empty state);
-- (4) a set seen.<key>.out is sticky; (5) refused paths, non-1-based or NULL-bearing
-- path arrays, a NULL value and an oversize value raise 22023; (5b) the owner cannot
-- INSERT, UPDATE or DELETE the table directly (42501) and the RPC still writes; (6) another
-- user cannot SELECT or write the row.
--
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/teaching_note_state.sql
-- Everything runs inside one transaction and is rolled back.

BEGIN;

-- ─── fixture: users A and B ────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('e9672000-0000-4000-8000-00000000000a', '00672-teach-a@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e9672000-0000-4000-8000-00000000000b', '00672-teach-b@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- ─── (0) shape: RLS on, no grant to anon or the agent roles ────────────────

DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.teaching_note_state'::regclass),
    'teaching_note_state must have RLS enabled';
  ASSERT (SELECT count(*) FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'teaching_note_state') = 1,
    'teaching_note_state must carry exactly one policy (SELECT)';
  ASSERT (SELECT cmd FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'teaching_note_state') = 'SELECT',
    'the one policy on teaching_note_state must be the SELECT policy';
  ASSERT has_table_privilege('authenticated', 'public.teaching_note_state', 'SELECT'),
    'authenticated must hold SELECT';
  ASSERT NOT has_table_privilege('authenticated', 'public.teaching_note_state', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.teaching_note_state', 'UPDATE')
     AND NOT has_table_privilege('authenticated', 'public.teaching_note_state', 'DELETE'),
    'authenticated must not hold INSERT, UPDATE or DELETE: the RPC is the only writer';
  ASSERT NOT has_table_privilege('anon', 'public.teaching_note_state', 'SELECT'),
    'anon must not SELECT teaching_note_state';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'teaching_note_state'
      AND grantee IN ('anon', 'agent_reader', 'agent_writer')
  ), 'no table grant to anon, agent_reader or agent_writer';
END $$;

-- ─── (1) anon cannot execute ───────────────────────────────────────────────

DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public.teaching_note_state_patch(text[], jsonb)', 'EXECUTE'),
    'anon must not hold EXECUTE on teaching_note_state_patch';
  ASSERT has_function_privilege('authenticated', 'public.teaching_note_state_patch(text[], jsonb)', 'EXECUTE'),
    'authenticated must hold EXECUTE on teaching_note_state_patch';
END $$;

SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.teaching_note_state_patch(ARRAY['v'], '1'::jsonb);
  RAISE EXCEPTION 'anon executed teaching_note_state_patch';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
RESET ROLE;

-- ─── as user A ─────────────────────────────────────────────────────────────

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e9672000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

-- (2) the first patch creates the row and returns the state
DO $$
DECLARE
  v_state jsonb;
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.teaching_note_state), 'A starts with no row';
  v_state := public.teaching_note_state_patch(ARRAY['v'], '1'::jsonb);
  ASSERT v_state = '{"v": 1}'::jsonb, format('first patch must return {"v":1}, got %s', v_state);
  ASSERT (SELECT state FROM public.teaching_note_state
          WHERE user_id = 'e9672000-0000-4000-8000-00000000000a') = v_state,
    'the stored row must equal the returned state';
END $$;

-- (3) missing parents are created, depth 3 under seen
DO $$
DECLARE
  v_state jsonb;
BEGIN
  v_state := public.teaching_note_state_patch(ARRAY['seen', 'k@1', 'n'], '1'::jsonb);
  ASSERT v_state = '{"v": 1, "seen": {"k@1": {"n": 1}}}'::jsonb,
    format('seen.k@1.n must be created with its parents, got %s', v_state);

  v_state := public.teaching_note_state_patch(ARRAY['cursor', 'lastSeenReleaseId'], '"2026-09-25-galley-po"'::jsonb);
  ASSERT v_state #>> '{cursor,lastSeenReleaseId}' = '2026-09-25-galley-po',
    format('cursor.lastSeenReleaseId must be set, got %s', v_state);
  ASSERT v_state #>> '{seen,k@1,n}' = '1', 'an unrelated patch keeps seen.k@1.n';
END $$;

-- (4) a set out is sticky: the second write returns the first value
DO $$
DECLARE
  v_state jsonb;
BEGIN
  v_state := public.teaching_note_state_patch(ARRAY['seen', 'k@1', 'out'], '"dismissed"'::jsonb);
  ASSERT v_state #>> '{seen,k@1,out}' = 'dismissed', format('out must be set, got %s', v_state);

  v_state := public.teaching_note_state_patch(ARRAY['seen', 'k@1', 'out'], '"acted"'::jsonb);
  ASSERT v_state #>> '{seen,k@1,out}' = 'dismissed',
    format('a second out must not replace the first, got %s', v_state);
  ASSERT (SELECT state #>> '{seen,k@1,out}' FROM public.teaching_note_state) = 'dismissed',
    'the stored out must stay dismissed';

  -- Counters still move after the note is terminal.
  v_state := public.teaching_note_state_patch(ARRAY['seen', 'k@1', 'n'], '2'::jsonb);
  ASSERT v_state #>> '{seen,k@1,n}' = '2', 'n still updates after out is set';
END $$;

-- (5) refused paths and an oversize value raise 22023
DO $$
DECLARE
  v_path text[];
  v_paths text[] := ARRAY[
    'bogus', 'seen', 'seen.k@1', 'seen.k@1.copy', 'visit.a.b.c', ''
  ];
  v_p text;
BEGIN
  FOREACH v_p IN ARRAY v_paths LOOP
    v_path := CASE WHEN v_p = '' THEN ARRAY[]::text[] ELSE string_to_array(v_p, '.') END;
    BEGIN
      PERFORM public.teaching_note_state_patch(v_path, '1'::jsonb);
      RAISE EXCEPTION 'path % must be refused', v_path;
    EXCEPTION WHEN invalid_parameter_value THEN
      NULL;
    END;
  END LOOP;

  BEGIN
    PERFORM public.teaching_note_state_patch(NULL, '1'::jsonb);
    RAISE EXCEPTION 'a NULL path must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.teaching_note_state_patch(ARRAY['visit', 'unsolicitedShown'], to_jsonb(repeat('x', 2000)));
    RAISE EXCEPTION 'a value over 1024 bytes must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  ASSERT (SELECT state FROM public.teaching_note_state) #> '{visit}' IS NULL,
    'a refused patch must write nothing';
END $$;

-- (5a) path arrays that are not plain 1-based and NULL-free, and a NULL value,
-- raise 22023 (R1 finding 1: on '[0:0]={bogus}' p_path[1] is NULL, so the old
-- whitelist went NULL and jsonb_set wrote top-level "bogus"; on '[2:4]={seen,k@1,out}'
-- p_path[3] is NULL, so the sticky-out check was skipped and out was overwritten).
DO $$
DECLARE
  v_before jsonb := (SELECT state FROM public.teaching_note_state);
BEGIN
  BEGIN
    PERFORM public.teaching_note_state_patch('[0:0]={bogus}'::text[], '"x"'::jsonb);
    RAISE EXCEPTION 'a [0:0] path must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.teaching_note_state_patch('[2:4]={seen,k@1,out}'::text[], '"acted"'::jsonb);
    RAISE EXCEPTION 'a [2:4] path must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.teaching_note_state_patch('{{v}}'::text[], '1'::jsonb);
    RAISE EXCEPTION 'a two-dimensional path must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.teaching_note_state_patch(ARRAY['seen', NULL, 'n'], '1'::jsonb);
    RAISE EXCEPTION 'a NULL path segment must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.teaching_note_state_patch(ARRAY['seen', '', 'n'], '1'::jsonb);
    RAISE EXCEPTION 'an empty path segment must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  BEGIN
    PERFORM public.teaching_note_state_patch(ARRAY['v'], NULL);
    RAISE EXCEPTION 'a NULL value must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  ASSERT (SELECT state FROM public.teaching_note_state) = v_before,
    format('refused path arrays must write nothing, got %s', (SELECT state FROM public.teaching_note_state));
  ASSERT v_before #>> '{seen,k@1,out}' = 'dismissed' AND NOT v_before ? 'bogus',
    'out stays dismissed and no top-level bogus key exists';
END $$;

-- (5b) the owner cannot write the table directly; the RPC is the only writer
-- (R1 finding 2: a direct UPDATE bypassed the whitelist, the cap and sticky out).
DO $$
DECLARE
  v_state jsonb;
BEGIN
  BEGIN
    UPDATE public.teaching_note_state SET state = '{}'::jsonb
     WHERE user_id = 'e9672000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'the owner''s direct UPDATE must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.teaching_note_state (user_id, state)
    VALUES ('e9672000-0000-4000-8000-00000000000a', '{}'::jsonb)
    ON CONFLICT (user_id) DO NOTHING;
    RAISE EXCEPTION 'the owner''s direct INSERT must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- R2 finding 14: dismiss = forever, so the owner cannot DELETE its own row either
  -- (a delete would wipe every sticky out). 42501 = insufficient_privilege.
  BEGIN
    DELETE FROM public.teaching_note_state
     WHERE user_id = 'e9672000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'the owner''s direct DELETE must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  ASSERT (SELECT state #>> '{seen,k@1,out}' FROM public.teaching_note_state) = 'dismissed',
    'the refused direct writes and delete must leave the row unchanged';

  v_state := public.teaching_note_state_patch(ARRAY['seen', 'k@1', 'n'], '3'::jsonb);
  ASSERT v_state #>> '{seen,k@1,n}' = '3', format('n must still set via the RPC, got %s', v_state);
  ASSERT (SELECT state #>> '{seen,k@1,n}' FROM public.teaching_note_state) = '3',
    'the RPC write must be stored';
END $$;

RESET ROLE;

-- ─── (6) user B cannot SELECT A's row ──────────────────────────────────────

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e9672000-0000-4000-8000-00000000000b', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_state jsonb;
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.teaching_note_state
    WHERE user_id = 'e9672000-0000-4000-8000-00000000000a'
  ), 'B must not see A''s row';

  -- B's own patch touches only B's row.
  v_state := public.teaching_note_state_patch(ARRAY['ignoredStreak'], '0'::jsonb);
  ASSERT v_state = '{"ignoredStreak": 0}'::jsonb, format('B starts from an empty state, got %s', v_state);
  ASSERT (SELECT count(*) FROM public.teaching_note_state) = 1, 'B sees exactly one row, its own';

  -- B cannot overwrite A's row directly either: no UPDATE grant at all.
  BEGIN
    UPDATE public.teaching_note_state SET state = '{}'::jsonb
     WHERE user_id = 'e9672000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'B''s direct UPDATE must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true);

DO $$
BEGIN
  ASSERT (SELECT state #>> '{seen,k@1,out}' FROM public.teaching_note_state
          WHERE user_id = 'e9672000-0000-4000-8000-00000000000a') = 'dismissed',
    'B''s UPDATE must not reach A''s row';
END $$;

ROLLBACK;
