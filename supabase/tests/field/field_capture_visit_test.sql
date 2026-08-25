-- ═══════════════════════════════════════════════════════════════════════════
-- field_captures visit + suggestion projection tests
-- (Field Companion wave 3 · migration 005NN_field_capture_visit_and_suggestion)
--
-- Covers:
--   1. A commit carrying a visit envelope fills visit_id / kind / kit / label /
--      started_at — and `capture_schema_version` round-trips whatever the
--      payload carried (the version is Task 0's found value + 1; this file
--      never asserts a literal).
--   2. A commit carrying NO visit envelope leaves every visit column NULL
--      (FC-R2: no visit = null kind).
--   3. A suggestion for a real project + room fills suggested_* + basis +
--      confidence — and NEVER touches project_id / project_room_id.
--   4. A suggestion naming a project that does not resolve is DROPPED, and the
--      commit still succeeds (a stale phone must never hard-fail a sync).
--   4b. A suggestion naming a project that EXISTS but belongs to ANOTHER
--      designer is dropped the same way — the RLS-visibility arm the
--      "suggestions are not facts" claim actually rests on.
--   5. A re-commit on the same client_capture_id updates the visit label
--      (idempotent projection), while the row is still at status='inbox'.
--   6. An UPDATE that carries no new payload leaves the visit intact — the
--      route_field_capture / dismiss_field_capture shape.
--   7. The named CHECKs reject an invalid kind, an invalid kit, an invalid
--      basis, and a confidence outside 0..1 — for a DIRECT writer.
--   8. The vocabulary does not name one thing twice: 'site' is a KIND and is
--      NOT an accepted kit; 'walk_through' is a KIT and is NOT an accepted kind.
--   9. idx_field_captures_visit exists.
--  10. The projection trigger is registered, and the routing guard's trigger
--      NAME sorts before it (read from pg_trigger, not asserted about literals).
--  11. The new routine is not reachable by PUBLIC or anon.
--  12. THE PROJECTION NEVER RAISES. One commit per malformed-payload class —
--      unparsable timestamptz (22007), unknown kit (23514), unknown basis
--      (23514), confidence out of range (23514), confidence past numeric(3,2)
--      (22003), non-uuid visit id (22P02) — each asserting that the commit
--      SUCCEEDS, the offending column is NULL, the rest of the envelope still
--      projects, and the drop is recorded in raw_payload->'visit_projection_errors'.
--
-- How to run (standalone):
--   scripts/run-sql-tests.sh -f field_capture_visit
-- or directly:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/field/field_capture_visit_test.sql
--
-- ⚠ The runner connects as `postgres` (superuser). `pg_temp.assume_user` sets
--   the role and JWT claims so `auth.uid()` resolves and the RPC's own logic is
--   exercised — but this file proves LOGIC, not RLS. No wave report may claim
--   "RLS verified" on the strength of it. (Group 4b runs under `SET LOCAL ROLE
--   authenticated`, which is neither superuser nor BYPASSRLS, so the visibility
--   arm it exercises is real — but it is still one probe, not an RLS audit.)
--
-- Transaction-wrapped + ROLLBACK, so it is idempotent.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── helpers ───────────────────────────────────────────────────────────────
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

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, instance_id, aud, role)
VALUES ('fc300000-0000-4000-8000-000000000001', 'fc-designer@test.invalid', '',
        NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated'),
       -- A SECOND designer, for the cross-designer suggestion probe (4b).
       ('fc300000-0000-4000-8000-000000000002', 'fc-other@test.invalid', '',
        NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fc300000-0000-4000-8000-000000000001', 'fc-designer@test.invalid',
        'FC Designer', NOW(), NOW()),
       ('fc300000-0000-4000-8000-000000000002', 'fc-other@test.invalid',
        'FC Other Designer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('fc300000-0000-4000-8000-0000000000a1', 'Maple St residence',
        'fc300000-0000-4000-8000-000000000001',
        'fc300000-0000-4000-8000-000000000001'),
       -- Owned by the OTHER designer. Real row, real id, invisible to designer 1.
       ('fc300000-0000-4000-8000-0000000000a2', 'Someone else''s project',
        'fc300000-0000-4000-8000-000000000002',
        'fc300000-0000-4000-8000-000000000002');

INSERT INTO project_rooms (id, project_id, name)
VALUES ('fc300000-0000-4000-8000-0000000000b1',
        'fc300000-0000-4000-8000-0000000000a1', 'Living');

-- ─── assertions ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_designer  UUID := 'fc300000-0000-4000-8000-000000000001';
  v_project   UUID := 'fc300000-0000-4000-8000-0000000000a1';
  v_theirs    UUID := 'fc300000-0000-4000-8000-0000000000a2';
  v_room      UUID := 'fc300000-0000-4000-8000-0000000000b1';
  v_visit     UUID := 'fc300000-0000-4000-8000-0000000000c1';
  v_token1    UUID := 'fc300000-0000-4000-8000-0000000000d1';
  v_token2    UUID := 'fc300000-0000-4000-8000-0000000000d2';
  v_token3    UUID := 'fc300000-0000-4000-8000-0000000000d3';
  v_token4    UUID := 'fc300000-0000-4000-8000-0000000000d4';
  v_token5    UUID := 'fc300000-0000-4000-8000-0000000000d5';
  -- One token per malformed-payload class (group 12).
  v_bad       UUID[] := ARRAY[
                'fc300000-0000-4000-8000-0000000000e1',
                'fc300000-0000-4000-8000-0000000000e2',
                'fc300000-0000-4000-8000-0000000000e3',
                'fc300000-0000-4000-8000-0000000000e4',
                'fc300000-0000-4000-8000-0000000000e5',
                'fc300000-0000-4000-8000-0000000000e6']::UUID[];
  -- The payload's own schemaVersion. Task 0 reads FieldCapturePayload's
  -- `currentSchemaVersion` (N) at pre-flight and Task 8 sets it to N+1; this
  -- file asserts the value ROUND-TRIPS, never that it equals a literal.
  v_schema    INT := 3;
  v_row       field_captures%ROWTYPE;
  v_count     INT;
  v_failed    BOOLEAN;
  v_guard     TEXT;
  v_projection TEXT;
  v_keys      TEXT[];
BEGIN
  -- ── 1. A visit envelope lands on the columns ────────────────────────────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_token1, 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema,
      'photos', '[]'::jsonb,
      'visit', jsonb_build_object(
        'id', v_visit::text,
        'kind', 'site',
        'kit', 'walk_through',
        'label', 'Maple St residence',
        'startedAt', '2026-08-25T14:14:00Z')),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_token1;
  ASSERT v_row.visit_id = v_visit,
    'FAIL 1a: visit_id not projected, got ' || COALESCE(v_row.visit_id::text, 'NULL');
  ASSERT v_row.visit_kind = 'site',
    'FAIL 1b: visit_kind, got ' || COALESCE(v_row.visit_kind, 'NULL');
  ASSERT v_row.visit_kit = 'walk_through',
    'FAIL 1c: visit_kit, got ' || COALESCE(v_row.visit_kit, 'NULL');
  ASSERT v_row.visit_label = 'Maple St residence',
    'FAIL 1d: visit_label, got ' || COALESCE(v_row.visit_label, 'NULL');
  ASSERT v_row.visit_started_at = '2026-08-25T14:14:00Z'::timestamptz,
    'FAIL 1e: visit_started_at, got ' || COALESCE(v_row.visit_started_at::text, 'NULL');
  ASSERT v_row.visit_ended_at IS NULL, 'FAIL 1f: visit_ended_at must be NULL';
  -- H2: the wire version the phone sent is the version the row records. The
  -- device and the database must not disagree about which payload shape landed.
  ASSERT v_row.capture_schema_version = v_schema,
    'FAIL 1g: capture_schema_version must round-trip the payload''s schemaVersion, got '
      || COALESCE(v_row.capture_schema_version::text, 'NULL');
  ASSERT NOT (v_row.raw_payload ? 'visit_projection_errors'),
    'FAIL 1h: a well-formed payload must record no projection errors';

  -- ── 2. No visit envelope → every visit column NULL ──────────────────────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_token2, 'inbox',
    jsonb_build_object('schemaVersion', v_schema, 'photos', '[]'::jsonb,
                       'title', 'A drive-home thought'),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_token2;
  ASSERT v_row.visit_id IS NULL AND v_row.visit_kind IS NULL
         AND v_row.visit_kit IS NULL AND v_row.visit_label IS NULL
         AND v_row.visit_started_at IS NULL,
    'FAIL 2: a capture with no visit must carry no visit facts';

  -- ── 3. A resolvable suggestion is stored, and is NOT the fact ───────────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_token3, 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'suggestion', jsonb_build_object(
        'projectId', v_project::text,
        'projectRoomId', v_room::text,
        'basis', 'proximity',
        'confidence', 0.61)),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_token3;
  ASSERT v_row.suggested_project_id = v_project, 'FAIL 3a: suggested_project_id';
  ASSERT v_row.suggested_project_room_id = v_room, 'FAIL 3b: suggested_project_room_id';
  ASSERT v_row.suggestion_basis = 'proximity', 'FAIL 3c: suggestion_basis';
  ASSERT v_row.suggestion_confidence = 0.61, 'FAIL 3d: suggestion_confidence';
  ASSERT v_row.project_id IS NULL,
    'FAIL 3e: a suggestion must NEVER be written to project_id';
  ASSERT v_row.project_room_id IS NULL,
    'FAIL 3f: a suggestion must NEVER be written to project_room_id';

  -- ── 4. An unresolvable suggestion is dropped, not raised ────────────────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_token4, 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'suggestion', jsonb_build_object(
        'projectId', 'fc300000-0000-4000-8000-00000000dead',
        'basis', 'venue', 'confidence', 0.4)),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO v_count FROM field_captures WHERE client_capture_id = v_token4;
  ASSERT v_count = 1, 'FAIL 4a: a stale suggestion must not fail the commit';
  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_token4;
  ASSERT v_row.suggested_project_id IS NULL,
    'FAIL 4b: an unresolvable suggested project must be dropped';
  ASSERT v_row.suggestion_basis = 'venue', 'FAIL 4c: the basis still records why';

  -- ── 4b. A suggestion naming ANOTHER DESIGNER'S project is dropped ───────
  -- Group 4 exercises the FK arm (a uuid with no row). This exercises the arm
  -- the design's "suggestions are not facts" claim actually rests on: the row
  -- EXISTS, and the projection's EXISTS probe runs under the caller's RLS, so a
  -- project she cannot see is treated as absent. Nothing raises; the capture
  -- syncs; the suggestion is simply not made.
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_token5, 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'suggestion', jsonb_build_object(
        'projectId', v_theirs::text,
        'basis', 'proximity', 'confidence', 0.88)),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO v_count FROM field_captures WHERE client_capture_id = v_token5;
  ASSERT v_count = 1,
    'FAIL 4d: a suggestion naming an unowned project must not fail the commit';
  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_token5;
  ASSERT v_row.suggested_project_id IS NULL,
    'FAIL 4e: another designer''s project must never be suggested, got '
      || COALESCE(v_row.suggested_project_id::text, 'NULL');
  ASSERT v_row.project_id IS NULL,
    'FAIL 4f: and it must certainly never become the fact';
  -- The row really is there and really is owned by someone else.
  SELECT COUNT(*) INTO v_count FROM projects WHERE id = v_theirs;
  ASSERT v_count = 1, 'FAIL 4g: fixture broken — the other designer''s project must exist';

  -- ── 5. A re-commit re-projects (idempotent), row still at 'inbox' ───────
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_token1, 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'visit', jsonb_build_object(
        'id', v_visit::text, 'kind', 'site', 'kit', 'walk_through',
        'label', 'Maple St — second floor',
        'startedAt', '2026-08-25T14:14:00Z')),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_token1;
  ASSERT v_row.visit_label = 'Maple St — second floor',
    'FAIL 5a: a re-commit must re-project the label, got ' || COALESCE(v_row.visit_label, 'NULL');
  ASSERT v_row.visit_id = v_visit, 'FAIL 5b: the visit id must not change';

  -- ── 6. A payload-less UPDATE leaves the visit intact ────────────────────
  UPDATE field_captures SET status = 'inbox', shelf = 'Seating · maybe'
   WHERE client_capture_id = v_token1;
  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_token1;
  ASSERT v_row.visit_id = v_visit AND v_row.visit_kind = 'site'
         AND v_row.visit_label = 'Maple St — second floor',
    'FAIL 6: an UPDATE carrying no new payload must never clear the visit';

  -- ── 7. The named CHECKs bite — for a DIRECT writer ──────────────────────
  -- These UPDATEs blank raw_payload and set the column by hand, which is
  -- exactly the portal/backfill shape the CHECKs exist for. The trigger leaves
  -- a column alone when its payload key is absent, so the constraint is what
  -- rejects the value. Group 12 proves the DEVICE path can no longer get here.
  v_failed := FALSE;
  BEGIN
    UPDATE field_captures SET raw_payload = '{}'::jsonb, visit_kind = 'roving'
     WHERE client_capture_id = v_token2;
  EXCEPTION WHEN check_violation THEN v_failed := TRUE;
  END;
  ASSERT v_failed, 'FAIL 7a: field_captures_visit_kind_ck must reject ''roving''';

  v_failed := FALSE;
  BEGIN
    UPDATE field_captures SET raw_payload = '{}'::jsonb, visit_kit = 'market'
     WHERE client_capture_id = v_token2;
  EXCEPTION WHEN check_violation THEN v_failed := TRUE;
  END;
  ASSERT v_failed, 'FAIL 7b: field_captures_visit_kit_ck must reject ''market''';

  v_failed := FALSE;
  BEGIN
    UPDATE field_captures SET raw_payload = '{}'::jsonb, suggestion_basis = 'vibes'
     WHERE client_capture_id = v_token2;
  EXCEPTION WHEN check_violation THEN v_failed := TRUE;
  END;
  ASSERT v_failed, 'FAIL 7c: field_captures_suggestion_basis_ck must reject ''vibes''';

  v_failed := FALSE;
  BEGIN
    UPDATE field_captures SET raw_payload = '{}'::jsonb, suggestion_confidence = 1.5
     WHERE client_capture_id = v_token2;
  EXCEPTION WHEN check_violation OR numeric_value_out_of_range THEN v_failed := TRUE;
  END;
  ASSERT v_failed, 'FAIL 7d: suggestion_confidence must be constrained to 0..1';

  -- ── 8. The vocabulary never names one thing twice (FC-R2) ───────────────
  v_failed := FALSE;
  BEGIN
    UPDATE field_captures SET raw_payload = '{}'::jsonb, visit_kit = 'site'
     WHERE client_capture_id = v_token2;
  EXCEPTION WHEN check_violation THEN v_failed := TRUE;
  END;
  ASSERT v_failed, 'FAIL 8a: ''site'' is a KIND and must not be an accepted kit';

  v_failed := FALSE;
  BEGIN
    UPDATE field_captures SET raw_payload = '{}'::jsonb, visit_kind = 'walk_through'
     WHERE client_capture_id = v_token2;
  EXCEPTION WHEN check_violation THEN v_failed := TRUE;
  END;
  ASSERT v_failed, 'FAIL 8b: ''walk_through'' is a KIT and must not be an accepted kind';

  -- ── 9. The visit index exists ───────────────────────────────────────────
  SELECT COUNT(*) INTO v_count FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'idx_field_captures_visit';
  ASSERT v_count = 1, 'FAIL 9: idx_field_captures_visit is missing';

  -- ── 10. The projection trigger is registered, and sorts AFTER the guard ──
  SELECT COUNT(*) INTO v_count FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'field_captures'
     AND t.tgname = 'trg_field_captures_visit_projection'
     AND NOT t.tgisinternal;
  ASSERT v_count = 1, 'FAIL 10a: trg_field_captures_visit_projection is missing';

  -- Read BOTH names off the live catalog. Comparing two string literals would
  -- be true regardless of the database and would prove nothing about either
  -- trigger existing, or being named what this migration assumes.
  SELECT t.tgname INTO v_guard FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'field_captures' AND NOT t.tgisinternal
     AND t.tgname = 'trg_field_captures_guard_insert';
  SELECT t.tgname INTO v_projection FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'field_captures' AND NOT t.tgisinternal
     AND t.tgname = 'trg_field_captures_visit_projection';
  ASSERT v_guard IS NOT NULL, 'FAIL 10b: the routing guard trigger is missing';
  ASSERT v_projection IS NOT NULL, 'FAIL 10c: the projection trigger is missing';
  ASSERT v_guard < v_projection,
    'FAIL 10d: the routing guard must sort BEFORE the projection trigger, got '
      || v_guard || ' vs ' || v_projection;

  -- ── 11. The new routine is not reachable by PUBLIC or anon ──────────────
  SELECT COUNT(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'field_captures_project_visit_columns'
     AND (has_function_privilege('public', p.oid, 'EXECUTE')
          OR has_function_privilege('anon', p.oid, 'EXECUTE'));
  ASSERT v_count = 0,
    'FAIL 11: field_captures_project_visit_columns must be REVOKEd from PUBLIC and anon';

  -- ── 12. THE PROJECTION NEVER RAISES ─────────────────────────────────────
  -- Six payload classes that each used to abort commit_field_capture on BOTH
  -- destinations — permanently, because the outbox retries the same bytes
  -- forever. Every one must now commit, drop only the offending value, and say
  -- what it dropped.

  -- 12a · 22007 — an unparsable timestamp. The rest of the envelope survives.
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_bad[1], 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'visit', jsonb_build_object('id', v_visit::text, 'kind', 'site',
                                  'startedAt', 'last tuesday')),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_bad[1];
  ASSERT v_row.id IS NOT NULL, 'FAIL 12a: a bad timestamp must not fail the commit';
  ASSERT v_row.visit_started_at IS NULL, 'FAIL 12a: the bad timestamp must be dropped';
  ASSERT v_row.visit_kind = 'site', 'FAIL 12a: the rest of the visit must still project';
  SELECT array_agg(e->>'key') INTO v_keys
    FROM jsonb_array_elements(v_row.raw_payload->'visit_projection_errors') e;
  ASSERT v_keys @> ARRAY['visit.startedAt'],
    'FAIL 12a: the drop must be recorded under visit.startedAt';

  -- 12b · 23514 — a kit this database has never heard of (a widened vocabulary,
  -- or simply a newer build than the schema).
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_bad[2], 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'visit', jsonb_build_object('id', v_visit::text, 'kind', 'site',
                                  'kit', 'punch_walk')),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_bad[2];
  ASSERT v_row.id IS NOT NULL, 'FAIL 12b: an unknown kit must not fail the commit';
  ASSERT v_row.visit_kit IS NULL, 'FAIL 12b: the unknown kit must be dropped';
  ASSERT v_row.visit_kind = 'site', 'FAIL 12b: the known keys must still project';
  SELECT array_agg(e->>'key') INTO v_keys
    FROM jsonb_array_elements(v_row.raw_payload->'visit_projection_errors') e;
  ASSERT v_keys @> ARRAY['visit.kit'], 'FAIL 12b: the drop must be recorded under visit.kit';

  -- 12c · 23514 — an unknown suggestion basis.
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_bad[3], 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'suggestion', jsonb_build_object('projectId', v_project::text,
                                       'basis', 'vibes', 'confidence', 0.5)),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_bad[3];
  ASSERT v_row.id IS NOT NULL, 'FAIL 12c: an unknown basis must not fail the commit';
  ASSERT v_row.suggestion_basis IS NULL, 'FAIL 12c: the unknown basis must be dropped';
  ASSERT v_row.suggested_project_id = v_project,
    'FAIL 12c: the resolvable project must still be suggested';
  SELECT array_agg(e->>'key') INTO v_keys
    FROM jsonb_array_elements(v_row.raw_payload->'visit_projection_errors') e;
  ASSERT v_keys @> ARRAY['suggestion.basis'],
    'FAIL 12c: the drop must be recorded under suggestion.basis';

  -- 12d · 23514 — a confidence outside 0..1.
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_bad[4], 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'suggestion', jsonb_build_object('projectId', v_project::text,
                                       'basis', 'venue', 'confidence', 1.4)),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_bad[4];
  ASSERT v_row.id IS NOT NULL, 'FAIL 12d: confidence 1.4 must not fail the commit';
  ASSERT v_row.suggestion_confidence IS NULL,
    'FAIL 12d: an out-of-range confidence must be dropped';
  ASSERT v_row.suggestion_basis = 'venue', 'FAIL 12d: the basis still records why';
  SELECT array_agg(e->>'key') INTO v_keys
    FROM jsonb_array_elements(v_row.raw_payload->'visit_projection_errors') e;
  ASSERT v_keys @> ARRAY['suggestion.confidence'],
    'FAIL 12d: the drop must be recorded under suggestion.confidence';

  -- 12e · 22003 — a confidence past numeric(3,2)'s 9.99 ceiling, which used to
  -- overflow at ASSIGNMENT, before the CHECK ever ran.
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_bad[5], 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'suggestion', jsonb_build_object('projectId', v_project::text,
                                       'basis', 'venue', 'confidence', 12.5)),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_bad[5];
  ASSERT v_row.id IS NOT NULL, 'FAIL 12e: confidence 12.5 must not fail the commit';
  ASSERT v_row.suggestion_confidence IS NULL,
    'FAIL 12e: an overflowing confidence must be dropped';
  SELECT array_agg(e->>'key') INTO v_keys
    FROM jsonb_array_elements(v_row.raw_payload->'visit_projection_errors') e;
  ASSERT v_keys @> ARRAY['suggestion.confidence'],
    'FAIL 12e: the drop must be recorded under suggestion.confidence';

  -- 12f · 22P02 — a visit id that is not a uuid.
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    v_bad[6], 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'visit', jsonb_build_object('id', 'not-a-uuid', 'kind', 'sourcing',
                                  'label', 'High Point 214')),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO v_row FROM field_captures WHERE client_capture_id = v_bad[6];
  ASSERT v_row.id IS NOT NULL, 'FAIL 12f: a non-uuid visit id must not fail the commit';
  ASSERT v_row.visit_id IS NULL, 'FAIL 12f: the non-uuid visit id must be dropped';
  ASSERT v_row.visit_kind = 'sourcing' AND v_row.visit_label = 'High Point 214',
    'FAIL 12f: the rest of the visit must still project';
  SELECT array_agg(e->>'key') INTO v_keys
    FROM jsonb_array_elements(v_row.raw_payload->'visit_projection_errors') e;
  ASSERT v_keys @> ARRAY['visit.id'], 'FAIL 12f: the drop must be recorded under visit.id';

  -- 12g · The same malformed payload on the LIBRARY destination — the branch
  -- with the safe harbor, which does NOT cover the upsert. It must commit too.
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    'fc300000-0000-4000-8000-0000000000f1'::uuid, 'library',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'title', 'A chair at the market',
      'visit', jsonb_build_object('id', v_visit::text, 'kind', 'sourcing',
                                  'kit', 'punch_walk', 'startedAt', 'last tuesday')),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT COUNT(*) INTO v_count FROM field_captures
   WHERE client_capture_id = 'fc300000-0000-4000-8000-0000000000f1'::uuid;
  ASSERT v_count = 1,
    'FAIL 12g: a malformed payload must not fail the commit on the library path either';

  -- ═════════════════════════════════════════════════════════════════════════
  -- GROUP 13 — ADDED BY TASK 9 (fix round 1), NOT AUTHORED BY TASK 10.
  -- Covers the two behaviours the round-1 review added to the migration:
  --   (a) an unresolved suggestion id is RECORDED as 23503, not dropped silently
  --   (b) the TG_OP gate — an UPDATE that does not move raw_payload does not
  --       re-project, so a deliberately cleared column stays cleared
  -- Task 10 may fold these into its own numbering; they are grouped here so it
  -- can see exactly what it did not write.
  -- ═════════════════════════════════════════════════════════════════════════

  -- 13a · A well-formed projectId that resolves to NOTHING is recorded.
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    'fc300000-0000-4000-8000-0000000000f2'::uuid, 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'suggestion', jsonb_build_object(
        'projectId', 'fc300000-0000-4000-8000-00000000dead'::text,
        'basis', 'visit', 'confidence', 0.5)),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO v_row FROM field_captures
   WHERE client_capture_id = 'fc300000-0000-4000-8000-0000000000f2'::uuid;
  ASSERT v_row.id IS NOT NULL, 'FAIL 13a: an unresolved projectId must not fail the commit';
  ASSERT v_row.suggested_project_id IS NULL, 'FAIL 13a: the unresolved projectId must be dropped';
  ASSERT v_row.suggestion_basis = 'visit', 'FAIL 13a: the rest of the suggestion must still project';
  SELECT array_agg(e->>'key') INTO v_keys
    FROM jsonb_array_elements(v_row.raw_payload->'visit_projection_errors') e;
  ASSERT v_keys @> ARRAY['suggestion.projectId'],
    'FAIL 13a: the unresolved projectId drop must be RECORDED, not silent';
  ASSERT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_row.raw_payload->'visit_projection_errors') e
     WHERE e->>'key' = 'suggestion.projectId' AND e->>'sqlstate' = '23503'),
    'FAIL 13a: the recorded sqlstate must be 23503 (the FK code it would have raised)';

  -- 13b · The RLS-visibility arm: a project that EXISTS but belongs to another
  -- designer is recorded the same way. This is the drop most easily mistaken
  -- for an RLS bug, which is exactly why it must leave a trace.
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    'fc300000-0000-4000-8000-0000000000f3'::uuid, 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'suggestion', jsonb_build_object('projectId', v_theirs::text, 'basis', 'scan')),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO v_row FROM field_captures
   WHERE client_capture_id = 'fc300000-0000-4000-8000-0000000000f3'::uuid;
  ASSERT v_row.suggested_project_id IS NULL,
    'FAIL 13b: another designer''s project must not be admitted as a suggestion';
  ASSERT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_row.raw_payload->'visit_projection_errors') e
     WHERE e->>'key' = 'suggestion.projectId' AND e->>'sqlstate' = '23503'),
    'FAIL 13b: the cross-designer drop must be recorded as 23503';

  -- 13c · The same for projectRoomId.
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    'fc300000-0000-4000-8000-0000000000f4'::uuid, 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'suggestion', jsonb_build_object(
        'projectId', v_project::text,
        'projectRoomId', 'fc300000-0000-4000-8000-00000000beef'::text,
        'basis', 'proximity')),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO v_row FROM field_captures
   WHERE client_capture_id = 'fc300000-0000-4000-8000-0000000000f4'::uuid;
  ASSERT v_row.suggested_project_id = v_project,
    'FAIL 13c: the resolvable projectId must still be admitted';
  ASSERT v_row.suggested_project_room_id IS NULL,
    'FAIL 13c: the unresolved projectRoomId must be dropped';
  ASSERT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_row.raw_payload->'visit_projection_errors') e
     WHERE e->>'key' = 'suggestion.projectRoomId' AND e->>'sqlstate' = '23503'),
    'FAIL 13c: the unresolved projectRoomId drop must be recorded as 23503';

  -- 13d · THE TG_OP GATE. A correction that clears a wrongly-suggested project
  -- must SURVIVE the next unrelated UPDATE. Before the gate, the projection
  -- re-derived the column from the stored payload and resurrected it.
  PERFORM pg_temp.assume_user(v_designer);
  PERFORM commit_field_capture(
    'fc300000-0000-4000-8000-0000000000f5'::uuid, 'inbox',
    jsonb_build_object(
      'schemaVersion', v_schema, 'photos', '[]'::jsonb,
      'visit', jsonb_build_object('id', v_visit::text, 'kind', 'site',
                                  'label', 'Thursday walk'),
      'suggestion', jsonb_build_object('projectId', v_project::text,
                                       'basis', 'visit', 'confidence', 0.9)),
    NULL, NULL, NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO v_row FROM field_captures
   WHERE client_capture_id = 'fc300000-0000-4000-8000-0000000000f5'::uuid;
  ASSERT v_row.suggested_project_id = v_project,
    'FAIL 13d: precondition — the suggestion must have projected';

  -- The correction: clear the wrong suggestion.
  UPDATE field_captures SET suggested_project_id = NULL WHERE id = v_row.id;
  -- An unrelated UPDATE that carries NO new payload (the route/dismiss shape).
  UPDATE field_captures SET upload_progress = 100 WHERE id = v_row.id;

  SELECT * INTO v_row FROM field_captures WHERE id = v_row.id;
  ASSERT v_row.suggested_project_id IS NULL,
    'FAIL 13d: a cleared suggestion must NOT be resurrected by a payload-less UPDATE';
  ASSERT v_row.visit_id = v_visit AND v_row.visit_label = 'Thursday walk',
    'FAIL 13d: the untouched visit columns must still be intact after both UPDATEs';

  -- And an UPDATE that DOES move raw_payload still projects.
  UPDATE field_captures
     SET raw_payload = raw_payload || jsonb_build_object(
           'visit', jsonb_build_object('id', v_visit::text, 'kind', 'site',
                                       'label', 'Friday walk'))
   WHERE id = v_row.id;
  SELECT * INTO v_row FROM field_captures WHERE id = v_row.id;
  ASSERT v_row.visit_label = 'Friday walk',
    'FAIL 13d: an UPDATE that DOES change raw_payload must still re-project';

  RAISE NOTICE 'All field_captures visit/suggestion assertions passed.';
END
$$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
