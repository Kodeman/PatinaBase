-- mark_arrival / arrival_anchors regression (00675, US-14 arrival v3)
-- Run after 00675 lands:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/arrival_anchors_test.sql
--
-- Chain-keying case omitted deliberately: 00675's header records that
-- mark_arrival stores p_engagement_id exactly as given, with no chain-
-- following resolution (briefing-data.md §3's draft performs none either).
-- A proposal's document_state.engagement_id (chain_root_id) and its
-- post-activation project's engagement_id (projects.id) are therefore
-- different keys under this function — there is no "resolve to the same
-- row" behavior to assert.

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('a1500000-0000-4000-8000-000000000001', 'arrival-a@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a1500000-0000-4000-8000-000000000002', 'arrival-b@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a1500000-0000-4000-8000-000000000001', 'arrival-a@test.invalid', 'Arrival Actor A', NOW(), NOW()),
  ('a1500000-0000-4000-8000-000000000002', 'arrival-b@test.invalid', 'Arrival Actor B', NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = EXCLUDED.updated_at;

CREATE OR REPLACE FUNCTION pg_temp.assume_arrival_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
END;
$$;
-- 00483 strips PUBLIC EXECUTE from routines created after it, pg_temp included,
-- and every call below runs under SET LOCAL ROLE authenticated.
GRANT EXECUTE ON FUNCTION pg_temp.assume_arrival_actor(uuid) TO PUBLIC;

-- ── ACL shape ────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT NOT has_function_privilege(
    'anon', 'public.mark_arrival(text,uuid)', 'EXECUTE'
  ), 'anon must not execute mark_arrival';
  ASSERT has_function_privilege(
    'authenticated', 'public.mark_arrival(text,uuid)', 'EXECUTE'
  ), 'authenticated must execute mark_arrival';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.arrival_anchors', 'INSERT'
  ), 'authenticated must not insert arrival_anchors directly';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.arrival_anchors', 'UPDATE'
  ), 'authenticated must not update arrival_anchors directly';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.arrival_anchors', 'DELETE'
  ), 'authenticated must not delete arrival_anchors directly';
  ASSERT has_table_privilege(
    'authenticated', 'public.arrival_anchors', 'SELECT'
  ), 'authenticated must be able to read its own rows';
  ASSERT NOT has_table_privilege(
    'anon', 'public.arrival_anchors', 'SELECT'
  ), 'anon must not read arrival_anchors (case 8)';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_arrival_actor('a1500000-0000-4000-8000-000000000001');

-- ── Case 1: first desk call returns NULL and inserts exactly one row ──────────────────
DO $$
DECLARE
  v_result timestamptz;
BEGIN
  v_result := public.mark_arrival('desk');
  ASSERT v_result IS NULL, 'first desk call must return NULL previous_seen_at';
  ASSERT (
    SELECT count(*) FROM public.arrival_anchors
    WHERE user_id = 'a1500000-0000-4000-8000-000000000001'
      AND scope = 'desk' AND engagement_id IS NULL
  ) = 1, 'first desk call must insert exactly one row';
END;
$$;

-- ── Case 2 + 4: a second call within 30 min keeps previous_seen_at NULL, bumps seen_at,
-- and — because it upserts the SAME row rather than inserting a second one — proves the
-- NULLS NOT DISTINCT key collapses two desk calls (NULL engagement_id) onto one row. ────
DO $$
DECLARE
  v_seen_before timestamptz;
  v_result      timestamptz;
  v_seen_after  timestamptz;
BEGIN
  SELECT seen_at INTO v_seen_before FROM public.arrival_anchors
  WHERE user_id = 'a1500000-0000-4000-8000-000000000001'
    AND scope = 'desk' AND engagement_id IS NULL;

  v_result := public.mark_arrival('desk');
  ASSERT v_result IS NULL,
    'second call inside the 30-minute visit window must still return NULL previous_seen_at';

  SELECT seen_at INTO v_seen_after FROM public.arrival_anchors
  WHERE user_id = 'a1500000-0000-4000-8000-000000000001'
    AND scope = 'desk' AND engagement_id IS NULL;
  ASSERT v_seen_after >= v_seen_before, 'seen_at must advance (or hold, same clock tick) on a repeat call';

  ASSERT (
    SELECT count(*) FROM public.arrival_anchors
    WHERE user_id = 'a1500000-0000-4000-8000-000000000001'
      AND scope = 'desk' AND engagement_id IS NULL
  ) = 1, 'desk scope with NULL engagement_id must upsert ONE row across two calls (NULLS NOT DISTINCT)';
END;
$$;

-- ── Case 3: a call ≥30 min after the last one returns the old seen_at as previous_seen_at
RESET ROLE;
UPDATE public.arrival_anchors
SET seen_at = now() - interval '31 minutes'
WHERE user_id = 'a1500000-0000-4000-8000-000000000001'
  AND scope = 'desk' AND engagement_id IS NULL;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_arrival_actor('a1500000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_old_seen_at timestamptz;
  v_result      timestamptz;
BEGIN
  SELECT seen_at INTO v_old_seen_at FROM public.arrival_anchors
  WHERE user_id = 'a1500000-0000-4000-8000-000000000001'
    AND scope = 'desk' AND engagement_id IS NULL;

  v_result := public.mark_arrival('desk');
  ASSERT v_result = v_old_seen_at,
    format('after >=30 min, previous_seen_at must equal the prior seen_at: got %s, expected %s',
      v_result, v_old_seen_at);
END;
$$;

-- ── Case 5: document scope requires an engagement id (shape check raises 22023) ───────
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.mark_arrival('document', NULL);
  EXCEPTION WHEN invalid_parameter_value THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'document scope without an engagement_id must raise 22023 (shape check)';
END;
$$;

-- Document scope WITH an engagement id succeeds and coexists as a distinct row from desk.
DO $$
DECLARE
  v_result timestamptz;
BEGIN
  v_result := public.mark_arrival('document', 'a1590000-0000-4000-8000-000000000099');
  ASSERT v_result IS NULL, 'first document-scope call for a given engagement must return NULL';
  ASSERT (
    SELECT count(*) FROM public.arrival_anchors
    WHERE user_id = 'a1500000-0000-4000-8000-000000000001'
  ) = 2, 'the desk row and the document row must coexist as two distinct rows';
END;
$$;

-- ── Case 6: anon is denied EXECUTE on mark_arrival ─────────────────────────────────────
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.mark_arrival('desk');
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'anon must be denied EXECUTE on mark_arrival';
END;
$$;

-- ── Case 8: anon has no SELECT on arrival_anchors ──────────────────────────────────────
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM count(*) FROM public.arrival_anchors;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'anon must not be able to select arrival_anchors';
END;
$$;
RESET ROLE;

-- ── Case 7: user B cannot SELECT user A's row (RLS), and gets only their own ──────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_arrival_actor('a1500000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_result timestamptz;
BEGIN
  ASSERT (
    SELECT count(*) FROM public.arrival_anchors
    WHERE user_id = 'a1500000-0000-4000-8000-000000000001'
  ) = 0, 'user B must not see user A''s arrival_anchors rows under RLS';

  v_result := public.mark_arrival('desk');
  ASSERT v_result IS NULL, 'user B''s own first desk call must also return NULL';
  ASSERT (
    SELECT count(*) FROM public.arrival_anchors
    WHERE user_id = 'a1500000-0000-4000-8000-000000000002'
  ) = 1, 'user B must see exactly their own row, never user A''s';
END;
$$;

RESET ROLE;

ROLLBACK;
