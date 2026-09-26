-- 00674 — help_state_merge: top-level shallow merge into the caller's own
-- profiles.help_state.
--
-- Covers: (1) {marginNotes:{x:1}} after {tours:{t:1}} keeps both keys; (2) an unknown
-- top-level key raises 22023; (3) a non-object patch raises 22023; (4) the result
-- equals the stored column. Also: anon cannot execute; an oversize patch raises 22023.
--
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/help_state_merge.sql
-- Everything runs inside one transaction and is rolled back.

BEGIN;

-- ─── fixture: one user (handle_new_user creates the profiles row) ──────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('e9674000-0000-4000-8000-00000000000a', '00674-help-a@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles SET help_state = '{}'::jsonb WHERE id = 'e9674000-0000-4000-8000-00000000000a';

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.profiles WHERE id = 'e9674000-0000-4000-8000-00000000000a'),
    'fixture: the profiles row must exist';
  ASSERT NOT has_function_privilege('anon', 'public.help_state_merge(jsonb)', 'EXECUTE'),
    'anon must not hold EXECUTE on help_state_merge';
  ASSERT has_function_privilege('authenticated', 'public.help_state_merge(jsonb)', 'EXECUTE'),
    'authenticated must hold EXECUTE on help_state_merge';
END $$;

-- ─── as the user ───────────────────────────────────────────────────────────

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e9674000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

-- (1) + (4) merge keeps both keys; the result equals the stored column
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.help_state_merge('{"tours": {"t": 1}}'::jsonb);
  ASSERT v_result = '{"tours": {"t": 1}}'::jsonb,
    format('merge into an empty help_state must hold only the patch, got %s', v_result);

  v_result := public.help_state_merge('{"marginNotes": {"x": 1}}'::jsonb);
  ASSERT v_result = '{"tours": {"t": 1}, "marginNotes": {"x": 1}}'::jsonb,
    format('merge must keep tours and add marginNotes, got %s', v_result);
  ASSERT (SELECT help_state FROM public.profiles
          WHERE id = 'e9674000-0000-4000-8000-00000000000a') = v_result,
    'the returned value must equal the stored help_state';

  -- A key present in the patch replaces that key whole.
  v_result := public.help_state_merge('{"tours": {"u": 2}}'::jsonb);
  ASSERT v_result = '{"tours": {"u": 2}, "marginNotes": {"x": 1}}'::jsonb,
    format('a patched key must replace the stored key whole, got %s', v_result);
  ASSERT (SELECT help_state FROM public.profiles
          WHERE id = 'e9674000-0000-4000-8000-00000000000a') = v_result,
    'the returned value must equal the stored help_state after a replace';
END $$;

-- (2) an unknown top-level key, (3) a non-object patch, and an oversize patch raise 22023
DO $$
DECLARE
  v_bad jsonb;
BEGIN
  FOREACH v_bad IN ARRAY ARRAY[
    '{"teaching": {"x": 1}}'::jsonb,
    '{"tours": {}, "role": "admin"}'::jsonb,
    '[]'::jsonb,
    '"tours"'::jsonb,
    '1'::jsonb,
    'null'::jsonb,
    jsonb_build_object('marginNotes', repeat('x', 20000))
  ] LOOP
    BEGIN
      PERFORM public.help_state_merge(v_bad);
      RAISE EXCEPTION 'patch % must be refused', left(v_bad::text, 80);
    EXCEPTION WHEN invalid_parameter_value THEN
      NULL;
    END;
  END LOOP;

  BEGIN
    PERFORM public.help_state_merge(NULL);
    RAISE EXCEPTION 'a NULL patch must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;

  ASSERT (SELECT help_state FROM public.profiles
          WHERE id = 'e9674000-0000-4000-8000-00000000000a')
         = '{"tours": {"u": 2}, "marginNotes": {"x": 1}}'::jsonb,
    'a refused patch must write nothing';
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true);

-- anon cannot execute
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.help_state_merge('{"tours": {}}'::jsonb);
  RAISE EXCEPTION 'anon executed help_state_merge';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
RESET ROLE;

ROLLBACK;
