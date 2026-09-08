-- ═══════════════════════════════════════════════════════════════════════════
-- 00580 — the room concept render: the bucket's policies and the widened reader
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Every file in that tree is a
-- plain psql script — BEGIN, pg_temp role-assumption helpers, DO blocks of
-- ASSERTs, ROLLBACK — run under ON_ERROR_STOP=1. This file follows
-- rls/project_notes_test.sql.
--
-- Run (single file, for iteration):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/room_concept_render_test.sql
--
-- Run (the actual gate — whole suite against KNOWN_FAILURES.md):
--   bash scripts/run-sql-tests.sh
--
-- Fixture: the seeded designer↔client pair every local reset carries
-- (designer@patina.dev a0000000-…-0004, client@patina.dev a0000000-…-0005,
-- project b0000000-…-00d1 "Aspen Loft Refresh" with rooms b0000000-…-0d2c0a
-- "Dining Room" and b0000000-…-0d2c0b "Living Room"), plus
-- seed/the-client-page.sql's one executed furnishings authorization and one
-- executed trade scope, so the widened reader has a line on each branch.
-- Third parties, exactly as project_notes_test.sql establishes them:
-- studio_manager@patina.dev a0000000-…-0003 is an ACTIVE non-guest co-member of
-- the project designer's studio (the studio WRITER under test — deliberately
-- not the project's own designer, or the studio rule would prove nothing);
-- cf-phase1-alice cf100000-…-0001 owns a different organization and is the
-- SECOND STUDIO; manufacturer@patina.dev a0000000-…-0006 holds no organization
-- membership, no project and no coordination party, and his id is FIXED by
-- seed/dev-accounts.sql, so he is the STRANGER and his refusals are not vacuous.
--
-- Covers:
--   1. the bucket exists and is PRIVATE, size-capped, image-only
--   2. a studio co-member writes under its own <project_id>/<room_id>/ prefix,
--      and cannot write under another project's prefix or a malformed one
--   3. the second studio cannot write under this project's prefix
--   4. the project client SELECTs the render and cannot INSERT one
--   5. a stranger sees zero rows and cannot insert
--   6. get_client_project_threshold emits the four new keys AND the exact key
--      set it emitted before 00580 — asserted whole, not by addition — and the
--      values reach the payload off the room the line stands in
--   7. the four columns ride the existing project_rooms policies: the client
--      reads them, a stranger reads no room at all, and no column-level grant
--      was needed
--   8. the grants on the redefined reader are unchanged: authenticated yes,
--      anon never
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ─── helpers ───────────────────────────────────────────────────────────────
-- The GRANT after each definition is required: 00483 revokes database
-- TEMPORARY from authenticated/anon/service_role, so a restricted role cannot
-- reach a pg_temp function without it.

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

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── fixture preconditions ─────────────────────────────────────────────────

DO $$
DECLARE
  v_client uuid;
  v_designer uuid;
  v_rooms integer;
BEGIN
  SELECT client_id, designer_id INTO v_client, v_designer
    FROM public.projects
   WHERE id = 'b0000000-0000-0000-0000-0000000000d1'::uuid;

  ASSERT v_client = 'a0000000-0000-0000-0000-000000000005'::uuid,
    'FIXTURE: Aspen Loft Refresh must belong to client@patina.dev';
  ASSERT v_designer = 'a0000000-0000-0000-0000-000000000004'::uuid,
    'FIXTURE: Aspen Loft Refresh must be designer@patina.dev''s project';

  SELECT count(*) INTO v_rooms
    FROM public.project_rooms
   WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid
     AND id IN ('b0000000-0000-0000-0000-0000000d2c0a'::uuid,
                'b0000000-0000-0000-0000-0000000d2c0b'::uuid);
  ASSERT v_rooms = 2,
    'FIXTURE: both seeded rooms must stand on the project, got ' || v_rooms;

  -- The studio writer under test must be a co-member who is NOT the project's
  -- own designer, or assertion 2 proves nothing about the studio rule.
  ASSERT app_private.is_project_studio_member(
           'b0000000-0000-0000-0000-0000000000d1'::uuid
         ) IS NOT NULL,
    'FIXTURE: the studio predicate must be callable';
END $$;

-- ─── 1. the bucket ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_public boolean;
  v_limit bigint;
  v_mimes text[];
BEGIN
  SELECT public, file_size_limit, allowed_mime_types
    INTO v_public, v_limit, v_mimes
    FROM storage.buckets WHERE id = 'room-renders';

  ASSERT v_public IS NOT NULL, 'the room-renders bucket must exist';
  ASSERT v_public = false,
    'room-renders must be PRIVATE — a client render is not a public object';
  ASSERT v_limit = 8388608,
    'room-renders must cap uploads at 8 MB, got ' || COALESCE(v_limit::text, '<null>');
  ASSERT v_mimes @> ARRAY['image/jpeg', 'image/png', 'image/webp']
     AND array_length(v_mimes, 1) = 3,
    'room-renders takes jpeg/png/webp and nothing else, got '
      || array_to_string(v_mimes, ', ');
END $$;

-- ─── 2. a studio co-member writes under its own prefix, and only there ─────

SAVEPOINT s2;
DO $$
DECLARE
  v_ok integer;
  v_sqlstate text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003'::uuid);

  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('room-renders',
          'b0000000-0000-0000-0000-0000000000d1/b0000000-0000-0000-0000-0000000d2c0a/dining.jpg');

  SELECT count(*) INTO v_ok FROM storage.objects
   WHERE bucket_id = 'room-renders'
     AND name = 'b0000000-0000-0000-0000-0000000000d1/b0000000-0000-0000-0000-0000000d2c0a/dining.jpg';
  ASSERT v_ok = 1, 'a studio co-member must be able to upload under its own project prefix';

  -- Another project's prefix. cf100000-…-0002 is not this studio's project.
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('room-renders',
            'cf100000-0000-4000-8000-000000000002/b0000000-0000-0000-0000-0000000d2c0a/stolen.jpg');
    ASSERT false, 'a studio wrote under a project it does not stand on';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '42501',
    'writing under a foreign project must be refused, got ' || COALESCE(v_sqlstate, '<none>');

  -- A path that is not <project_id>/<room_id>/<filename> is refused rather than
  -- raising 22P02 out of the policy's cast.
  v_sqlstate := NULL;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('room-renders', 'not-a-uuid/also-not-a-uuid/loose.jpg');
    ASSERT false, 'a malformed prefix was accepted';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '42501',
    'a malformed prefix must be refused by policy (42501), not blow up the cast (22P02); got '
      || COALESCE(v_sqlstate, '<none>');

  -- A bare filename at the bucket root has no project to belong to.
  v_sqlstate := NULL;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('room-renders', 'loose.jpg');
    ASSERT false, 'an unprefixed object was accepted';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '42501',
    'an unprefixed object must be refused, got ' || COALESCE(v_sqlstate, '<none>');

  PERFORM pg_temp.reset_role();
END $$;
ROLLBACK TO SAVEPOINT s2;

-- ─── 3. the second studio cannot write here ────────────────────────────────

SAVEPOINT s3;
DO $$
DECLARE
  v_sqlstate text;
  v_seen integer;
BEGIN
  -- Seed one object as the owning studio so there is something to be refused.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003'::uuid);
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('room-renders',
          'b0000000-0000-0000-0000-0000000000d1/b0000000-0000-0000-0000-0000000d2c0a/dining.jpg');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001'::uuid);

  SELECT count(*) INTO v_seen FROM storage.objects WHERE bucket_id = 'room-renders';
  ASSERT v_seen = 0,
    'a second studio must read zero renders on a house it does not work in, saw ' || v_seen;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('room-renders',
            'b0000000-0000-0000-0000-0000000000d1/b0000000-0000-0000-0000-0000000d2c0b/theirs.jpg');
    ASSERT false, 'a second studio uploaded into another studio''s house';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '42501',
    'a second studio must be refused, got ' || COALESCE(v_sqlstate, '<none>');

  PERFORM pg_temp.reset_role();
END $$;
ROLLBACK TO SAVEPOINT s3;

-- ─── 4. the client reads her own render and writes none ────────────────────

SAVEPOINT s4;
DO $$
DECLARE
  v_seen integer;
  v_sqlstate text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003'::uuid);
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('room-renders',
          'b0000000-0000-0000-0000-0000000000d1/b0000000-0000-0000-0000-0000000d2c0a/dining.jpg');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);

  SELECT count(*) INTO v_seen FROM storage.objects
   WHERE bucket_id = 'room-renders'
     AND name = 'b0000000-0000-0000-0000-0000000000d1/b0000000-0000-0000-0000-0000000d2c0a/dining.jpg';
  ASSERT v_seen = 1, 'the client must be able to read her own house''s render';

  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('room-renders',
            'b0000000-0000-0000-0000-0000000000d1/b0000000-0000-0000-0000-0000000d2c0b/hers.jpg');
    ASSERT false, 'the client uploaded a concept render';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '42501',
    'a render is the studio''s to publish, not the client''s; got '
      || COALESCE(v_sqlstate, '<none>');

  PERFORM pg_temp.reset_role();
END $$;
ROLLBACK TO SAVEPOINT s4;

-- ─── 5. a stranger sees nothing and writes nothing ─────────────────────────

SAVEPOINT s5;
DO $$
DECLARE
  v_seen integer;
  v_sqlstate text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003'::uuid);
  INSERT INTO storage.objects (bucket_id, name)
  VALUES ('room-renders',
          'b0000000-0000-0000-0000-0000000000d1/b0000000-0000-0000-0000-0000000d2c0a/dining.jpg');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000006'::uuid);

  SELECT count(*) INTO v_seen FROM storage.objects WHERE bucket_id = 'room-renders';
  ASSERT v_seen = 0, 'a stranger must see zero renders, saw ' || v_seen;

  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('room-renders',
            'b0000000-0000-0000-0000-0000000000d1/b0000000-0000-0000-0000-0000000d2c0a/his.jpg');
    ASSERT false, 'a stranger uploaded into a house he has nothing to do with';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '42501',
    'a stranger must be refused, got ' || COALESCE(v_sqlstate, '<none>');

  PERFORM pg_temp.reset_role();
END $$;
ROLLBACK TO SAVEPOINT s5;

-- ─── 6. the widened reader ─────────────────────────────────────────────────
--
-- The key set is asserted WHOLE. An addition-only assertion would pass while a
-- key the client page reads had quietly gone, which is exactly the failure a
-- CREATE OR REPLACE from a stale body causes.

SAVEPOINT s6;
DO $$
DECLARE
  v_payload jsonb;
  v_expected text[] := ARRAY[
    'allowance', 'assignmentScope', 'category', 'clientLineTotalCents',
    'clientUnitPriceCents', 'conceptRenderCaption', 'conceptRenderUploadedAt',
    'conceptRenderUploadedBy', 'conceptRenderUrl', 'docCode', 'id', 'imageUrl',
    'instrument', 'itemType', 'kind', 'logisticsStatus', 'name', 'productId',
    'quantity', 'roomId', 'roomName', 'threadId', 'tradeJourney', 'updatedAt'
  ];
  v_keys text[];
  v_line jsonb;
  v_kinds text[];
  v_dining jsonb;
  v_living jsonb;
  v_leak text;
BEGIN
  -- Put a render on the Dining Room only, so the payload is proved to read the
  -- room the line stands in rather than any room on the project.
  UPDATE public.project_rooms
     SET concept_render_url         = 'b0000000-0000-0000-0000-0000000000d1/b0000000-0000-0000-0000-0000000d2c0a/dining.jpg',
         concept_render_caption     = 'The dining room looking north',
         concept_render_uploaded_at = timestamptz '2026-09-08 10:00:00+00',
         concept_render_uploaded_by = 'a0000000-0000-0000-0000-000000000004'::uuid
   WHERE id = 'b0000000-0000-0000-0000-0000000d2c0a'::uuid;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);
  v_payload := public.get_client_project_threshold(
    'b0000000-0000-0000-0000-0000000000d1'::uuid
  );
  PERFORM pg_temp.reset_role();

  -- Every top-level key 00565 shipped is still there.
  SELECT array_agg(k ORDER BY k) INTO v_keys FROM jsonb_object_keys(v_payload) AS k;
  ASSERT v_keys = ARRAY['origin', 'projectId', 'projectName', 'selections'],
    'the reader''s top-level shape changed: ' || array_to_string(v_keys, ', ');

  ASSERT v_payload->>'origin' = 'commercial',
    'origin must resolve commercial for the seeded project, got '
      || COALESCE(v_payload->>'origin', '<missing>');
  ASSERT jsonb_array_length(v_payload->'selections') >= 2,
    'the seeded project must carry a furnishings line and a trade line, got '
      || jsonb_array_length(v_payload->'selections');

  -- Every line, on both branches, carries EXACTLY the pre-00580 key set plus
  -- the four. Nothing dropped, nothing renamed, nothing extra.
  FOR v_line IN SELECT * FROM jsonb_array_elements(v_payload->'selections') LOOP
    SELECT array_agg(k ORDER BY k) INTO v_keys FROM jsonb_object_keys(v_line) AS k;
    ASSERT v_keys = v_expected,
      'a ' || COALESCE(v_line->>'kind', '<no kind>') || ' line''s key set is wrong: '
        || array_to_string(v_keys, ', ');
  END LOOP;

  SELECT array_agg(DISTINCT s->>'kind') INTO v_kinds
    FROM jsonb_array_elements(v_payload->'selections') AS s;
  ASSERT 'furnishings' = ANY(v_kinds) AND 'trade' = ANY(v_kinds),
    'both selection kinds must appear, got ' || array_to_string(v_kinds, ', ');

  -- The Dining Room's line carries the render; the Living Room's carries none.
  SELECT s INTO v_dining FROM jsonb_array_elements(v_payload->'selections') AS s
   WHERE s->>'roomId' = 'b0000000-0000-0000-0000-0000000d2c0a' LIMIT 1;
  SELECT s INTO v_living FROM jsonb_array_elements(v_payload->'selections') AS s
   WHERE s->>'roomId' = 'b0000000-0000-0000-0000-0000000d2c0b' LIMIT 1;

  ASSERT v_dining IS NOT NULL AND v_living IS NOT NULL,
    'FIXTURE: the payload must carry a line in each seeded room';

  ASSERT v_dining->>'conceptRenderUrl'
         = 'b0000000-0000-0000-0000-0000000000d1/b0000000-0000-0000-0000-0000000d2c0a/dining.jpg',
    'the dining line must carry the object PATH, got '
      || COALESCE(v_dining->>'conceptRenderUrl', '<null>');
  ASSERT v_dining->>'conceptRenderCaption' = 'The dining room looking north',
    'the dining line must carry the studio''s caption';
  ASSERT (v_dining->>'conceptRenderUploadedAt')::timestamptz
         = timestamptz '2026-09-08 10:00:00+00',
    'the dining line must carry the upload stamp';
  ASSERT v_dining->>'conceptRenderUploadedBy' = 'a0000000-0000-0000-0000-000000000004',
    'the dining line must carry the uploader';

  ASSERT v_living->'conceptRenderUrl' = 'null'::jsonb,
    'a room with no render must say nothing, got '
      || COALESCE(v_living->>'conceptRenderUrl', '<null>');
  ASSERT v_living->'conceptRenderCaption' = 'null'::jsonb
     AND v_living->'conceptRenderUploadedAt' = 'null'::jsonb
     AND v_living->'conceptRenderUploadedBy' = 'null'::jsonb,
    'a room with no render must carry four nulls, not a partial render';

  -- 00565's bound, re-checked over the widened payload: never the studio's
  -- side of the money, at any depth of any line.
  SELECT string_agg(DISTINCT k, ', ') INTO v_leak
    FROM jsonb_array_elements(v_payload->'selections') AS s
    CROSS JOIN LATERAL (
      SELECT jsonb_object_keys(s) AS k
      UNION ALL
      SELECT jsonb_object_keys(s->'instrument')
       WHERE jsonb_typeof(s->'instrument') = 'object'
      UNION ALL
      SELECT jsonb_object_keys(s->'allowance')
       WHERE jsonb_typeof(s->'allowance') = 'object'
    ) AS keys
   WHERE k ~* '(trade_price|tradeprice|vendor|cost|markup|margin)';
  ASSERT v_leak IS NULL,
    'the widened payload leaks the studio''s side of the money: ' || v_leak;
END $$;
ROLLBACK TO SAVEPOINT s6;

-- ─── 7. the columns ride the existing project_rooms policies ───────────────

SAVEPOINT s7;
DO $$
DECLARE
  v_caption text;
  v_seen integer;
BEGIN
  UPDATE public.project_rooms
     SET concept_render_caption = 'The dining room looking north'
   WHERE id = 'b0000000-0000-0000-0000-0000000d2c0a'::uuid;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);
  SELECT concept_render_caption INTO v_caption FROM public.project_rooms
   WHERE id = 'b0000000-0000-0000-0000-0000000d2c0a'::uuid;
  PERFORM pg_temp.reset_role();
  ASSERT v_caption = 'The dining room looking north',
    'the client reads the new columns through the policy 00066:249 already gave her';

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000006'::uuid);
  SELECT count(*) INTO v_seen FROM public.project_rooms
   WHERE project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid;
  PERFORM pg_temp.reset_role();
  ASSERT v_seen = 0, 'a stranger must read no room of this house, saw ' || v_seen;
END $$;
ROLLBACK TO SAVEPOINT s7;

DO $$
BEGIN
  -- No column-level grant was added, and none is needed: the table-wide grant
  -- authenticated already held covers the four new columns.
  ASSERT has_column_privilege('authenticated', 'public.project_rooms', 'concept_render_url', 'SELECT')
     AND has_column_privilege('authenticated', 'public.project_rooms', 'concept_render_caption', 'SELECT')
     AND has_column_privilege('authenticated', 'public.project_rooms', 'concept_render_uploaded_at', 'SELECT')
     AND has_column_privilege('authenticated', 'public.project_rooms', 'concept_render_uploaded_by', 'SELECT'),
    'authenticated must be able to read the four new columns';
  ASSERT has_column_privilege('authenticated', 'public.project_rooms', 'concept_render_url', 'UPDATE'),
    'a studio must be able to write the render path';
END $$;

-- ─── 8. the grants on the redefined reader ─────────────────────────────────

DO $$
BEGIN
  ASSERT has_function_privilege('authenticated', 'public.get_client_project_threshold(uuid)', 'EXECUTE'),
    'authenticated must be able to call get_client_project_threshold';
  ASSERT NOT has_function_privilege('anon', 'public.get_client_project_threshold(uuid)', 'EXECUTE'),
    'anon must never call get_client_project_threshold';
END $$;

ROLLBACK;
