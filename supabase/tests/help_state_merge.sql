-- 00674 — help_state_merge: top-level shallow merge into the caller's own
-- profiles.help_state.
--
-- Covers: (1) {marginNotes:{x:1}} after {tours:{t:1}} keeps both keys; (2) an unknown
-- top-level key raises 22023; (3) a non-object patch raises 22023; (4) the result
-- equals the stored column; (5) a stored non-object help_state ([], "str", JSON null)
-- is replaced by the patch, never concatenated into an array; (6) object over object
-- merges one level down (stored tours.x / marginNotes.desk-first-touch survive a
-- sibling patch), scalar over object and object over scalar replace. Also: anon cannot
-- execute; an oversize patch raises 22023.
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

  -- Object over object merges one level down; a second-level entry is replaced whole.
  v_result := public.help_state_merge('{"tours": {"u": 2, "t": 3}}'::jsonb);
  ASSERT v_result = '{"tours": {"t": 3, "u": 2}, "marginNotes": {"x": 1}}'::jsonb,
    format('an object patch must merge into the stored object key, got %s', v_result);
  ASSERT (SELECT help_state FROM public.profiles
          WHERE id = 'e9674000-0000-4000-8000-00000000000a') = v_result,
    'the returned value must equal the stored help_state after a merge';
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
         = '{"tours": {"t": 3, "u": 2}, "marginNotes": {"x": 1}}'::jsonb,
    'a refused patch must write nothing';
END $$;

-- (6) two-level merge (SQ-294 R1 finding 9): a cache that writes before it has
-- hydrated sends only its own entry, and the stored siblings must survive.
RESET ROLE;
UPDATE public.profiles
   SET help_state = '{"tours": {"x": {"completed": true}}, "marginNotes": {"desk-first-touch": {"at": "2026-01-01T00:00:00Z"}}}'::jsonb
 WHERE id = 'e9674000-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.help_state_merge('{"tours": {"y": {"abandoned": true}}}'::jsonb);
  ASSERT v_result -> 'tours' = '{"x": {"completed": true}, "y": {"abandoned": true}}'::jsonb,
    format('a tours patch must keep the stored tours.x, got %s', v_result);

  v_result := public.help_state_merge('{"marginNotes": {"doc-first-touch": {"at": "2026-09-25T00:00:00Z"}}}'::jsonb);
  ASSERT v_result -> 'marginNotes' ? 'desk-first-touch' AND v_result -> 'marginNotes' ? 'doc-first-touch',
    format('a marginNotes patch must keep the stored desk-first-touch, got %s', v_result);
  ASSERT v_result -> 'tours' ? 'x' AND v_result -> 'tours' ? 'y', 'tours untouched by a marginNotes patch';
  ASSERT (SELECT help_state FROM public.profiles
          WHERE id = 'e9674000-0000-4000-8000-00000000000a') = v_result,
    'the returned value must equal the stored help_state';

  -- A second-level JSON null deletes that entry and keeps its siblings.
  v_result := public.help_state_merge('{"tours": {"walk": {"completed": true}}}'::jsonb);
  ASSERT v_result -> 'tours' ? 'walk', 'fixture: tours.walk set';
  v_result := public.help_state_merge('{"tours": {"walk": null}}'::jsonb);
  ASSERT v_result -> 'tours' = '{"x": {"completed": true}, "y": {"abandoned": true}}'::jsonb,
    format('{"tours":{"walk":null}} must remove walk and keep x, y, got %s', v_result);

  -- A null deeper inside an entry is preserved.
  v_result := public.help_state_merge('{"tours": {"walk": {"completedAt": null}}}'::jsonb);
  ASSERT v_result #> '{tours,walk}' = '{"completedAt": null}'::jsonb,
    format('a nested null must be kept, got %s', v_result);

  -- Deleting an entry that does not exist is a no-op.
  v_result := public.help_state_merge('{"tours": {"nope": null}}'::jsonb);
  ASSERT v_result -> 'tours'
         = '{"x": {"completed": true}, "y": {"abandoned": true}, "walk": {"completedAt": null}}'::jsonb,
    format('deleting an absent entry must change nothing, got %s', v_result);
  ASSERT (SELECT help_state FROM public.profiles
          WHERE id = 'e9674000-0000-4000-8000-00000000000a') = v_result,
    'the returned value must equal the stored help_state after the deletes';

  -- Scalar over object replaces; object over scalar replaces (no merge).
  v_result := public.help_state_merge('{"tours": "reset"}'::jsonb);
  ASSERT v_result -> 'tours' = '"reset"'::jsonb,
    format('a scalar patch must replace a stored object, got %s', v_result);
  v_result := public.help_state_merge('{"tours": {"z": 1}}'::jsonb);
  ASSERT v_result -> 'tours' = '{"z": 1}'::jsonb,
    format('an object patch over a stored scalar must replace it, got %s', v_result);
  ASSERT v_result -> 'marginNotes' ? 'desk-first-touch', 'other keys survive the replaces';
END $$;

-- (5) a stored non-object help_state is replaced, not concatenated (R1 finding 6:
-- `[] || {...}` stored [{...}] and grew by one element per write). The fixture
-- value is written as the table owner; the merge runs as the user.
RESET ROLE;
UPDATE public.profiles SET help_state = '[]'::jsonb WHERE id = 'e9674000-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.help_state_merge('{"tours": {"t": 1}}'::jsonb);
  ASSERT v_result = '{"tours": {"t": 1}}'::jsonb,
    format('a stored [] must yield only the patch keys, got %s', v_result);
  ASSERT (SELECT help_state FROM public.profiles
          WHERE id = 'e9674000-0000-4000-8000-00000000000a') = v_result,
    'the stored help_state must be the object, not an array';
END $$;

RESET ROLE;
UPDATE public.profiles SET help_state = '"str"'::jsonb WHERE id = 'e9674000-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.help_state_merge('{"marginNotes": {"x": 1}}'::jsonb);
  ASSERT v_result = '{"marginNotes": {"x": 1}}'::jsonb,
    format('a stored "str" must yield only the patch keys, got %s', v_result);
  ASSERT jsonb_typeof((SELECT help_state FROM public.profiles
                       WHERE id = 'e9674000-0000-4000-8000-00000000000a')) = 'object',
    'the stored help_state must be an object';
END $$;

RESET ROLE;
UPDATE public.profiles SET help_state = 'null'::jsonb WHERE id = 'e9674000-0000-4000-8000-00000000000a';
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.help_state_merge('{"firstAuthoredAt": "2026-09-25T00:00:00Z"}'::jsonb);
  ASSERT v_result = '{"firstAuthoredAt": "2026-09-25T00:00:00Z"}'::jsonb,
    format('a stored JSON null must yield only the patch keys, got %s', v_result);
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
