-- ═══════════════════════════════════════════════════════════════════════════
-- commit_field_capture inbox-branch routing + the note/audio lane
-- (the W1 routing migration — 005NN_field_capture_notes_and_routing.sql)
--
-- 1. INBOX ROUTING       → project_id / project_room_id persist on the inbox
--                          path. Before this migration only the library branch
--                          wrote them (00235:205-217 vs :255-264), so every
--                          note-shaped capture arrived with no project.
-- 2. AUDIO SEGMENTS      → voice.audioSegments round-trips.
-- 3. CAPTURE KIND        → payload captureKind lands, defaulting to specimen.
-- 4. RE-COMMIT           → a second commit with the same client_capture_id is
--                          a FULL CONTENT OVERWRITE that must not clear
--                          routing. ⚠ It is NOT a no-op: status is 'inbox',
--                          which is not in ('saved','dismissed'), so the
--                          upsert fires and every content column is rewritten
--                          from EXCLUDED — this very case resets capture_kind
--                          to 'specimen' and voice_audio_segments to '[]',
--                          undoing what cases 2 and 3 just proved. Routing
--                          survives only because the destination branch
--                          COALESCEs it. The true no-op branch (already
--                          'saved' or 'dismissed') is NOT exercised here.
-- 5. SAFE HARBOR         → a project the caller does not own does NOT abort the
--                          RPC. 00235:85-88 documents the routing deferral as
--                          DELIBERATE ("so a bad route can be safe-harbored
--                          instead of hard-failing the whole sync") and wraps
--                          the library branch in EXCEPTION WHEN OTHERS. The
--                          inbox branch now carries the same harbor: the row
--                          parks at status='inbox' with routing untouched and
--                          the conflict stashed in raw_payload. An unwrapped
--                          RAISE would surface on the device as a plain Error,
--                          not a LocalSyncError, so runAttempt's catch would
--                          reach recordFailure → .retryableFailure and retry
--                          on EVERY drain forever.
-- 6. ROUTING CLEAR       → payload {routing:{clear:true}} un-places a capture.
--                          COALESCE alone cannot tell "not supplied" from
--                          "explicitly cleared", and a defaulted 8th argument
--                          would create a SECOND OVERLOAD that makes every
--                          existing 7-argument call ambiguous.
-- 7. POLICY SHAPE        → all five field_captures policies are TO authenticated.
--                          ⚠ The count is 5 TODAY (00233:155/159/163/168/175).
--                          FC-R8 ruling per-studio would add a sixth; this
--                          assertion is meant to fail loudly if it does.
-- 8-11. DEFENSIVE        → a malformed captureKind / transcriptSource /
--       PROJECTION         noteSetting / audioSegments must NOT raise. Each of
--                          those values would violate one of the migration's
--                          named CHECK constraints (or the jsonb type of
--                          voice_audio_segments), and the raise would come
--                          from the UPSERT — before both destination branches
--                          and therefore OUTSIDE every safe harbor. The RPC
--                          would fail on BOTH destinations and an offline
--                          device would retry that capture forever. The row
--                          must still commit, the offending column must carry
--                          its default, and the dropped value must be recorded
--                          in raw_payload -> 'projection_errors'.
-- 12. NO FALSE FIRE      → a well-formed payload leaves projection_errors
--                          absent. A projection that fires on good input is as
--                          wrong as one that never fires. Asserted inline on
--                          the case-1 row, which is the well-formed one.
-- 14. CLEAR IS TOTAL     → a non-boolean routing.clear ("yes", 1, null) must
--                          neither abort nor clear. The read is a jsonb
--                          comparison, not a ::boolean cast, which would raise
--                          22P02 outside every handler.
-- 15. STALE STORED       → a capture whose STORED project_id has gone stale
--     ROUTING              (its room was re-parented) must still sync. The
--                          unconditional BEFORE UPDATE guard re-validates it
--                          on the upsert — before either destination branch
--                          and outside the harbors they carry — so the upsert
--                          needs its own harbor. The stale routing is detached
--                          and recorded, and the row commits.
-- 13. NO CLOBBER         → projection_errors and the safe harbor's conflict
--                          are distinct TOP-LEVEL keys of raw_payload, written
--                          by two different merges. A capture that is both
--                          malformed AND badly routed must end up carrying
--                          BOTH.
--
-- How to run:
--   scripts/run-sql-tests.sh -f field_capture_note_routing
-- and, for the wave report, the FULL suite as well — it exits 0 with the 22
-- documented known failures in supabase/tests/KNOWN_FAILURES.md, so a new
-- unexpected failure is a real regression.
--
-- ⚠ The runner connects as `postgres` (superuser, run-sql-tests.sh:92), so the
-- auth.uid()-shaped cases below exercise the RPC's LOGIC with RLS BYPASSED.
-- apply_field_effect_test.sql:25-27 documents the same caveat. Nothing here
-- proves RLS; do not report it as such.
--
-- Transaction-wrapped + ROLLBACK. commit_field_capture is SECURITY INVOKER and
-- reads auth.uid(), so every call sets request.jwt.claims first.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('fc000000-0000-4000-8000-000000000001', 'fc-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
       ('fc000000-0000-4000-8000-000000000002', 'fc-other@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fc000000-0000-4000-8000-000000000001', 'fc-designer@test.invalid', 'FC Designer', NOW(), NOW()),
       ('fc000000-0000-4000-8000-000000000002', 'fc-other@test.invalid',    'FC Other',    NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('fc000000-0000-4000-8000-0000000000a1', 'FC Maple St', 'fc000000-0000-4000-8000-000000000001', 'fc000000-0000-4000-8000-000000000001'),
       ('fc000000-0000-4000-8000-0000000000a2', 'FC Not Mine', 'fc000000-0000-4000-8000-000000000002', 'fc000000-0000-4000-8000-000000000002');

-- ⚠ 'd1', not 'r1': `r` is not a hex digit and the uuid cast fails before the
--   first assertion runs.
INSERT INTO project_rooms (id, project_id, name)
VALUES ('fc000000-0000-4000-8000-0000000000d1', 'fc000000-0000-4000-8000-0000000000a1', 'Living');

DO $$
DECLARE
  v_res       JSONB;
  v_project   UUID;
  v_room      UUID;
  v_segments  JSONB;
  v_kind      TEXT;
  v_status    TEXT;
  v_conflict  JSONB;
  v_count     INTEGER;
  v_projerr   JSONB;
  v_source    TEXT;
  v_setting   TEXT;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'fc000000-0000-4000-8000-000000000001', 'role', 'authenticated')::text, true);

  -- 1 + 2 + 3 -------------------------------------------------------------
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c1',
    'inbox',
    jsonb_build_object(
      'captureKind', 'note',
      'voice', jsonb_build_object(
        'audioPath',        'fc/ct/voice-a-000.m4a',
        'audioSegments',    jsonb_build_array('fc/ct/voice-a-000.m4a', 'fc/ct/voice-a-001.m4a'),
        'transcriptSource', 'device',
        'transcript',       'the alcove reads about forty-two and three quarters')),
    'fc000000-0000-4000-8000-0000000000a1',
    'fc000000-0000-4000-8000-0000000000d1');

  SELECT project_id, project_room_id, voice_audio_segments, capture_kind, status,
         raw_payload -> 'projection_errors'
    INTO v_project, v_room, v_segments, v_kind, v_status, v_projerr
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c1';

  ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 1a: inbox branch must persist project_id, got ' || COALESCE(v_project::text, 'NULL');
  ASSERT v_room = 'fc000000-0000-4000-8000-0000000000d1',
    'FAIL 1b: inbox branch must persist project_room_id, got ' || COALESCE(v_room::text, 'NULL');
  ASSERT v_status = 'inbox', 'FAIL 1c: status should be inbox, got ' || v_status;
  ASSERT jsonb_array_length(v_segments) = 2,
    'FAIL 2: voice_audio_segments should carry 2 entries, got ' || COALESCE(v_segments::text, 'NULL');
  ASSERT v_kind = 'note', 'FAIL 3: capture_kind should be note, got ' || v_kind;
  ASSERT v_projerr IS NULL OR jsonb_array_length(v_projerr) = 0,
    'FAIL 12: a WELL-FORMED payload must record no projection error, got ' || v_projerr::text;
  RAISE NOTICE 'field_capture routing: cases 1-3 + 12 passed.';

  -- 4 ---------------------------------------------------------------------
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c1', 'inbox', '{}'::jsonb);
  SELECT project_id INTO v_project
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c1';
  ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 4: a re-commit with no routing must not clear the stored routing';
  RAISE NOTICE 'field_capture routing: case 4 passed.';

  -- 5 — SAFE HARBOR, not a raise -------------------------------------------
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c2', 'inbox', '{}'::jsonb,
    'fc000000-0000-4000-8000-0000000000a2');
  SELECT status, project_id, raw_payload -> 'conflict'
    INTO v_status, v_project, v_conflict
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c2';
  ASSERT v_status = 'inbox',
    'FAIL 5a: a bad route must safe-harbor to inbox, not abort the RPC; got ' || COALESCE(v_status, 'NULL');
  ASSERT v_project IS NULL,
    'FAIL 5b: a refused route must leave project_id NULL, got ' || COALESCE(v_project::text, 'NULL');
  ASSERT v_conflict IS NOT NULL,
    'FAIL 5c: the refused route must be stashed in raw_payload.conflict so she can re-route by hand';
  RAISE NOTICE 'field_capture routing: case 5 passed (safe harbor).';

  -- 6 — explicit un-placing ------------------------------------------------
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c1', 'inbox',
    jsonb_build_object('routing', jsonb_build_object('clear', true)));
  SELECT project_id, project_room_id INTO v_project, v_room
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c1';
  ASSERT v_project IS NULL AND v_room IS NULL,
    'FAIL 6: {routing:{clear:true}} must un-place a capture from the device';
  RAISE NOTICE 'field_capture routing: case 6 passed.';

  -- 7 ---------------------------------------------------------------------
  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'field_captures'
     AND roles = '{authenticated}';
  ASSERT v_count = 5,
    'FAIL 7: all five field_captures policies must be TO authenticated, got ' || v_count
    || ' (if FC-R8 ruled per-studio and added a sixth, update this count deliberately)';
  RAISE NOTICE 'field_capture routing: case 7 passed.';

  -- 8-11 — DEFENSIVE PROJECTION: malformed values must not raise -------------
  -- Each value below would violate a named CHECK constraint (or the jsonb type
  -- of voice_audio_segments) if written through unprojected, and the raise
  -- would come from the UPSERT — outside every safe harbor, failing the RPC on
  -- BOTH destinations and making an offline device retry forever.

  -- 8 — captureKind not on the whitelist
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c3', 'inbox',
    jsonb_build_object('captureKind', 'foo'));
  SELECT status, capture_kind, raw_payload -> 'projection_errors'
    INTO v_status, v_kind, v_projerr
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c3';
  ASSERT v_status = 'inbox',
    'FAIL 8a: a malformed captureKind must still commit, got status ' || COALESCE(v_status, 'NULL');
  ASSERT v_kind = 'specimen',
    'FAIL 8b: a malformed captureKind must fall back to specimen, got ' || COALESCE(v_kind, 'NULL');
  ASSERT v_projerr @> '[{"key": "captureKind"}]'::jsonb,
    'FAIL 8c: the dropped captureKind must be recorded in raw_payload.projection_errors, got '
    || COALESCE(v_projerr::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 8 passed (captureKind projected).';

  -- 9 — transcriptSource not on the whitelist
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c4', 'inbox',
    jsonb_build_object('voice', jsonb_build_object('transcriptSource', 'x')));
  SELECT status, transcript_source, raw_payload -> 'projection_errors'
    INTO v_status, v_source, v_projerr
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c4';
  ASSERT v_status = 'inbox',
    'FAIL 9a: a malformed transcriptSource must still commit, got status ' || COALESCE(v_status, 'NULL');
  ASSERT v_source IS NULL,
    'FAIL 9b: a malformed transcriptSource must land NULL, got ' || COALESCE(v_source, 'NULL');
  ASSERT v_projerr @> '[{"key": "voice.transcriptSource"}]'::jsonb,
    'FAIL 9c: the dropped transcriptSource must be recorded in raw_payload.projection_errors, got '
    || COALESCE(v_projerr::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 9 passed (transcriptSource projected).';

  -- 10 — noteSetting not on the whitelist
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c5', 'inbox',
    jsonb_build_object('voice', jsonb_build_object('noteSetting', 'both')));
  SELECT status, note_setting, raw_payload -> 'projection_errors'
    INTO v_status, v_setting, v_projerr
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c5';
  ASSERT v_status = 'inbox',
    'FAIL 10a: a malformed noteSetting must still commit, got status ' || COALESCE(v_status, 'NULL');
  ASSERT v_setting IS NULL,
    'FAIL 10b: a malformed noteSetting must land NULL, got ' || COALESCE(v_setting, 'NULL');
  ASSERT v_projerr @> '[{"key": "voice.noteSetting"}]'::jsonb,
    'FAIL 10c: the dropped noteSetting must be recorded in raw_payload.projection_errors, got '
    || COALESCE(v_projerr::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 10 passed (noteSetting projected).';

  -- 11 — audioSegments that is not a jsonb array
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c6', 'inbox',
    jsonb_build_object('voice', jsonb_build_object('audioSegments', 'not-an-array')));
  SELECT status, voice_audio_segments, raw_payload -> 'projection_errors'
    INTO v_status, v_segments, v_projerr
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c6';
  ASSERT v_status = 'inbox',
    'FAIL 11a: a non-array audioSegments must still commit, got status ' || COALESCE(v_status, 'NULL');
  ASSERT v_segments = '[]'::jsonb,
    'FAIL 11b: a non-array audioSegments must fall back to [], got ' || COALESCE(v_segments::text, 'NULL');
  ASSERT v_projerr @> '[{"key": "voice.audioSegments"}]'::jsonb,
    'FAIL 11c: the dropped audioSegments must be recorded in raw_payload.projection_errors, got '
    || COALESCE(v_projerr::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 11 passed (audioSegments projected).';

  -- 13 — projection_errors and conflict must COMPOSE, not clobber ------------
  -- Malformed captureKind (projection writes raw_payload.projection_errors on
  -- the upsert) AND a project owned by someone else (the inbox safe harbor
  -- writes raw_payload.conflict afterwards). A top-level jsonb || merges keys,
  -- so both must survive.
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c7', 'inbox',
    jsonb_build_object('captureKind', 'foo'),
    'fc000000-0000-4000-8000-0000000000a2');
  SELECT status, capture_kind, raw_payload -> 'projection_errors', raw_payload -> 'conflict'
    INTO v_status, v_kind, v_projerr, v_conflict
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c7';
  ASSERT v_status = 'inbox',
    'FAIL 13a: a malformed AND badly-routed capture must still park at inbox, got '
    || COALESCE(v_status, 'NULL');
  ASSERT v_kind = 'specimen',
    'FAIL 13b: capture_kind should be the projected default, got ' || COALESCE(v_kind, 'NULL');
  ASSERT v_projerr @> '[{"key": "captureKind"}]'::jsonb,
    'FAIL 13c: the safe harbor must not clobber raw_payload.projection_errors, got '
    || COALESCE(v_projerr::text, 'NULL');
  ASSERT v_conflict IS NOT NULL,
    'FAIL 13d: the projection must not clobber raw_payload.conflict';
  RAISE NOTICE 'field_capture routing: case 13 passed (projection_errors + conflict compose).';

  -- 14 — a NON-BOOLEAN routing.clear must not abort ---------------------------
  -- The read is ((v_payload #> '{routing,clear}') = 'true'::jsonb), not a
  -- ::boolean cast. A cast would raise 22P02 on each of these, before the
  -- upsert and outside every handler — the same forever-retry failure as
  -- cases 8-11, one step earlier. Each must commit and PRESERVE routing.
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c8', 'inbox', '{}'::jsonb,
    'fc000000-0000-4000-8000-0000000000a1',
    'fc000000-0000-4000-8000-0000000000d1');

  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c8', 'inbox',
    jsonb_build_object('routing', jsonb_build_object('clear', 'yes')));
  SELECT status, project_id INTO v_status, v_project
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c8';
  ASSERT v_status = 'inbox',
    'FAIL 14a: routing.clear "yes" must not abort the RPC, got status ' || COALESCE(v_status, 'NULL');
  ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 14b: a non-boolean routing.clear must NOT clear routing, got '
    || COALESCE(v_project::text, 'NULL');

  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c8', 'inbox',
    jsonb_build_object('routing', jsonb_build_object('clear', 1)));
  SELECT project_id INTO v_project
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c8';
  ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 14c: routing.clear 1 must not abort and must not clear routing, got '
    || COALESCE(v_project::text, 'NULL');

  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c8', 'inbox',
    '{"routing": {"clear": null}}'::jsonb);
  SELECT project_id INTO v_project
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c8';
  ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 14d: routing.clear null must not abort and must not clear routing, got '
    || COALESCE(v_project::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 14 passed (non-boolean routing.clear).';

  -- 15 — STALE STORED ROUTING must not abort the upsert -----------------------
  -- trg_field_captures_guard_update is unconditional (00233:258-260), so the
  -- ON CONFLICT DO UPDATE re-validates the STORED project_id even though it
  -- never writes it. Transferring the project away makes that stored value
  -- illegal, and without the upsert's own harbor the RPC aborts BEFORE either
  -- destination branch — outside the harbors both branches carry. That row
  -- would then be un-syncable from the device forever.
  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c9', 'inbox', '{}'::jsonb,
    'fc000000-0000-4000-8000-0000000000a1',
    'fc000000-0000-4000-8000-0000000000d1');
  SELECT project_id INTO v_project
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c9';
  ASSERT v_project = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 15a: fixture setup — the capture should be routed before the project moves';

  -- The room is re-parented to the other project. The capture's stored
  -- (project_id, project_room_id) pair is now illegal — the guard's
  -- "room must belong to the routed project" branch (00233:231-236).
  -- (Transferring the project itself is not usable as a fixture here:
  --  guard_project_terminal_identity_integrity refuses a direct designer_id
  --  change, "project lead may only change through reassign_project_lead".)
  UPDATE project_rooms
     SET project_id = 'fc000000-0000-4000-8000-0000000000a2'
   WHERE id = 'fc000000-0000-4000-8000-0000000000d1';

  v_res := public.commit_field_capture(
    'fc000000-0000-4000-8000-0000000000c9', 'inbox',
    jsonb_build_object('title', 'still syncing'));
  SELECT status, project_id, project_room_id, raw_payload -> 'conflict'
    INTO v_status, v_project, v_room, v_conflict
    FROM field_captures WHERE client_capture_id = 'fc000000-0000-4000-8000-0000000000c9';
  ASSERT v_status = 'inbox',
    'FAIL 15b: a capture with STALE STORED routing must still sync, got status '
    || COALESCE(v_status, 'NULL');
  ASSERT v_project IS NULL AND v_room IS NULL,
    'FAIL 15c: stale stored routing must be detached, got project ' || COALESCE(v_project::text, 'NULL');
  ASSERT v_conflict IS NOT NULL,
    'FAIL 15d: the detached routing must be recorded in raw_payload.conflict';
  ASSERT v_conflict ->> 'detached_project_id' = 'fc000000-0000-4000-8000-0000000000a1',
    'FAIL 15e: the conflict must name what was detached so she can re-route by hand, got '
    || COALESCE(v_conflict::text, 'NULL');
  RAISE NOTICE 'field_capture routing: case 15 passed (stale stored routing detached, not aborted).';

  -- Restore the fixture so nothing after this depends on the re-parenting.
  UPDATE project_rooms
     SET project_id = 'fc000000-0000-4000-8000-0000000000a1'
   WHERE id = 'fc000000-0000-4000-8000-0000000000d1';

  PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'All field_capture note-routing assertions passed.';
END
$$;

ROLLBACK;
