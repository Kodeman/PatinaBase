-- ═══════════════════════════════════════════════════════════════════════════
-- field_captures.confirmations / proposals — the 00669 projection (NI-02, F6)
--
--   1. A V4 payload projects both objects; a well-formed payload records no
--      projection error.
--   2. A V3 payload without the keys leaves both columns '{}'.
--   3. CONFIRMED → UNCONFIRMED RECOMMIT: a first commit with {"maker": …},
--      a second commit of the same capture with {} clears the column. This is
--      where 00669 deliberately departs from 00532's never-clears policy.
--   4. A recommit that changes an unrelated payload key but carries the same
--      confirmations re-projects the same value.
--   5. A recommit that omits the keys (a V3 client) leaves both columns alone.
--   6. Malformed confirmations (an array) and proposals (null) record an error
--      once each, do not raise, and leave the prior value.
--   7. The trigger's entries append to commit_field_capture's own
--      projection_errors (a malformed captureKind) rather than replacing them.
--   8. dismiss_field_capture after commit preserves the projection.
--
-- How to run (standalone):
--   scripts/run-sql-tests.sh -f field_capture_confirmations
-- or directly:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/field/field_capture_confirmations_test.sql
--
-- Proves LOGIC, not RLS (the runner is a superuser; assume_user only makes
-- auth.uid() resolve). Transaction-wrapped + ROLLBACK, so it is idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, instance_id, aud, role)
VALUES ('fc690000-0000-4000-8000-000000000001', 'fc-confirm@test.invalid', '',
        NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fc690000-0000-4000-8000-000000000001', 'fc-confirm@test.invalid',
        'FC Confirm Designer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  v_designer UUID := 'fc690000-0000-4000-8000-000000000001';
  v_v4       UUID := 'fc690000-0000-4000-8000-0000000000d1';
  v_v3       UUID := 'fc690000-0000-4000-8000-0000000000d2';
  v_bad      UUID := 'fc690000-0000-4000-8000-0000000000d3';
  v_both     UUID := 'fc690000-0000-4000-8000-0000000000d4';
  v_dismiss  UUID := 'fc690000-0000-4000-8000-0000000000d5';
  v_confirm  JSONB := jsonb_build_object(
                'maker', jsonb_build_object(
                  'confirmedBy', 'fc690000-0000-4000-8000-000000000001',
                  'confirmedAt', '2026-09-25T10:00:00Z'));
  v_propose  JSONB := jsonb_build_object('maker', 'Hollis & Co');
  v_row      field_captures%ROWTYPE;
  v_errs     JSONB;
BEGIN
  -- ── 1. V4 payload projects both objects ─────────────────────────────────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_v4, 'inbox',
    jsonb_build_object('schemaVersion', 4, 'photos', '[]'::jsonb,
                       'title', 'Walnut console',
                       'confirmations', v_confirm, 'proposals', v_propose),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_v4;
  ASSERT v_row.confirmations = v_confirm,
    'FAIL 1a: confirmations not projected, got ' || v_row.confirmations::text;
  ASSERT v_row.proposals = v_propose,
    'FAIL 1b: proposals not projected, got ' || v_row.proposals::text;
  ASSERT NOT (v_row.raw_payload ? 'projection_errors'),
    'FAIL 1c: a well-formed payload must record no projection errors, got '
      || (v_row.raw_payload -> 'projection_errors')::text;

  -- ── 2. V3 payload without the keys → '{}' ───────────────────────────────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_v3, 'inbox',
    jsonb_build_object('schemaVersion', 3, 'photos', '[]'::jsonb,
                       'title', 'A V3 capture'),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_v3;
  ASSERT v_row.confirmations = '{}'::jsonb AND v_row.proposals = '{}'::jsonb,
    'FAIL 2: a payload without the keys must leave both columns ''{}''';

  -- ── 3. Confirmed → unconfirmed recommit clears ──────────────────────────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_v4, 'inbox',
    jsonb_build_object('schemaVersion', 4, 'photos', '[]'::jsonb,
                       'title', 'Walnut console',
                       'confirmations', '{}'::jsonb, 'proposals', '{}'::jsonb),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_v4;
  ASSERT v_row.confirmations = '{}'::jsonb,
    'FAIL 3a: a recommit with confirmations {} must clear the column, got '
      || v_row.confirmations::text;
  ASSERT v_row.proposals = '{}'::jsonb,
    'FAIL 3b: a recommit with proposals {} must clear the column, got '
      || v_row.proposals::text;

  -- ── 4. Unrelated key changes, same confirmations → same value ───────────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_v4, 'inbox',
    jsonb_build_object('schemaVersion', 4, 'photos', '[]'::jsonb,
                       'title', 'Walnut console',
                       'confirmations', v_confirm, 'proposals', v_propose),
    NULL, NULL, NULL, NULL);
  PERFORM commit_field_capture(
    v_v4, 'inbox',
    jsonb_build_object('schemaVersion', 4, 'photos', '[]'::jsonb,
                       'title', 'Walnut console, renamed',
                       'confirmations', v_confirm, 'proposals', v_propose),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_v4;
  ASSERT v_row.raw_payload ->> 'title' = 'Walnut console, renamed',
    'FAIL 4a: the recommit did not reach the row';
  ASSERT v_row.confirmations = v_confirm AND v_row.proposals = v_propose,
    'FAIL 4b: an unrelated-key recommit must re-project the same values';

  -- ── 5. Recommit without the keys (V3 client) leaves both alone ──────────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_v4, 'inbox',
    jsonb_build_object('schemaVersion', 3, 'photos', '[]'::jsonb,
                       'title', 'Walnut console, from an old build'),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_v4;
  ASSERT v_row.raw_payload ->> 'title' = 'Walnut console, from an old build',
    'FAIL 5a: the recommit did not reach the row';
  ASSERT v_row.confirmations = v_confirm AND v_row.proposals = v_propose,
    'FAIL 5b: a payload without the keys must leave both columns alone';

  -- ── 6. Malformed values: recorded once, no raise, prior value kept ──────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_bad, 'inbox',
    jsonb_build_object('schemaVersion', 4, 'photos', '[]'::jsonb,
                       'confirmations', v_confirm, 'proposals', v_propose),
    NULL, NULL, NULL, NULL);
  -- The recommit goes through INSERT … ON CONFLICT DO UPDATE, which fires the
  -- trigger twice; each error must still appear exactly once.
  PERFORM commit_field_capture(
    v_bad, 'inbox',
    jsonb_build_object('schemaVersion', 4, 'photos', '[]'::jsonb,
                       'confirmations', '["maker"]'::jsonb,
                       'proposals', 'null'::jsonb),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_bad;
  ASSERT v_row.confirmations = v_confirm,
    'FAIL 6a: a malformed confirmations must leave the prior value, got '
      || v_row.confirmations::text;
  ASSERT v_row.proposals = v_propose,
    'FAIL 6b: a malformed proposals must leave the prior value, got '
      || v_row.proposals::text;
  v_errs := v_row.raw_payload -> 'projection_errors';
  ASSERT jsonb_typeof(v_errs) = 'array',
    'FAIL 6c: projection_errors must be an array, got ' || COALESCE(v_errs::text, 'NULL');
  ASSERT (SELECT count(*) FROM jsonb_array_elements(v_errs) e
           WHERE e ->> 'key' = 'confirmations'
             AND e ->> 'reason' LIKE '%(got array)%') = 1,
    'FAIL 6d: the array confirmations must be recorded exactly once, got ' || v_errs::text;
  ASSERT (SELECT count(*) FROM jsonb_array_elements(v_errs) e
           WHERE e ->> 'key' = 'proposals'
             AND e ->> 'reason' LIKE '%(got null)%') = 1,
    'FAIL 6e: the null proposals must be recorded exactly once, got ' || v_errs::text;

  -- A later clean recommit replaces raw_payload, so the record goes away.
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_bad, 'inbox',
    jsonb_build_object('schemaVersion', 4, 'photos', '[]'::jsonb,
                       'confirmations', '{}'::jsonb, 'proposals', '{}'::jsonb),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_bad;
  ASSERT NOT (v_row.raw_payload ? 'projection_errors'),
    'FAIL 6f: a clean recommit must carry no projection errors';
  ASSERT v_row.confirmations = '{}'::jsonb AND v_row.proposals = '{}'::jsonb,
    'FAIL 6g: the clean recommit must clear both columns';

  -- ── 7. Appends to commit_field_capture's own projection_errors ──────────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_both, 'inbox',
    jsonb_build_object('schemaVersion', 4, 'photos', '[]'::jsonb,
                       'captureKind', 'sculpture',
                       'confirmations', '"maker"'::jsonb),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_both;
  v_errs := v_row.raw_payload -> 'projection_errors';
  ASSERT v_errs @> '[{"key":"captureKind"}]'::jsonb,
    'FAIL 7a: commit_field_capture''s own entry must survive, got ' || COALESCE(v_errs::text, 'NULL');
  ASSERT v_errs @> '[{"key":"confirmations"}]'::jsonb,
    'FAIL 7b: the trigger''s entry must be appended, got ' || COALESCE(v_errs::text, 'NULL');
  ASSERT v_row.confirmations = '{}'::jsonb,
    'FAIL 7c: a malformed first commit must leave the default';

  -- ── 8. dismiss_field_capture preserves the projection ───────────────────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_dismiss, 'inbox',
    jsonb_build_object('schemaVersion', 4, 'photos', '[]'::jsonb,
                       'confirmations', v_confirm, 'proposals', v_propose),
    NULL, NULL, NULL, NULL);
  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_dismiss;
  PERFORM dismiss_field_capture(v_row.id);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_dismiss;
  ASSERT v_row.status = 'dismissed', 'FAIL 8a: the capture was not dismissed';
  ASSERT v_row.confirmations = v_confirm AND v_row.proposals = v_propose,
    'FAIL 8b: dismiss_field_capture must preserve both columns';

  RAISE NOTICE 'All field_captures confirmations/proposals assertions passed.';
END
$$;

ROLLBACK;
